# API 版本化与实时通道 - 使用指南

## 概述

本文档介绍 v1 版本的 API 实时通道功能，用于通过 Server-Sent Events (SSE) 推送实时事件。

## 目录结构

```
packages/backend/src/
├── routes/v1/
│   ├── index.ts                    # v1 路由入口
│   └── realtime.routes.ts          # SSE 实时通道路由
├── services/
│   └── realtime.service.ts         # 实时服务实现
packages/shared/src/types/
└── realtime.ts                     # 实时事件类型定义
```

## API 端点

### 1. 建立 SSE 连接

**端点:** `GET /api/v1/realtime/sessions/:sessionId/stream`

**认证:** 需要

**参数:**

- `sessionId` (路径参数): 学习会话 ID
- `eventTypes` (查询参数，可选): 逗号分隔的事件类型列表，用于过滤事件

**示例请求:**

```bash
curl -N \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/v1/realtime/sessions/session_123/stream"

# 只接收 feedback 和 alert 事件
curl -N \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/v1/realtime/sessions/session_123/stream?eventTypes=feedback,alert"
```

**响应格式 (SSE):**

```
id: msg_1234567890_abc123
event: feedback
data: {"type":"feedback","payload":{"sessionId":"session_123","wordId":1,"feedbackType":"correct","message":"回答正确！","timestamp":"2025-12-12T10:00:00.000Z","scoreChange":10}}

id: msg_1234567891_def456
event: alert
data: {"type":"alert","payload":{"alertId":"alert_123","alertType":"info","title":"学习提醒","content":"已完成今日学习目标！","timestamp":"2025-12-12T10:05:00.000Z"}}
```

### 2. 获取统计信息

**端点:** `GET /api/v1/realtime/stats`

**认证:** 需要

**响应:**

```json
{
  "success": true,
  "data": {
    "totalSubscriptions": 5,
    "activeUsers": 3,
    "activeSessions": 4
  }
}
```

### 3. 测试端点 (仅开发/测试环境)

**端点:** `POST /api/v1/realtime/test`

**认证:** 需要

**请求体:**

```json
{
  "sessionId": "session_123",
  "eventType": "feedback",
  "payload": {
    "sessionId": "session_123",
    "wordId": 1,
    "feedbackType": "correct",
    "message": "测试反馈",
    "timestamp": "2025-12-12T10:00:00.000Z"
  }
}
```

## 事件类型

### 1. feedback (反馈事件)

学习反馈信息推送

```typescript
{
  type: 'feedback',
  payload: {
    sessionId: string;
    wordId: number;
    feedbackType: 'correct' | 'incorrect' | 'skip';
    message: string;
    timestamp: string;
    scoreChange?: number;
    masteryChange?: number;
  }
}
```

### 2. alert (警报事件)

系统警报或学习提醒

```typescript
{
  type: 'alert',
  payload: {
    alertId: string;
    alertType: 'warning' | 'info' | 'success' | 'error';
    title: string;
    content: string;
    timestamp: string;
    priority?: 'low' | 'medium' | 'high';
    actions?: Array<{
      label: string;
      action: string;
    }>;
  }
}
```

### 3. flow-update (流程更新事件)

学习流程状态变化

```typescript
{
  type: 'flow-update',
  payload: {
    sessionId: string;
    flowState: 'started' | 'in_progress' | 'paused' | 'completed' | 'interrupted';
    progress: number;
    completedWords: number;
    totalWords: number;
    timestamp: string;
    nextWordId?: number;
    estimatedTimeRemaining?: number;
  }
}
```

### 4. next-suggestion (建议事件)

推荐下一个学习内容

```typescript
{
  type: 'next-suggestion',
  payload: {
    sessionId: string;
    suggestionType: 'word' | 'review' | 'break' | 'session_end';
    wordId?: number;
    reason: string;
    timestamp: string;
    priorityScore?: number;
    estimatedDuration?: number;
  }
}
```

### 5. ping (心跳事件)

保持连接活跃

```typescript
{
  type: 'ping',
  payload: {
    timestamp: string;
  }
}
```

### 6. error (错误事件)

错误信息推送

```typescript
{
  type: 'error',
  payload: {
    message: string;
    code?: string;
  }
}
```

## 前端使用示例

### 使用原生 EventSource

```typescript
const sessionId = 'session_123';
const token = 'YOUR_AUTH_TOKEN';

const eventSource = new EventSource(
  `/api/v1/realtime/sessions/${sessionId}/stream?eventTypes=feedback,alert`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
);

// 监听 feedback 事件
eventSource.addEventListener('feedback', (event) => {
  const data = JSON.parse(event.data);
  console.log('收到反馈:', data.payload);
});

// 监听 alert 事件
eventSource.addEventListener('alert', (event) => {
  const data = JSON.parse(event.data);
  console.log('收到警报:', data.payload);
});

// 监听 ping 心跳
eventSource.addEventListener('ping', (event) => {
  const data = JSON.parse(event.data);
  console.log('心跳:', data.payload.timestamp);
});

// 监听错误
eventSource.onerror = (error) => {
  console.error('SSE 连接错误:', error);
};

// 关闭连接
// eventSource.close();
```

