# 遗忘预警 SSE 实时推送 - 实施完成报告

**日期**: 2025-12-12
**状态**: ✅ 已完成
**工作目录**: /home/liji/danci/danci/packages/backend

---

## 📋 任务概述

将遗忘预警功能接入 SSE (Server-Sent Events) 实时推送系统，完善用户体验闭环。当 ForgettingAlertWorker 检测到用户的单词面临遗忘风险时，自动通过 SSE 实时推送提醒消息给在线用户。

---

## ✅ 完成内容

### 1. 扩展类型定义

**文件**: `/home/liji/danci/danci/packages/shared/src/types/realtime.ts`

- ✅ 新增 `ForgettingAlertPayload` 接口
  - 包含预警 ID、单词信息、预测遗忘时间、回忆概率、风险等级、建议复习时间等字段
- ✅ 扩展 `RealtimeEvent` 联合类型
  - 添加 `forgetting-alert` 事件类型

```typescript
export interface ForgettingAlertPayload {
  alertId: string;
  wordId: string;
  word: string;
  predictedForgetAt: string;
  recallProbability: number;
  riskLevel: 'high' | 'medium' | 'low';
  suggestedReviewTime?: string;
  message: string;
  timestamp: string;
}
```

### 2. 修改 ForgettingAlertWorker

**文件**: `/home/liji/danci/danci/packages/backend/src/workers/forgetting-alert.worker.ts`

- ✅ 引入 EventBus 和相关依赖
- ✅ 在 `processBatch` 函数中添加事件发布逻辑
- ✅ 只对新创建的预警发布事件（避免重复推送）
- ✅ 发布 `FORGETTING_RISK_HIGH` 事件到 EventBus

**关键实现**:

```typescript
// 只有新创建的预警才发布事件（避免重复推送）
if (isNewAlert) {
  const word = await prisma.word.findUnique({
    where: { id: state.wordId },
    select: { spelling: true },
  });

  await eventBus.publish({
    type: 'FORGETTING_RISK_HIGH',
    payload: {
      userId,
      wordId: state.wordId,
      recallProbability: currentRetention,
      riskLevel: currentRetention < 0.2 ? 'high' : currentRetention < 0.3 ? 'medium' : 'low',
      lastReviewDate: state.lastReviewDate,
      suggestedReviewDate: predictedForgetAt,
      timestamp: now,
    },
  });
}
```

### 3. 集成到 RealtimeService

**文件**: `/home/liji/danci/danci/packages/backend/src/services/realtime.service.ts`

- ✅ 在构造函数中订阅 `FORGETTING_RISK_HIGH` 事件
- ✅ 实现事件处理逻辑：
  - 获取单词信息
  - 计算风险等级
  - 构建友好的提醒消息
  - 转换为 SSE 事件格式
  - 推送给目标用户
- ✅ 添加辅助方法：
  - `formatTimeUntil()`: 格式化时间差（如"1天后"、"5小时后"）
  - `buildForgettingMessage()`: 根据风险等级构建不同的消息

**风险等级对应的消息模板**:

- **高风险** (< 20%): "单词 'X' 面临高风险遗忘，建议立即复习"
- **中风险** (20-30%): "单词 'X' 可能在 Y 被遗忘，建议尽快复习"
- **低风险** (> 30%): "单词 'X' 的记忆保持率为 Z%，建议在 Y 进行复习"

### 4. 编写集成测试

**文件**: `/home/liji/danci/danci/packages/backend/tests/integration/forgetting-alert-sse.test.ts`

- ✅ 测试场景 1: 验证预警创建后能通过 SSE 推送给用户
- ✅ 测试场景 2: 验证不同风险等级构建不同的消息
- ✅ 测试场景 3: 验证只向订阅的用户推送
- ✅ 测试场景 4: 验证时间格式化功能

**测试覆盖率**:

- ✅ 完整流程测试（Worker → EventBus → RealtimeService → SSE）
- ✅ 风险等级分类测试
- ✅ 用户隔离测试
- ✅ 消息格式验证

### 5. 更新文档

**文件**: `/home/liji/danci/danci/packages/backend/docs/forgetting-alert-sse.md`

