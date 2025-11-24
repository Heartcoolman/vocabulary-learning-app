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
  responseTime?: number;         // 响应时间（从显示单词到选择答案的时间，毫秒）
  dwellTime?: number;            // 停留时长（累计在单词上的时间，毫秒）
  sessionId?: string;            // 学习会话ID
  masteryLevelBefore?: number;   // 答题前的掌握程度（0-5级）
  masteryLevelAfter?: number;    // 答题后的掌握程度（0-5级）
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

/**
 * 词书类型
 */
export type WordBookType = 'SYSTEM' | 'USER';

/**
 * 词书数据模型
 */
export interface WordBook {
  id: string;
  name: string;
  description?: string | null;
  type: WordBookType;
  userId?: string | null;
  isPublic: boolean;
  wordCount: number;
  coverImage?: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * 学习配置数据模型
 */
export interface StudyConfig {
  id: string;
  userId: string;
  selectedWordBookIds: string[];
  dailyWordCount: number;
  studyMode: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 用户角色
 */
export type UserRole = 'USER' | 'ADMIN';

/**
 * 用户信息（包含角色）
 */
export interface UserInfo {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: number;
  updatedAt: number;
}

/**
 * 系统统计数据
 */
export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalWordBooks: number;
  systemWordBooks: number;
  userWordBooks: number;
  totalWords: number;
  totalRecords: number;
}

/**
 * 单词状态枚举
 */
export enum WordState {
  NEW = 'NEW',                   // 新单词
  LEARNING = 'LEARNING',         // 学习中
  REVIEWING = 'REVIEWING',       // 复习中
  MASTERED = 'MASTERED'          // 已掌握
}

/**
 * 单词学习状态数据模型
 */
export interface WordLearningState {
  id: string;                    // 唯一标识符
  userId: string;                // 用户ID
  wordId: string;                // 单词ID
  state: WordState;              // 单词状态
  masteryLevel: number;          // 掌握程度（0-5级）
  easeFactor: number;            // 难度因子（1.3-2.5）
  reviewCount: number;           // 复习次数
  lastReviewDate: number;        // 最后复习时间戳
  nextReviewDate: number;        // 下次复习时间戳
  currentInterval: number;       // 当前复习间隔（天）
  consecutiveCorrect: number;    // 连续答对次数
  consecutiveWrong: number;      // 连续答错次数
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
}

/**
 * 单词综合评分数据模型
 */
export interface WordScore {
  id: string;                    // 唯一标识符
  userId: string;                // 用户ID
  wordId: string;                // 单词ID
  totalScore: number;            // 总分（0-100）
  accuracyScore: number;         // 正确率得分（0-40）
  speedScore: number;            // 答题速度得分（0-30）
  stabilityScore: number;        // 稳定性得分（0-20）
  proficiencyScore: number;      // 熟练度得分（0-10）
  totalAttempts: number;         // 总答题次数
  correctAttempts: number;       // 正确答题次数
  averageResponseTime: number;   // 平均响应时间（毫秒）
  averageDwellTime: number;      // 平均停留时长（毫秒）
  recentAccuracy: number;        // 最近5次的正确率（0-1）
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
}

/**
 * 算法配置数据模型
 */
export interface AlgorithmConfig {
  id: string;                    // 唯一标识符
  name: string;                  // 配置名称
  description?: string;          // 配置描述
  
  // 遗忘曲线参数
  reviewIntervals: number[];     // 复习间隔序列（天），默认：[1, 3, 7, 15, 30]
  
  // 难度调整参数
  consecutiveCorrectThreshold: number;  // 连续答对阈值，默认：5
  consecutiveWrongThreshold: number;    // 连续答错阈值，默认：3
  difficultyAdjustmentInterval: number; // 难度调整最小间隔（会话数），默认：1
  
  // 优先级权重（总和必须为100）
  priorityWeights: {
    newWord: number;             // 新单词权重，默认：40
    errorRate: number;           // 错误率权重，默认：30
    overdueTime: number;         // 逾期时间权重，默认：20
    wordScore: number;           // 单词得分权重，默认：10
  };
  
  // 掌握程度阈值（0-5级）
  masteryThresholds: {
    level: number;               // 级别（0-5）
    requiredCorrectStreak: number;  // 所需连续答对次数
    minAccuracy: number;         // 最低正确率（0-1）
    minScore: number;            // 最低单词得分（0-100）
  }[];
  
  // 单词得分权重（总和必须为100）
  scoreWeights: {
    accuracy: number;            // 正确率权重，默认：40
    speed: number;               // 答题速度权重，默认：30
    stability: number;           // 稳定性权重，默认：20
    proficiency: number;         // 熟练度权重，默认：10
  };
  
  // 答题速度评分标准（毫秒）
  speedThresholds: {
    excellent: number;           // 优秀阈值，默认：3000（< 3秒）
    good: number;                // 良好阈值，默认：5000（3-5秒）
    average: number;             // 一般阈值，默认：10000（5-10秒）
    slow: number;                // 较慢阈值，默认：10000（> 10秒）
  };
  
  // 新单词比例配置
  newWordRatio: {
    default: number;             // 默认比例，默认：0.3（30%）
    highAccuracy: number;        // 高正确率时的比例，默认：0.5（50%）
    lowAccuracy: number;         // 低正确率时的比例，默认：0.1（10%）
    highAccuracyThreshold: number;  // 高正确率阈值，默认：0.85（85%）
    lowAccuracyThreshold: number;   // 低正确率阈值，默认：0.65（65%）
  };
  
  isDefault: boolean;            // 是否为默认配置
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
  createdBy?: string;            // 创建者ID（管理员）
}

/**
 * 配置历史记录数据模型
 */
export interface ConfigHistory {
  id: string;                    // 唯一标识符
  configId: string;              // 配置ID
  changedBy: string;             // 修改者ID
  changeReason?: string;         // 修改原因
  previousValue: Partial<AlgorithmConfig>;  // 修改前的值
  newValue: Partial<AlgorithmConfig>;       // 修改后的值
  timestamp: number;             // 修改时间戳
}
