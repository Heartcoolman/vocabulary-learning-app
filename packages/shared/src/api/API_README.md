# 前端API适配器

前端与后端API交互的统一适配器，提供完整的TypeScript类型定义、错误处理、重试机制和React Hooks支持。

## 特性

- ✅ **完整的TypeScript类型定义** - 所有API都有完整的类型支持
- ✅ **统一的错误处理** - 自动处理网络错误、超时、重试等
- ✅ **自动重试机制** - 可配置的指数退避重试
- ✅ **请求取消** - 支持AbortController取消请求
- ✅ **SSE实时通信** - 完整的Server-Sent Events支持
- ✅ **React Hooks** - 开箱即用的React Hook封装
- ✅ **拦截器支持** - 请求/响应/错误拦截器
- ✅ **批量操作** - 优化的批量API调用
- ✅ **缓存管理** - 自动缓存管理和失效

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

// 2. 创建适配器
const realtimeAdapter = createRealtimeAdapter(apiClient);
const learningStateAdapter = createLearningStateAdapter(apiClient);
const userProfileAdapter = createUserProfileAdapter(apiClient);
```

### React组件中使用

```typescript
import { useWordState, useRealtimeConnection } from '@danci/shared/api/hooks';

function MyComponent({ userId, wordId, sessionId }) {
  // 获取单词状态
  const { data, loading, error } = useWordState(
    learningStateAdapter,
    userId,
    wordId,
    true
  );

  // 建立SSE连接
  const { isConnected } = useRealtimeConnection(realtimeAdapter, {
    sessionId,
    autoConnect: true,
  });

  // 渲染组件
  return (
    <div>
      {isConnected && <span>实时连接已建立</span>}
      {loading && <span>加载中...</span>}
      {data && <div>单词状态: {data.learningState?.state}</div>}
    </div>
  );
}
```

## 文档

- [使用指南](./README.md) - 完整的API使用文档
- [迁移指南](./MIGRATION.md) - 从旧API迁移到新API
- [示例代码](./examples/) - 各种使用场景的示例代码

## API适配器

### 1. Realtime API适配器

用于SSE实时事件通信。

```typescript
// 连接到SSE流
realtimeAdapter.connect({
  sessionId: 'session_123',
  eventTypes: ['feedback', 'alert'],
  autoReconnect: true,
});

// 监听事件
realtimeAdapter.on('feedback', (event) => {
  console.log('收到反馈:', event.payload);
});

// 断开连接
realtimeAdapter.disconnect();
```

### 2. LearningState API适配器

用于管理单词学习状态、得分和掌握度。

```typescript
// 获取单词状态
const state = await learningStateAdapter.getWordState(userId, wordId, true);

// 更新单词状态
await learningStateAdapter.updateWordState(userId, wordId, {
  state: 'REVIEWING',
  reviewCount: 5,
});

// 获取需要复习的单词
const dueWords = await learningStateAdapter.getDueWords(userId);

// 评估掌握度
const evaluation = await learningStateAdapter.evaluateWord(userId, wordId);
```

### 3. UserProfile API适配器

用于管理用户画像和学习档案。

```typescript
// 获取完整用户画像
const profile = await userProfileAdapter.getUserProfile(userId, {
  includeHabit: true,
  includeCognitive: true,
  includeLearning: true,
});

// 更新习惯画像
await userProfileAdapter.updateHabitProfile(userId, {
  timePref: [...],
  rhythmPref: {...},
});

// 获取认知画像
const cognitive = await userProfileAdapter.getCognitiveProfile(userId);
```

## React Hooks

### 实时连接Hook

```typescript
const { isConnected, connect, disconnect } = useRealtimeConnection(realtimeAdapter, {
  sessionId: 'session_123',
  autoConnect: true,
});
```

### 学习状态Hook

```typescript
const { data, loading, error, updateState } = useWordState(
  learningStateAdapter,
  userId,
  wordId,
  true,
);
```

### 用户画像Hook

```typescript
const { data, loading, refresh } = useUserProfile(userProfileAdapter, userId, {
  includeHabit: true,
  includeCognitive: true,
});
```

## 错误处理

```typescript
import { ApiError } from '@danci/shared/api';

try {
  const result = await learningStateAdapter.getWordState(userId, wordId);
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API错误:', error.code, error.message);
    console.error('HTTP状态:', error.status);
  }
}
```

## 高级功能

### 请求拦截器

```typescript
apiClient.addRequestInterceptor(async (config) => {
  config.headers['X-Custom-Header'] = 'value';
  return config;
});
```

### 响应拦截器

```typescript
apiClient.addResponseInterceptor(async (response) => {
  console.log('Response:', response);
  return response;
});
```

### 错误拦截器

```typescript
apiClient.addErrorInterceptor(async (error) => {
  if (error.status === 401) {
    window.location.href = '/login';
  }
  return error;
});
```

### 请求取消

```typescript
const controller = new AbortController();

const promise = learningStateAdapter.getUserStats(userId, {
  signal: controller.signal,
});

// 取消请求
controller.abort();
```

## 最佳实践

### 1. 创建单例

```typescript
// api.ts
export const apiClient = createApiClient({...});
export const realtimeAdapter = createRealtimeAdapter(apiClient);
export const learningStateAdapter = createLearningStateAdapter(apiClient);
export const userProfileAdapter = createUserProfileAdapter(apiClient);
```

### 2. 使用批量API

```typescript
// ✅ 推荐
const states = await learningStateAdapter.batchGetWordStates(userId, wordIds);

// ❌ 不推荐
for (const wordId of wordIds) {
  const state = await learningStateAdapter.getWordState(userId, wordId);
}
```

### 3. 正确处理错误

```typescript
try {
  const result = await apiCall();
} catch (error) {
  if (error instanceof ApiError) {
    // 处理API错误
  }
  throw error;
}
```

### 4. 组件卸载时清理

```typescript
useEffect(() => {
  realtimeAdapter.connect({...});

  return () => {
    realtimeAdapter.disconnect();
  };
}, []);
```

## 项目结构

```
packages/shared/src/api/
├── adapters/              # API适配器
│   ├── base-client.ts     # 基础HTTP客户端
│   ├── realtime-adapter.ts # Realtime API适配器
│   ├── learning-state-adapter.ts # LearningState API适配器
│   ├── user-profile-adapter.ts   # UserProfile API适配器
│   └── index.ts           # 适配器导出
├── types/                 # 类型定义
│   ├── common.ts          # 通用类型
│   ├── realtime.ts        # Realtime类型
│   ├── learning-state.ts  # LearningState类型
│   ├── user-profile.ts    # UserProfile类型
│   └── index.ts           # 类型导出
├── hooks/                 # React Hooks
│   ├── use-realtime.ts    # Realtime Hooks
│   ├── use-learning-state.ts # LearningState Hooks
│   ├── use-user-profile.ts   # UserProfile Hooks
│   └── index.ts           # Hooks导出
├── utils/                 # 工具函数
│   └── helpers.ts         # 辅助函数
├── examples/              # 示例代码
│   ├── basic-usage.ts     # 基础使用示例
│   └── react-components.tsx # React组件示例
├── README.md              # 使用文档
├── MIGRATION.md           # 迁移指南
└── index.ts               # 主入口
```

## 许可证

MIT