- ✅ 创建完整的技术文档，包含：
  - 架构设计和整体流程
  - 事件类型定义
  - 风险等级分类表
  - 前端/后端使用示例
  - 配置说明
  - SSE 消息格式
  - 测试指南
  - 性能优化说明
  - 故障排查指南
  - 监控指标
  - 扩展计划

**文件**: `/home/liji/danci/danci/packages/backend/README.md`

- ✅ 更新主 README，添加遗忘预警 SSE 推送说明
- ✅ 在"学习体验特性"章节补充风险等级和 SSE 推送信息
- ✅ 在"实时通道"章节添加 `forgetting-alert` 事件类型

---

## 🔄 完整流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      遗忘预警 SSE 推送流程                         │
└─────────────────────────────────────────────────────────────────┘

1. ForgettingAlertWorker (定时扫描)
   ├─ 扫描用户的单词学习状态
   ├─ 基于遗忘曲线识别高风险单词
   ├─ 创建 ForgettingAlert 记录
   └─ 发布 FORGETTING_RISK_HIGH 事件
              ↓
2. EventBus (事件总线)
   ├─ 接收 FORGETTING_RISK_HIGH 事件
   ├─ 进程内发布
   ├─ (可选) SSE 推送
   └─ (可选) Redis 跨进程发布
              ↓
3. RealtimeService (实时服务)
   ├─ 订阅 FORGETTING_RISK_HIGH 事件
   ├─ 获取单词信息
   ├─ 计算风险等级
   ├─ 构建友好消息
   ├─ 转换为 SSE 事件
   └─ 推送给目标用户
              ↓
4. SSE Connection (用户连接)
   ├─ 接收 forgetting-alert 事件
   ├─ 解析 payload
   └─ 显示通知/提醒
              ↓
5. 用户操作
   ├─ 立即复习
   ├─ 稍后提醒
   └─ 忽略
```

---

## 📊 技术亮点

### 1. 类型安全

- 使用 TypeScript 强类型定义所有事件和 payload
- 前后端共享类型定义（@danci/shared/types）
- 编译时检查，减少运行时错误

### 2. 事件驱动

- 解耦 Worker 和推送逻辑
- 基于 EventBus 的发布-订阅模式
- 支持多订阅者，易于扩展

### 3. 智能消息

- 根据风险等级生成不同消息
- 友好的时间格式化（"1天后"、"5小时后"）
- 包含回忆概率百分比，量化风险

### 4. 防止重复推送

- 只对新创建的预警发布事件
- 已存在的 ACTIVE 预警只更新数据
- DISMISSED/REVIEWED 状态不再更新

### 5. 异步处理

- EventBus 默认异步处理，不阻塞主流程
- RealtimeService 订阅采用异步处理
- 错误隔离，单个处理器失败不影响其他

---

## 🧪 测试验证

### 集成测试

```bash
pnpm test tests/integration/forgetting-alert-sse.test.ts
```

**测试用例**:

1. ✅ 应该在创建预警时通过 SSE 推送给用户
2. ✅ 应该根据风险等级构建不同的消息
3. ✅ 应该只向订阅的用户推送
4. ✅ 应该正确格式化时间差

### 手动测试

```bash
# 1. 启动开发服务器
pnpm dev

# 2. 建立 SSE 连接
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/realtime/sessions/current/stream?eventTypes=forgetting-alert

# 3. 手动触发 Worker 扫描（需要管理员权限）
curl -X POST http://localhost:3000/api/admin/forgetting-alerts/scan \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 📈 性能优化

### 1. 批量处理

Worker 每批处理 100 个单词，减少数据库查询次数：

```typescript
const BATCH_SIZE = 100;
```

### 2. 事件防重

只有新创建的预警才发布事件，避免重复推送：

```typescript
if (isNewAlert) {
  await eventBus.publish(...);
}
```

### 3. 异步处理

EventBus 和 RealtimeService 都采用异步处理，不阻塞主流程：

```typescript
eventBus.subscribe<ForgettingRiskPayload>(
  'FORGETTING_RISK_HIGH',
  async (payload) => { ... },
  { async: true }
);
```

---

## 📝 配置示例

### 环境变量

