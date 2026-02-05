import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient, User, wordClient, learningClient } from '../services/client';
import StorageService from '../services/StorageService';
import { authLogger } from '../utils/logger';
import { queryKeys } from '../lib/queryKeys';
import { DATA_CACHE_CONFIG } from '../lib/cacheConfig';
import { isTauriEnvironment, getDesktopLocalUser } from '../utils/tauri-bridge';

/**
 * 认证上下文类型
 */
export interface AuthContextType {
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
  const hasPrefetchedLearningPageRef = useRef(false);
  const hasAttemptedOptimisticLoadRef = useRef(false);
  const hasScheduledPrefetchUserDataRef = useRef(false);
  // 注意：useToast 必须在 ToastProvider 内部使用。
  // 但 AuthProvider 通常包裹在 ToastProvider 外部？
  // 检查 App.tsx，AuthProvider 在 ToastProvider 外部！
  // 所以这里不能用 useToast。我们将改用 console.log 和 window.alert (临时) 或不做 UI 提示只做 console?
  // 既然用户是本地部署，让他看 console 也是一种办法。
  // 但用户可能不懂。
  // 让我们暂时移除 toast 依赖，仅用 console，并尝试一种无需 hook 的通知方式（如 alert）来确认。
  // 为了不破坏 UX，我们只用 console.group 详细打印时间线。

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

  const prefetchLearningPage = useCallback(() => {
    // 测试环境下避免触发页面动态导入，减少不必要的依赖加载与副作用
    if (import.meta.env.MODE === 'test') return;
    if (hasPrefetchedLearningPageRef.current) return;
    hasPrefetchedLearningPageRef.current = true;
    void import('../pages/LearningPage').catch(() => {
      // 静默处理预加载失败，不影响用户体验
    });
  }, []);

  const schedulePrefetchUserData = useCallback(() => {
    if (hasScheduledPrefetchUserDataRef.current) return;
    hasScheduledPrefetchUserDataRef.current = true;
    setTimeout(() => {
      void prefetchUserData();
    }, 2000);
  }, [prefetchUserData]);

  /**
   * 加载用户信息
   */
  /**
   * 加载用户信息
   * 采用乐观加载策略：
   * 1. 优先读取本地缓存，立即渲染界面
   * 2. 后台静默验证 Token 有效性
   */
  const loadUser = useCallback(
    async (isMounted: () => boolean) => {
      try {
        // 桌面模式：自动使用本地用户，无需网络认证
        if (isTauriEnvironment()) {
          authLogger.info('桌面模式：自动登录本地用户');
          const desktopUser = getDesktopLocalUser() as User;
          if (isMounted()) {
            setUser(desktopUser);
            setLoading(false);
          }
          void StorageService.setCurrentUser(desktopUser.id);
          schedulePrefetchUserData();
          return;
        }

        const token = authClient.getToken();
        if (!token) {
          if (isMounted()) setLoading(false);
          return;
        }

        // 一旦存在 token，就尽早预加载核心学习页面代码，避免后续跳转卡在骨架屏
        prefetchLearningPage();

        // 1. 乐观加载：尝试读取本地缓存
        // 仅在首次尝试时执行，避免因状态变化导致重复触发网络请求
        if (!hasAttemptedOptimisticLoadRef.current) {
          hasAttemptedOptimisticLoadRef.current = true;
          const cachedUser = StorageService.loadUserInfo();
          if (cachedUser) {
            authLogger.info('命中本地用户缓存，执行乐观加载');
            console.timeEnd('AuthLoading');
            console.log('🚀 [Auth] Cache HIT! Instant load.');

            if (isMounted()) {
              setUser(cachedUser);
              // 立即解除阻塞
              setLoading(false);
            }
            void StorageService.setCurrentUser(cachedUser.id);
            schedulePrefetchUserData();
          } else {
            console.log('⏳ [Auth] Cache MISS. Loading from network...');
          }
        }

        console.time('NetworkAuth');
        // 2. 后台验证：始终发起网络请求获取最新状态
        const userData = await authClient.getCurrentUser();
        console.timeEnd('NetworkAuth');
        if (!isMounted()) return;

        // 更新状态和缓存
        setUser(userData);
        StorageService.saveUserInfo(userData);
        console.log('💾 [Auth] User info saved to cache.');

        void StorageService.setCurrentUser(userData.id);
        schedulePrefetchUserData();
      } catch (error) {
        authLogger.error({ err: error }, '加载用户信息失败');
        if (!isMounted()) return;

        // 只有在认证真正失败（如 Token 过期）时才清除状态
        // 此时如果已经乐观加载了，用户会看到界面突然跳回登录页，这是预期行为
        authClient.clearToken();
        setUser(null);
        await StorageService.setCurrentUser(null);
        await StorageService.clearLocalData();
      } finally {
        if (isMounted()) setLoading(false);
      }
    },
    [prefetchLearningPage, schedulePrefetchUserData],
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
        StorageService.saveUserInfo(userData);
        prefetchLearningPage();
        // setCurrentUser 内部会调用 init()，无需重复调用
        // 关键优化：不等待数据全量加载完成，直接进入应用
        void StorageService.setCurrentUser(userData.id);

        // 登录成功后，预加载常用数据（延迟执行，避免阻塞首屏加载）
        setTimeout(() => {
          void prefetchUserData();
        }, 2000);
      } catch (error) {
        authLogger.error({ err: error, email }, '用户登录失败');
        throw error;
      }
    },
    [prefetchLearningPage, prefetchUserData],
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
        StorageService.saveUserInfo(userData);
        prefetchLearningPage();
        // setCurrentUser 内部会调用 init()，无需重复调用
        // 关键优化：不等待数据全量加载完成，直接进入应用
        void StorageService.setCurrentUser(userData.id);

        // 注册成功后，预加载常用数据（延迟执行，避免阻塞首屏加载）
        setTimeout(() => {
          void prefetchUserData();
        }, 2000);
      } catch (error) {
        authLogger.error({ err: error, email, username }, '用户注册失败');
        throw error;
      }
    },
    [prefetchLearningPage, prefetchUserData],
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
