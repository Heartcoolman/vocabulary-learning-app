/**
 * 实时事件类型定义
 *
 * 定义了所有通过 SSE (Server-Sent Events) 推送的实时事件类型
 */

/**
 * 反馈事件载荷
 * 用于推送学习反馈信息
 */
export interface FeedbackPayload {
  /** 学习会话 ID */
  sessionId: string;
  /** 单词 ID */
  wordId: number;
  /** 反馈类型 */
  feedbackType: 'correct' | 'incorrect' | 'skip';
  /** 反馈消息 */
  message: string;
  /** 时间戳 */
  timestamp: string;
  /** 得分变化（可选） */
  scoreChange?: number;
  /** 熟练度变化（可选） */
  masteryChange?: number;
}

/**
 * 警报事件载荷
 * 用于推送系统警报或学习提醒
 */
export interface AlertPayload {
  /** 警报 ID */
  alertId: string;
  /** 警报类型 */
  alertType: 'warning' | 'info' | 'success' | 'error';
  /** 警报标题 */
  title: string;
  /** 警报内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 优先级 */
  priority?: 'low' | 'medium' | 'high';
  /** 操作按钮（可选） */
  actions?: Array<{
    label: string;
    action: string;
  }>;
}

/**
 * 流程更新事件载荷
 * 用于推送学习流程状态变化
 */
export interface FlowUpdatePayload {
  /** 学习会话 ID */
  sessionId: string;
  /** 流程状态 */
  flowState: 'started' | 'in_progress' | 'paused' | 'completed' | 'interrupted';
  /** 当前进度百分比 */
  progress: number;
  /** 已完成单词数 */
  completedWords: number;
  /** 总单词数 */
  totalWords: number;
  /** 时间戳 */
  timestamp: string;
  /** 下一个单词 ID（可选） */
  nextWordId?: number;
  /** 剩余时间估计（分钟，可选） */
  estimatedTimeRemaining?: number;
}

/**
 * 下一个建议事件载荷
 * 用于推送下一个推荐的学习内容
 */
export interface NextSuggestionPayload {
  /** 学习会话 ID */
  sessionId: string;
  /** 推荐类型 */
  suggestionType: 'word' | 'review' | 'break' | 'session_end';
  /** 推荐的单词 ID（如果类型是 word） */
  wordId?: number;
  /** 推荐理由 */
  reason: string;
  /** 时间戳 */
  timestamp: string;
  /** 优先级分数 */
  priorityScore?: number;
  /** 预计学习时间（分钟，可选） */
  estimatedDuration?: number;
}

/**
 * 遗忘预警事件载荷
 * 用于推送单词遗忘风险提醒
 */
export interface ForgettingAlertPayload {
  /** 预警 ID */
  alertId: string;
  /** 单词 ID */
  wordId: string;
  /** 单词拼写 */
  word: string;
  /** 预测遗忘时间 */
  predictedForgetAt: string;
  /** 回忆概率 (0-1) */
  recallProbability: number;
  /** 风险等级 */
  riskLevel: 'high' | 'medium' | 'low';
  /** 推荐复习时间 */
  suggestedReviewTime?: string;
  /** 提醒消息 */
  message: string;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 实时事件联合类型
 * 所有可能的实时事件类型
 */
export type RealtimeEvent =
  | { type: 'feedback'; payload: FeedbackPayload }
  | { type: 'alert'; payload: AlertPayload }
  | { type: 'flow-update'; payload: FlowUpdatePayload }
  | { type: 'next-suggestion'; payload: NextSuggestionPayload }
  | { type: 'forgetting-alert'; payload: ForgettingAlertPayload } // 遗忘预警事件
  | { type: 'ping'; payload: { timestamp: string } } // 心跳事件
  | { type: 'error'; payload: { message: string; code?: string } }; // 错误事件

/**
 * SSE 消息格式
 */
export interface SSEMessage {
  /** 事件 ID（用于客户端重连） */
  id?: string;
  /** 事件类型 */
  event?: string;
  /** 事件数据 */
  data: string;
  /** 重连延迟（毫秒） */
  retry?: number;
}

/**
 * 实时订阅选项
 */
export interface RealtimeSubscriptionOptions {
  /** 用户 ID */
  userId: string;
  /** 学习会话 ID（可选，为空则接收该用户所有事件） */
  sessionId?: string;
  /** 事件过滤器（可选，指定只接收哪些类型的事件） */
  eventTypes?: Array<RealtimeEvent['type']>;
}
