/**
 * Mastery Learning Hooks
 *
 * 从 useMasteryLearning 拆分出的子 hooks，用于模块化管理学习逻辑
 */

// 单词队列 Hook
export {
  useWordQueue,
  type UseWordQueueOptions,
  type UseWordQueueReturn,
  type QueueConfig
} from './useWordQueue';

// 重试队列 Hook
export {
  useRetryQueue,
  type RetryQueueItem,
  type UseRetryQueueOptions,
  type UseRetryQueueReturn
} from './useRetryQueue';

// 会话缓存 Hook
export {
  useSessionCache,
  type CachedSession,
  type UseSessionCacheOptions,
  type UseSessionCacheReturn,
  SESSION_CACHE_STORAGE_KEY,
  SESSION_CACHE_EXPIRY_TIME
} from './useSessionCache';

// API 封装（纯函数，无状态）
export {
  syncMasteryProgress,
  fetchMoreWords,
  processLearningEvent,
  adjustLearningWords,
  getMasteryStudyWords,
  createMasterySession,
  endHabitSession,
  type SyncProgressParams,
  type FetchMoreWordsParams,
  type FetchMoreWordsResult,
  type ProcessLearningEventParams,
  type AdjustLearningWordsParams,
  type AdjustLearningWordsResult,
  type CreateSessionResult,
  type GetStudyWordsResult
} from './useMasteryApi';

// 同步逻辑 Hook
export {
  useMasterySync,
  calculateLocalMasteryDecision,
  type LocalMasteryDecision,
  type UseMasterySyncOptions,
  type SubmitAnswerParams,
  type UseMasterySyncReturn
} from './useMasterySync';

// 状态管理 Hook (useReducer 整合)
export {
  useMasteryState,
  masteryReducer,
  createInitialState,
  initialMasteryState,
  type MasteryState,
  type MasteryAction,
  type UseMasteryStateOptions,
  type UseMasteryStateReturn
} from './useMasteryState';

// 用户动作 Hook
export {
  useMasteryActions,
  type UseMasteryActionsOptions,
  type UseMasteryActionsReturn
} from './useMasteryActions';
