/**
 * Hooks 导出
 */
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

// Mutations
export {
  useSubmitAnswer,
  extractAmasState,
  shouldTakeBreak,
} from './mutations';
export type {
  SubmitAnswerParams,
  LocalWordDecision,
  UseSubmitAnswerOptions,
} from './mutations';
