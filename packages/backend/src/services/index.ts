/**
 * Services Index
 * 集中导出所有服务
 */

// Cache Services
export { cacheService, CacheKeys, CacheTTL } from './cache.service';
export { redisCacheService, REDIS_CACHE_KEYS } from './redis-cache.service';
export { difficultyCacheService } from './difficulty-cache.service';

// Buffer Services
export {
  AnswerBufferService,
  BufferedAnswer,
  getAnswerBufferService,
  resetAnswerBufferService,
} from './answer-buffer.service';

// Core Services
export { default as authService } from './auth.service';
export { default as wordService } from './word.service';
export { default as wordBookService } from './wordbook.service';
export { default as recordService } from './record.service';
export { default as adminService } from './admin.service';
export { default as studyConfigService } from './study-config.service';

// Learning Services
// 新的统一学习状态服务
export { learningStateService } from './learning-state.service';
export type {
  CompleteWordState,
  UserStats,
  UserMasteryStats,
  WordStateUpdateData,
  UserLearningStats,
  ReviewEventInput,
  ReviewTraceRecord,
} from './learning-state.service';

export { masteryLearningService } from './mastery-learning.service';
export { stateHistoryService } from './state-history.service';

// AMAS Related Services
export { amasService } from './amas.service';
export { amasConfigService } from './amas-config.service';
export { optimizationService } from './optimization.service';
export { delayedRewardService, DelayedRewardService } from './delayed-reward.service';
export { metricsService } from './metrics.service';
export { explainabilityService } from './explainability.service';
export { decisionEventsService } from './decision-events.service';
export { trackingService } from './tracking.service';
export { behaviorFatigueService } from './behavior-fatigue.service';

// Analysis Services
export { trendAnalysisService } from './trend-analysis.service';
export { evaluationService } from './evaluation.service';
export { badgeService } from './badge.service';

// User Profile Service (统一的用户画像服务)
export { userProfileService } from './user-profile.service';
export type {
  UserProfile,
  UpdatePasswordDto,
  UserStatistics,
  UpdateHabitProfileParams,
  UpdateLearningProfileParams,
  ProfileUpdatedPayload,
  InsufficientDataError,
  AnalysisError,
} from './user-profile.service';

// Config Services
export { algorithmConfigService } from './algorithm-config.service';
export { timeRecommendService } from './time-recommend.service';
export { LearningObjectivesService as learningObjectivesService } from './learning-objectives.service';
export { planGeneratorService } from './plan-generator.service';

// External Services
export { llmProviderService, LLMProviderService } from './llm-provider.service';
export { logStorageService } from './log-storage.service';

// About Services
export { aboutService } from './about.service';
export { createRealAboutService, RealAboutService } from './real-about.service';

// Experiment Service
export { experimentService } from './experiment.service';

// Notification Service
export { notificationService } from './notification.service';

// Preference Service
export { preferenceService } from './preference.service';

// Learning Session Service
export { learningSessionService } from './learning-session.service';
export type {
  SessionConfig,
  SessionProgress,
  SessionStats,
  SessionDetail,
  FlowDetectionHook,
  EmotionTrackingHook,
} from './learning-session.service';

// Word Context Service
export { wordContextService } from './word-context.service';
export type {
  ContextMetadata,
  WordContextData,
  CreateContextRequest,
  UpdateContextMetadataRequest,
  GetContextsOptions,
  ContextStats,
} from './word-context.service';
