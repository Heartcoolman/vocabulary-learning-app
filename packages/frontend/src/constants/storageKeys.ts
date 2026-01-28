/**
 * LocalStorage 存储键常量
 * 统一管理所有 localStorage 键名，防止命名冲突和拼写错误
 */
export const STORAGE_KEYS = {
  // 认证相关
  AUTH_TOKEN: 'auth_token',

  // 学习相关
  LEARNING_TYPE: 'learningType',

  // 配置相关
  ROLLOUT_CONFIGS: 'rollout_configs',
  ROLLOUT_ALERT_RULES: 'rollout_alert_rules',

  // 视觉疲劳
  VISUAL_FATIGUE_STORAGE: 'visual-fatigue-storage',

  // AMAS 设置
  AMAS_SETTINGS_STORAGE: 'amas-settings-storage',

  // A/B 测试
  AB_TESTING: 'ab_testing',

  // Feature Flags
  FEATURE_FLAGS: 'feature_flags',

  // 紧急状态
  EMERGENCY_STATE: 'danci_emergency_state',
  NOTIFICATIONS: 'danci_notifications',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
