import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient, { User } from '../services/ApiClient';
import StorageService from '../services/StorageService';

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
  const loadUser = async (isMounted: () => boolean) => {
    try {
      const token = apiClient.getToken();
      if (!token) {
        if (isMounted()) setLoading(false);
        return;
      }

      const userData = await apiClient.getCurrentUser();
      if (!isMounted()) return; // 组件已卸载，停止后续操作

      setUser(userData);

      // 将当前用户写入缓存服务，便于隔离缓存
      await StorageService.setCurrentUser(userData.id);
      await StorageService.syncToCloud();
    } catch (error) {
      console.error('加载用户信息失败:', error);
      if (!isMounted()) return; // 组件已卸载，停止后续操作

      apiClient.clearToken();
      setUser(null);
      await StorageService.setCurrentUser(null);
    } finally {
      if (isMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    // 使用标志位防止组件卸载后的状态更新
    let mounted = true;
    const isMounted = () => mounted;

    loadUser(isMounted);

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * 用户登录
   */
  const login = async (email: string, password: string) => {
    try {
      const { user: userData, token } = await apiClient.login(email, password);
      apiClient.setToken(token);
      setUser(userData);
      await StorageService.setCurrentUser(userData.id);
      await StorageService.syncToCloud();
    } catch (error) {
      console.error('登录失败:', error);
      throw error;
    }
  };

  /**
   * 用户注册
   */
  const register = async (email: string, password: string, username: string) => {
    try {
      const { user: userData, token } = await apiClient.register(email, password, username);
      apiClient.setToken(token);
      setUser(userData);
      await StorageService.setCurrentUser(userData.id);
      await StorageService.syncToCloud();
    } catch (error) {
      console.error('注册失败:', error);
      throw error;
    }
  };

  /**
   * 用户退出登录
   */
  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('退出登录失败:', error);
    } finally {
      apiClient.clearToken();
      setUser(null);
      await StorageService.setCurrentUser(null);
      await StorageService.clearLocalData();
    }
  };

  /**
   * 刷新用户信息
   */
  const refreshUser = async () => {
    // refreshUser 是主动调用，组件必然已挂载，直接传入返回 true 的函数
    await loadUser(() => true);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    register,
    logout,
    refreshUser,
  };

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
