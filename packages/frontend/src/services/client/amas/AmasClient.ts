import { BaseClient, ApiError } from '../base/BaseClient';
import { AlgorithmConfig } from '../../../types/models';
import { apiLogger } from '../../../utils/logger';

/**
 * API 响应中的 AlgorithmConfig 类型（扁平字段结构）
 */
interface ApiAlgorithmConfig {
  id: string;
  name: string;
  description?: string;
  reviewIntervals?: number[];
  consecutiveCorrectThreshold?: number;
  consecutiveWrongThreshold?: number;
  difficultyAdjustmentInterval?: number;
  priorityWeightNewWord?: number;
  priorityWeightErrorRate?: number;
  priorityWeightOverdueTime?: number;
  priorityWeightWordScore?: number;
  masteryThresholds?: {
    level: number;
    requiredCorrectStreak: number;
    minAccuracy: number;
    minScore: number;
  }[];
  scoreWeightAccuracy?: number;
  scoreWeightSpeed?: number;
  scoreWeightStability?: number;
  scoreWeightProficiency?: number;
  speedThresholdExcellent?: number;
  speedThresholdGood?: number;
  speedThresholdAverage?: number;
  speedThresholdSlow?: number;
  newWordRatioDefault?: number;
  newWordRatioHighAccuracy?: number;
  newWordRatioLowAccuracy?: number;
  newWordRatioHighAccuracyThreshold?: number;
  newWordRatioLowAccuracyThreshold?: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * API 响应中的 ConfigHistory 类型
 */
interface ApiConfigHistory {
  id: string;
  configId: string;
  changedBy: string;
  changeReason?: string;
  previousValue: ApiAlgorithmConfig | null;
  newValue: ApiAlgorithmConfig | null;
  timestamp: string;
}

/**
 * API 响应中的用户状态（后端紧凑格式）
 * 后端使用简写字段名: A/F/M/C
 */
interface ApiUserState {
  A: number;
  F: number;
  M: number;
  C: {
    mem: number;
    speed: number;
    stability: number;
  };
  conf?: number;
  ts?: number;
}

/**
 * API 响应中的 ProcessEvent 结果（后端紧凑格式）
 */
interface ApiProcessEventResponse {
  sessionId: string;
  strategy: {
    interval_scale: number;
    new_ratio: number;
    difficulty: string;
    batch_size: number;
    hint_level: number;
  };
  explanation: {
    factors: Array<{ name: string; value: number; impact: string; percentage: number }>;
    changes: string[];
    text: string;
  };
  state: ApiUserState;
  wordMasteryDecision?: {
    wordId: string;
    prevMastery: number;
    newMastery: number;
    prevInterval: number;
    newInterval: number;
    quality: number;
  };
  reward: { value: number; reason: string };
  coldStartPhase?: string;
  shouldBreak?: boolean;
  suggestion?: string;
}

/**
 * 将后端状态响应转换为前端状态格式
 */
function transformApiUserState(
  raw: ApiUserState | null | undefined,
): import('../../../types/amas').UserStateFrontend {
  const c = raw?.C ?? { mem: 0.5, speed: 0.5, stability: 0.5 };
  return {
    attention: raw?.A ?? 0.5,
    fatigue: raw?.F ?? 0.5,
    motivation: raw?.M ?? 0,
    memory: c.mem ?? 0.5,
    speed: c.speed ?? 0.5,
    stability: c.stability ?? 0.5,
    confidence: raw?.conf,
    timestamp: raw?.ts,
  };
}

/**
 * AmasClient - AMAS自适应学习系统相关API
 *
 * 职责：
 * - AMAS核心功能（状态、策略、事件处理）
 * - 算法配置管理
 * - AMAS增强功能（时间偏好、趋势分析、徽章系统、学习计划等）
 * - 单词精通度分析
 * - 习惯画像
 * - 可解释性API
 * - 认知画像（Chronotype、Learning Style）
 * - 学习目标配置
 */
/** 前端 masteryThreshold 结构 */
interface MasteryThreshold {
  level: number;
  requiredCorrectStreak: number;
  minAccuracy: number;
  minScore: number;
}

export class AmasClient extends BaseClient {
  /**
   * 将后端的 masteryThresholds 转换为前端数组格式
   * 后端格式: {"level1":20,"level2":40,...} 或 数组格式
   * 前端格式: [{level:1, requiredCorrectStreak:2, minAccuracy:0.6, minScore:40}, ...]
   */
  private normalizeMasteryThresholds(raw: unknown): MasteryThreshold[] {
    // 如果已经是数组格式，直接返回
    if (Array.isArray(raw)) {
      return raw;
    }

    // 如果是对象格式 {"level1":20,"level2":40,...}，转换为数组
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, number>;
      const thresholds: MasteryThreshold[] = [];

      // 从对象中提取 level1, level2, ... 的值
      // minAccuracy 默认值与下方默认数组保持一致：0.6, 0.7, 0.75, 0.8, 0.85
      const defaultMinAccuracy = [0.6, 0.7, 0.75, 0.8, 0.85];
      for (let i = 1; i <= 5; i++) {
        const key = `level${i}`;
        const minScore = obj[key];
        if (minScore !== undefined) {
          thresholds.push({
            level: i,
            requiredCorrectStreak: i + 1, // 默认：级别+1
            minAccuracy: defaultMinAccuracy[i - 1],
            minScore: minScore,
          });
        }
      }

      if (thresholds.length > 0) {
        return thresholds;
      }
    }