```bash
# 启用遗忘预警 Worker
ENABLE_FORGETTING_ALERT_WORKER=true

# 自定义运行频率（默认：每小时）
FORGETTING_ALERT_SCHEDULE="0 * * * *"
```

### Worker 风险阈值

在 `src/workers/forgetting-alert.worker.ts` 中调整：

```typescript
/** 风险阈值：保持率低于此值视为高风险 */
const RISK_THRESHOLD = 0.3;

/** 预警范围：提前多少天预警 */
const ALERT_WINDOW_DAYS = 1;
```

---

## 🔍 监控指标

### Worker 统计

- `usersScanned`: 扫描的用户数
- `wordsScanned`: 扫描的单词数
- `alertsCreated`: 创建的预警数
- `alertsUpdated`: 更新的预警数
- `wordsSkipped`: 跳过的单词数
- `duration`: 处理耗时（秒）

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

---

## 🚀 前端集成建议

### 1. 建立 SSE 连接

```javascript
const eventSource = new EventSource(
  '/api/v1/realtime/sessions/current/stream?eventTypes=forgetting-alert',
);
```

### 2. 监听遗忘预警事件

```javascript
eventSource.addEventListener('forgetting-alert', (event) => {
  const data = JSON.parse(event.data);
  const { payload } = data;

  // 根据风险等级显示不同样式的通知
  const notificationType = {
    high: 'error',
    medium: 'warning',
    low: 'info',
  }[payload.riskLevel];

  showNotification({
    title: '单词复习提醒',
    message: payload.message,
    type: notificationType,
    actions: [
      { label: '立即复习', onClick: () => reviewWord(payload.wordId) },
      { label: '稍后提醒', onClick: () => snoozeAlert(payload.alertId) },
    ],
  });
});
```

### 3. 错误处理和重连

```javascript
eventSource.onerror = (error) => {
  console.error('SSE 连接错误:', error);

  // 实现指数退避重连
  setTimeout(
    () => {
      reconnectSSE();
    },
    Math.min(1000 * Math.pow(2, retryCount), 30000),
  );
};
```

---

## 🔮 未来扩展

### 1. 智能推送时机

- 基于用户的在线时间模式
- 避免在休息时间推送
- 根据用户活跃度调整推送频率

### 2. 多渠道通知

- Email 通知（离线用户）
- 移动端推送通知
- 浏览器桌面通知

### 3. 个性化消息

- 根据用户偏好调整消息风格
- 支持多语言消息
- 添加单词关联的例句或图片

### 4. 批量预警汇总

- 将多个单词的预警汇总为一条消息
- 减少推送频率，提升用户体验
- 提供"一键复习"功能

---

## 📚 相关文档

- [遗忘预警 SSE 推送详细文档](/home/liji/danci/danci/packages/backend/docs/forgetting-alert-sse.md)
- [EventBus 使用指南](/home/liji/danci/danci/packages/backend/src/core/README.md)
- [RealtimeService API](/home/liji/danci/danci/packages/backend/src/services/realtime.service.ts)
- [遗忘曲线模型](/home/liji/danci/danci/packages/backend/src/amas/models/forgetting-curve.ts)

---

## ✅ 验收标准

- ✅ ForgettingAlertWorker 成功发布 FORGETTING_RISK_HIGH 事件
- ✅ EventBus 正确传递事件到订阅者
- ✅ RealtimeService 正确转换事件并推送给用户
- ✅ SSE 消息格式符合规范
- ✅ 风险等级分类正确
- ✅ 消息友好且准确
- ✅ 只向订阅的用户推送
- ✅ 防止重复推送
- ✅ 集成测试全部通过
- ✅ 文档完整且清晰

---

## 🎉 总结

遗忘预警 SSE 实时推送功能已成功实施并完成测试。通过事件驱动架构，实现了 Worker、EventBus、RealtimeService 的完美解耦，为用户提供了及时、友好的单词复习提醒。

**核心优势**:

- 🚀 实时推送，及时提醒
- 🎯 智能分级，精准推荐
- 💡 友好消息，清晰易懂
- 🔧 易于扩展，灵活配置
- 🛡️ 类型安全，健壮可靠

**实施日期**: 2025-12-12
**实施人**: Claude Sonnet 4.5
**状态**: ✅ 已完成
