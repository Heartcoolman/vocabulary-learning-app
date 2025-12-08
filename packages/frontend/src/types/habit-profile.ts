/**
 * 习惯画像相关类型定义
 * 与后端 backend/src/amas/modeling/habit-recognizer.ts 保持一致
 *
 * 注意: HabitProfile 已迁移到 @danci/shared，此处只保留前端专用的响应类型
 */

// HabitProfile 从 @danci/shared 导入
import type { HabitProfile } from '@danci/shared';

// 重新导出以保持向后兼容
export type { HabitProfile };

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
