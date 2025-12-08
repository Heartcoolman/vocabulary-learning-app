# 状态管理文档

## 概述

Danci 项目采用多层次的状态管理方案，根据状态的特性和使用场景选择最合适的管理方式：

| 状态类型       | 管理方案            | 使用场景               |
| -------------- | ------------------- | ---------------------- |
| 服务端状态     | React Query         | API 数据、缓存、同步   |
| 全局客户端状态 | React Context       | 认证、主题、Toast      |
| 本地 UI 状态   | useState/useReducer | 表单、模态框、临时状态 |
| 复杂客户端状态 | Zustand (可选)      | 购物车、多步骤表单     |

## React Query 使用指南

### 配置

```typescript
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 分钟内数据被认为是新鲜的
      gcTime: 10 * 60 * 1000, // 缓存保留 10 分钟
      retry: 1, // 失败重试 1 次
      refetchOnWindowFocus: false, // 窗口聚焦时不自动刷新
      refetchOnReconnect: false, // 重新连接时不自动刷新
      refetchOnMount: true, // 挂载时刷新过期数据
    },
    mutations: {
      retry: 0, // mutation 不重试
    },
  },
});
```

### 查询 (Queries)

#### 基础用法

```typescript
import { useQuery } from '@tanstack/react-query';
import { wordClient } from '@/services/client';

// 基础查询
function useWords() {
  return useQuery({
    queryKey: ['words'],
    queryFn: () => wordClient.getWords(),
  });
}

// 带参数的查询
function useWordDetail(wordId: string) {
  return useQuery({
    queryKey: ['word', wordId],
    queryFn: () => wordClient.getWordById(wordId),
    enabled: !!wordId, // 条件启用
  });
}

// 分页查询
function useWordsPaginated(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['words', 'paginated', page, pageSize],
    queryFn: () => wordClient.getWordsPaginated({ page, pageSize }),
    placeholderData: keepPreviousData, // 保持旧数据直到新数据加载
  });
}
```

#### 项目中的查询 Hooks

```typescript
// 单词相关
import { useWords } from '@/hooks/queries/useWords';
import { useLearnedWords } from '@/hooks/queries/useLearnedWords';
import { useWordSearch } from '@/hooks/queries/useWordSearch';
import { useWordDetail } from '@/hooks/queries/useWordDetail';
import { useMasteryWords } from '@/hooks/queries/useMasteryWords';

// 词书相关
import { useWordBooks } from '@/hooks/queries/useWordBooks';
import { useTodayWords } from '@/hooks/queries/useTodayWords';

// AMAS 相关
import { useAmasState } from '@/hooks/queries/useAmasState';
import { useAmasExplanation } from '@/hooks/queries/useAmasExplanation';
import { useTrendAnalysis } from '@/hooks/queries/useTrendAnalysis';

// 统计相关
import { useStatistics } from '@/hooks/queries/useStatistics';
import { useStudyProgress } from '@/hooks/queries/useStudyProgress';
import { useWordMasteryStats } from '@/hooks/queries/useWordMasteryStats';

// 成就相关
import { useBadges } from '@/hooks/queries/useBadges';
import { useAchievements } from '@/hooks/queries/useAchievements';

// 管理员
import { useAdminUsers } from '@/hooks/queries/useAdminUsers';
import { useAdminStatistics } from '@/hooks/queries/useAdminStatistics';
import { useAlgorithmConfig } from '@/hooks/queries/useAlgorithmConfig';
import { useConfigHistory } from '@/hooks/queries/useConfigHistory';
```

### 变更 (Mutations)

#### 基础用法

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wordClient } from '@/services/client';

function useCreateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (wordData: CreateWordInput) => wordClient.createWord(wordData),
    onSuccess: () => {
      // 使相关查询失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: ['words'] });
    },
  });
}
```

#### 乐观更新

```typescript
function useDeleteWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (wordId: string) => wordClient.deleteWord(wordId),
    onMutate: async (wordId) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: ['words'] });

      // 保存当前数据用于回滚
      const previousWords = queryClient.getQueryData(['words']);

      // 乐观更新
      queryClient.setQueryData(['words'], (old: Word[]) =>
        old.filter((word) => word.id !== wordId),
      );

      return { previousWords };
    },
    onError: (err, wordId, context) => {
      // 出错时回滚
      queryClient.setQueryData(['words'], context?.previousWords);
    },
    onSettled: () => {
      // 最终刷新数据
      queryClient.invalidateQueries({ queryKey: ['words'] });
    },
  });
}
```

#### 项目中的变更 Hooks

```typescript
// 答题提交
import { useSubmitAnswer } from '@/hooks/mutations/useSubmitAnswer';

