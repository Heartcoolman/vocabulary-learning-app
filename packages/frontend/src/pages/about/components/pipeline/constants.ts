/**
 * AMAS Neural Pipeline 常量配置
 */

import type { PipelineNode, Connection, StageInfo, FaultOption } from './types';

/** 六层架构信息 */
export const STAGES: StageInfo[] = [
  {
    id: 1,
    name: '感知层',
    description: '原始事件采集与特征提取',
    color: '#38bdf8',
    bgColor: 'from-sky-900/20',
  },
  {
    id: 2,
    name: '建模层',
    description: 'AFCM状态推断',
    color: '#a78bfa',
    bgColor: 'from-violet-900/20',
  },
  {
    id: 3,
    name: '学习层',
    description: '多算法集成决策',
    color: '#34d399',
    bgColor: 'from-emerald-900/20',
  },
  {
    id: 4,
    name: '决策层',
    description: '策略映射与安全护栏',
    color: '#fbbf24',
    bgColor: 'from-amber-900/20',
  },
  {
    id: 5,
    name: '评估层',
    description: '延迟奖励与因果推断',
    color: '#f472b6',
    bgColor: 'from-pink-900/20',
  },
  {
    id: 6,
    name: '优化层',
    description: '超参数自动调优',
    color: '#60a5fa',
    bgColor: 'from-blue-900/20',
  },
];

/** 管道节点配置 */
export const PIPELINE_NODES: PipelineNode[] = [
  // Stage 1: 感知层
  {
    id: 'raw_input',
    stage: 1,
    label: 'Raw Event',
    type: 'perception',
    description: '用户交互原始事件',
  },
  {
    id: 'feature_builder',
    stage: 1,
    label: '特征提取',
    type: 'perception',
    description: '构建8维特征向量',
    meta: { outputDim: '8维向量' },
  },

  // Stage 2: 建模层
  {
    id: 'attention',
    stage: 2,
    label: '注意力',
    type: 'model',
    description: '注意力水平监测',
    meta: { outputDim: 'A∈[0,1]' },
  },
  {
    id: 'fatigue',
    stage: 2,
    label: '疲劳度',
    type: 'model',
    description: '疲劳程度估计',
    meta: { outputDim: 'F∈[0,1]' },
  },
  {
    id: 'cognitive',
    stage: 2,
    label: '认知',
    type: 'model',
    description: '认知能力画像',
    meta: { outputDim: 'C∈[0,1]³' },
  },
  {
    id: 'motivation',
    stage: 2,
    label: '动机',
    type: 'model',
    description: '学习动机追踪',
    meta: { outputDim: 'M∈[-1,1]' },
  },
  {
    id: 'trend',
    stage: 2,
    label: '趋势',
    type: 'model',
    description: '能力趋势分析',
    meta: { outputDim: '↑/→/↓' },
  },

  // Stage 3: 学习层
  {
    id: 'coldstart',
    stage: 3,
    label: '冷启动',
    type: 'learner',
    description: '新用户快速分类',
    meta: { algorithm: '5探测策略' },
  },
  {
    id: 'linucb',
    stage: 3,
    label: 'LinUCB',
    type: 'learner',
    description: '上下文Bandit算法',
    meta: { inputDim: '22维', algorithm: 'UCB' },
  },
  {
    id: 'thompson',
    stage: 3,
    label: 'Thompson',
    type: 'learner',
    description: '贝叶斯采样',
    meta: { algorithm: 'Beta分布' },
  },
  {
    id: 'actr',
    stage: 3,
    label: 'ACT-R',
    type: 'learner',
    description: '认知架构模型',
    meta: { algorithm: '激活度' },
  },
  {
    id: 'heuristic',
    stage: 3,
    label: 'Heuristic',
    type: 'learner',
    description: '经验规则',
    meta: { algorithm: '5维打分' },
  },
  {
    id: 'ensemble',
    stage: 3,
    label: '集成投票',
    type: 'learner',
    description: '加权投票融合',
  },

  // Stage 4: 决策层
  {
    id: 'mapper',
    stage: 4,
    label: 'Action映射',
    type: 'decision',
    description: '动作到策略映射',
  },
  {
    id: 'guardrails',
    stage: 4,
    label: '安全护栏',
    type: 'guard',
    description: '4重安全保护',
  },
  {
    id: 'output',
    stage: 4,
    label: '最终策略',
    type: 'decision',
    description: '输出学习策略',
  },

  // Stage 5: 评估层
  {
    id: 'delayed_reward',
    stage: 5,
    label: '延迟奖励',
    type: 'eval',
    description: '奖励信号聚合',
  },
  {
    id: 'causal',
    stage: 5,
    label: '因果推断',
    type: 'eval',
    description: '因果效应分析',
  },

  // Stage 6: 优化层
  {
    id: 'bayesian',
    stage: 6,
    label: '贝叶斯优化',
    type: 'optim',
    description: '超参数自动调优',
  },
];

