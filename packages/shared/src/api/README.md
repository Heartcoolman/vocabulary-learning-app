# API适配器使用指南

本文档介绍如何使用前端API适配器与后端v1版本API和新服务进行交互。

## 目录

- [快速开始](#快速开始)
- [API客户端](#api客户端)
- [Realtime API](#realtime-api)
- [LearningState API](#learningstate-api)
- [UserProfile API](#userprofile-api)
- [React Hooks](#react-hooks)
- [错误处理](#错误处理)
- [最佳实践](#最佳实践)

## 快速开始

### 安装

适配器位于 `@danci/shared` 包中，已包含在项目依赖中。

### 基础使用

```typescript
import {
  createApiClient,
  createRealtimeAdapter,
  createLearningStateAdapter,
  createUserProfileAdapter,
} from '@danci/shared/api';

// 1. 创建API客户端
const apiClient = createApiClient({
  baseURL: '/api',
  timeout: 30000,
  retries: 3,
  getToken: () => localStorage.getItem('auth_token'),
});

// 2. 创建各个适配器
const realtimeAdapter = createRealtimeAdapter(apiClient);
const learningStateAdapter = createLearningStateAdapter(apiClient);
const userProfileAdapter = createUserProfileAdapter(apiClient);
```

## API客户端

### 配置选项

```typescript
interface ApiClientConfig {
  baseURL?: string; // 基础URL，默认 '/api'
  timeout?: number; // 超时时间（毫秒），默认 30000
  retries?: number; // 重试次数，默认 3
  retryDelay?: number; // 重试延迟（毫秒），默认 1000
  enableLog?: boolean; // 是否启用日志，默认开发环境启用
  headers?: Record<string, string>; // 自定义请求头
  token?: string; // 认证Token
  getToken?: () => string | null | Promise<string | null>; // Token获取函数
}
```

### 请求拦截器

```typescript
// 添加请求拦截器
apiClient.addRequestInterceptor(async (config) => {
  // 修改请求配置
  config.headers = {
    ...config.headers,
    'X-Custom-Header': 'value',
  };
  return config;
});

// 添加响应拦截器
apiClient.addResponseInterceptor(async (response) => {
  // 处理响应数据
  console.log('Response:', response);
  return response;
});

// 添加错误拦截器
apiClient.addErrorInterceptor(async (error) => {
  // 处理错误
  if (error.status === 401) {
    // 处理未授权错误
    window.location.href = '/login';
  }
  return error;
});
```

### 请求选项

```typescript
interface RequestOptions {
  signal?: AbortSignal; // 取消令牌
  timeout?: number; // 超时时间
  retry?: boolean; // 是否重试
  retries?: number; // 重试次数
  headers?: Record<string, string>; // 额外的请求头
  params?: Record<string, any>; // 查询参数
}

// 使用示例
const controller = new AbortController();

const response = await apiClient.get('/endpoint', {
  signal: controller.signal,
  timeout: 10000,
  retry: true,
  retries: 3,
  params: { page: 1, limit: 20 },
});

// 取消请求
controller.abort();
```

## Realtime API

### 建立SSE连接

```typescript
import { createRealtimeAdapter } from '@danci/shared/api';

const realtimeAdapter = createRealtimeAdapter(apiClient);

// 连接到SSE流
realtimeAdapter.connect({
  sessionId: 'session_123',
  eventTypes: ['feedback', 'alert', 'flow-update'], // 可选，过滤事件类型
  autoReconnect: true, // 自动重连
  reconnectInterval: 3000, // 重连间隔
  maxReconnectAttempts: 10, // 最大重连次数
  heartbeatTimeout: 60000, // 心跳超时
});
```

### 监听事件

```typescript
// 监听特定类型的事件
const unsubscribe = realtimeAdapter.on('feedback', (event) => {
  console.log('收到反馈:', event.payload);
  // 处理反馈事件
});

// 监听所有事件
const unsubscribeAll = realtimeAdapter.onAll((event) => {
  console.log('收到事件:', event);
});

// 取消监听
unsubscribe();
unsubscribeAll();
```

### 获取连接信息

```typescript
const connectionInfo = realtimeAdapter.getConnectionInfo();
console.log('连接状态:', connectionInfo.state);
console.log('连接时间:', connectionInfo.connectedAt);
console.log('最后心跳:', connectionInfo.lastHeartbeat);
console.log('重连次数:', connectionInfo.reconnectAttempts);
```

### 断开连接

```typescript
realtimeAdapter.disconnect();
```

### 获取统计信息

```typescript
const stats = await realtimeAdapter.getStats();
console.log('总订阅数:', stats.totalSubscriptions);
console.log('活跃用户数:', stats.activeUsers);
console.log('活跃会话数:', stats.activeSessions);
```

## LearningState API

### 获取单词学习状态

```typescript
import { createLearningStateAdapter } from '@danci/shared/api';

const learningStateAdapter = createLearningStateAdapter(apiClient);

// 获取单个单词状态
const wordState = await learningStateAdapter.getWordState(
  userId,
  wordId,
  true, // 包含掌握度评估
);

console.log('学习状态:', wordState.learningState);
console.log('得分:', wordState.score);
console.log('掌握度:', wordState.mastery);
```

### 批量获取单词状态

```typescript
const wordStates = await learningStateAdapter.batchGetWordStates(
  userId,
  ['word1', 'word2', 'word3'],
  true,
);

for (const [wordId, state] of Object.entries(wordStates)) {
  console.log(`单词 ${wordId}:`, state);
}
```

### 更新单词状态

```typescript
await learningStateAdapter.updateWordState(userId, wordId, {
  state: 'REVIEWING',
  masteryLevel: 3,
  easeFactor: 2.5,
  reviewCount: 5,
  lastReviewDate: new Date().toISOString(),
  nextReviewDate: new Date(Date.now() + 86400000).toISOString(),
});
```

### 获取需要复习的单词

```typescript
const dueWords = await learningStateAdapter.getDueWords(userId);
console.log('需要复习的单词数:', dueWords.length);
```

### 更新单词得分

```typescript
const score = await learningStateAdapter.updateWordScore(userId, wordId, {
  isCorrect: true,
  responseTime: 2500,
});
```

### 评估单词掌握度

```typescript
const evaluation = await learningStateAdapter.evaluateWord(userId, wordId);

console.log('掌握度评分:', evaluation.score);
console.log('是否已掌握:', evaluation.isLearned);
console.log('推荐:', evaluation.recommendation);
console.log('各项因素:', evaluation.factors);
```

### 记录复习事件

```typescript
await learningStateAdapter.recordReview(userId, wordId, {
  timestamp: Date.now(),
  isCorrect: true,
  responseTime: 2500,
});
```

### 获取用户学习统计

```typescript
const stats = await learningStateAdapter.getUserLearningStats(userId);

console.log('状态统计:', stats.stateStats);
console.log('得分统计:', stats.scoreStats);
console.log('掌握度统计:', stats.masteryStats);
```

## UserProfile API

### 获取用户信息

```typescript
import { createUserProfileAdapter } from '@danci/shared/api';

const userProfileAdapter = createUserProfileAdapter(apiClient);

// 获取指定用户信息
const user = await userProfileAdapter.getUserById(userId);

// 获取当前用户信息
const currentUser = await userProfileAdapter.getCurrentUser();
```

### 获取完整用户画像

```typescript
const profile = await userProfileAdapter.getUserProfile(userId, {
  includeHabit: true,
  includeCognitive: true,
  includeLearning: true,
});

console.log('用户信息:', profile.user);
console.log('习惯画像:', profile.habitProfile);
console.log('认知画像:', profile.cognitiveProfile);
console.log('学习档案:', profile.learningProfile);
```

### 更新习惯画像

```typescript
const habitProfile = await userProfileAdapter.updateHabitProfile(userId, {
  timePref: [0, 0, 0, 0, 0, 5, 10, 15, 20, 18, 12, 8, 6, 4, 3, 5, 8, 12, 15, 20, 18, 10, 5, 2],
  rhythmPref: {
    sessionMedianMinutes: 30,
    batchMedian: 10,
  },
});
```

### 获取认知画像

```typescript
const cognitiveProfile = await userProfileAdapter.getCognitiveProfile(userId);

if (cognitiveProfile.chronotype) {
  console.log('时间类型:', cognitiveProfile.chronotype.type);
  console.log('峰值时段:', cognitiveProfile.chronotype.peakHours);
}

if (cognitiveProfile.learningStyle) {
  console.log('学习风格:', cognitiveProfile.learningStyle.dominantStyle);
  console.log('风格评分:', cognitiveProfile.learningStyle.styleScores);
}
```

### 更新学习档案

```typescript
const learningProfile = await userProfileAdapter.updateUserLearningProfile(userId, {
  attention: 0.8,
  fatigue: 0.2,
  motivation: 0.9,
  emotionBaseline: 'positive',
  flowScore: 0.7,
});
```

### 记录学习习惯

```typescript
// 记录学习时间事件
await userProfileAdapter.recordTimeEvent(userId);

// 记录会话结束
await userProfileAdapter.recordSessionEnd(userId, 30, 10); // 30分钟，10个单词
```

## React Hooks

### 使用Realtime连接Hook

```typescript
import { useRealtimeConnection, useRealtimeEvent } from '@danci/shared/api/hooks';

function MyComponent() {
  // 建立SSE连接
  const { isConnected, connect, disconnect } = useRealtimeConnection(
    realtimeAdapter,
    {
      sessionId: 'session_123',
      eventTypes: ['feedback', 'alert'],
      autoConnect: true,
    }
  );

  // 监听反馈事件
  const { latestEvent, events } = useRealtimeEvent(
    realtimeAdapter,
    'feedback',
    {
      maxHistory: 50,
      onEvent: (event) => {
        console.log('收到反馈:', event);
      },
    }
  );

  return (
    <div>
      <p>连接状态: {isConnected ? '已连接' : '未连接'}</p>
      <button onClick={connect}>连接</button>
      <button onClick={disconnect}>断开</button>
      {latestEvent && (
        <div>最新反馈: {latestEvent.payload.message}</div>
      )}
    </div>
  );
}
```

### 使用LearningState Hook

```typescript
import { useWordState, useDueWords } from '@danci/shared/api/hooks';

function WordLearningComponent({ userId, wordId }) {
  const { data, loading, error, updateState } = useWordState(
    learningStateAdapter,
    userId,
    wordId,
    true
  );

  const handleReview = async (isCorrect: boolean) => {
    await updateState({
      reviewCount: (data?.learningState?.reviewCount || 0) + 1,
      lastReviewDate: new Date().toISOString(),
    });
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;

  return (
    <div>
      <h3>单词状态</h3>
      <p>状态: {data?.learningState?.state}</p>
      <p>掌握度: {data?.mastery?.score}</p>
      <button onClick={() => handleReview(true)}>正确</button>
      <button onClick={() => handleReview(false)}>错误</button>
    </div>
  );
}

function DueWordsComponent({ userId }) {
  const { data, loading, refresh } = useDueWords(learningStateAdapter, userId);

  if (loading) return <div>加载中...</div>;

  return (
    <div>
      <h3>需要复习的单词</h3>
      <p>共 {data?.length || 0} 个单词</p>
      <button onClick={refresh}>刷新</button>
      <ul>
        {data?.map(word => (
          <li key={word.wordId}>{word.wordId}</li>
        ))}
      </ul>
    </div>
  );
}
```

### 使用UserProfile Hook

```typescript
import { useUserProfile, useHabitProfile } from '@danci/shared/api/hooks';

function UserProfileComponent({ userId }) {
  const { data, loading, refresh } = useUserProfile(
    userProfileAdapter,
    userId,
    {
      includeHabit: true,
      includeCognitive: true,
      includeLearning: true,
    }
  );

  if (loading) return <div>加载中...</div>;

  return (
    <div>
      <h2>用户画像</h2>
      <p>用户名: {data?.user.username}</p>
      <p>邮箱: {data?.user.email}</p>

      {data?.habitProfile && (
        <div>
          <h3>习惯画像</h3>
          <p>学习节奏: {data.habitProfile.rhythmPref.sessionMedianMinutes}分钟/次</p>
        </div>
      )}

      {data?.cognitiveProfile.chronotype && (
        <div>
          <h3>时间节律</h3>
          <p>类型: {data.cognitiveProfile.chronotype.type}</p>
        </div>
      )}
    </div>
  );
}
```

## 错误处理

### 错误类型

```typescript
import { ApiError } from '@danci/shared/api';

try {
  const result = await apiClient.get('/endpoint');
} catch (error) {
  if (error instanceof ApiError) {
    console.error('错误代码:', error.code);
    console.error('HTTP状态:', error.status);
    console.error('错误消息:', error.message);
    console.error('响应数据:', error.response);
  }
}
```

### 全局错误处理

```typescript
// 添加全局错误拦截器
apiClient.addErrorInterceptor(async (error) => {
  switch (error.code) {
    case 'NETWORK_ERROR':
      alert('网络错误，请检查网络连接');
      break;
    case 'REQUEST_CANCELLED':
      console.log('请求已取消');
      break;
    default:
      if (error.status === 401) {
        // 未授权，跳转到登录页
        window.location.href = '/login';
      } else if (error.status >= 500) {
        // 服务器错误
        alert('服务器错误，请稍后重试');
      }
  }
  return error;
});
```

## 最佳实践

### 1. 单例模式

```typescript
// api.ts
import {
  createApiClient,
  createRealtimeAdapter,
  createLearningStateAdapter,
  createUserProfileAdapter,
} from '@danci/shared/api';

// 创建单例
export const apiClient = createApiClient({
  baseURL: '/api',
  timeout: 30000,
  retries: 3,
  getToken: () => localStorage.getItem('auth_token'),
});

export const realtimeAdapter = createRealtimeAdapter(apiClient);
export const learningStateAdapter = createLearningStateAdapter(apiClient);
export const userProfileAdapter = createUserProfileAdapter(apiClient);

// 在其他文件中导入使用
import { learningStateAdapter } from './api';
```

### 2. 请求取消

```typescript
import { createAbortController } from '@danci/shared/api';

// 方法1：使用AbortController
const controller = new AbortController();
const promise = apiClient.get('/endpoint', { signal: controller.signal });

// 取消请求
controller.abort();

// 方法2：使用超时自动取消
const controller2 = createAbortController(5000); // 5秒后自动取消
const promise2 = apiClient.get('/endpoint', { signal: controller2.signal });
```

### 3. 批量操作

```typescript
// 批量获取单词状态
const wordIds = ['word1', 'word2', 'word3', 'word4', 'word5'];
const states = await learningStateAdapter.batchGetWordStates(userId, wordIds);

// 批量更新单词状态
const updates = wordIds.map((wordId) => ({
  wordId,
  data: { reviewCount: 1 },
}));
await learningStateAdapter.batchUpdateWordStates(userId, updates);
```

### 4. 条件重试

```typescript
// 自定义重试逻辑
apiClient.addErrorInterceptor(async (error) => {
  if (error.status === 503) {
    // 服务不可用，等待5秒后重试
    await new Promise((resolve) => setTimeout(resolve, 5000));
    throw error; // 继续重试
  }
  return error;
});
```

### 5. 缓存管理

```typescript
// 清除用户缓存
await learningStateAdapter.clearUserCache(userId);

// 清除单词缓存
await learningStateAdapter.clearWordCache(userId, wordId);
```

### 6. 性能优化

```typescript
// 使用 React.memo 避免不必要的重渲染
const WordComponent = React.memo(({ wordId, userId }) => {
  const { data } = useWordState(learningStateAdapter, userId, wordId);
  return <div>{data?.learningState?.state}</div>;
});

// 使用 useMemo 缓存计算结果
const stats = useMemo(() => {
  if (!data) return null;
  return {
    totalWords: data.stateStats.totalWords,
    masteredWords: data.stateStats.masteredWords,
    progress: (data.stateStats.masteredWords / data.stateStats.totalWords) * 100,
  };
}, [data]);
```

## 调试技巧

### 启用日志

```typescript
const apiClient = createApiClient({
  enableLog: true, // 启用详细日志
});
```

### 监控请求

```typescript
// 添加请求日志拦截器
apiClient.addRequestInterceptor(async (config) => {
  console.log(`[Request] ${config.method} ${config.url}`, config.data);
  return config;
});

// 添加响应日志拦截器
apiClient.addResponseInterceptor(async (response) => {
  console.log('[Response]', response);
  return response;
});
```

### 测试SSE连接

```typescript
// 发送测试事件（仅开发环境）
if (process.env.NODE_ENV === 'development') {
  await realtimeAdapter.sendTestEvent('session_123', 'feedback', {
    sessionId: 'session_123',
    wordId: 1,
    feedbackType: 'correct',
    message: '测试反馈',
    timestamp: new Date().toISOString(),
  });
}
```