// 单词操作
import { useWordMutations } from '@/hooks/mutations/useWordMutations';

// 词书操作
import { useWordBookMutations } from '@/hooks/mutations/useWordBookMutations';

// 配置操作
import { useConfigMutations } from '@/hooks/mutations/useConfigMutations';

// 批量操作
import { useBatchOperations } from '@/hooks/mutations/useBatchOperations';

// 管理员操作
import { useAdminMutations } from '@/hooks/mutations/useAdminMutations';

// 数据导出
import { useExportData } from '@/hooks/mutations/useExportData';

// 学习队列调整
import { useAdjustWords } from '@/hooks/mutations/useAdjustWords';
```

### 核心 Hook: useSubmitAnswer

这是学习流程中最重要的 Hook，处理答题提交和 AMAS 状态更新：

```typescript
import { useSubmitAnswer, shouldTakeBreak, extractAmasState } from '@/hooks/mutations';

function LearningPage() {
  const {
    submitAnswer,
    isSubmitting,
    lastResult,
    error,
  } = useSubmitAnswer({
    onSuccess: (result) => {
      // 检查是否需要休息
      if (shouldTakeBreak(result)) {
        showBreakSuggestion();
      }

      // 提取 AMAS 状态用于 UI 更新
      const amasState = extractAmasState(result);
      updateUI(amasState);
    },
    onError: (error) => {
      showError(error.message);
    },
  });

  const handleAnswer = async (answer: string) => {
    await submitAnswer({
      wordId: currentWord.id,
      selectedAnswer: answer,
      responseTime: timer.elapsed,
      dwellTime: dwellTimer.elapsed,
    });
  };

  return (
    // ...
  );
}
```

### Query Key 约定

```typescript
// 命名规范
const queryKeys = {
  // 资源列表
  words: ['words'],
  wordBooks: ['wordbooks'],

  // 单个资源
  word: (id: string) => ['word', id],
  wordBook: (id: string) => ['wordbook', id],

  // 嵌套资源
  wordBookWords: (bookId: string) => ['wordbook', bookId, 'words'],

  // 带过滤条件
  wordsFiltered: (filters: WordFilters) => ['words', 'filtered', filters],

  // 分页
  wordsPaginated: (page: number, size: number) => ['words', 'paginated', { page, size }],

  // AMAS 相关
  amasState: ['amas', 'state'],
  amasStrategy: ['amas', 'strategy'],

  // 用户相关
  userStatistics: ['user', 'statistics'],
  userBadges: ['user', 'badges'],
};
```

### 缓存失效策略

```typescript
// 工具函数
import { invalidateQueries, clearAllQueries } from '@/lib/queryClient';

// 精确失效
queryClient.invalidateQueries({ queryKey: ['words'] });

// 模糊失效（失效所有以 'word' 开头的查询）
queryClient.invalidateQueries({ queryKey: ['word'], exact: false });

// 条件失效
queryClient.invalidateQueries({
  predicate: (query) => query.queryKey[0] === 'words' && query.state.data?.length > 0,
});

// 清除所有缓存（用于登出）
clearAllQueries();
```

## Context 使用场景

### 认证上下文 (AuthContext)

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback(async (email: string, password: string) => {
    const { user, token } = await authClient.login(email, password);
    authClient.setToken(token);
    setUser(user);
    await StorageService.setCurrentUser(user.id);
  }, []);

  const logout = useCallback(async () => {
    await authClient.logout();
    authClient.clearToken();
    setUser(null);
    await StorageService.clearLocalData();
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    // ...
  }), [user, loading, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### 使用认证上下文

```tsx
function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      <h1>欢迎, {user.username}</h1>
      <button onClick={logout}>退出登录</button>
    </div>
  );
}
```

### Toast 上下文 (ToastProvider)

```typescript
// src/components/ui/Toast.tsx
import { createContext, useContext, useState, useCallback } from 'react';

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((options: ToastOptions) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, ...options }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, options.duration || 3000);
  }, []);

  const showSuccess = useCallback((message: string) => {
    showToast({ type: 'success', message });
  }, [showToast]);

  // ...

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
```

## 自定义 Hooks

### 学习计时器 (useLearningTimer)

```typescript
import { useLearningTimer } from '@/hooks';

