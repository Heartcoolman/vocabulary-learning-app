/**
 * UserProfile API类型定义
 */

/**
 * 用户基础信息
 */
export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  rewardProfile: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 习惯画像
 */
export interface HabitProfile {
  userId: string;
  timePref: {
    preferredTimes: number[];
  };
  rhythmPref: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * 时间节律画像
 */
export interface ChronotypeProfile {
  type: 'morning' | 'evening' | 'intermediate';
  confidence: number;
  peakHours: number[];
  analysis: string;
}

/**
 * 学习风格画像
 */
export interface LearningStyleProfile {
  dominantStyle: string;
  styleScores: Record<string, number>;
  confidence: number;
  recommendations: string[];
}

/**
 * 认知画像
 */
export interface CognitiveProfile {
  chronotype: ChronotypeProfile | null;
  learningStyle: LearningStyleProfile | null;
}

/**
 * 学习档案
 */
export interface UserLearningProfile {
  id: string;
  userId: string;
  theta: number;
  thetaVariance: number;
  attention: number;
  fatigue: number;
  motivation: number;
  emotionBaseline: string;
  lastReportedEmotion: string | null;
  flowScore: number;
  flowBaseline: number;
  activePolicyVersion: string;
  forgettingParams: any;
  createdAt: string;
  updatedAt: string;
}

/**
 * 完整用户画像
 */
export interface UserProfile {
  user: User;
  habitProfile: HabitProfile | null;
  cognitiveProfile: CognitiveProfile;
  learningProfile: UserLearningProfile | null;
}

/**
 * 用户统计信息
 */
export interface UserStatistics {
  totalWords: number;
  totalRecords: number;
  correctCount: number;
  accuracy: number;
}

/**
 * 更新密码参数
 */
export interface UpdatePasswordDto {
  oldPassword: string;
  newPassword: string;
}

/**
 * 习惯画像更新参数
 */
export interface UpdateHabitProfileParams {
  timePref?: number[];
  rhythmPref?: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
}

/**
 * 学习档案更新参数
 */
export interface UpdateLearningProfileParams {
  theta?: number;
  thetaVariance?: number;
  attention?: number;
  fatigue?: number;
  motivation?: number;
  emotionBaseline?: string;
  lastReportedEmotion?: string | null;
  flowScore?: number;
  flowBaseline?: number;
  activePolicyVersion?: string;
  forgettingParams?: any;
}
