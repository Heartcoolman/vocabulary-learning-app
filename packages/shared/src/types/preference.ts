/**
 * 用户偏好设置相关类型定义
 */

/**
 * 学习偏好
 */
export interface LearningPreferences {
  /** 偏好学习开始时间 (HH:mm 格式) */
  preferredStudyTimeStart?: string;
  /** 偏好学习结束时间 (HH:mm 格式) */
  preferredStudyTimeEnd?: string;
  /** 偏好难度等级 */
  preferredDifficulty?: 'easy' | 'medium' | 'hard' | 'adaptive';
  /** 是否启用每日目标 */
  dailyGoalEnabled?: boolean;
  /** 每日目标单词数 */
  dailyGoalWords?: number;
}

/**
 * 通知偏好
 */
export interface NotificationPreferences {
  /** 是否启用遗忘预警通知 */
  enableForgettingAlerts?: boolean;
  /** 是否启用成就通知 */
  enableAchievements?: boolean;
  /** 是否启用提醒通知 */
  enableReminders?: boolean;
  /** 是否启用系统通知 */
  enableSystemNotif?: boolean;
  /** 提醒频率 */
  reminderFrequency?: 'never' | 'daily' | 'weekly' | 'custom';
  /** 免打扰开始时间 (HH:mm 格式) */
  quietHoursStart?: string;
  /** 免打扰结束时间 (HH:mm 格式) */
  quietHoursEnd?: string;
}

/**
 * 界面偏好
 */
export interface UIPreferences {
  /** 主题 */
  theme?: 'light' | 'dark' | 'auto';
  /** 语言 */
  language?: string;
  /** 是否启用声音 */
  soundEnabled?: boolean;
  /** 是否启用动画 */
  animationEnabled?: boolean;
}

/**
 * 用户偏好设置（完整）
 */
export interface UserPreference {
  id: string;
  userId: string;
  // 学习偏好
  preferredStudyTimeStart?: string;
  preferredStudyTimeEnd?: string;
  preferredDifficulty?: string;
  dailyGoalEnabled: boolean;
  dailyGoalWords: number;
  // 通知偏好
  enableForgettingAlerts: boolean;
  enableAchievements: boolean;
  enableReminders: boolean;
  enableSystemNotif: boolean;
  reminderFrequency: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  // 界面偏好
  theme: string;
  language: string;
  soundEnabled: boolean;
  animationEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 更新偏好设置 DTO
 */
export interface UpdatePreferencesDto {
  learning?: Partial<LearningPreferences>;
  notification?: Partial<NotificationPreferences>;
  ui?: Partial<UIPreferences>;
}

/**
 * 偏好设置响应（分组）
 */
export interface PreferencesResponse {
  learning: LearningPreferences;
  notification: NotificationPreferences;
  ui: UIPreferences;
  updatedAt: Date;
}