function LearningPage() {
  const {
    elapsed,        // 已过时间（毫秒）
    isRunning,      // 是否运行中
    start,          // 开始计时
    stop,           // 停止计时
    reset,          // 重置
    pause,          // 暂停
    resume,         // 恢复
  } = useLearningTimer();

  // 开始学习时启动计时器
  useEffect(() => {
    start();
    return () => stop();
  }, []);

  return <div>学习时间: {formatTime(elapsed)}</div>;
}
```

### 对话框暂停追踪 (useDialogPauseTracking)

```typescript
import { useDialogPauseTracking } from '@/hooks';

function LearningPage() {
  const [showModal, setShowModal] = useState(false);

  // 自动在对话框打开时暂停计时器
  useDialogPauseTracking({
    isDialogOpen: showModal,
    onPause: () => timer.pause(),
    onResume: () => timer.resume(),
  });

  return (
    <>
      <Timer elapsed={timer.elapsed} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        {/* 打开模态框时计时器自动暂停 */}
      </Modal>
    </>
  );
}
```

### 测试选项生成 (useTestOptions)

```typescript
import { useTestOptions } from '@/hooks';

function TestPage() {
  const { options, regenerate } = useTestOptions({
    word: currentWord,
    allWords: wordList,
    optionCount: 4,
  });

  return (
    <div>
      {options.map(option => (
        <button key={option.id} onClick={() => handleSelect(option)}>
          {option.text}
        </button>
      ))}
    </div>
  );
}
```

### 自动播放发音 (useAutoPlayPronunciation)

```typescript
import { useAutoPlayPronunciation } from '@/hooks';

function WordCard({ word }) {
  // 自动在单词变化时播放发音
  useAutoPlayPronunciation({
    word,
    enabled: autoPlayEnabled,
    delay: 300,
  });

  return <div>{word.spelling}</div>;
}
```

## 状态持久化

### StorageService

```typescript
// 本地存储服务
import StorageService from '@/services/StorageService';

// 设置当前用户
await StorageService.setCurrentUser(userId);

// 获取本地数据
const localData = await StorageService.getLocalData();

// 保存学习进度
await StorageService.saveLearningProgress(progress);

// 清除本地数据
await StorageService.clearLocalData();
```

### 与 React Query 配合

```typescript
// 登出时清除所有状态
async function handleLogout() {
  // 清除服务端状态缓存
  queryClient.clear();

  // 清除本地存储
  await StorageService.clearLocalData();

  // 清除认证信息
  authClient.clearToken();
}
```

## 最佳实践

### 1. 状态提升原则

```tsx
// 不好：状态下沉导致重复请求
function WordList() {
  const { data } = useWords(); // 每次渲染都请求
  return <List items={data} />;
}

function WordStats() {
  const { data } = useWords(); // 重复请求
  return <Stats words={data} />;
}

// 好：状态提升到共同父组件
function WordPage() {
  const { data: words } = useWords(); // 单次请求，自动缓存

  return (
    <>
      <WordList words={words} />
      <WordStats words={words} />
    </>
  );
}
```

### 2. 避免过度使用全局状态

```tsx
// 不好：所有状态都放 Context
const AppContext = createContext({
  user: null,
  words: [],
  settings: {},
  // ... 大量状态
});

// 好：按职责分离
// - 认证状态 → AuthContext
// - 服务端数据 → React Query
// - UI 状态 → 组件本地状态
```

### 3. 合理使用缓存

```typescript
// 频繁变化的数据：短缓存时间
const { data } = useQuery({
  queryKey: ['notifications'],
  queryFn: fetchNotifications,
  staleTime: 30 * 1000, // 30 秒
});

// 稳定的数据：长缓存时间
const { data } = useQuery({
  queryKey: ['systemConfig'],
  queryFn: fetchSystemConfig,
  staleTime: 24 * 60 * 60 * 1000, // 24 小时
});
```

### 4. 错误处理

```typescript
function WordList() {
  const { data, error, isError, refetch } = useWords();

  if (isError) {
    return (
      <ErrorView
        error={error}
        onRetry={refetch}
      />
    );
  }

  return <List items={data} />;
}
```

## 相关文档

- [架构文档](./ARCHITECTURE.md)
- [API 文档](./API.md)
- [组件文档](./COMPONENTS.md)
- [开发指南](./DEVELOPMENT.md)
