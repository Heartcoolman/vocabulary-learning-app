# 遗忘预警 SSE 实时推送

## 概述

遗忘预警系统通过 Server-Sent Events (SSE) 实时向用户推送单词遗忘风险提醒，帮助用户及时复习即将遗忘的单词。

## 架构设计

### 整体流程

```
ForgettingAlertWorker → EventBus → RealtimeService → SSE Connection → 前端
     (定时扫描)        (事件发布)     (事件订阅)      (推送消息)    (接收提醒)
```

### 组件说明

1. **ForgettingAlertWorker** (`src/workers/forgetting-alert.worker.ts`)
   - 定时扫描用户的单词学习状态
   - 基于遗忘曲线模型识别高风险单词
   - 创建 `ForgettingAlert` 记录
   - 发布 `FORGETTING_RISK_HIGH` 事件到 EventBus

2. **EventBus** (`src/core/event-bus.ts`)
   - 提供进程内事件发布/订阅机制
   - 支持类型安全的事件系统
   - 可选 Redis 跨进程通信

3. **RealtimeService** (`src/services/realtime.service.ts`)
   - 订阅 EventBus 的 `FORGETTING_RISK_HIGH` 事件
   - 将事件转换为前端友好的 SSE 消息
   - 管理用户的 SSE 连接和订阅

## 事件类型定义

### EventBus 事件：FORGETTING_RISK_HIGH

```typescript
interface ForgettingRiskPayload {
  userId: string;
  wordId: string;
  recallProbability: number; // 回忆概率 (0-1)
  riskLevel: 'high' | 'medium' | 'low';
  lastReviewDate?: Date;
  suggestedReviewDate: Date; // 建议复习时间
  timestamp: Date;
}
```

### SSE 事件：forgetting-alert

```typescript
interface ForgettingAlertPayload {
  alertId: string; // 预警ID
  wordId: string; // 单词ID
  word: string; // 单词拼写
  predictedForgetAt: string; // 预测遗忘时间 (ISO 8601)
  recallProbability: number; // 回忆概率 (0-1)
  riskLevel: 'high' | 'medium' | 'low';
  suggestedReviewTime?: string; // 建议复习时间 (ISO 8601)
  message: string; // 友好的提醒消息
  timestamp: string; // 时间戳 (ISO 8601)
}
```

## 风险等级分类

| 风险等级 | 回忆概率范围 | 消息模板                                        | 推荐行动   |
| -------- | ------------ | ----------------------------------------------- | ---------- |
| `high`   | < 0.2 (20%)  | "单词 'X' 面临高风险遗忘，建议立即复习"         | 立即复习   |
| `medium` | 0.2 - 0.3    | "单词 'X' 可能在 Y 被遗忘，建议尽快复习"        | 尽快复习   |
| `low`    | > 0.3        | "单词 'X' 的记忆保持率为 Z%，建议在 Y 进行复习" | 按计划复习 |

## 使用示例

### 前端订阅 SSE

```javascript
// 建立 SSE 连接
const eventSource = new EventSource(
  '/api/v1/realtime/sessions/current/stream?eventTypes=forgetting-alert',
);

// 监听遗忘预警事件
eventSource.addEventListener('forgetting-alert', (event) => {
  const data = JSON.parse(event.data);

  console.log('收到遗忘预警:', data.payload);

  // 显示通知
  showNotification({
    title: '单词复习提醒',
    message: data.payload.message,
    type: data.payload.riskLevel === 'high' ? 'error' : 'warning',
    actions: [
      { label: '立即复习', onClick: () => reviewWord(data.payload.wordId) },
      { label: '稍后提醒', onClick: () => snoozeAlert(data.payload.alertId) },
    ],
  });
});

// 错误处理
eventSource.onerror = (error) => {
  console.error('SSE 连接错误:', error);
  // 实现重连逻辑
};
```

### 后端手动触发测试

```typescript
import { getEventBus } from './core/event-bus';
import { decisionEventsService } from './services/decision-events.service';

const eventBus = getEventBus(decisionEventsService);

// 发布测试事件
await eventBus.publish({
  type: 'FORGETTING_RISK_HIGH',
  payload: {
    userId: 'user-123',
    wordId: 'word-456',
    recallProbability: 0.25,
    riskLevel: 'medium',
    lastReviewDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    suggestedReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    timestamp: new Date(),
  },
});
```

## 配置说明

### Worker 配置

在 `src/index.ts` 中启动 Worker：

```typescript
import { startForgettingAlertWorker } from './workers/forgetting-alert.worker';

// 启动遗忘预警 Worker（默认每小时执行一次）
startForgettingAlertWorker();

// 自定义运行频率（例如：每30分钟）
// startForgettingAlertWorker('*/30 * * * *');
```

