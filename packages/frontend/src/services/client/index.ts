/**
 * API Client 统一导出
 *
 * 本文件提供所有 API Client 模块的统一入口，支持：
 * - 命名导出每个 Client 类
 * - 导出单例实例
 * - 导出相关类型和接口
 */

// ==================== Base 模块 ====================
export { BaseClient, ApiError } from './base/BaseClient';
export type { ApiResponse } from './base/BaseClient';
export { default as TokenManager } from './base/TokenManager';

// ==================== Auth 模块 ====================
export { AuthClient } from './auth/AuthClient';
export type { User, AuthResponse, Statistics } from './auth/AuthClient';

// ==================== Word 模块 ====================
export { WordClient } from './word/WordClient';

// ==================== WordBook 模块 ====================
export { WordBookClient } from './wordbook/WordBookClient';
export type { StudyProgress, TodayWordsResponse } from './wordbook/WordBookClient';

// ==================== WordBook Center 模块 ====================
export { WordBookCenterClient } from './wordbook-center/WordBookCenterClient';
export type {
  CenterConfig,
  PersonalCenterConfig,
  CenterConfigResponse,
  CenterWordBook,
  CenterWord,
  CenterWordBookDetail,
  BrowseResponse,
  ImportResult,
  UpdateInfo,
  SyncResult,
} from './wordbook-center/WordBookCenterClient';

// ==================== Learning 模块 ====================
export { LearningClient } from './learning/LearningClient';
export type { SessionStats, SessionAnswerRecord } from './learning/LearningClient';

// ==================== AMAS 模块 ====================
export { AmasClient } from './amas/AmasClient';

// ==================== Admin 模块 ====================
export { AdminClient } from './admin/AdminClient';
export type {
  UserOverview,
  AdminUsersResponse,
  UserLearningData,
  UserDetailedStatistics,
  UserWordDetail,
  UserWordsResponse,
  AdminStatistics,
  WordLearningHistory,
  WordScoreHistory,
  UserLearningHeatmap,
  AnomalyFlag,
  VisualFatigueStats,
  LLMTask,
  WordVariant,
  SystemVersionInfo,
  OTAUpdateStatus,
} from './admin/AdminClient';

// ==================== Admin Settings 模块 ====================
export { AdminSettingsClient, adminSettingsClient } from './admin/AdminSettingsClient';
export type { SettingItem, UpdateSettingItem } from './admin/AdminSettingsClient';

// ==================== LLM Advisor 模块 ====================
export { LLMAdvisorClient } from './llm/LLMAdvisorClient';
export type {
  LLMSuggestionItem,
  LLMSuggestionAnalysis,
  LLMParsedSuggestion,
  LLMWeeklyStats,
  LLMStoredSuggestion,
  LLMConfig,
  LLMWorkerStatus,
  LLMAdvisorConfigResponse,
  LLMAdvisorHealthResponse,
  LLMAdvisorSuggestionsResponse,
  LLMAdvisorTriggerResponse,
  LLMAdvisorPendingCountResponse,
} from './llm/LLMAdvisorClient';

// ==================== Visual Fatigue 模块 ====================
export { VisualFatigueClient, visualFatigueClient } from './visual-fatigue/VisualFatigueClient';

// ==================== Ops Enhance 模块 ====================
export { OpsEnhanceClient, opsEnhanceClient } from './ops-enhance/OpsEnhanceClient';
export type {
  AlertSeverity,
  AlertStatus,
  UserSegment,
  AlertInput,
  AlertAnalysisResult,
  AlertStats,
  WeeklyReportSummary,
  WeeklyReportDetail,
  HealthTrendPoint,
  UserBehaviorInsight,
  UserSegmentInfo,
} from './ops-enhance/OpsEnhanceClient';

// ==================== Notification 模块 ====================
export { NotificationClient } from './notification/NotificationClient';
export type {
  Notification,
  NotificationQueryParams,
  NotificationStats,
} from './notification/NotificationClient';

// ==================== Preferences 模块 ====================
export { PreferencesClient } from './preferences/PreferencesClient';
export type {
  LearningPreferences,
  NotificationPreferences,
  UiPreferences,
  UserPreferences,
  UpdatePreferencesDto,
} from './preferences/PreferencesClient';