    // 返回默认值
    return [
      { level: 1, requiredCorrectStreak: 2, minAccuracy: 0.6, minScore: 40 },
      { level: 2, requiredCorrectStreak: 3, minAccuracy: 0.7, minScore: 50 },
      { level: 3, requiredCorrectStreak: 4, minAccuracy: 0.75, minScore: 60 },
      { level: 4, requiredCorrectStreak: 5, minAccuracy: 0.8, minScore: 70 },
      { level: 5, requiredCorrectStreak: 6, minAccuracy: 0.85, minScore: 80 },
    ];
  }

  /**
   * 将后端扁平字段转换为前端嵌套对象
   */
  private normalizeAlgorithmConfig(raw: ApiAlgorithmConfig): AlgorithmConfig {
    if (!raw) throw new Error('算法配置为空');
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description ?? '',
      reviewIntervals: raw.reviewIntervals ?? [1, 3, 7, 15, 30],
      consecutiveCorrectThreshold: raw.consecutiveCorrectThreshold ?? 5,
      consecutiveWrongThreshold: raw.consecutiveWrongThreshold ?? 3,
      difficultyAdjustmentInterval: raw.difficultyAdjustmentInterval ?? 1,
      // 优先级权重默认值（总和 = 100）
      priorityWeights: {
        newWord: raw.priorityWeightNewWord ?? 40,
        errorRate: raw.priorityWeightErrorRate ?? 30,
        overdueTime: raw.priorityWeightOverdueTime ?? 20,
        wordScore: raw.priorityWeightWordScore ?? 10,
      },
      masteryThresholds: this.normalizeMasteryThresholds(raw.masteryThresholds),
      // 单词得分权重默认值（总和 = 100）
      scoreWeights: {
        accuracy: raw.scoreWeightAccuracy ?? 40,
        speed: raw.scoreWeightSpeed ?? 30,
        stability: raw.scoreWeightStability ?? 20,
        proficiency: raw.scoreWeightProficiency ?? 10,
      },
      // 速度阈值默认值（必须递增：excellent < good < average < slow）
      speedThresholds: {
        excellent: raw.speedThresholdExcellent ?? 3000,
        good: raw.speedThresholdGood ?? 5000,
        average: raw.speedThresholdAverage ?? 10000,
        slow: raw.speedThresholdSlow ?? 15000,
      },
      newWordRatio: {
        default: raw.newWordRatioDefault ?? 0.3,
        highAccuracy: raw.newWordRatioHighAccuracy ?? 0.5,
        lowAccuracy: raw.newWordRatioLowAccuracy ?? 0.1,
        highAccuracyThreshold: raw.newWordRatioHighAccuracyThreshold ?? 0.85,
        lowAccuracyThreshold: raw.newWordRatioLowAccuracyThreshold ?? 0.65,
      },
      isDefault: !!raw.isDefault,
      createdAt: new Date(raw.createdAt).getTime(),
      updatedAt: new Date(raw.updatedAt).getTime(),
      createdBy: raw.createdBy,
    };
  }

  /**
   * 将前端嵌套对象转换为后端扁平字段
   */
  private denormalizeAlgorithmConfig(config: Partial<AlgorithmConfig>): Record<string, unknown> {
    const flat: Record<string, unknown> = { ...config };

    // 删除不应该发送到后端更新的字段（这些字段由数据库管理或不可更新）
    delete flat.id;
    delete flat.createdAt;
    delete flat.updatedAt;
    delete flat.isDefault;
    delete flat.createdBy;

    if (config.priorityWeights) {
      flat.priorityWeightNewWord = config.priorityWeights.newWord;
      flat.priorityWeightErrorRate = config.priorityWeights.errorRate;
      flat.priorityWeightOverdueTime = config.priorityWeights.overdueTime;
      flat.priorityWeightWordScore = config.priorityWeights.wordScore;
      delete flat.priorityWeights;
    }
    if (config.scoreWeights) {
      flat.scoreWeightAccuracy = config.scoreWeights.accuracy;
      flat.scoreWeightSpeed = config.scoreWeights.speed;
      flat.scoreWeightStability = config.scoreWeights.stability;
      flat.scoreWeightProficiency = config.scoreWeights.proficiency;
      delete flat.scoreWeights;
    }
    if (config.speedThresholds) {
      flat.speedThresholdExcellent = config.speedThresholds.excellent;
      flat.speedThresholdGood = config.speedThresholds.good;
      flat.speedThresholdAverage = config.speedThresholds.average;
      flat.speedThresholdSlow = config.speedThresholds.slow;
      delete flat.speedThresholds;
    }
    if (config.newWordRatio) {
      flat.newWordRatioDefault = config.newWordRatio.default;
      flat.newWordRatioHighAccuracy = config.newWordRatio.highAccuracy;
      flat.newWordRatioLowAccuracy = config.newWordRatio.lowAccuracy;
      flat.newWordRatioHighAccuracyThreshold = config.newWordRatio.highAccuracyThreshold;
      flat.newWordRatioLowAccuracyThreshold = config.newWordRatio.lowAccuracyThreshold;
      delete flat.newWordRatio;
    }
    return flat;
  }

  // ==================== 算法配置 API ====================

  /**
   * 获取当前激活的算法配置
   */
  async getAlgorithmConfig(): Promise<AlgorithmConfig> {
    try {
      const raw = await this.request<ApiAlgorithmConfig>('/api/algorithm-config');
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      apiLogger.error({ err: error }, '获取算法配置失败');
      throw error;
    }
  }

  /**
   * 更新算法配置
   */
  async updateAlgorithmConfig(
    configId: string,
    config: Partial<AlgorithmConfig>,
    changeReason?: string,
  ): Promise<AlgorithmConfig> {
    try {
      const payload = this.denormalizeAlgorithmConfig(config);
      const raw = await this.request<ApiAlgorithmConfig>(`/api/algorithm-config/${configId}`, {
        method: 'PUT',
        body: JSON.stringify({ config: payload, changeReason }),
      });
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      apiLogger.error({ err: error }, '更新算法配置失败');
      throw error;
    }
  }

  /**
   * 重置算法配置为默认值
   */
  async resetAlgorithmConfig(configId: string): Promise<AlgorithmConfig> {
    try {
      const raw = await this.request<ApiAlgorithmConfig>('/api/algorithm-config/reset', {
        method: 'POST',
        body: JSON.stringify({ configId }),
      });
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      apiLogger.error({ err: error }, '重置算法配置失败');
      throw error;
    }
  }

  /**
   * 获取算法配置历史记录
   */
  async getConfigHistory(limit?: number): Promise<import('../../../types/models').ConfigHistory[]> {
    try {
      const query = limit ? `?limit=${limit}` : '';
      const raw = await this.request<ApiConfigHistory[]>(`/api/algorithm-config/history${query}`);
      return raw.map((h): import('../../../types/models').ConfigHistory => ({
        id: h.id,
        configId: h.configId,
        changedBy: h.changedBy,
        changeReason: h.changeReason,
        previousValue: h.previousValue ? this.normalizeAlgorithmConfig(h.previousValue) : {},
        newValue: h.newValue ? this.normalizeAlgorithmConfig(h.newValue) : {},
        timestamp: new Date(h.timestamp).getTime(),
        createdAt: new Date(h.timestamp).getTime(),
        updatedAt: new Date(h.timestamp).getTime(),
      }));
    } catch (error) {
      apiLogger.error({ err: error }, '获取配置历史失败');
      throw error;
    }
  }

  /**
   * 获取所有算法配置预设
   */
  async getAllAlgorithmConfigs(): Promise<AlgorithmConfig[]> {
    try {
      const raw = await this.request<ApiAlgorithmConfig[]>('/api/algorithm-config/presets');
      return raw.map((config) => this.normalizeAlgorithmConfig(config));
    } catch (error) {
      apiLogger.error({ err: error }, '获取算法配置预设失败');
      throw error;
    }
  }

  // ==================== AMAS 核心 API ====================

  /**
   * 处理学习事件，获取自适应学习策略
   */
  async processLearningEvent(
    eventData: import('../../../types/amas').LearningEventInput,
  ): Promise<import('../../../types/amas').AmasProcessResult> {
    try {
      const raw = await this.request<ApiProcessEventResponse>('/api/amas/process', {
        method: 'POST',
        body: JSON.stringify(eventData),
      });
      return {
        sessionId: raw.sessionId,
        strategy: {
          interval_scale: raw.strategy.interval_scale,
          new_ratio: raw.strategy.new_ratio,
          difficulty: raw.strategy.difficulty as 'easy' | 'mid' | 'hard',
          batch_size: raw.strategy.batch_size,
          hint_level: raw.strategy.hint_level,
        },
        state: transformApiUserState(raw.state),
        explanation: raw.explanation,
        wordMasteryDecision: raw.wordMasteryDecision
          ? {
              wordId: raw.wordMasteryDecision.wordId,
              prevMastery: raw.wordMasteryDecision.prevMastery,
              newMastery: raw.wordMasteryDecision.newMastery,
              prevInterval: raw.wordMasteryDecision.prevInterval,
              newInterval: raw.wordMasteryDecision.newInterval,
              quality: raw.wordMasteryDecision.quality,
              isMastered: raw.wordMasteryDecision.newMastery >= 0.8,
              confidence: Math.min(raw.wordMasteryDecision.newMastery, 1),
              suggestedRepeats: raw.wordMasteryDecision.quality < 3 ? 2 : 0,
            }
          : undefined,
      };
    } catch (error) {
      apiLogger.error({ err: error }, '处理学习事件失败');
      throw error;
    }
  }

  /**
   * 获取用户当前AMAS状态
   */
  async getAmasState(): Promise<import('../../../types/amas').UserState | null> {
    try {
      const raw = await this.request<ApiUserState>('/api/amas/state');
      return transformApiUserState(raw);
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      apiLogger.error({ err: error }, '获取AMAS状态失败');
      throw error;
    }
  }

  /**
   * 获取用户当前学习策略
   */
  async getAmasStrategy(): Promise<import('../../../types/amas').LearningStrategy | null> {
    try {
      return await this.request<import('../../../types/amas').LearningStrategy>(
        '/api/amas/strategy',
      );
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      apiLogger.error({ err: error }, '获取AMAS策略失败');
      throw error;
    }
  }

  /**
   * 重置用户AMAS状态
   */
  async resetAmasState(): Promise<void> {
    try {
      await this.request<void>('/api/amas/reset', {
        method: 'POST',
      });
    } catch (error) {
      apiLogger.error({ err: error }, '重置AMAS状态失败');
      throw error;
    }
  }

  /**
   * 获取用户冷启动阶段
   */
  async getAmasColdStartPhase(): Promise<import('../../../types/amas').ColdStartPhaseInfo> {
    try {
      return await this.request<import('../../../types/amas').ColdStartPhaseInfo>(
        '/api/amas/phase',
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取冷启动阶段失败');
      throw error;
    }
  }

  /**
   * 批量处理历史学习事件
   */
  async batchProcessEvents(
    events: import('../../../types/amas').LearningEventInput[],
  ): Promise<import('../../../types/amas').BatchProcessResult> {
    try {
      return await this.request<import('../../../types/amas').BatchProcessResult>(
        '/api/amas/batch-process',
        {
          method: 'POST',
          body: JSON.stringify({ events }),
        },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '批量处理事件失败');
      throw error;
    }
  }

  /**
   * 获取延迟奖励列表
   * @param params 查询参数
   * @param params.status 奖励状态筛选 (PENDING|PROCESSING|DONE|FAILED)
   * @param params.limit 返回数量限制 (默认50, 最大100)
   */
  async getDelayedRewards(params?: {
    status?: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
    limit?: number;
  }): Promise<{
    items: Array<{
      id: string;
      userId: string;
      decisionId: string;
      status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
      reward?: number;
      createdAt: string;
      updatedAt: string;
    }>;
    count: number;
  }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.status) {
        queryParams.append('status', params.status);
      }
      if (params?.limit !== undefined) {
        queryParams.append('limit', String(params.limit));
      }
      const query = queryParams.toString();
      const url = `/api/amas/delayed-rewards${query ? `?${query}` : ''}`;

      return await this.request<{
        items: Array<{
          id: string;
          userId: string;
          decisionId: string;
          status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
          reward?: number;
          createdAt: string;
          updatedAt: string;
        }>;
        count: number;
      }>(url);
    } catch (error) {
      apiLogger.error({ err: error }, '获取延迟奖励列表失败');
      throw error;
    }
  }

  // ==================== AMAS 增强功能 API ====================

  /**
   * 获取时间偏好分析
   */
  async getTimePreferences(): Promise<
    import('../../../types/amas-enhanced').TimePreferenceResponse
  > {
    try {
      return await this.request<import('../../../types/amas-enhanced').TimePreferenceResponse>(
        '/api/amas/time-preferences',
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取时间偏好失败');
      throw error;
    }
  }

  /**
   * 检查当前是否为黄金学习时间
   */
  async getGoldenTime(): Promise<
    import('../../../types/amas-enhanced').GoldenTimeResult & { message: string }
  > {
    try {
      return await this.request<
        import('../../../types/amas-enhanced').GoldenTimeResult & { message: string }
      >('/api/amas/golden-time');
    } catch (error) {
      apiLogger.error({ err: error }, '获取黄金时间失败');
      throw error;
    }
  }

  /**
   * 获取当前趋势状态
   */
  async getCurrentTrend(): Promise<
    import('../../../types/amas-enhanced').TrendInfo & { stateDescription: string }
  > {
    try {
      return await this.request<
        import('../../../types/amas-enhanced').TrendInfo & { stateDescription: string }
      >('/api/amas/trend');
    } catch (error) {
      apiLogger.error({ err: error }, '获取趋势状态失败');
      throw error;
    }
  }

  /**
   * 获取趋势历史数据
   */
  async getTrendHistory(days: number = 28): Promise<{
    daily: import('../../../types/amas-enhanced').TrendHistoryItem[];
    weekly: Array<{
      weekNumber: number;
      startDate: string;
      endDate: string;
      avgAccuracy: number;
      avgResponseTime: number;
      avgMotivation: number;
      dominantState: string;
    }>;
    totalDays: number;
  }> {
    try {
      return await this.request<{
        daily: import('../../../types/amas-enhanced').TrendHistoryItem[];
        weekly: Array<{
          weekNumber: number;
          startDate: string;
          endDate: string;
          avgAccuracy: number;
          avgResponseTime: number;
          avgMotivation: number;
          dominantState: string;
        }>;
        totalDays: number;
      }>(`/api/amas/trend/history?days=${days}`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取趋势历史失败');
      throw error;
    }
  }

  /**
   * 生成趋势报告
   */
  async getTrendReport(): Promise<import('../../../types/amas-enhanced').TrendReport> {
    try {
      return await this.request<import('../../../types/amas-enhanced').TrendReport>(
        '/api/amas/trend/report',
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取趋势报告失败');
      throw error;
    }
  }

  /**
   * 检查是否需要干预
   */
  async getIntervention(): Promise<import('../../../types/amas-enhanced').InterventionResult> {
    try {
      return await this.request<import('../../../types/amas-enhanced').InterventionResult>(
        '/api/amas/trend/intervention',
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取干预建议失败');
      throw error;
    }
  }

  /**
   * 获取用户所有徽章
   */
  async getUserBadges(): Promise<{
    badges: import('../../../types/amas-enhanced').Badge[];
    count: number;
  }> {
    try {
      return await this.request<{
        badges: import('../../../types/amas-enhanced').Badge[];
        count: number;
      }>('/api/badges');
    } catch (error) {
      apiLogger.error({ err: error }, '获取用户徽章失败');
      throw error;
    }
  }

  /**
   * 获取所有徽章（包含解锁状态）
   */
  async getAllBadgesWithStatus(): Promise<{
    badges: Array<import('../../../types/amas-enhanced').Badge & { unlocked: boolean }>;
    grouped: Record<
      string,
      Array<import('../../../types/amas-enhanced').Badge & { unlocked: boolean }>
    >;
    totalCount: number;
    unlockedCount: number;
  }> {
    try {
      return await this.request<{
        badges: Array<import('../../../types/amas-enhanced').Badge & { unlocked: boolean }>;
        grouped: Record<
          string,
          Array<import('../../../types/amas-enhanced').Badge & { unlocked: boolean }>
        >;
        totalCount: number;
        unlockedCount: number;
      }>('/api/badges/all');
    } catch (error) {
      apiLogger.error({ err: error }, '获取所有徽章失败');
      throw error;
    }
  }

  /**
   * 获取徽章详情
   */
  async getBadgeDetails(badgeId: string): Promise<
    import('../../../types/amas-enhanced').BadgeDefinition & {
      unlocked: boolean;
      unlockedAt?: string;
    }
  > {
    try {
      return await this.request<
        import('../../../types/amas-enhanced').BadgeDefinition & {
          unlocked: boolean;
          unlockedAt?: string;
        }
      >(`/api/badges/${badgeId}`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取徽章详情失败');
      throw error;
    }
  }

  /**
   * 获取徽章进度
   */
  async getBadgeProgress(
    badgeId: string,
  ): Promise<import('../../../types/amas-enhanced').BadgeProgress> {
    try {
      return await this.request<import('../../../types/amas-enhanced').BadgeProgress>(
        `/api/badges/${badgeId}/progress`,
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取徽章进度失败');
      throw error;
    }
  }

  /**
   * 检查并授予新徽章
   */
  async checkAndAwardBadges(): Promise<{
    newBadges: import('../../../types/amas-enhanced').NewBadgeResult[];
    hasNewBadges: boolean;
    message: string;
  }> {
    try {
      return await this.request<{
        newBadges: import('../../../types/amas-enhanced').NewBadgeResult[];
        hasNewBadges: boolean;
        message: string;
      }>('/api/badges/check', { method: 'POST' });
    } catch (error) {
      apiLogger.error({ err: error }, '检查徽章失败');
      throw error;
    }
  }

  /**
   * 获取当前学习计划
   */
  async getLearningPlan(): Promise<import('../../../types/amas-enhanced').LearningPlan | null> {
    try {
      const result = await this.request<import('../../../types/amas-enhanced').LearningPlan | null>(
        '/api/plan',
      );
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      apiLogger.error({ err: error }, '获取学习计划失败');
      throw error;
    }
  }

  /**
   * 生成学习计划
   */
  async generateLearningPlan(
    options?: import('../../../types/amas-enhanced').PlanOptions,
  ): Promise<import('../../../types/amas-enhanced').LearningPlan> {
    try {
      return await this.request<import('../../../types/amas-enhanced').LearningPlan>(
        '/api/plan/generate',
        {
          method: 'POST',
          body: JSON.stringify(options || {}),
        },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '生成学习计划失败');
      throw error;
    }
  }

  /**
   * 获取计划进度
   */
  async getPlanProgress(): Promise<
    import('../../../types/amas-enhanced').PlanProgress & { status: string }
  > {
    try {
      return await this.request<
        import('../../../types/amas-enhanced').PlanProgress & { status: string }
      >('/api/plan/progress');
    } catch (error) {
      apiLogger.error({ err: error }, '获取计划进度失败');
      throw error;
    }
  }

  /**
   * 调整学习计划
   */
  async adjustLearningPlan(
    reason?: string,
  ): Promise<import('../../../types/amas-enhanced').LearningPlan> {
    try {
      return await this.request<import('../../../types/amas-enhanced').LearningPlan>(
        '/api/plan/adjust',
        {
          method: 'PUT',
          body: JSON.stringify({ reason }),
        },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '调整学习计划失败');
      throw error;
    }
  }

  /**
   * 获取状态历史数据
   */
  async getStateHistory(
    range: import('../../../types/amas-enhanced').DateRangeOption = 30,
  ): Promise<{
    history: import('../../../types/amas-enhanced').StateHistoryPoint[];
    summary: {
      recordCount: number;
      averages: {
        attention: number;
        fatigue: number;
        motivation: number;
        memory: number;
        speed: number;
        stability: number;
      };
    };
    range: number;
    totalRecords: number;
  }> {
    try {
      const history = await this.request<
        import('../../../types/amas-enhanced').StateHistoryPoint[]
      >(`/api/amas/history?range=${range}`);

      const recordCount = history.length;
      const averages =
        recordCount > 0
          ? {
              attention: history.reduce((s, h) => s + h.attention, 0) / recordCount,
              fatigue: history.reduce((s, h) => s + h.fatigue, 0) / recordCount,
              motivation: history.reduce((s, h) => s + h.motivation, 0) / recordCount,
              memory: history.reduce((s, h) => s + h.memory, 0) / recordCount,
              speed: history.reduce((s, h) => s + h.speed, 0) / recordCount,
              stability: history.reduce((s, h) => s + h.stability, 0) / recordCount,
            }
          : { attention: 0, fatigue: 0, motivation: 0, memory: 0, speed: 0, stability: 0 };

      return {
        history,
        summary: { recordCount, averages },
        range,
        totalRecords: recordCount,
      };
    } catch (error) {
      apiLogger.error({ err: error }, '获取状态历史失败');
      throw error;
    }
  }

  /**
   * 获取认知成长对比
   */
  async getCognitiveGrowth(
    range: import('../../../types/amas-enhanced').DateRangeOption = 30,
  ): Promise<{
    current: import('../../../types/amas-enhanced').CognitiveProfile;
    past: import('../../../types/amas-enhanced').CognitiveProfile;
    changes: {
      memory: { value: number; percent: number; direction: 'up' | 'down' };
      speed: { value: number; percent: number; direction: 'up' | 'down' };
      stability: { value: number; percent: number; direction: 'up' | 'down' };
    };
    period: number;
    periodLabel: string;
  }> {
    try {
      const raw = await this.request<{
        current: import('../../../types/amas-enhanced').CognitiveProfile;
        previous: import('../../../types/amas-enhanced').CognitiveProfile;
        memoryChange: number;
        speedChange: number;
        stabilityChange: number;
        days: number;
      }>(`/api/amas/growth?range=${range}`);

      const makeChange = (
        current: number,
        previous: number,
        changePercent: number,
      ): { value: number; percent: number; direction: 'up' | 'down' } => ({
        value: Math.abs(current - previous),
        percent: Math.abs(changePercent),
        direction: changePercent >= 0 ? 'up' : 'down',
      });

      return {
        current: raw.current,
        past: raw.previous,
        changes: {
          memory: makeChange(raw.current.memory, raw.previous.memory, raw.memoryChange),
          speed: makeChange(raw.current.speed, raw.previous.speed, raw.speedChange),
          stability: makeChange(raw.current.stability, raw.previous.stability, raw.stabilityChange),
        },
        period: raw.days,
        periodLabel: `${raw.days}天`,
      };
    } catch (error) {
      apiLogger.error({ err: error }, '获取认知成长失败');
      throw error;
    }
  }

  /**
   * 获取显著变化
   */
  async getSignificantChanges(
    range: import('../../../types/amas-enhanced').DateRangeOption = 30,
  ): Promise<{
    changes: Array<
      import('../../../types/amas-enhanced').SignificantChange & { description: string }
    >;
    range: number;
    hasSignificantChanges: boolean;
    summary: string;
  }> {
    try {
      const rawChanges = await this.request<
        import('../../../types/amas-enhanced').SignificantChange[]
      >(`/api/amas/changes?range=${range}`);

      const changesWithDesc = rawChanges.map((c) => ({
        ...c,
        description: `${c.metricLabel}${c.direction === 'up' ? '提升' : '下降'}了 ${Math.abs(c.changePercent).toFixed(1)}%`,
      }));

      const positiveCount = changesWithDesc.filter((c) => c.isPositive).length;
      let summary = '暂无显著变化';
      if (changesWithDesc.length > 0) {
        summary =
          positiveCount > changesWithDesc.length / 2
            ? `${range}天内有 ${positiveCount} 项指标呈积极变化`
            : `${range}天内有 ${changesWithDesc.length - positiveCount} 项指标需要关注`;
      }

      return {
        changes: changesWithDesc,
        range,
        hasSignificantChanges: changesWithDesc.length > 0,
        summary,
      };
    } catch (error) {
      apiLogger.error({ err: error }, '获取显著变化失败');
      throw error;
    }
  }

  // ==================== Word Mastery Analytics APIs ====================

  /**
   * 获取用户整体精通度统计
   */
  async getWordMasteryStats(): Promise<import('../../../types/word-mastery').UserMasteryStats> {
    try {
      return await this.request<import('../../../types/word-mastery').UserMasteryStats>(
        '/api/word-mastery/stats',
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词精通度统计失败');
      throw error;
    }
  }

  /**
   * 批量获取单词精通度评估
   */
  async batchProcessWordMastery(
    wordIds: string[],
    userFatigue?: number,
  ): Promise<import('../../../types/word-mastery').MasteryEvaluation[]> {
    try {
      if (!Array.isArray(wordIds) || wordIds.length === 0) {
        throw new Error('wordIds 必须是非空数组');
      }
      if (wordIds.length > 100) {
        throw new Error('wordIds 数组不能超过100个');
      }
      if (!wordIds.every((id) => typeof id === 'string' && id.trim().length > 0)) {
        throw new Error('wordIds 中所有元素必��是非空字符串');
      }
      if (
        userFatigue !== undefined &&
        (typeof userFatigue !== 'number' || userFatigue < 0 || userFatigue > 1)
      ) {
        throw new Error('userFatigue 必须是 0-1 之间的数字');
      }

      return await this.request<import('../../../types/word-mastery').MasteryEvaluation[]>(
        '/api/word-mastery/batch',
        {
          method: 'POST',
          body: JSON.stringify({ wordIds, userFatigue }),
        },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '批量处理单词精通度失败');
      throw error;
    }
  }

  /**
   * 获取单词精通度评估
   */
  async getWordMasteryDetail(
    wordId: string,
    userFatigue?: number,
  ): Promise<import('../../../types/word-mastery').MasteryEvaluation> {
    try {
      if (!wordId || typeof wordId !== 'string' || wordId.trim().length === 0) {
        throw new Error('wordId 必须是非空字符串');
      }
      if (
        userFatigue !== undefined &&
        (typeof userFatigue !== 'number' || userFatigue < 0 || userFatigue > 1)
      ) {
        throw new Error('userFatigue 必须是 0-1 之间的数字');
      }

      const queryParams = new URLSearchParams();
      if (userFatigue !== undefined) {
        queryParams.append('userFatigue', userFatigue.toString());
      }
      const query = queryParams.toString();

      return await this.request<import('../../../types/word-mastery').MasteryEvaluation>(
        `/api/word-mastery/${wordId}${query ? `?${query}` : ''}`,
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词精通度详情失败');
      throw error;
    }
  }

  /**
   * 获取单词学习轨迹
   */
  async getWordMasteryTrace(
    wordId: string,
    limit?: number,
  ): Promise<import('../../../types/word-mastery').WordMasteryTrace> {
    try {
      if (!wordId || typeof wordId !== 'string' || wordId.trim().length === 0) {
        throw new Error('wordId 必须是非空字符串');
      }
      if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 100)) {
        throw new Error('limit 必须是 1-100 之间的整数');
      }

      const queryParams = new URLSearchParams();
      if (limit !== undefined) {
        queryParams.append('limit', Math.floor(limit).toString());
      }
      const query = queryParams.toString();

      return await this.request<import('../../../types/word-mastery').WordMasteryTrace>(
        `/api/word-mastery/${wordId}/trace${query ? `?${query}` : ''}`,
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词学习轨迹失败');
      throw error;
    }
  }

  /**
   * 预测最佳复习间隔
   */
  async getWordMasteryInterval(
    wordId: string,
    targetRecall?: number,
  ): Promise<import('../../../types/word-mastery').WordMasteryIntervalResponse> {
    try {
      if (!wordId || typeof wordId !== 'string' || wordId.trim().length === 0) {
        throw new Error('wordId 必须是非空字符串');
      }
      if (
        targetRecall !== undefined &&
        (typeof targetRecall !== 'number' || targetRecall <= 0 || targetRecall >= 1)
      ) {
        throw new Error('targetRecall 必须是大于0小于1的数字');
      }

      const queryParams = new URLSearchParams();
      if (targetRecall !== undefined) {
        queryParams.append('targetRecall', targetRecall.toString());
      }
      const query = queryParams.toString();

      return await this.request<import('../../../types/word-mastery').WordMasteryIntervalResponse>(
        `/api/word-mastery/${wordId}/interval${query ? `?${query}` : ''}`,
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取复习间隔预测失败');
      throw error;
    }
  }

  // ==================== Habit Profile APIs ====================

  /**
   * 获取用户习惯画像
   */
  async getHabitProfile(): Promise<import('../../../types/habit-profile').HabitProfileResponse> {
    try {
      return await this.request<import('../../../types/habit-profile').HabitProfileResponse>(
        '/api/habit-profile',
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取习惯画像失败');
      throw error;
    }
  }

  /**
   * 从历史记录初始化习惯画像
   */
  async initializeHabitProfile(): Promise<
    import('../../../types/habit-profile').InitializeProfileResponse
  > {
    try {
      return await this.request<import('../../../types/habit-profile').InitializeProfileResponse>(
        '/api/habit-profile/initialize',
        { method: 'POST' },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '初始化习惯画像失败');
      throw error;
    }
  }

  /**
   * 结束学习会话并持久化习惯画像
   */
  async endHabitSession(
    sessionId: string,
  ): Promise<import('../../../types/habit-profile').EndSessionResponse> {
    try {
      if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        throw new Error('sessionId 必须是非空字符串');
      }

      return await this.request<import('../../../types/habit-profile').EndSessionResponse>(
        '/api/habit-profile/end-session',
        {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '结束学习会话失败');
      throw error;
    }
  }

  /**
   * 手动触发习惯画像持久化
   */
  async persistHabitProfile(): Promise<
    import('../../../types/habit-profile').PersistProfileResponse
  > {
    try {
      return await this.request<import('../../../types/habit-profile').PersistProfileResponse>(
        '/api/habit-profile/persist',
        { method: 'POST' },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '持久化习惯画像失败');
      throw error;
    }
  }

  // ==================== Explainability APIs ====================

  /**
   * 获取AMAS决策解释
   */
  async getAmasDecisionExplanation(
    decisionId?: string,
  ): Promise<import('../../../types/explainability').DecisionExplanation> {
    try {
      const queryParams = new URLSearchParams();
      if (decisionId) {
        queryParams.append('decisionId', decisionId);
      }
      const query = queryParams.toString();

      return await this.request<import('../../../types/explainability').DecisionExplanation>(
        `/api/amas/explain-decision${query ? `?${query}` : ''}`,
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取决策解释失败');
      throw error;
    }
  }

  /**
   * 运行反事实分析
   */
  async runCounterfactualAnalysis(
    input: import('../../../types/explainability').CounterfactualInput,
  ): Promise<import('../../../types/explainability').CounterfactualResult> {
    try {
      return await this.request<import('../../../types/explainability').CounterfactualResult>(
        '/api/amas/counterfactual',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '反事实分析失败');
      throw error;
    }
  }

  /**
   * 获取学习曲线数据
   */
  async getAmasLearningCurve(
    days: number = 30,
  ): Promise<import('../../../types/explainability').LearningCurveData> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('days', days.toString());

      return await this.request<import('../../../types/explainability').LearningCurveData>(
        `/api/amas/learning-curve?${queryParams.toString()}`,
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取学习曲线失败');
      throw error;
    }
  }

  /**
   * 获取决策时间线
   */
  async getDecisionTimeline(
    limit: number = 50,
    cursor?: string,
  ): Promise<import('../../../types/explainability').DecisionTimelineResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('limit', limit.toString());
      if (cursor) {
        queryParams.append('cursor', cursor);
      }

      return await this.request<import('../../../types/explainability').DecisionTimelineResponse>(
        `/api/amas/decision-timeline?${queryParams.toString()}`,
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取决策时间线失败');
      throw error;
    }
  }

  // ==================== Cognitive Profiling API ====================

  /**
   * 获取用户Chronotype画像
   */
  async getChronotypeProfile(): Promise<{
    category: 'morning' | 'evening' | 'intermediate';
    peakHours: number[];
    confidence: number;
    learningHistory: Array<{
      hour: number;
      performance: number;
      sampleCount: number;
    }>;
  }> {
    return this.request('/api/users/profile/chronotype');
  }

  /**
   * 获取用户Learning Style画像
   */
  async getLearningStyleProfile(): Promise<{
    style: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
    confidence: number;
    scores: {
      visual: number;
      auditory: number;
      kinesthetic: number;
    };
  }> {
    return this.request('/api/users/profile/learning-style');
  }

  /**
   * 获取用户完整认知画像（Chronotype + Learning Style）
   */
  async getCognitiveProfile(): Promise<{
    chronotype: {
      category: 'morning' | 'evening' | 'intermediate';
      peakHours: number[];
      confidence: number;
      learningHistory: Array<{
        hour: number;
        performance: number;
        sampleCount: number;
      }>;
    };
    learningStyle: {
      style: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
      confidence: number;
      scores: {
        visual: number;
        auditory: number;
        kinesthetic: number;
      };
    };
  }> {
    return this.request('/api/users/profile/cognitive');
  }

  // ==================== Learning Objectives ====================

  /**
   * 获取用户学习目标配置
   */
  async getLearningObjectives() {
    return this.request<{
      userId: string;
      mode: 'exam' | 'daily' | 'travel' | 'custom';
      primaryObjective: 'accuracy' | 'retention' | 'efficiency';
      minAccuracy?: number;
      maxDailyTime?: number;
      targetRetention?: number;
      weightShortTerm: number;
      weightLongTerm: number;
      weightEfficiency: number;
    }>('/api/learning-objectives');
  }

  /**
   * 更新学习目标配置
   */
  async updateLearningObjectives(objectives: {
    mode: 'exam' | 'daily' | 'travel' | 'custom';
    primaryObjective: 'accuracy' | 'retention' | 'efficiency';
    minAccuracy?: number;
    maxDailyTime?: number;
    targetRetention?: number;
    weightShortTerm: number;
    weightLongTerm: number;
    weightEfficiency: number;
  }) {
    return this.request('/api/learning-objectives', {
      method: 'PUT',
      body: JSON.stringify(objectives),
    });
  }

  /**
   * 切换学习模式
   */
  async switchLearningMode(mode: 'exam' | 'daily' | 'travel' | 'custom', reason?: string) {
    return this.request('/api/learning-objectives/switch-mode', {
      method: 'POST',
      body: JSON.stringify({ mode, reason }),
    });
  }

  /**
   * 获取模式建议
   */
  async getLearningObjectiveSuggestions() {
    return this.request<{
      currentMode: 'exam' | 'daily' | 'travel' | 'custom';
      suggestedModes: Array<{
        mode: 'exam' | 'daily' | 'travel' | 'custom';
        reason: string;
        config: Record<string, unknown>;
      }>;
    }>('/api/learning-objectives/suggestions');
  }

  /**
   * 获取目标切换历史
   */
  async getLearningObjectiveHistory(limit: number = 10) {
    return this.request<
      Array<{
        timestamp: string;
        reason: string;
        beforeMode: string;
        afterMode: string;
      }>
    >(`/api/learning-objectives/history?limit=${limit}`);
  }

  /**
   * 删除学习目标配置
   */
  async deleteLearningObjectives() {
    return this.request('/api/learning-objectives', {
      method: 'DELETE',
    });
  }

  /**
   * 获取用户奖励配置（学习模式）
   */
  async getUserRewardProfile(): Promise<{
    currentProfile: string;
    availableProfiles: Array<{
      id: string;
      name: string;
      description: string;
    }>;
  }> {
    return this.request('/api/users/profile/reward');
  }

  /**
   * 更新用户奖励配置（学习模式）
   */
  async updateUserRewardProfile(profileId: string): Promise<{
    currentProfile: string;
    message: string;
  }> {
    return this.request('/api/users/profile/reward', {
      method: 'PUT',
      body: JSON.stringify({ profileId }),
    });
  }
}