### 使用 React Hook

```typescript
import { useEffect, useState } from 'react';
import { RealtimeEvent } from '@danci/shared/types';

export function useRealtimeEvents(sessionId: string, eventTypes?: string[]) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const params = new URLSearchParams();
    if (eventTypes) {
      params.set('eventTypes', eventTypes.join(','));
    }

    const url = `/api/v1/realtime/sessions/${sessionId}/stream?${params}`;
    const eventSource = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    eventSource.onopen = () => {
      setConnected(true);
      console.log('SSE 连接已建立');
    };

    // 监听所有事件类型
    ['feedback', 'alert', 'flow-update', 'next-suggestion', 'ping', 'error'].forEach(
      (eventType) => {
        eventSource.addEventListener(eventType, (event) => {
          const data = JSON.parse(event.data) as RealtimeEvent;
          setEvents((prev) => [...prev, data]);
        });
      },
    );

    eventSource.onerror = () => {
      setConnected(false);
      console.error('SSE 连接错误');
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [sessionId, eventTypes]);

  return { events, connected };
}
```

## 后端发送事件示例

### 在学习服务中发送反馈事件

```typescript
import realtimeService from '../services/realtime.service';

export class LearningService {
  async submitAnswer(userId: string, sessionId: string, answer: Answer) {
    // ... 处理答案逻辑 ...

    // 发送实时反馈
    await realtimeService.sendToUser(userId, {
      type: 'feedback',
      payload: {
        sessionId,
        wordId: answer.wordId,
        feedbackType: answer.isCorrect ? 'correct' : 'incorrect',
        message: answer.isCorrect ? '回答正确！' : '回答错误，请再接再厉',
        timestamp: new Date().toISOString(),
        scoreChange: answer.isCorrect ? 10 : -5,
      },
    });
  }
}
```

### 发送流程更新事件

```typescript
await realtimeService.sendToSession(sessionId, {
  type: 'flow-update',
  payload: {
    sessionId,
    flowState: 'in_progress',
    progress: 50,
    completedWords: 25,
    totalWords: 50,
    timestamp: new Date().toISOString(),
    nextWordId: 101,
    estimatedTimeRemaining: 15,
  },
});
```

### 发送警报事件

```typescript
await realtimeService.sendToUser(userId, {
  type: 'alert',
  payload: {
    alertId: `alert_${Date.now()}`,
    alertType: 'success',
    title: '学习目标达成',
    content: '恭喜！您已完成今日学习目标',
    timestamp: new Date().toISOString(),
    priority: 'high',
    actions: [
      {
        label: '查看统计',
        action: '/dashboard/stats',
      },
    ],
  },
});
```

### 广播事件给所有用户

```typescript
await realtimeService.broadcast({
  type: 'alert',
  payload: {
    alertId: `system_${Date.now()}`,
    alertType: 'info',
    title: '系统维护通知',
    content: '系统将于今晚 22:00 进行维护，预计持续 1 小时',
    timestamp: new Date().toISOString(),
    priority: 'medium',
  },
});
```

## 性能与扩展性

### 订阅管理

- 使用内存中的 Map 存储订阅关系
- 支持用户级和会话级索引，快速定位目标订阅
- 自动清理过期订阅（默认 24 小时）

### 连接保持

- 每 30 秒发送一次心跳 (ping) 事件
- 客户端断开时自动清理资源

### 扩展性考虑

- 当前实现适用于单实例部署
- 多实例部署时建议使用 Redis Pub/Sub 或消息队列
- 可考虑使用 WebSocket 代替 SSE 以支持双向通信

## 监控与调试

### 查看统计信息

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/realtime/stats
```

### 日志记录

所有关键操作都会记录日志：

- 连接建立/断开
- 事件发送
- 订阅管理
- 错误信息

### 测试

开发环境下可使用测试端点发送模拟事件：

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session_123",
    "eventType": "feedback",
    "payload": {
      "sessionId": "session_123",
      "wordId": 1,
      "feedbackType": "correct",
      "message": "测试反馈",
      "timestamp": "2025-12-12T10:00:00.000Z"
    }
  }' \
  http://localhost:3000/api/v1/realtime/test
```

## 最佳实践

1. **错误处理**: 总是监听 `onerror` 事件并实现重连逻辑
2. **事件过滤**: 使用 `eventTypes` 参数只订阅需要的事件类型
3. **资源清理**: 组件卸载时记得关闭 EventSource 连接
4. **心跳监控**: 监听 ping 事件以检测连接状态
5. **认证管理**: Token 过期时重新建立连接

## 未来改进

- [ ] 添加 Redis Pub/Sub 支持多实例部署
- [ ] 实现事件持久化和断线重连
- [ ] 添加事件优先级队列
- [ ] 支持自定义心跳间隔
- [ ] 添加更详细的监控指标
