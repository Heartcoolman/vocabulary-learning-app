## MODIFIED Requirements

### Requirement: AMAS Flow Visualization Component

AMAS 数据流可视化组件 **MUST** 支持多种使用场景。

#### Constraint: Component Props Interface

```typescript
interface AMASFlowVisualizationProps {
  mode: 'idle' | 'demo' | 'live';
  userId?: string; // Required for live mode
  autoPlay?: boolean; // For demo mode, default true
  showControls?: boolean; // Show play/pause/reset buttons, default true
  compact?: boolean; // Compact layout for embedding, default false
  onConnectionChange?: (connected: boolean) => void;
}
```

#### Constraint: Compact Layout

- 当 `compact: true` 时，组件 **MUST** 隐藏控制按钮（播放/暂停/重置）
- 当 `compact: true` 时，组件 **MUST** 隐藏文字说明和标签
- 当 `compact: true` 时，组件 **MUST** 缩小可视化节点和连接线的尺寸

#### Constraint: Demo Mode Scenario Script

- Demo 模式 **MUST** 循环展示完整学习流程：新词添加 → 记忆建模 → 复习调度 → 学习反馈
- 每个阶段 **MUST** 持续 3 秒
- 完整循环后 **MUST** 自动重新开始

#### Constraint: Animation Policy

- 组件 **MUST** 在离开视口时暂停动画
- 组件 **MAY** 支持 prefers-reduced-motion 媒体查询

#### Constraint: Live Mode Reconnection

- SSE 连接断开后 **MUST** 使用指数退避策略重连
- 初始重连间隔 **MUST** 为 1 秒
- 最大重连间隔 **MUST** 为 30 秒
- 最大重连次数 **MUST** 为 5 次
- 超过最大重连次数后 **MUST** 停止重连并显示错误状态

#### Scenario: Idle mode

- **GIVEN** 组件以 idle 模式初始化
- **WHEN** 组件挂载完成
- **THEN** 组件 **MUST** 显示静态初始状态
- **AND** 组件 **MUST NOT** 播放任何动画

#### Scenario: Demo mode

- **GIVEN** 组件以 demo 模式初始化
- **WHEN** 组件挂载完成
- **THEN** 组件 **MUST** 使用模拟数据生成工作流帧
- **AND** 组件 **MUST** 每 3 秒生成一个新帧
- **AND** 组件 **MUST** 支持自动播放配置

#### Scenario: Live mode

- **GIVEN** 组件以 live 模式初始化
- **AND** 提供了有效的 userId
- **WHEN** 组件挂载完成
- **THEN** 组件 **MUST** 建立 SSE 连接到 `/api/realtime/users/{userId}/stream`
- **AND** 组件 **MUST** 实时显示接收到的 amas-flow 事件

#### Scenario: Connection status callback

- **GIVEN** 组件以 live 模式运行
- **WHEN** SSE 连接状态变化
- **THEN** 组件 **MUST** 调用 `onConnectionChange` 回调
- **AND** 回调参数 **MUST** 为 boolean 类型（true=已连接，false=断开）

#### Scenario: Compact layout

- **GIVEN** 组件配置了 `compact: true`
- **WHEN** 组件渲染
- **THEN** 组件 **MUST** 使用紧凑布局
- **AND** 组件 **MUST** 隐藏控制按钮
- **AND** 组件 **MUST** 隐藏文字说明
- **AND** 组件 **MUST** 缩小可视化尺寸

#### Scenario: Auto-play loop

- **GIVEN** 组件以 demo 模式运行
- **AND** 配置了 `autoPlay: true`
- **WHEN** 动画播放完成
- **THEN** 组件 **MUST** 自动重新开始播放
- **AND** 组件 **MUST** 保持连续循环

#### Scenario: Viewport visibility

- **GIVEN** 组件以 demo 模式运行
- **WHEN** 组件离开视口
- **THEN** 组件 **MUST** 暂停动画
- **WHEN** 组件重新进入视口
- **THEN** 组件 **MUST** 恢复动画播放
