# 事件总线快速开始指南

## 5 分钟快速上手

### 步骤 1: 导入事件总线

```typescript
import { getEventBus } from './core';
import { decisionEventsService } from './services/decision-events.service';
```

### 步骤 2: 获取实例

```typescript
const eventBus = getEventBus(decisionEventsService);
```

### 步骤 3: 发布第一个事件

```typescript
await eventBus.publish({
  type: 'ANSWER_RECORDED',
  payload: {
    userId: 'user-123',
    wordId: 'word-456',
    isCorrect: true,
    responseTime: 1200,
    timestamp: new Date(),
  },
});
```

### 步骤 4: 订阅事件

```typescript
eventBus.subscribe('ANSWER_RECORDED', (payload, event) => {
  console.log(`用户 ${payload.userId} 回答了单词 ${payload.wordId}`);
  console.log(`结果: ${payload.isCorrect ? '正确' : '错误'}`);
});
```

## 常见使用场景

### 场景 1: 答题后更新徽章

```typescript
// 在 AnswerService 中发布事件
async recordAnswer(userId: string, wordId: string, isCorrect: boolean) {
  // 保存答题记录...

  await eventBus.publish({
    type: 'ANSWER_RECORDED',
    payload: { userId, wordId, isCorrect, timestamp: new Date() },
  });
}

// 在 BadgeService 中订阅事件
constructor() {
  eventBus.subscribe('ANSWER_RECORDED', async (payload) => {
    await this.checkAndAwardBadges(payload.userId);
  });
}
```

### 场景 2: 单词掌握后发送通知

```typescript
// 发布
await eventBus.publish({
  type: 'WORD_MASTERED',
  payload: {
    userId: 'user-123',
    wordId: 'word-456',
    masteryLevel: 5,
    evaluationScore: 0.85,
    confidence: 0.92,
    timestamp: new Date(),
  },
});

// 订阅
eventBus.subscribe('WORD_MASTERED', async (payload) => {
  await notificationService.send(payload.userId, {
    title: '恭喜！',
    message: `你已掌握单词 ${payload.wordId}`,
  });
});
```

### 场景 3: 遗忘风险预警

```typescript
// 发布
await eventBus.publish({
  type: 'FORGETTING_RISK_HIGH',
  payload: {
    userId: 'user-123',
    wordId: 'word-789',
    recallProbability: 0.3,
    riskLevel: 'high',
    suggestedReviewDate: new Date(Date.now() + 86400000),
    timestamp: new Date(),
  },
});

// 订阅
eventBus.subscribe('FORGETTING_RISK_HIGH', async (payload) => {
  // 添加到复习队列
  await reviewQueueService.add(payload.userId, payload.wordId);

  // 发送提醒
  await notificationService.sendReviewReminder(payload.userId, payload.wordId);
});
```

## 启用 Redis（可选）

如果你需要跨进程通信：

```typescript
import { getRedisClient } from './config/redis';

const redis = getRedisClient();
const eventBus = getEventBus(decisionEventsService, redis, { enableRedis: true });
```

## 错误处理

```typescript
eventBus.subscribe(
  'ANSWER_RECORDED',
  async (payload) => {
    // 可能失败的操作
    await riskyOperation(payload);
  },
  {
    onError: (error, event) => {
      console.error('处理失败:', error);
      // 记录到错误日志、发送告警等
    },
  },
);
```

## 监控订阅

```typescript
// 查看所有事件的订阅情况
console.log(eventBus.getSubscriptionStats());
// { ANSWER_RECORDED: 3, SESSION_STARTED: 1, ... }

// 查看特定事件的订阅者数量
console.log(eventBus.getSubscriberCount('ANSWER_RECORDED'));
// 3
```

## 应用关闭时清理

```typescript
process.on('SIGTERM', async () => {
  await eventBus.shutdown();
  process.exit(0);
});
```

## 下一步

- 阅读完整文档：`/home/liji/danci/danci/packages/backend/src/core/README.md`
- 查看更多示例：`/home/liji/danci/danci/packages/backend/src/core/event-bus.example.ts`
- 运行测试：`/home/liji/danci/danci/packages/backend/src/core/event-bus.test.ts`
