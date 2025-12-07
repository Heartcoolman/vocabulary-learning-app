import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import apiClient, { User } from '../services/ApiClient';
import StorageService from '../services/StorageService';
import { authLogger } from '../utils/logger';

/**
 * 认证上下文类型
 */
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

/**
 * 认证上下文
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 认证提供者组件
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * 加载用户信息
   */
  const loadUser = useCallback(async (isMounted: () => boolean) => {
    try {
      const token = apiClient.getToken();
      if (!token) {
        if (isMounted()) setLoading(false);
        return;
      }

      const userData = await apiClient.getCurrentUser();
      if (!isMounted()) return; // 组件已卸载，停止后续操作

      setUser(userData);

      // setCurrentUser 内部会调用 init()，无需重复调用
      await StorageService.setCurrentUser(userData.id);
    } catch (error) {
      authLogger.error({ err: error }, '加载用户信息失败');
      if (!isMounted()) return; // 组件已卸载，停止后续操作

      apiClient.clearToken();
      setUser(null);
      await StorageService.setCurrentUser(null);
    } finally {
      if (isMounted()) setLoading(false);
    }
  }, []);

  // 初始化和 401 处理
  useEffect(() => {
    // 使用标志位防止组件卸载后的状态更新
    let mounted = true;
    const isMounted = () => mounted;

    // 注册全局 401 回调：当 token 失效时自动清空状态
    apiClient.setOnUnauthorized(() => {
      if (mounted) {
        setUser(null);
        setLoading(false);
        void StorageService.setCurrentUser(null);
      }
    });

    // 加载用户信息
    void loadUser(isMounted);

    // 清理函数：恢复回调并标记组件已卸载
    return () => {
      mounted = false;
      apiClient.setOnUnauthorized(null);
    };
  }, [loadUser]);

  /**
   * 用户登录
   */
  const login = useCallback(async (email: string, password: string) => {
    try {
      const { user: userData, token } = await apiClient.login(email, password);
      if (!token) {
        throw new Error('登录响应中缺少认证令牌');
      }
      apiClient.setToken(token);
      setUser(userData);
      // setCurrentUser 内部会调用 init()，无需重复调用
      await StorageService.setCurrentUser(userData.id);
    } catch (error) {
      authLogger.error({ err: error, email }, '用户登录失败');
      throw error;
    }
  }, []);

  /**
   * 用户注册
   */
  const register = useCallback(async (email: string, password: string, username: string) => {
    try {
      const { user: userData, token } = await apiClient.register(email, password, username);
      if (!token) {
        throw new Error('注册响应中缺少认证令牌');
      }
      apiClient.setToken(token);
      setUser(userData);
      // setCurrentUser 内部会调用 init()，无需重复调用
      await StorageService.setCurrentUser(userData.id);
    } catch (error) {
      authLogger.error({ err: error, email, username }, '用户注册失败');
      throw error;
    }
  }, []);

  /**
   * 用户退出登录
   */
  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      authLogger.error({ err: error }, '退出登录失败');
    } finally {
      apiClient.clearToken();
      setUser(null);
      await StorageService.setCurrentUser(null);
      await StorageService.clearLocalData();
    }
  }, []);

  /**
   * 刷新用户信息
   */
  const refreshUser = useCallback(async () => {
    // refreshUser 是主动调用，组件必然已挂载，直接传入返回 true 的函数
    await loadUser(() => true);
  }, [loadUser]);

  const value: AuthContextType = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 使用认证上下文的Hook
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth必须在AuthProvider内部使用');
  }
  return context;
}
