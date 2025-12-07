/**
 * AMAS 增强功能类型定义
 * 包含时间推荐、趋势分析、徽章系统、学习计划和状态历史追踪
 */

// ============================================
// 时间推荐相关类型 (Requirements: 1.1, 1.2, 1.5)
// ============================================

/**
 * 时间段信息
 */
export interface TimeSlot {
  /** 小时 (0-23) */
  hour: number;
  /** 得分 (0-1) */
  score: number;
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * 时间偏好分析结果
 */
export interface TimePreference {
  /** 24小时偏好分布 (每小时的学习效果得分) */
  timePref: number[];
  /** 推荐时间段 (前3个最佳时段) */
  preferredSlots: TimeSlot[];
  /** 整体置信度 (0-1) */
  confidence: number;
  /** 样本数量 */
  sampleCount: number;
}

/**
 * 黄金学习时间检测结果
 */
export interface GoldenTimeResult {
  /** 当前是否为黄金学习时间 */
  isGolden: boolean;
  /** 当前小时 */
  currentHour: number;
  /** 匹配的时间段 (如果是黄金时间) */
  matchedSlot?: TimeSlot;
}

// ============================================
// 趋势分析相关类型 (Requirements: 2.1, 2.3, 2.5)
// ============================================

/**
 * 趋势状态
 */
export type TrendState = 'up' | 'flat' | 'stuck' | 'down';

/**
 * 趋势信息
 */
export interface TrendInfo {
  /** 当前趋势状态 */
  state: TrendState;
  /** 连续天数 */
  consecutiveDays: number;
  /** 最后变化时间 */
  lastChange: string;
}

/**
 * 趋势历史项
 */
export interface TrendHistoryItem {
  /** 日期 */
  date: string;
  /** 趋势状态 */
  state: TrendState;
  /** 正确率 */
  accuracy: number;
  /** 平均响应时间 */
  avgResponseTime: number;
  /** 动机值 */
  motivation: number;
}

/**
 * 趋势线数据
 */
export interface TrendLine {
  /** 数据点 */
  points: { date: string; value: number }[];
  /** 趋势方向 */
  direction: 'up' | 'down' | 'flat';
  /** 变化百分比 */
  changePercent: number;
}

/**
 * 趋势报告
 */
export interface TrendReport {
  /** 正确率趋势 */
  accuracyTrend: TrendLine;
  /** 响应时间趋势 */
  responseTimeTrend: TrendLine;
  /** 动机趋势 */
  motivationTrend: TrendLine;
  /** 总结 */
  summary: string;
  /** 建议列表 */
  recommendations: string[];
}

/**
 * 干预建议结果
 */
export interface InterventionResult {
  /** 是否需要干预 */
  needsIntervention: boolean;
  /** 干预类型 */
  type?: 'warning' | 'suggestion' | 'encouragement';
  /** 干预消息 */
  message?: string;
  /** 建议操作 */
  actions?: string[];
}

// ============================================
// 徽章系统相关类型 (Requirements: 3.1, 3.2, 3.5)
// ============================================

/**
 * 徽章类别
 */
export type BadgeCategory = 'STREAK' | 'ACCURACY' | 'COGNITIVE' | 'MILESTONE';

/**
 * 徽章解锁条件
 */
export interface BadgeCondition {
  /** 条件类型 */
  type: 'streak' | 'accuracy' | 'words_learned' | 'cognitive_improvement' | 'total_sessions';
  /** 目标值 */
  value: number;
  /** 额外参数 */
  params?: Record<string, unknown>;
}

/**
 * 徽章定义
 */
export interface BadgeDefinition {
  /** 徽章ID */
  id: string;
  /** 徽章名称 */
  name: string;
  /** 徽章描述 */
  description: string;
  /** 图标URL */
  iconUrl: string;
  /** 徽章类别 */
  category: BadgeCategory;
  /** 徽章等级 (1-5) */
  tier: number;
  /** 解锁条件 */
  condition: BadgeCondition;
}

/**
 * 用户徽章
 */
export interface Badge {
  /** 徽章ID */
  id: string;
  /** 徽章名称 */
  name: string;
  /** 徽章描述 */
  description: string;
  /** 图标URL */
  iconUrl: string;
  /** 徽章类别 */
  category: BadgeCategory;
  /** 徽章等级 */
  tier: number;
  /** 解锁时间 (ISO字符串，未解锁时为undefined) */
  unlockedAt?: string;
  /** 进度百分比 (0-100，未解锁时显示进度) */
  progress?: number;
}

/**
 * 徽章进度
 */
export interface BadgeProgress {
  /** 徽章ID */
  badgeId: string;
  /** 当前值 */
  currentValue: number;
  /** 目标值 */
  targetValue: number;
  /** 进度百分比 (0-100) */
  percentage: number;
}

/**
 * 新徽章获得结果
 */
export interface NewBadgeResult {
  /** 徽章信息 */
  badge: Badge;
  /** 是否为新获得 */
  isNew: boolean;
  /** 获得时间 */
  unlockedAt: string;
}

// ============================================
// 学习计划相关类型 (Requirements: 4.1, 4.2, 4.4)
// ============================================

/**
 * 词书分配
 */
export interface WordbookAllocation {
  /** 词书ID */
  wordbookId: string;
  /** 词书名称 */
  wordbookName?: string;
  /** 分配百分比 (0-100) */
  percentage: number;
  /** 优先级 (1-5，1最高) */
  priority: number;
}

/**
 * 周里程碑
 */
export interface WeeklyMilestone {
  /** 周数 */
  week: number;
  /** 目标单词数 */
  target: number;
  /** 描述 */
  description: string;
  /** 是否已完成 */
  completed?: boolean;
}

/**
 * 学习计划
 */
export interface LearningPlan {
  /** 计划ID */
  id: string;
  /** 每日目标单词数 */
  dailyTarget: number;
  /** 总单词数 */
  totalWords: number;
  /** 预计完成日期 (ISO字符串) */
  estimatedCompletionDate: string;
  /** 周里程碑 */
  weeklyMilestones: WeeklyMilestone[];
  /** 词书分配 */
  wordbookDistribution: WordbookAllocation[];
  /** 是否激活 */
  isActive?: boolean;
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
}

/**
 * 计划生成选项
 */
export interface PlanOptions {
  /** 目标完成天数 */
  targetDays?: number;
  /** 每日目标单词数 */
  dailyTarget?: number;
  /** 选中的词书ID列表 */
  wordbookIds?: string[];
}

/**
 * 计划进度
 */
export interface PlanProgress {
  /** 今日已完成 */
  completedToday: number;
  /** 今日目标 */
  targetToday: number;
  /** 本周进度百分比 (0-100) */
  weeklyProgress: number;
  /** 总体进度百分比 (0-100) */
  overallProgress: number;
  /** 是否按计划进行 */
  onTrack: boolean;
  /** 偏差百分比 (正数表示超前，负数表示落后) */
  deviation: number;
}

// ============================================
// 状态历史相关类型 (Requirements: 5.1, 5.3, 5.4)
// ============================================

/**
 * 日期范围选项
 */
export type DateRangeOption = 7 | 30 | 90;

/**
 * 日期范围
 */
export interface DateRange {
  /** 开始日期 (ISO字符串) */
  start: string;
  /** 结束日期 (ISO字符串) */
  end: string;
}

/**
 * 状态历史数据点
 */
export interface StateHistoryPoint {
  /** 日期 (ISO字符串) */
  date: string;
  /** 注意力 (0-1) */
  attention: number;
  /** 疲劳度 (0-1) */
  fatigue: number;
  /** 动机 (-1-1) */
  motivation: number;
  /** 记忆力 (0-1) - 与后端 API 和数据库保持一致 */
  memory: number;
  /** 速度 (0-1) */
  speed: number;
  /** 稳定性 (0-1) */
  stability: number;
  /** 趋势状态 */
  trendState?: TrendState;
}

/**
 * 认知能力画像
 * 注意：字段命名与后端 API 和数据库保持一致，使用 memory
 */
export interface CognitiveProfile {
  /** 记忆力 (0-1) - 与后端 API 和数据库 UserStateHistory.memory 对应 */
  memory: number;
  /** 速度 (0-1) */
  speed: number;
  /** 稳定性 (0-1) */
  stability: number;
}

/**
 * 认知能力变化详情
 */
export interface CognitiveChange {
  /** 变化绝对值 */
  value: number;
  /** 变化百分比 */
  percent: number;
  /** 变化方向 */
  direction: 'up' | 'down';
}

/**
 * 认知成长结果
 */
export interface CognitiveGrowthResult {
  /** 当前认知画像 */
  current: CognitiveProfile;
  /** 过去认知画像 */
  past: CognitiveProfile;
  /** 变化详情 - 使用 memory 与 CognitiveProfile 字段名保持一致 */
  changes: {
    memory: CognitiveChange;
    speed: CognitiveChange;
    stability: CognitiveChange;
  };
  /** 对比周期 (天数) */
  period: number;
  /** 周期标签 (如 "30天") */
  periodLabel?: string;
}

/**
 * 显著变化
 */
export interface SignificantChange {
  /** 指标名称 - 使用 memory 与后端 API 保持一致 */
  metric: 'attention' | 'fatigue' | 'motivation' | 'memory' | 'speed' | 'stability';
  /** 指标显示名称 */
  metricLabel: string;
  /** 变化百分比 */
  changePercent: number;
  /** 变化方向 */
  direction: 'up' | 'down';
  /** 是否为正面变化 */
  isPositive: boolean;
  /** 开始日期 */
  startDate: string;
  /** 结束日期 */
  endDate: string;
}

// ============================================
// API 响应类型
// ============================================

/**
 * 数据不足响应
 */
export interface InsufficientDataResponse {
  /** 数据是否不足 */
  insufficientData: true;
  /** 最小所需数量 */
  minRequired: number;
  /** 当前数量 */
  currentCount: number;
}

/**
 * 时间偏好API响应
 */
export type TimePreferenceResponse = TimePreference | InsufficientDataResponse;

/**
 * 判断是否为数据不足响应
 */
export function isInsufficientData(
  response: TimePreferenceResponse,
): response is InsufficientDataResponse {
  return 'insufficientData' in response && response.insufficientData === true;
}
