// UI Store - 模态框、侧边栏等UI状态管理
export { useUIStore } from './uiStore';

// Toast Store - Toast通知状态管理
export { useToastStore, useToastCleanup } from './toastStore';
export type { Toast, ToastType } from './toastStore';

// Admin Auth Store - 管理员独立认证状态管理
export { useAdminAuthStore } from './adminAuthStore';
export type { AdminUser } from './adminAuthStore';

// Visual Fatigue Store - 视觉疲劳检测状态管理
export {
  useVisualFatigueStore,
  selectIsDetecting,
  selectVisualFatigueScore,
  selectNeedsCalibration,
  selectCameraAvailable,
} from './visualFatigueStore';

// AMAS Settings Store - AMAS 参数配置状态管理
export {
  useAmasSettingsStore,
  getFatigueThreshold,
  getDifficultyLabel,
  FATIGUE_SENSITIVITY_THRESHOLDS,
} from './amasSettingsStore';
export type {
  FatigueSensitivity,
  FatigueAlertMode,
  DifficultyAdjustSpeed,
  DifficultyRange,
} from './amasSettingsStore';
