// UI Store - 模态框、侧边栏等UI状态管理
export { useUIStore } from './uiStore';

// Toast Store - Toast通知状态管理
export { useToastStore, useToastCleanup } from './toastStore';
export type { Toast, ToastType } from './toastStore';

// Visual Fatigue Store - 视觉疲劳检测状态管理
export {
  useVisualFatigueStore,
  selectIsDetecting,
  selectVisualFatigueScore,
  selectNeedsCalibration,
  selectCameraAvailable,
} from './visualFatigueStore';