/** 连接关系配置 */
export const CONNECTIONS: Connection[] = [
  // 感知层内部
  { from: 'raw_input', to: 'feature_builder', type: 'normal' },

  // 感知层 → 建模层 (1对5分支)
  { from: 'feature_builder', to: 'attention', type: 'branch' },
  { from: 'feature_builder', to: 'fatigue', type: 'branch' },
  { from: 'feature_builder', to: 'cognitive', type: 'branch' },
  { from: 'feature_builder', to: 'motivation', type: 'branch' },
  { from: 'feature_builder', to: 'trend', type: 'branch' },

  // 建模层 → 学习层
  { from: 'attention', to: 'coldstart', type: 'merge' },
  { from: 'fatigue', to: 'coldstart', type: 'merge' },
  { from: 'cognitive', to: 'coldstart', type: 'merge' },
  { from: 'motivation', to: 'coldstart', type: 'merge' },
  { from: 'trend', to: 'coldstart', type: 'merge' },

  // 冷启动 → 集成 (或直接输出)
  { from: 'coldstart', to: 'ensemble', type: 'normal' },

  // 建模层 → 4个学习器
  { from: 'attention', to: 'linucb', type: 'branch' },
  { from: 'fatigue', to: 'linucb', type: 'branch' },
  { from: 'cognitive', to: 'thompson', type: 'branch' },
  { from: 'motivation', to: 'actr', type: 'branch' },
  { from: 'trend', to: 'heuristic', type: 'branch' },

  // 4个学习器 → 集成投票
  { from: 'linucb', to: 'ensemble', type: 'merge' },
  { from: 'thompson', to: 'ensemble', type: 'merge' },
  { from: 'actr', to: 'ensemble', type: 'merge' },
  { from: 'heuristic', to: 'ensemble', type: 'merge' },

  // 学习层 → 决策层
  { from: 'ensemble', to: 'mapper', type: 'normal' },
  { from: 'mapper', to: 'guardrails', type: 'normal' },
  { from: 'guardrails', to: 'output', type: 'normal' },

  // 决策层 → 评估层
  { from: 'output', to: 'delayed_reward', type: 'normal' },
  { from: 'delayed_reward', to: 'causal', type: 'normal' },

  // 评估层 → 优化层
  { from: 'causal', to: 'bayesian', type: 'normal' },

  // 反馈回路 (优化层 → 学习层)
  { from: 'bayesian', to: 'linucb', type: 'feedback' },
  { from: 'delayed_reward', to: 'ensemble', type: 'feedback' },
];

/** 节点状态样式 */
export const NODE_STATUS_STYLES = {
  idle: {
    border: 'border-slate-600',
    bg: 'bg-slate-800/80',
    shadow: '',
  },
  processing: {
    border: 'border-sky-500',
    bg: 'bg-sky-900/50',
    shadow: 'shadow-lg shadow-sky-500/20',
  },
  warning: {
    border: 'border-amber-500',
    bg: 'bg-amber-900/50',
    shadow: 'shadow-lg shadow-amber-500/20',
  },
  error: {
    border: 'border-red-500',
    bg: 'bg-red-900/50 animate-pulse',
    shadow: 'shadow-lg shadow-red-500/30',
  },
} as const;

/** 节点类型颜色 */
export const NODE_TYPE_COLORS: Record<string, string> = {
  perception: '#38bdf8',
  model: '#a78bfa',
  learner: '#34d399',
  decision: '#fbbf24',
  guard: '#ef4444',
  eval: '#f472b6',
  optim: '#60a5fa',
};

/** 故障注入选项 */
export const FAULT_OPTIONS: FaultOption[] = [
  {
    type: 'high_fatigue',
    label: '高疲劳',
    description: '模拟用户高度疲劳状态',
    color: '#f97316',
  },
  {
    type: 'low_attention',
    label: '低注意力',
    description: '模拟用户注意力不集中',
    color: '#eab308',
  },
  {
    type: 'anomaly',
    label: '异常数据',
    description: '模拟异常/攻击数据',
    color: '#ef4444',
  },
];

/** 数据包状态颜色 */
export const PACKET_STATUS_COLORS = {
  normal: '#38bdf8',
  warning: '#fbbf24',
  blocked: '#ef4444',
  fault_sim: '#f97316',
} as const;