// ==================== Semantic 模块 ====================
export { SemanticClient, semanticClient } from './semantic/SemanticClient';
export type {
  SemanticWord,
  SemanticSearchResponse,
  SemanticStatsResponse,
  BatchEmbedResponse,
  ConfusionPair,
  WordCluster,
  WordClusterDetail,
  HealthCheckResponse,
  ClusterConfusionCount,
  ConfusionCacheStatus,
} from './semantic/SemanticClient';

// ==================== 单例实例 ====================
// 创建全局共享的 Client 实例，便于直接使用

import { AuthClient } from './auth/AuthClient';
import { WordClient } from './word/WordClient';
import { WordBookClient } from './wordbook/WordBookClient';
import { LearningClient } from './learning/LearningClient';
import { AmasClient } from './amas/AmasClient';
import { AdminClient } from './admin/AdminClient';
import { LLMAdvisorClient } from './llm/LLMAdvisorClient';
import { visualFatigueClient } from './visual-fatigue/VisualFatigueClient';
import { opsEnhanceClient } from './ops-enhance/OpsEnhanceClient';
import { NotificationClient } from './notification/NotificationClient';
import { PreferencesClient } from './preferences/PreferencesClient';
import { WordBookCenterClient } from './wordbook-center/WordBookCenterClient';
import { SemanticClient, semanticClient } from './semantic/SemanticClient';

/** 认证客户端单例 */
export const authClient = new AuthClient();

/** 单词客户端单例 */
export const wordClient = new WordClient();

/** 词书客户端单例 */
export const wordBookClient = new WordBookClient();

/** 学习记录客户端单例 */
export const learningClient = new LearningClient();

/** AMAS 自适应学习客户端单例 */
export const amasClient = new AmasClient();

/** 管理员客户端单例 */
export const adminClient = new AdminClient();

/** LLM 顾问客户端单例 */
export const llmAdvisorClient = new LLMAdvisorClient();

/** 通知客户端单例 */
export const notificationClient = new NotificationClient();

/** 偏好设置客户端单例 */
export const preferencesClient = new PreferencesClient();

/** 词库中心客户端单例 */
export const wordBookCenterClient = new WordBookCenterClient();

// ==================== 向后兼容的 API 对象 ====================
// 提供与旧版 ApiClient 完全兼容的单例对象

/**
 * API 客户端单例 - 向后兼容层
 * 将所有方法代理到对应的模块化客户端
 */
