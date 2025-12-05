/**
 * 习惯画像相关类型定义
 * 与后端 backend/src/amas/modeling/habit-recognizer.ts 保持一致
 */

/**
 * 习惯画像（内存实时计算）
 */
export interface HabitProfile {
  timePref: number[]; // 24小时归一化直方图
  rhythmPref: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
  preferredTimeSlots: number[]; // 偏好时间段小时数组，如 [9, 14, 20]
  samples: {
    timeEvents: number;
    sessions: number;
    batches: number;
  };
}

/**
 * 数据库存储的习惯画像
 */
export interface StoredHabitProfile {
  timePref: number[];
  rhythmPref: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
  updatedAt: string; // ISO date string
}

/**
 * 获取习惯画像响应（包含存储和实时数据）
 */
export interface HabitProfileResponse {
  stored: StoredHabitProfile | null;
  realtime: HabitProfile;
}

/**
 * 结束会话响应
 */
export interface EndSessionResponse {
  sessionEnded: boolean;
  durationMinutes: number;
  wordCount: number;
  habitProfileSaved: boolean;
  habitProfileMessage?: string;
  preferredTimeSlots: number[];
}

/**
 * 初始化画像响应
 */
export interface InitializeProfileResponse {
  initialized: boolean;
  saved: boolean;
  profile: {
    preferredTimeSlots: number[];
    rhythmPref: {
      sessionMedianMinutes: number;
      batchMedian: number;
    };
    samples: {
      timeEvents: number;
      sessions: number;
      batches: number;
    };
  };
}

/**
 * 持久化画像响应
 */
export interface PersistProfileResponse {
  saved: boolean;
  profile: {
    preferredTimeSlots: number[];
    rhythmPref: {
      sessionMedianMinutes: number;
      batchMedian: number;
    };
    samples: {
      timeEvents: number;
      sessions: number;
      batches: number;
    };
  };
}