### 风险阈值配置

在 `src/workers/forgetting-alert.worker.ts` 中调整：

```typescript
/** 风险阈值：保持率低于此值视为高风险 */
const RISK_THRESHOLD = 0.3;

/** 预警范围：提前多少天预警（天） */
const ALERT_WINDOW_DAYS = 1;
```

## SSE 消息格式

### 标准格式

```
event: forgetting-alert
data: {"type":"forgetting-alert","payload":{...}}
id: msg_1234567890_abc123

```

### 示例消息

```
event: forgetting-alert
data: {"type":"forgetting-alert","payload":{"alertId":"user123-word456","wordId":"word456","word":"abandon","predictedForgetAt":"2025-12-13T10:00:00.000Z","recallProbability":0.25,"riskLevel":"medium","message":"单词 \"abandon\" 可能在 1天后 被遗忘（记忆保持率 25%），建议尽快复习","timestamp":"2025-12-12T10:00:00.000Z"}}
id: msg_1702380000000_xyz789

```

## 测试

### 运行集成测试

```bash
pnpm test tests/integration/forgetting-alert-sse.test.ts
```

### 手动测试流程

1. **启动开发服务器**

   ```bash
   pnpm dev
   ```

2. **手动触发 Worker 扫描**

   ```bash
   curl -X POST http://localhost:3000/api/admin/forgetting-alerts/scan \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **建立 SSE 连接**

   ```bash
   curl -N -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/v1/realtime/sessions/current/stream?eventTypes=forgetting-alert
   ```

4. **验证消息推送**
   - 观察控制台输出的 SSE 事件
   - 检查日志中的事件发布记录

## 性能优化

### 批量处理

Worker 采用批量处理机制，每批处理 100 个单词：

```typescript
const BATCH_SIZE = 100;
```

### 防止重复推送

- 只有新创建的预警才会发布事件
- 已存在的 ACTIVE 预警只更新数据，不重复推送
- DISMISSED 和 REVIEWED 状态的预警不再更新

### 异步事件处理

EventBus 订阅默认采用异步处理，不阻塞主流程：

```typescript
eventBus.subscribe<ForgettingRiskPayload>(
  'FORGETTING_RISK_HIGH',
  async (payload) => {
    // 异步处理逻辑
  },
  {
    async: true, // 默认值
  },
);
```

## 故障排查

### SSE 连接断开

**现象**: 前端无法收到预警消息

**排查步骤**:

1. 检查 SSE 连接是否建立成功
2. 查看浏览器开发者工具的 Network 标签
3. 检查后端日志中的连接状态

### 事件未发布

**现象**: Worker 运行但未收到 SSE 消息

**排查步骤**:

1. 检查 Worker 日志：`发布遗忘风险事件`
2. 检查 EventBus 订阅状态
3. 验证 RealtimeService 是否正确初始化

### 消息格式错误

**现象**: 前端收到消息但解析失败

**排查步骤**:

1. 检查 SSE 消息格式是否符合规范
2. 验证 payload 字段是否完整
3. 查看前端控制台的错误信息

## 监控指标

### 关键指标

- **预警创建数**: `stats.alertsCreated`
- **预警更新数**: `stats.alertsUpdated`
- **扫描单词数**: `stats.wordsScanned`
- **跳过单词数**: `stats.wordsSkipped`
- **处理耗时**: `stats.duration`

### 日志示例

```json
{
  "level": "info",
  "module": "forgetting-alert-worker",
  "usersScanned": 150,
  "wordsScanned": 3420,
  "alertsCreated": 45,
  "alertsUpdated": 12,
  "wordsSkipped": 3363,
  "duration": "2.34",
  "msg": "遗忘预警扫描完成"
}
```

## 扩展计划

### 未来改进

1. **智能推送时机**
   - 基于用户的在线时间模式
   - 避免在用户休息时间推送

2. **多渠道通知**
   - Email 通知
   - 移动端推送通知
   - 浏览器桌面通知

3. **个性化消息**
   - 根据用户偏好调整消息风格
   - 支持多语言消息

4. **批量预警汇总**
   - 将多个单词的预警汇总为一条消息
   - 减少推送频率，提升用户体验

## 相关文档

- [EventBus 使用指南](../src/core/README.md)
- [RealtimeService API](../src/services/realtime.service.ts)
- [遗忘曲线模型](../src/amas/models/forgetting-curve.ts)
- [Worker 配置](../src/workers/forgetting-alert.worker.ts)

## 联系方式

如有问题或建议，请联系开发团队或提交 Issue。
