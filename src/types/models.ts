/**
 * 单词数据模型
 */
export interface Word {
  id: string;                    // 唯一标识符
  spelling: string;              // 单词拼写
  phonetic: string;              // 国际音标
  meanings: string[];            // 中文释义列表
  examples: string[];            // 例句列表
  audioUrl?: string;             // 发音音频URL（可选）
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
}

/**
 * 答题记录数据模型
 */
export interface AnswerRecord {
  id: string;                    // 唯一标识符
  wordId: string;                // 关联的单词ID
  selectedAnswer: string;        // 用户选择的答案
  correctAnswer: string;         // 正确答案
  isCorrect: boolean;            // 是否正确
  timestamp: number;             // 答题时间戳
}

/**
 * 学习会话数据模型
 */
export interface LearningSession {
  id: string;                    // 会话ID
  wordIds: string[];             // 本次学习的单词ID列表
  currentIndex: number;          // 当前单词索引
  startTime: number;             // 开始时间
  endTime?: number;              // 结束时间（可选）
}

/**
 * 单词统计信息
 */
export interface WordStatistics {
  attempts: number;              // 尝试次数
  correct: number;               // 正确次数
  lastStudied: number;           // 最后学习时间
}

/**
 * 学习统计数据模型
 */
export interface StudyStatistics {
  totalWords: number;            // 总单词数
  studiedWords: number;          // 已学习单词数
  correctRate: number;           // 总体正确率
  wordStats: Map<string, WordStatistics>; // 每个单词的统计
}
