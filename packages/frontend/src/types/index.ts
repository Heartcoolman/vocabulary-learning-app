/**
 * Frontend 类型导出
 *
 * 类型迁移策略：
 * - 共享类型：从 @danci/shared 重新导出
 * - 前端专用类型：从本地文件导出
 *
 * 统一导入点：import { XXX } from '@/types' 或 import { XXX } from '../types'
 */

// ============================================
// 从 @danci/shared 重新导出的共享类型
// ============================================

// 通用类型
export type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Timestamp,
  ID,
  BaseEntity,
} from '@danci/shared';

// 用户相关类型
export type {
  UserRole,
  UserInfo,
  AuthUser,
  RegisterDto,
  LoginDto,
  UpdatePasswordDto,
  UserStatistics,
} from '@danci/shared';

// 单词相关类型
export type {
  Word,
  CreateWordDto,
  UpdateWordDto,
  WordBookType,
  WordBook,
  CreateWordBookDto,
  UpdateWordBookDto,
  WordLearningState,
  WordScore,
  WordStatistics,
} from '@danci/shared';

export { WordState } from '@danci/shared';

// 学习相关类型
export type {
  StudyConfig,
  StudyConfigDto,
  LearningSession,
  AnswerRecord,
  CreateRecordDto,
  StudyStatistics,
  AlgorithmConfig,
  ConfigHistory,
} from '@danci/shared';

// AMAS 共享类型
export type {
  ColdStartPhase,
  TrendState,
  LearningObjectiveMode,
  LearningObjectives,
  MultiObjectiveMetrics,
  HabitProfile,
} from '@danci/shared';

// ============================================
// 从 @danci/shared 重新导出的 Zod Schemas
// ============================================

export {
  // 用户相关 Schemas
  UserRoleSchema,
  RegisterDtoSchema,
  LoginDtoSchema,
  UpdatePasswordDtoSchema,
  UserInfoSchema,
  AuthUserSchema,
  // 单词相关 Schemas
  WordBookTypeSchema,
  CreateWordDtoSchema,
  UpdateWordDtoSchema,
  WordSchema,
  CreateWordBookDtoSchema,
  UpdateWordBookDtoSchema,
  WordBookSchema,
  // 学习相关 Schemas
  StudyConfigDtoSchema,
  StudyConfigSchema,
  CreateRecordDtoSchema,
  AnswerRecordSchema,
  LearningSessionSchema,
  // AMAS 相关 Schemas
  DifficultyLevelSchema,
  LearningObjectiveModeSchema,
  ColdStartPhaseSchema,
  TrendStateSchema,
  LearningEventInputSchema,
  LearningStrategySchema,
  UserCognitiveStateSchema,
  UserStateSchema,
  LearningObjectivesSchema,
  MultiObjectiveMetricsSchema,
  // API 响应相关 Schemas (核心 API 验证)
  AuthResponseSchema,
  UserStatisticsSchema,
  WordApiSchema,
  WordListResponseSchema,
  WordBookApiSchema,
  WordBookListResponseSchema,
  StudyProgressSchema,
  TodayWordsResponseSchema,
  StudyConfigApiSchema,
  AnswerRecordApiSchema,
  RecordsResponseSchema,
  LearningSessionApiSchema,
  PaginationSchema,
} from '@danci/shared';

// ============================================
// 前端专用类型（本地定义）
// ============================================

// AMAS 前端专用类型
export * from './amas';

// AMAS 增强类型（时间推荐、趋势分析、徽章系统等）
export * from './amas-enhanced';

// 可解释性相关类型
export * from './explainability';

// 习惯画像响应类型（HabitProfile 从 shared 导出，响应类型本地定义）
export type {
  StoredHabitProfile,
  HabitProfileResponse,
  EndSessionResponse,
  InitializeProfileResponse,
  PersistProfileResponse,
} from './habit-profile';

// 学习目标前端专用类型（基础类型从 shared 导出）
export type {
  PrimaryObjective,
  ModeSuggestion,
  ObjectiveSuggestions,
  ObjectiveHistoryEntry,
} from './learning-objectives';

// 单词精通度相关类型
export * from './word-mastery';
