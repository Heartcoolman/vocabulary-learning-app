import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient, User, wordClient, learningClient } from '../services/client';
import StorageService from '../services/StorageService';
import { authLogger } from '../utils/logger';
import { queryKeys } from '../lib/queryKeys';
import { DATA_CACHE_CONFIG } from '../lib/cacheConfig';

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
  const queryClient = useQueryClient();

  /**
   * 预加载用户数据
   * 在用户登录/认证后预加载常用数据，提升用户体验
   */
  const prefetchUserData = useCallback(async () => {
    try {
      authLogger.info('开始预加载用户数据');

      // 并行预加载多个数据
      await Promise.allSettled([
        // 预加载单词列表
        queryClient.prefetchQuery({
          queryKey: queryKeys.words.list({}),
          queryFn: () => wordClient.getWords(),
          ...DATA_CACHE_CONFIG.words,
        }),
        // 预加载学习记录（第一页）
        queryClient.prefetchQuery({
          queryKey: queryKeys.learningRecords.list({ page: 1, pageSize: 20 }),
          queryFn: () => learningClient.getRecords({ page: 1, pageSize: 20 }),
          staleTime: 1000 * 60 * 5, // 5分钟
        }),
        // 预加载用户统计数据
        queryClient.prefetchQuery({
          queryKey: queryKeys.user.statistics(),
          queryFn: async () => {
            // 这里可以添加获取用户统计的API调用
            // 暂时返回空对象，避免错误
            return {};
          },
          staleTime: 1000 * 60 * 5,
        }),
      ]);

      authLogger.info('用户数据预加载完成');
    } catch (error) {
      // 预加载失败不应影响用户使用，仅记录日志
      authLogger.warn({ err: error }, '预加载用户数据失败');
    }
  }, [queryClient]);

  /**
   * 加载用户信息
   */
  const loadUser = useCallback(
    async (isMounted: () => boolean) => {
      try {
        const token = authClient.getToken();
        if (!token) {
          if (isMounted()) setLoading(false);
          return;
        }

        const userData = await authClient.getCurrentUser();
        if (!isMounted()) return; // 组件已卸载，停止后续操作

        setUser(userData);

        // setCurrentUser 内部会调用 init()，无需重复调用
        await StorageService.setCurrentUser(userData.id);

        // 用户认证成功后，预加载常用数据
        void prefetchUserData();
      } catch (error) {
        authLogger.error({ err: error }, '加载用户信息失败');
        if (!isMounted()) return; // 组件已卸载，停止后续操作

        authClient.clearToken();
        setUser(null);
        await StorageService.setCurrentUser(null);
      } finally {
        if (isMounted()) setLoading(false);
      }
    },
    [prefetchUserData],
  );

  // 初始化和 401 处理
  useEffect(() => {
    // 使用标志位防止组件卸载后的状态更新
    let mounted = true;
    const isMounted = () => mounted;

    // 注册全局 401 回调：当 token 失效时自动清空状态
    authClient.setOnUnauthorized(() => {
      if (mounted) {
        setUser(null);
        setLoading(false);
        void StorageService.setCurrentUser(null);
      }
    });

    // 监听 auth:logout 事件（由 TokenManager 在刷新失败时触发）
    const handleAuthLogout = () => {
      if (mounted) {
        setUser(null);
        setLoading(false);
        void StorageService.setCurrentUser(null);
        void StorageService.clearLocalData();
      }
    };
    window.addEventListener('auth:logout', handleAuthLogout);

    // 加载用户信息
    void loadUser(isMounted);

    // 清理函数：恢复回调并标记组件已卸载
    return () => {
      mounted = false;
      authClient.setOnUnauthorized(null);
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, [loadUser]);

  /**
   * 用户登录
   */
  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { user: userData, token } = await authClient.login(email, password);
        if (!token) {
          throw new Error('登录响应中缺少认证令牌');
        }
        authClient.setToken(token);
        setUser(userData);
        // setCurrentUser 内部会调用 init()，无需重复调用
        await StorageService.setCurrentUser(userData.id);

        // 登录成功后，预加载常用数据
        void prefetchUserData();
      } catch (error) {
        authLogger.error({ err: error, email }, '用户登录失败');
        throw error;
      }
    },
    [prefetchUserData],
  );

  /**
   * 用户注册
   */
  const register = useCallback(
    async (email: string, password: string, username: string) => {
      try {
        const { user: userData, token } = await authClient.register(email, password, username);
        if (!token) {
          throw new Error('注册响应中缺少认证令牌');
        }
        authClient.setToken(token);
        setUser(userData);
        // setCurrentUser 内部会调用 init()，无需重复调用
        await StorageService.setCurrentUser(userData.id);

        // 注册成功后，预加载常用数据
        void prefetchUserData();
      } catch (error) {
        authLogger.error({ err: error, email, username }, '用户注册失败');
        throw error;
      }
    },
    [prefetchUserData],
  );

  /**
   * 用户退出登录
   */
  const logout = useCallback(async () => {
    try {
      await authClient.logout();
    } catch (error) {
      authLogger.error({ err: error }, '退出登录失败');
    } finally {
      authClient.clearToken();
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
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth必须在AuthProvider内部使用');
  }
  return context;
}
