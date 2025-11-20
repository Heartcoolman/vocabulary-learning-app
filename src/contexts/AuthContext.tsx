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
  showMigrationPrompt: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  dismissMigrationPrompt: () => void;
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
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);

  /**
   * 加载用户信息
   */
  const loadUser = async () => {
    try {
      const token = apiClient.getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const userData = await apiClient.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('加载用户信息失败:', error);
      // 如果令牌无效，清除它
      apiClient.clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 初始化时检查本地存储的token
   */
  useEffect(() => {
    loadUser();
  }, []);

  /**
   * 用户登录
   */
  const login = async (email: string, password: string) => {
    try {
      const { user: userData, token } = await apiClient.login(email, password);
      apiClient.setToken(token);
      setUser(userData);

      // 登录后检查是否需要迁移数据
      await checkMigrationNeeded();
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

      // 注册后切换到混合模式
      StorageService.setMode('hybrid');
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
      
      // 退出后切换回本地模式
      StorageService.setMode('local');
    }
  };

  /**
   * 检查是否需要迁移数据
   */
  const checkMigrationNeeded = async () => {
    try {
      // 检查是否已经迁移过
      const migrated = await StorageService.isMigrated();
      if (migrated) {
        // 已迁移，直接切换到混合模式并同步
        StorageService.setMode('hybrid');
        StorageService.syncToCloud().catch(err => {
          console.error('同步失败:', err);
        });
        return;
      }

      // 检查是否有本地数据
      const localWords = await StorageService.getWords();
      if (localWords.length > 0) {
        // 有本地数据，显示迁移提示
        setShowMigrationPrompt(true);
      } else {
        // 没有本地数据，直接切换到混合模式并同步
        StorageService.setMode('hybrid');
        StorageService.syncToCloud().catch(err => {
          console.error('同步失败:', err);
        });
      }
    } catch (error) {
      console.error('检查迁移状态失败:', error);
      // 出错时默认切换到混合模式并同步
      StorageService.setMode('hybrid');
      StorageService.syncToCloud().catch(err => {
        console.error('同步失败:', err);
      });
    }
  };

  /**
   * 关闭迁移提示
   */
  const dismissMigrationPrompt = () => {
    setShowMigrationPrompt(false);
  };

  /**
   * 刷新用户信息
   */
  const refreshUser = async () => {
    await loadUser();
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    loading,
    showMigrationPrompt,
    login,
    register,
    logout,
    refreshUser,
    dismissMigrationPrompt,
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
