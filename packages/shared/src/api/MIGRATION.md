# API迁移指南

本文档帮助您从旧版API迁移到新版v1 API和新服务。

## 目录

- [迁移概述](#迁移概述)
- [Realtime API迁移](#realtime-api迁移)
- [LearningState API迁移](#learningstate-api迁移)
- [UserProfile API迁移](#userprofile-api迁移)
- [废弃API映射](#废弃api映射)
- [常见问题](#常见问题)

## 迁移概述

### 主要变化

1. **API版本化**: 新API使用 `/api/v1` 前缀
2. **统一响应格式**: 所有API返回统一的响应格式
3. **增强的错误处理**: 提供详细的错误代码和消息
4. **实时通信**: 通过SSE实现服务器推送
5. **服务整合**: 多个分散的服务整合为统一的API

### 迁移步骤

1. 安装/更新依赖
2. 替换旧的API调用
3. 更新数据模型
4. 测试新功能
5. 清理旧代码

## Realtime API迁移

### 旧方式：轮询

```typescript
// ❌ 旧方式：使用定时器轮询
useEffect(() => {
  const timer = setInterval(async () => {
    try {
      const response = await fetch('/api/feedback/latest');
      const data = await response.json();
      if (data.feedback) {
        setFeedback(data.feedback);
      }
    } catch (error) {
      console.error('Failed to fetch feedback:', error);
    }
  }, 1000); // 每秒轮询一次

  return () => clearInterval(timer);
}, []);
```

### 新方式：SSE实时推送

```typescript
// ✅ 新方式：使用SSE实时推送
import { useRealtimeConnection, useRealtimeEvent } from '@danci/shared/api/hooks';
import { realtimeAdapter } from './api';

function MyComponent({ sessionId }) {
  // 建立SSE连接
  const { isConnected } = useRealtimeConnection(realtimeAdapter, {
    sessionId,
    eventTypes: ['feedback'],
    autoConnect: true,
  });

  // 监听反馈事件
  const { latestEvent } = useRealtimeEvent(realtimeAdapter, 'feedback');

  return (
    <div>
      {isConnected && <span>✓ 已连接</span>}
      {latestEvent && (
        <div>反馈: {latestEvent.payload.message}</div>
      )}
    </div>
  );
}
```

### 迁移优势

- **实时性**: 从1秒延迟降低到几乎实时
- **性能**: 减少约99%的网络请求
- **服务器负载**: 减少轮询带来的服务器压力
- **功能增强**: 支持多种事件类型和过滤

## LearningState API迁移

### 场景1: 获取单词学习状态

```typescript
// ❌ 旧方式：分别调用多个API
const wordState = await fetch(`/api/word-state/${userId}/${wordId}`).then((r) => r.json());
const wordScore = await fetch(`/api/word-score/${userId}/${wordId}`).then((r) => r.json());
const mastery = await fetch(`/api/word-mastery/${userId}/${wordId}`).then((r) => r.json());

// 手动合并数据
const completeState = {
  state: wordState.data,
  score: wordScore.data,
  mastery: mastery.data,
};

// ✅ 新方式：使用统一的API
import { learningStateAdapter } from './api';

const completeState = await learningStateAdapter.getWordState(
  userId,
  wordId,
  true, // 包含掌握度评估
);
```

### 场景2: 批量操作

```typescript
// ❌ 旧方式：循环调用API
const wordIds = ['word1', 'word2', 'word3'];
const states = [];

for (const wordId of wordIds) {
  const state = await fetch(`/api/word-state/${userId}/${wordId}`).then((r) => r.json());
  states.push(state.data);
}

// ✅ 新方式：批量API
const states = await learningStateAdapter.batchGetWordStates(userId, wordIds, true);
```

### 场景3: 使用React Hook

```typescript
// ❌ 旧方式：手动管理状态
function WordComponent({ userId, wordId }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/word-state/${userId}/${wordId}`)
      .then((r) => r.json())
      .then((data) => {
        setState(data);
        setLoading(false);
      })
      .catch((error) => {
        setError(error);
        setLoading(false);
      });
  }, [userId, wordId]);

  // ... 渲染逻辑
}

// ✅ 新方式：使用Hook
import { useWordState } from '@danci/shared/api/hooks';
import { learningStateAdapter } from './api';

function WordComponent({ userId, wordId }) {
  const { data, loading, error } = useWordState(learningStateAdapter, userId, wordId, true);

  // ... 渲染逻辑
}
```

## UserProfile API迁移

### 场景1: 获取用户画像

```typescript
// ❌ 旧方式：分别调用多个API
const user = await fetch(`/api/user/${userId}`).then((r) => r.json());
const habit = await fetch(`/api/habit-profile/${userId}`).then((r) => r.json());
const cognitive = await fetch(`/api/cognitive/${userId}`).then((r) => r.json());
const learning = await fetch(`/api/learning-profile/${userId}`).then((r) => r.json());

const profile = {
  user: user.data,
  habitProfile: habit.data,
  cognitiveProfile: cognitive.data,
  learningProfile: learning.data,
};

// ✅ 新方式：统一API
import { userProfileAdapter } from './api';

const profile = await userProfileAdapter.getUserProfile(userId, {
  includeHabit: true,
  includeCognitive: true,
  includeLearning: true,
});
```

### 场景2: 更新习惯画像

```typescript
// ❌ 旧方式：直接更新数据库记录
await fetch(`/api/habit-profile/${userId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    timePref: [...],
    rhythmPref: {...},
  }),
});

// ✅ 新方式：使用适配器
await userProfileAdapter.updateHabitProfile(userId, {
  timePref: [...],
  rhythmPref: {...},
});
```

## 废弃API映射

### LearningState相关

| 旧API                                             | 新API                                                     | 适配器方法               |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------ |
| `GET /api/word-state/:userId/:wordId`             | `GET /api/word-state/:userId/:wordId?includeMastery=true` | `getWordState()`         |
| `POST /api/word-state/:userId/batch`              | `POST /api/word-state/:userId/batch`                      | `batchGetWordStates()`   |
| `GET /api/word-score/:userId/:wordId`             | `GET /api/word-score/:userId/:wordId`                     | `getWordScore()`         |
| `POST /api/word-mastery/:userId/:wordId/evaluate` | `POST /api/word-mastery/:userId/:wordId/evaluate`         | `evaluateWord()`         |
| `GET /api/learning-state/:userId/stats`           | `GET /api/learning-state/:userId/stats`                   | `getUserLearningStats()` |

### UserProfile相关

| 旧API                               | 新API                                | 适配器方法                    |
| ----------------------------------- | ------------------------------------ | ----------------------------- |
| `GET /api/user/:userId`             | `GET /api/user/:userId`              | `getUserById()`               |
| `GET /api/profile/:userId`          | `GET /api/profile/:userId`           | `getUserProfile()`            |
| `PUT /api/habit-profile/:userId`    | `PUT /api/profile/:userId/habit`     | `updateHabitProfile()`        |
| `GET /api/cognitive/:userId`        | `GET /api/profile/:userId/cognitive` | `getCognitiveProfile()`       |
| `PUT /api/learning-profile/:userId` | `PUT /api/profile/:userId/learning`  | `updateUserLearningProfile()` |

### Realtime相关

| 旧方式                      | 新API                                             | 适配器方法                        |
| --------------------------- | ------------------------------------------------- | --------------------------------- |
| 轮询 `/api/feedback/latest` | SSE `/api/v1/realtime/sessions/:sessionId/stream` | `connect()` + `on('feedback')`    |
| 轮询 `/api/alerts/latest`   | SSE `/api/v1/realtime/sessions/:sessionId/stream` | `connect()` + `on('alert')`       |
| 轮询 `/api/flow/status`     | SSE `/api/v1/realtime/sessions/:sessionId/stream` | `connect()` + `on('flow-update')` |

## 常见问题

### Q1: 旧API什么时候会被移除？

A: 旧API将在v2.0版本中被完全移除。在此之前，旧API将继续可用，但会返回废弃警告。

### Q2: 如何处理API版本警告？

```typescript
// 添加响应拦截器检查版本警告
apiClient.addResponseInterceptor(async (response) => {
  if (response.data?.deprecated) {
    console.warn(
      `API已废弃: ${response.data.deprecationMessage}`,
      `迁移指南: ${response.data.migrationGuide}`,
    );
  }
  return response;
});
```

### Q3: SSE在不支持的浏览器中如何兼容？

```typescript
// 检测SSE支持
if (typeof EventSource === 'undefined') {
  console.warn('浏览器不支持SSE，将使用轮询');
  // 回退到轮询方案
} else {
  // 使用SSE
  realtimeAdapter.connect({
    sessionId: 'session_123',
  });
}
```

### Q4: 如何测试新API？

```typescript
// 使用测试环境
const apiClient = createApiClient({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  enableLog: true,
});

// 使用测试端点
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

### Q5: 批量操作的最佳实践是什么？

```typescript
// ✅ 推荐：批量操作
const wordIds = ['word1', 'word2', 'word3', 'word4', 'word5'];
const states = await learningStateAdapter.batchGetWordStates(userId, wordIds);

// ❌ 不推荐：循环单个请求
for (const wordId of wordIds) {
  const state = await learningStateAdapter.getWordState(userId, wordId);
}

// ✅ 如果必须循环，使用Promise.all并发
const states = await Promise.all(
  wordIds.map((wordId) => learningStateAdapter.getWordState(userId, wordId)),
);
```

### Q6: 如何处理认证Token过期？

```typescript
// 方法1：使用错误拦截器
apiClient.addErrorInterceptor(async (error) => {
  if (error.status === 401) {
    // Token过期，刷新Token
    const newToken = await refreshAuthToken();
    apiClient.updateConfig({ token: newToken });
    // 不抛出错误，自动重试
    return error;
  }
  throw error;
});

// 方法2：使用getToken函数
const apiClient = createApiClient({
  getToken: async () => {
    const token = localStorage.getItem('auth_token');
    const expiry = localStorage.getItem('token_expiry');

    // 检查Token是否过期
    if (expiry && Date.now() > Number(expiry)) {
      // Token过期，刷新Token
      const newToken = await refreshAuthToken();
      return newToken;
    }

    return token;
  },
});
```

### Q7: 如何调试SSE连接问题？

```typescript
// 启用详细日志
const realtimeAdapter = createRealtimeAdapter(apiClient);

realtimeAdapter.onAll((event) => {
  console.log('[SSE Event]', event);
});

// 监控连接状态
const connectionInfo = realtimeAdapter.getConnectionInfo();
console.log('连接状态:', connectionInfo);

// 使用浏览器开发工具
// 1. 打开Network面板
// 2. 筛选"EventStream"类型
// 3. 查看SSE消息
```

## 完整迁移示例

### 迁移前

```typescript
// old-app.tsx
function App() {
  const [feedback, setFeedback] = useState(null);
  const [wordState, setWordState] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // 轮询反馈
  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch('/api/feedback/latest');
      const data = await res.json();
      setFeedback(data);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取单词状态
  useEffect(() => {
    Promise.all([
      fetch(`/api/word-state/${userId}/${wordId}`),
      fetch(`/api/word-score/${userId}/${wordId}`),
      fetch(`/api/word-mastery/${userId}/${wordId}`),
    ])
      .then(([s1, s2, s3]) => Promise.all([s1.json(), s2.json(), s3.json()]))
      .then(([state, score, mastery]) => {
        setWordState({ state, score, mastery });
      });
  }, [userId, wordId]);

  // 获取用户画像
  useEffect(() => {
    Promise.all([
      fetch(`/api/user/${userId}`),
      fetch(`/api/habit-profile/${userId}`),
      fetch(`/api/cognitive/${userId}`),
    ])
      .then(([u, h, c]) => Promise.all([u.json(), h.json(), c.json()]))
      .then(([user, habit, cognitive]) => {
        setUserProfile({ user, habit, cognitive });
      });
  }, [userId]);

  // ... 渲染逻辑
}
```

### 迁移后

```typescript
// new-app.tsx
import {
  useRealtimeConnection,
  useRealtimeEvent,
  useWordState,
  useUserProfile,
} from '@danci/shared/api/hooks';
import { realtimeAdapter, learningStateAdapter, userProfileAdapter } from './api';

function App() {
  // SSE实时连接
  const { isConnected } = useRealtimeConnection(realtimeAdapter, {
    sessionId: 'session_123',
    autoConnect: true,
  });

  // 监听反馈事件
  const { latestEvent: feedback } = useRealtimeEvent(realtimeAdapter, 'feedback');

  // 获取单词状态（包含得分和掌握度）
  const { data: wordState } = useWordState(learningStateAdapter, userId, wordId, true);

  // 获取用户画像
  const { data: userProfile } = useUserProfile(userProfileAdapter, userId, {
    includeHabit: true,
    includeCognitive: true,
    includeLearning: true,
  });

  // ... 渲染逻辑（代码更简洁，逻辑更清晰）
}
```

### 对比总结

| 指标        | 迁移前               | 迁移后         | 改进 |
| ----------- | -------------------- | -------------- | ---- |
| 代码行数    | ~80行                | ~40行          | -50% |
| API调用次数 | 轮询1次/秒 + 6次初始 | SSE + 2次初始  | -99% |
| 实时性      | 1秒延迟              | 几乎实时       | 10x  |
| 类型安全    | 无                   | 完整TypeScript | ✓    |
| 错误处理    | 手动                 | 自动           | ✓    |
| 重试机制    | 无                   | 自动           | ✓    |
