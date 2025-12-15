# Event Bus - 事件总线系统

## 概述

事件总线是后端重构阶段 2 的核心基础设施，提供了类型安全的领域事件发布/订阅机制。

## 架构设计

### 核心特性

1. **类型安全的事件系统**
   - 使用 TypeScript 联合类型定义所有事件
   - 编译时类型检查，防止事件类型错误

2. **多种通信方式**
   - 进程内通信：基于 EventEmitter
   - SSE 实时推送：复用 DecisionEventsService
   - 跨进程通信：可选的 Redis Pub/Sub

3. **错误隔离**
   - 单个事件处理器失败不影响其他订阅者
   - 可配置的错误处理器

4. **异步处理支持**
   - 支持同步和异步事件处理
   - 异步处理不阻塞事件发布

## 事件类型

### 已定义的领域事件

| 事件类型               | Payload 类型               | 描述             |
| ---------------------- | -------------------------- | ---------------- |
| `ANSWER_RECORDED`      | `AnswerRecordedPayload`    | 用户提交答题记录 |
| `SESSION_STARTED`      | `SessionStartedPayload`    | 学习会话开始     |
| `SESSION_ENDED`        | `SessionEndedPayload`      | 学习会话结束     |
| `WORD_MASTERED`        | `WordMasteredPayload`      | 单词达到掌握标准 |
| `FORGETTING_RISK_HIGH` | `ForgettingRiskPayload`    | 检测到遗忘风险   |
| `STRATEGY_ADJUSTED`    | `StrategyAdjustedPayload`  | AMAS 策略调整    |
| `USER_STATE_UPDATED`   | `UserStateUpdatedPayload`  | 用户状态更新     |
| `REWARD_DISTRIBUTED`   | `RewardDistributedPayload` | 奖励分配         |

### Payload 接口

详细的 Payload 接口定义见 `packages/backend/src/core/event-bus.ts`。

## 快速开始

### 1. 基本使用

```typescript
import { getEventBus } from '../core/event-bus';
import { decisionEventsService } from '../services/decision-events.service';

// 获取事件总线实例
const eventBus = getEventBus(decisionEventsService);

// 订阅事件
const unsubscribe = eventBus.subscribe('ANSWER_RECORDED', (payload, event) => {
  console.log('答题记录:', payload);
  console.log('事件 ID:', event.correlationId);
});

// 发布事件
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

// 取消订阅
unsubscribe();
```

### 2. 启用 Redis 跨进程通信

```typescript
import { getEventBus } from '../core/event-bus';
import { decisionEventsService } from '../services/decision-events.service';
import { getRedisClient } from '../config/redis';

const redis = getRedisClient();
const eventBus = getEventBus(decisionEventsService, redis, {
  enableRedis: true,
  redisChannelPrefix: 'learning:events:',
  enableSSE: true,
});
```

### 3. 订阅多个事件

```typescript
// 订阅多个事件类型
const unsubscribeAll = eventBus.subscribeMany(
  ['SESSION_STARTED', 'SESSION_ENDED', 'WORD_MASTERED'],
  (payload, event) => {
    console.log('学习事件:', event.type, payload);
  },
);

// 取消所有订阅
unsubscribeAll();
```

### 4. 一次性订阅

```typescript
// 只处理第一次事件
eventBus.once('SESSION_STARTED', (payload, event) => {
  console.log('首次会话开始:', payload);
});
```

### 5. 错误处理

```typescript
eventBus.subscribe(
  'ANSWER_RECORDED',
  async (payload, event) => {
    // 可能抛出错误的处理逻辑
    await processAnswerRecord(payload);
  },
  {
    subscriberId: 'answer-processor',
    async: true,
    onError: (error, event) => {
      console.error('处理失败:', error);
      // 错误恢复逻辑
    },
  },
);
```

## 集成指南

### 在服务中使用

```typescript
export class WordStateService {
  private eventBus = getEventBus(decisionEventsService);

  async updateWordState(userId: string, wordId: string, isCorrect: boolean) {
    // 更新状态逻辑
    // ...

    // 发布事件
    await this.eventBus.publish({
      type: 'ANSWER_RECORDED',
      payload: {
        userId,
        wordId,
        isCorrect,
        timestamp: new Date(),
      },
    });
  }
}
```

### 订阅事件处理业务逻辑

```typescript
export class BadgeService {
  private eventBus = getEventBus(decisionEventsService);
  private unsubscribers: Array<() => void> = [];

  constructor() {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // 监听单词掌握事件，检查徽章
    this.unsubscribers.push(
      this.eventBus.subscribe('WORD_MASTERED', async (payload) => {
        await this.checkAndAwardBadges(payload.userId);
      }),
    );
  }

  cleanup() {
    this.unsubscribers.forEach((unsub) => unsub());
  }

  private async checkAndAwardBadges(userId: string) {
    // 徽章检查逻辑
  }
}
```

## 监控与调试

### 获取订阅统计

```typescript
// 获取所有事件的订阅数量
const stats = eventBus.getSubscriptionStats();
console.log(stats);
// 输出: { ANSWER_RECORDED: 2, SESSION_STARTED: 1, ... }

// 获取特定事件的订阅者数量
const count = eventBus.getSubscriberCount('ANSWER_RECORDED');
console.log('ANSWER_RECORDED 订阅者数量:', count);
```

### 日志记录

事件总线使用 `serviceLogger` 记录所有事件发布和订阅活动：

- `debug` 级别：事件发布、订阅、取消订阅
- `info` 级别：初始化、关闭
- `error` 级别：事件处理错误、Redis 错误

## 优雅关闭

```typescript
// 应用关闭时调用
process.on('SIGTERM', async () => {
  await eventBus.shutdown();
  process.exit(0);
});
```

## 最佳实践

### 1. 事件命名

- 使用过去时态（例如：`ANSWER_RECORDED`，而不是 `RECORD_ANSWER`）
- 表达业务意图，而不是技术实现

### 2. Payload 设计

- 包含足够的上下文信息
- 保持 Payload 简单，避免嵌套过深
- 使用明确的时间戳字段

### 3. 错误处理

- 始终为关键事件处理器提供 `onError` 回调
- 使用异步处理避免阻塞发布者
- 记录错误日志便于调试

### 4. 性能优化

- 对于高频事件，考虑使用批量处理
- 避免在事件处理器中执行重量级同步操作
- 使用 Redis 时注意网络延迟

### 5. 测试

- 使用 `resetEventBus()` 在测试间重置单例
- 模拟事件发布测试订阅逻辑
- 验证错误处理路径

## 示例代码

完整的使用示例见：`packages/backend/src/core/event-bus.example.ts`

## 未来扩展

### 计划中的功能

1. **事件持久化**
   - 将事件存储到数据库
   - 支持事件回放和审计

2. **事件版本控制**
   - 支持 Payload 结构演进
   - 向后兼容性

3. **死信队列**
   - 处理失败的事件
   - 重试机制

4. **事件过滤**
   - 基于条件的事件订阅
   - 事件路由

## 相关文档

- [DecisionEventsService](../services/decision-events.service.ts)
- [AMAS Types](../amas/types.ts)
- [Redis Config](../config/redis.ts)