export const apiClient = {
  // ==================== 模块化客户端引用 ====================
  auth: authClient,
  word: wordClient,
  wordBook: wordBookClient,
  learning: learningClient,
  amas: amasClient,
  admin: adminClient,
  llmAdvisor: llmAdvisorClient,
  visualFatigue: visualFatigueClient,
  opsEnhance: opsEnhanceClient,
  notification: notificationClient,
  preferences: preferencesClient,
  semantic: semanticClient,

  // ==================== 认证相关 ====================
  register: authClient.register.bind(authClient),
  login: authClient.login.bind(authClient),
  logout: authClient.logout.bind(authClient),
  getCurrentUser: authClient.getCurrentUser.bind(authClient),
  updatePassword: authClient.updatePassword.bind(authClient),
  updateProfile: authClient.updateProfile.bind(authClient),
  requestPasswordReset: authClient.requestPasswordReset.bind(authClient),
  resetPassword: authClient.resetPassword.bind(authClient),
  getUserStatistics: authClient.getUserStatistics.bind(authClient),
  uploadAvatar: authClient.uploadAvatar.bind(authClient),
  setToken: authClient.setToken.bind(authClient),
  clearToken: authClient.clearToken.bind(authClient),
  getToken: authClient.getToken.bind(authClient),

  // ==================== 单词相关 ====================
  getWords: wordClient.getWords.bind(wordClient),
  getLearnedWords: wordClient.getLearnedWords.bind(wordClient),
  getWordById: wordClient.getWordById.bind(wordClient),
  createWord: wordClient.createWord.bind(wordClient),
  updateWord: wordClient.updateWord.bind(wordClient),
  deleteWord: wordClient.deleteWord.bind(wordClient),
  batchCreateWords: wordClient.batchCreateWords.bind(wordClient),
  searchWords: wordClient.searchWords.bind(wordClient),
  batchImportWords: wordClient.batchImportWords.bind(wordClient),

  // ==================== 词书相关 ====================
  getUserWordBooks: wordBookClient.getUserWordBooks.bind(wordBookClient),
  getSystemWordBooks: wordBookClient.getSystemWordBooks.bind(wordBookClient),
  getAllAvailableWordBooks: wordBookClient.getAllAvailableWordBooks.bind(wordBookClient),
  getWordBookById: wordBookClient.getWordBookById.bind(wordBookClient),
  createWordBook: wordBookClient.createWordBook.bind(wordBookClient),
  updateWordBook: wordBookClient.updateWordBook.bind(wordBookClient),
  deleteWordBook: wordBookClient.deleteWordBook.bind(wordBookClient),
  getWordBookWords: wordBookClient.getWordBookWords.bind(wordBookClient),
  addWordToWordBook: wordBookClient.addWordToWordBook.bind(wordBookClient),
  removeWordFromWordBook: wordBookClient.removeWordFromWordBook.bind(wordBookClient),
  getStudyConfig: wordBookClient.getStudyConfig.bind(wordBookClient),
  updateStudyConfig: wordBookClient.updateStudyConfig.bind(wordBookClient),
  getTodayWords: wordBookClient.getTodayWords.bind(wordBookClient),
  getStudyProgress: wordBookClient.getStudyProgress.bind(wordBookClient),

  // ==================== 学习记录相关 ====================
  getRecords: learningClient.getRecords.bind(learningClient),
  createRecord: learningClient.createRecord.bind(learningClient),
  batchCreateRecords: learningClient.batchCreateRecords.bind(learningClient),
  getEnhancedStatistics: learningClient.getEnhancedStatistics.bind(learningClient),
  getWordLearningState: learningClient.getWordLearningState.bind(learningClient),
  getWordLearningStates: learningClient.getWordLearningStates.bind(learningClient),
  saveWordLearningState: learningClient.saveWordLearningState.bind(learningClient),
  deleteWordLearningState: learningClient.deleteWordLearningState.bind(learningClient),
  getDueWords: learningClient.getDueWords.bind(learningClient),
  getWordsByState: learningClient.getWordsByState.bind(learningClient),
  getWordScore: learningClient.getWordScore.bind(learningClient),
  getWordScores: learningClient.getWordScores.bind(learningClient),
  saveWordScore: learningClient.saveWordScore.bind(learningClient),
  getWordsByScoreRange: learningClient.getWordsByScoreRange.bind(learningClient),
  getMasteryStudyWords: learningClient.getMasteryStudyWords.bind(learningClient),
  getNextWords: learningClient.getNextWords.bind(learningClient),
  createMasterySession: learningClient.createMasterySession.bind(learningClient),
  syncMasteryProgress: learningClient.syncMasteryProgress.bind(learningClient),
  adjustLearningWords: learningClient.adjustLearningWords.bind(learningClient),
  markWordAsMastered: learningClient.markWordAsMastered.bind(learningClient),
  markWordAsNeedsPractice: learningClient.markWordAsNeedsPractice.bind(learningClient),
  resetWordProgress: learningClient.resetWordProgress.bind(learningClient),
  batchUpdateWordStates: learningClient.batchUpdateWordStates.bind(learningClient),
  listSessions: learningClient.listSessions.bind(learningClient),
  getSessionDetail: learningClient.getSessionDetail.bind(learningClient),

  // ==================== AMAS 相关 ====================
  getAlgorithmConfig: amasClient.getAlgorithmConfig.bind(amasClient),
  updateAlgorithmConfig: amasClient.updateAlgorithmConfig.bind(amasClient),
  resetAlgorithmConfig: amasClient.resetAlgorithmConfig.bind(amasClient),
  getConfigHistory: amasClient.getConfigHistory.bind(amasClient),
  getAllAlgorithmConfigs: amasClient.getAllAlgorithmConfigs.bind(amasClient),
  processLearningEvent: amasClient.processLearningEvent.bind(amasClient),
  getAmasState: amasClient.getAmasState.bind(amasClient),
  getAmasStrategy: amasClient.getAmasStrategy.bind(amasClient),
  resetAmasState: amasClient.resetAmasState.bind(amasClient),
  getAmasColdStartPhase: amasClient.getAmasColdStartPhase.bind(amasClient),
  batchProcessEvents: amasClient.batchProcessEvents.bind(amasClient),
  getTimePreferences: amasClient.getTimePreferences.bind(amasClient),
  getGoldenTime: amasClient.getGoldenTime.bind(amasClient),
  getCurrentTrend: amasClient.getCurrentTrend.bind(amasClient),
  getTrendHistory: amasClient.getTrendHistory.bind(amasClient),
  getTrendReport: amasClient.getTrendReport.bind(amasClient),
  getIntervention: amasClient.getIntervention.bind(amasClient),
  getUserBadges: amasClient.getUserBadges.bind(amasClient),
  getAllBadgesWithStatus: amasClient.getAllBadgesWithStatus.bind(amasClient),
  getBadgeDetails: amasClient.getBadgeDetails.bind(amasClient),
  getBadgeProgress: amasClient.getBadgeProgress.bind(amasClient),
  checkAndAwardBadges: amasClient.checkAndAwardBadges.bind(amasClient),
  getLearningPlan: amasClient.getLearningPlan.bind(amasClient),
  generateLearningPlan: amasClient.generateLearningPlan.bind(amasClient),
  getPlanProgress: amasClient.getPlanProgress.bind(amasClient),
  adjustLearningPlan: amasClient.adjustLearningPlan.bind(amasClient),
  getStateHistory: amasClient.getStateHistory.bind(amasClient),
  getCognitiveGrowth: amasClient.getCognitiveGrowth.bind(amasClient),
  getSignificantChanges: amasClient.getSignificantChanges.bind(amasClient),
  getWordMasteryStats: amasClient.getWordMasteryStats.bind(amasClient),
  batchProcessWordMastery: amasClient.batchProcessWordMastery.bind(amasClient),
  getWordMasteryDetail: amasClient.getWordMasteryDetail.bind(amasClient),
  getWordMasteryTrace: amasClient.getWordMasteryTrace.bind(amasClient),
  getWordMasteryInterval: amasClient.getWordMasteryInterval.bind(amasClient),
  getHabitProfile: amasClient.getHabitProfile.bind(amasClient),
  initializeHabitProfile: amasClient.initializeHabitProfile.bind(amasClient),
  endHabitSession: amasClient.endHabitSession.bind(amasClient),
  persistHabitProfile: amasClient.persistHabitProfile.bind(amasClient),
  getAmasDecisionExplanation: amasClient.getAmasDecisionExplanation.bind(amasClient),
  runCounterfactualAnalysis: amasClient.runCounterfactualAnalysis.bind(amasClient),
  getAmasLearningCurve: amasClient.getAmasLearningCurve.bind(amasClient),
  getDecisionTimeline: amasClient.getDecisionTimeline.bind(amasClient),
  getChronotypeProfile: amasClient.getChronotypeProfile.bind(amasClient),
  getLearningStyleProfile: amasClient.getLearningStyleProfile.bind(amasClient),
  getCognitiveProfile: amasClient.getCognitiveProfile.bind(amasClient),
  getLearningObjectives: amasClient.getLearningObjectives.bind(amasClient),
  updateLearningObjectives: amasClient.updateLearningObjectives.bind(amasClient),
  switchLearningMode: amasClient.switchLearningMode.bind(amasClient),
  getLearningObjectiveSuggestions: amasClient.getLearningObjectiveSuggestions.bind(amasClient),
  getLearningObjectiveHistory: amasClient.getLearningObjectiveHistory.bind(amasClient),
  deleteLearningObjectives: amasClient.deleteLearningObjectives.bind(amasClient),
  getUserRewardProfile: amasClient.getUserRewardProfile.bind(amasClient),
  updateUserRewardProfile: amasClient.updateUserRewardProfile.bind(amasClient),

  // ==================== 管理员相关 ====================
  adminGetUsers: adminClient.getUsers.bind(adminClient),
  adminGetUserById: adminClient.getUserById.bind(adminClient),
  adminGetUserLearningData: adminClient.getUserLearningData.bind(adminClient),
  adminGetUserStatistics: adminClient.getUserStatistics.bind(adminClient),
  adminGetUserWords: adminClient.getUserWords.bind(adminClient),
  adminExportUserWords: adminClient.exportUserWords.bind(adminClient),
  adminUpdateUserRole: adminClient.updateUserRole.bind(adminClient),
  adminDeleteUser: adminClient.deleteUser.bind(adminClient),
  adminGetSystemWordBooks: adminClient.getSystemWordBooks.bind(adminClient),
  adminCreateSystemWordBook: adminClient.createSystemWordBook.bind(adminClient),
  adminUpdateSystemWordBook: adminClient.updateSystemWordBook.bind(adminClient),
  adminDeleteSystemWordBook: adminClient.deleteSystemWordBook.bind(adminClient),
  adminBatchAddWordsToSystemWordBook: adminClient.batchAddWordsToSystemWordBook.bind(adminClient),
  adminGetStatistics: adminClient.getStatistics.bind(adminClient),
  adminGetWordLearningHistory: adminClient.getWordLearningHistory.bind(adminClient),
  adminGetWordScoreHistory: adminClient.getWordScoreHistory.bind(adminClient),
  adminGetUserLearningHeatmap: adminClient.getUserLearningHeatmap.bind(adminClient),
  adminFlagAnomalyRecord: adminClient.flagAnomalyRecord.bind(adminClient),
  adminGetAnomalyFlags: adminClient.getAnomalyFlags.bind(adminClient),
  adminGetUserDecisions: adminClient.getUserDecisions.bind(adminClient),
  adminGetDecisionDetail: adminClient.getDecisionDetail.bind(adminClient),
  getOptimizationSuggestion: adminClient.getOptimizationSuggestion.bind(adminClient),
  recordOptimizationEvaluation: adminClient.recordOptimizationEvaluation.bind(adminClient),
  getBestOptimizationParams: adminClient.getBestOptimizationParams.bind(adminClient),
  getOptimizationHistory: adminClient.getOptimizationHistory.bind(adminClient),
  triggerOptimization: adminClient.triggerOptimization.bind(adminClient),
  resetOptimizer: adminClient.resetOptimizer.bind(adminClient),
  getOptimizationDiagnostics: adminClient.getOptimizationDiagnostics.bind(adminClient),
  recordCausalObservation: adminClient.recordCausalObservation.bind(adminClient),
  getCausalATE: adminClient.getCausalATE.bind(adminClient),
  compareStrategies: adminClient.compareStrategies.bind(adminClient),
  getCausalDiagnostics: adminClient.getCausalDiagnostics.bind(adminClient),
  getExperimentVariant: adminClient.getExperimentVariant.bind(adminClient),
  recordExperimentMetric: adminClient.recordExperimentMetric.bind(adminClient),
  createExperiment: adminClient.createExperiment.bind(adminClient),
  getExperiments: adminClient.getExperiments.bind(adminClient),
  getExperiment: adminClient.getExperiment.bind(adminClient),
  getExperimentStatus: adminClient.getExperimentStatus.bind(adminClient),
  startExperiment: adminClient.startExperiment.bind(adminClient),
  stopExperiment: adminClient.stopExperiment.bind(adminClient),
  deleteExperiment: adminClient.deleteExperiment.bind(adminClient),
  exportExperiment: adminClient.exportExperiment.bind(adminClient),
  getVisualFatigueStats: adminClient.getVisualFatigueStats.bind(adminClient),

  // ==================== LLM 顾问相关 ====================
  getLLMAdvisorConfig: llmAdvisorClient.getConfig.bind(llmAdvisorClient),
  checkLLMAdvisorHealth: llmAdvisorClient.checkHealth.bind(llmAdvisorClient),
  getLLMAdvisorSuggestions: llmAdvisorClient.getSuggestions.bind(llmAdvisorClient),
  getLLMAdvisorSuggestion: llmAdvisorClient.getSuggestion.bind(llmAdvisorClient),
  approveLLMAdvisorSuggestion: llmAdvisorClient.approveSuggestion.bind(llmAdvisorClient),
  rejectLLMAdvisorSuggestion: llmAdvisorClient.rejectSuggestion.bind(llmAdvisorClient),
  triggerLLMAdvisorAnalysis: llmAdvisorClient.triggerAnalysis.bind(llmAdvisorClient),
  getLatestLLMAdvisorSuggestion: llmAdvisorClient.getLatestSuggestion.bind(llmAdvisorClient),
  getLLMAdvisorPendingCount: llmAdvisorClient.getPendingCount.bind(llmAdvisorClient),

  // ==================== 视觉疲劳相关 ====================
  submitVisualFatigueMetrics: visualFatigueClient.submitMetrics.bind(visualFatigueClient),
  getVisualFatigueBaseline: visualFatigueClient.getBaseline.bind(visualFatigueClient),
  updateVisualFatigueBaseline: visualFatigueClient.updateBaseline.bind(visualFatigueClient),
  getVisualFatigueConfig: visualFatigueClient.getConfig.bind(visualFatigueClient),
  getVisualFatigueFusion: visualFatigueClient.getFusion.bind(visualFatigueClient),
  resetVisualFatigue: visualFatigueClient.reset.bind(visualFatigueClient),

  // ==================== 通知相关 ====================
  getNotifications: notificationClient.getNotifications.bind(notificationClient),
  getNotification: notificationClient.getNotification.bind(notificationClient),
  getNotificationStats: notificationClient.getStats.bind(notificationClient),
  getUnreadCount: notificationClient.getUnreadCount.bind(notificationClient),
  markNotificationAsRead: notificationClient.markAsRead.bind(notificationClient),
  markAllNotificationsAsRead: notificationClient.markAllAsRead.bind(notificationClient),
  batchMarkNotificationsAsRead: notificationClient.batchMarkAsRead.bind(notificationClient),
  archiveNotification: notificationClient.archive.bind(notificationClient),
  deleteNotification: notificationClient.deleteNotification.bind(notificationClient),
  batchDeleteNotifications: notificationClient.batchDelete.bind(notificationClient),

  // ==================== 偏好设置相关 ====================
  getPreferences: preferencesClient.getPreferences.bind(preferencesClient),
  updatePreferences: preferencesClient.updatePreferences.bind(preferencesClient),
  getLearningPreferences: preferencesClient.getLearningPreferences.bind(preferencesClient),
  updateLearningPreferences: preferencesClient.updateLearningPreferences.bind(preferencesClient),
  getNotificationPreferences: preferencesClient.getNotificationPreferences.bind(preferencesClient),
  updateNotificationPreferences:
    preferencesClient.updateNotificationPreferences.bind(preferencesClient),
  getUiPreferences: preferencesClient.getUiPreferences.bind(preferencesClient),
  updateUiPreferences: preferencesClient.updateUiPreferences.bind(preferencesClient),
  resetPreferences: preferencesClient.resetPreferences.bind(preferencesClient),
  checkQuietHours: preferencesClient.checkQuietHours.bind(preferencesClient),

  // ==================== 语义搜索相关 ====================
  semanticSearch: semanticClient.search.bind(semanticClient),
  getSimilarWords: semanticClient.getSimilarWords.bind(semanticClient),
  getSemanticStats: semanticClient.getStats.bind(semanticClient),
  batchEmbed: semanticClient.batchEmbed.bind(semanticClient),

  // ==================== 设置 ====================
  setOnUnauthorized(callback: (() => void) | null): void {
    authClient.setOnUnauthorized(callback);
    wordClient.setOnUnauthorized(callback);
    wordBookClient.setOnUnauthorized(callback);
    learningClient.setOnUnauthorized(callback);
    amasClient.setOnUnauthorized(callback);
    adminClient.setOnUnauthorized(callback);
    llmAdvisorClient.setOnUnauthorized(callback);
    visualFatigueClient.setOnUnauthorized(callback);
    opsEnhanceClient.setOnUnauthorized(callback);
    notificationClient.setOnUnauthorized(callback);
    preferencesClient.setOnUnauthorized(callback);
    semanticClient.setOnUnauthorized(callback);
  },
};

// 同时导出 ApiClient 作为别名（大写开头，兼容某些导入方式）
export const ApiClient = apiClient;

// 默认导出 apiClient 单例
export default apiClient;
