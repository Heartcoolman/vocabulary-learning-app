/**
 * Hooks 导出
 *
 * 统一导出所有 hooks，包括：
 * - React Query Hooks (queries & mutations)
 * - 学习相关 Hooks
 * - 工具 Hooks
 */

// ==================== React Query Hooks ====================
// 导出所有 query hooks
export * from './queries';

// 导出所有 mutation hooks
export * from './mutations';

// ==================== 学习相关 Hooks ====================
export { useLearningTimer } from './useLearningTimer';
export type { UseLearningTimerResult } from './useLearningTimer';

export { useDialogPauseTracking, useDialogPauseTrackingWithStates } from './useDialogPauseTracking';
export type {
  UseDialogPauseTrackingOptions,
  UseDialogPauseTrackingReturn,
} from './useDialogPauseTracking';

export { useTestOptions, useTestOptionsGenerator, generateTestOptions } from './useTestOptions';
export type {
  TestOption,
  UseTestOptionsConfig,
  UseTestOptionsReturn,
  TestOptionsGeneratorConfig,
  TestOptionsGeneratorReturn,
} from './useTestOptions';

export { useAutoPlayPronunciation } from './useAutoPlayPronunciation';
export type {
  UseAutoPlayPronunciationConfig,
  UseAutoPlayPronunciationReturn,
} from './useAutoPlayPronunciation';

// ==================== 灰度发布 Hooks ====================
export {
  RolloutProvider,
  useRolloutContext,
  useFeatureFlag,
  useFeatureFlags,
  Feature,
  useExperiment,
  useExperimentConfig,
  ExperimentComponent,
  Experiment,
  useRolloutStage,
  useActiveRollouts,
  useFeatureWithExperiment,
  useRolloutDebug,
} from './useRollout';

// ==================== 灰度发布监控 Hooks ====================
export {
  useHealthReport,
  useAllHealthReports,
  useAlerts,
  useAlertRules,
  useMetricsRecorder,
  usePerformanceMonitor,
  useMetricsComparison,
  useRolloutDashboard,
} from './useRolloutMonitoring';

// ==================== 视觉疲劳检测 Hooks ====================
export { useVisualFatigue } from './useVisualFatigue';
export type { UseVisualFatigueOptions, UseVisualFatigueReturn } from './useVisualFatigue';

// ==================== 平台检测 Hooks ====================
export { usePlatform } from './usePlatform';
export type { PlatformInfo } from './usePlatform';

// ==================== 存储服务 Hooks ====================
export { useStorageService } from './useStorageService';
export type { UseStorageServiceOptions } from './useStorageService';
export type {
  IStorageService,
  LearningStats,
  DailyStats,
  SyncResult,
  SyncStatus,
} from './useStorageService';
export { StorageServiceError } from './useStorageService';

// ==================== 权限管理 Hooks ====================
export { usePermission } from './usePermission';
export type { PermissionType, PermissionStatus, UsePermissionReturn } from './usePermission';
