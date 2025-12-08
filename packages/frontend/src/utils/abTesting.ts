/**
 * A/B Testing System - A/B 测试系统
 *
 * 提供实验分组、变体管理和结果追踪
 */

import { UserContext, getFeatureFlagManager } from './featureFlags';

// ===================== 类型定义 =====================

/** 实验状态 */
export type ExperimentStatus =
  | 'draft' // 草稿
  | 'running' // 运行中
  | 'paused' // 已暂停
  | 'stopped' // 已停止
  | 'completed'; // 已完成

/** 变体类型 */
export interface Variant {
  id: string;
  name: string;
  description?: string;
  weight: number; // 流量权重 (所有变体权重之和应为 100)
  config: Record<string, unknown>; // 变体配置
  isControl: boolean; // 是否为对照组
}

/** 实验定义 */
export interface Experiment {
  id: string;
  key: string; // 唯一标识符
  name: string;
  description?: string;
  hypothesis?: string; // 假设
  status: ExperimentStatus;
  variants: Variant[];
  targetAudience?: ExperimentAudience;
  metrics: ExperimentMetric[];
  startDate?: Date;
  endDate?: Date;
  minSampleSize?: number;
  confidenceLevel?: number; // 置信水平，默认 0.95
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/** 目标受众 */
export interface ExperimentAudience {
  percentage: number; // 参与实验的用户百分比
  filters?: AudienceFilter[];
}

/** 受众过滤器 */
export interface AudienceFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in' | 'greater_than' | 'less_than';
  value: unknown;
}

/** 实验指标 */
export interface ExperimentMetric {
  id: string;
  name: string;
  type: 'conversion' | 'count' | 'duration' | 'revenue' | 'custom';
  eventName: string; // 关联的事件名称
  isPrimary: boolean; // 是否为主要指标
  minimumDetectableEffect?: number; // 最小可检测效应
}

/** 用户实验分配 */
export interface ExperimentAssignment {
  experimentKey: string;
  variantId: string;
  assignedAt: Date;
  userId: string;
}

/** 实验事件 */
export interface ExperimentEvent {
  experimentKey: string;
  variantId: string;
  userId: string;
  eventName: string;
  eventValue?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/** 变体结果 */
export interface VariantResult {
  variantId: string;
  variantName: string;
  sampleSize: number;
  metrics: Record<string, MetricResult>;
}

/** 指标结果 */
export interface MetricResult {
  value: number;
  standardError?: number;
  confidenceInterval?: [number, number];
  improvementOverControl?: number; // 相对于对照组的提升百分比
  pValue?: number;
  isSignificant?: boolean;
}

/** 实验结果 */
export interface ExperimentResult {
  experimentKey: string;
  status: 'insufficient_data' | 'no_winner' | 'winner_found';
  winningVariant?: string;
  variants: VariantResult[];
  totalSampleSize: number;
  analysisDate: Date;
}

// ===================== 工具函数 =====================

/**
 * 生成用户哈希值 (用于一致性分配)
 */
function hashUserForExperiment(userId: string, experimentKey: string): number {
  const str = `${userId}:${experimentKey}:experiment`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash % 10000) / 100; // 返回 0-100 的值
}

/**
 * 检查用户是否匹配受众条件
 */
function matchesAudience(user: UserContext, audience: ExperimentAudience): boolean {
  // 首先检查百分比
  const hash = hashUserForExperiment(user.userId, 'audience_check');
  if (hash >= audience.percentage) {
    return false;
  }

  // 检查过滤条件
  if (audience.filters && audience.filters.length > 0) {
    return audience.filters.every((filter) => {
      const userValue = user[filter.field as keyof UserContext] ?? user.attributes?.[filter.field];

      switch (filter.operator) {
        case 'equals':
          return userValue === filter.value;
        case 'not_equals':
          return userValue !== filter.value;
        case 'contains':
          return String(userValue).includes(String(filter.value));
        case 'in':
          return (filter.value as unknown[]).includes(userValue);
        case 'not_in':
          return !(filter.value as unknown[]).includes(userValue);
        case 'greater_than':
          return (userValue as number) > (filter.value as number);
        case 'less_than':
          return (userValue as number) < (filter.value as number);
        default:
          return false;
      }
    });
  }

  return true;
}

/**
 * 根据权重选择变体
 */
function selectVariantByWeight(variants: Variant[], hash: number): Variant {
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (hash < cumulative) {
      return variant;
    }
  }
  // 默认返回第一个变体 (通常是对照组)
  return variants[0];
}

// ===================== A/B 测试管理器 =====================

export class ABTestingManager {
  private experiments: Map<string, Experiment> = new Map();
  private assignments: Map<string, ExperimentAssignment> = new Map();
  private events: ExperimentEvent[] = [];
  private userContext?: UserContext;
  private storageKey = 'ab_testing';
  private listeners: Map<string, Set<(assignment: ExperimentAssignment) => void>> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 从存储加载
   */
  private loadFromStorage(): void {
    try {
      // 加载实验
      const storedExperiments = localStorage.getItem(`${this.storageKey}_experiments`);
      if (storedExperiments) {
        const data = JSON.parse(storedExperiments) as Experiment[];
        data.forEach((exp) => this.experiments.set(exp.key, exp));
      }

      // 加载分配
      const storedAssignments = localStorage.getItem(`${this.storageKey}_assignments`);
      if (storedAssignments) {
        const data = JSON.parse(storedAssignments) as ExperimentAssignment[];
        data.forEach((assignment) => {
          const key = `${assignment.userId}:${assignment.experimentKey}`;
          this.assignments.set(key, assignment);
        });
      }

      // 加载事件 (仅保留最近的)
      const storedEvents = localStorage.getItem(`${this.storageKey}_events`);
      if (storedEvents) {
        this.events = JSON.parse(storedEvents);
      }
    } catch (error) {
      console.error('Failed to load A/B testing data:', error);
    }
  }

  /**
   * 保存到存储
   */
  private saveToStorage(): void {
    try {
      // 保存实验
      const experiments = Array.from(this.experiments.values());
      localStorage.setItem(`${this.storageKey}_experiments`, JSON.stringify(experiments));

      // 保存分配
      const assignments = Array.from(this.assignments.values());
      localStorage.setItem(`${this.storageKey}_assignments`, JSON.stringify(assignments));

      // 保存事件 (仅保留最近 1000 条)
      const recentEvents = this.events.slice(-1000);
      localStorage.setItem(`${this.storageKey}_events`, JSON.stringify(recentEvents));
    } catch (error) {
      console.error('Failed to save A/B testing data:', error);
    }
  }

  /**
   * 设置用户上下文
   */
  setUserContext(context: UserContext): void {
    this.userContext = context;
  }

  /**
   * 注册实验
   */
  registerExperiment(experiment: Experiment): void {
    // 验证变体权重
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      console.warn(
        `Experiment ${experiment.key}: Variant weights should sum to 100 (current: ${totalWeight})`,
      );
    }

    // 确保有对照组
    const hasControl = experiment.variants.some((v) => v.isControl);
    if (!hasControl) {
      console.warn(`Experiment ${experiment.key}: No control variant specified`);
    }

    this.experiments.set(experiment.key, experiment);
    this.saveToStorage();
  }

  /**
   * 获取实验
   */
  getExperiment(key: string): Experiment | undefined {
    return this.experiments.get(key);
  }

  /**
   * 获取所有实验
   */
  getAllExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  /**
   * 获取运行中的实验
   */
  getRunningExperiments(): Experiment[] {
    return this.getAllExperiments().filter((exp) => exp.status === 'running');
  }

  /**
   * 启动实验
   */
  startExperiment(key: string): void {
    const experiment = this.experiments.get(key);
    if (!experiment) {
      throw new Error(`Experiment not found: ${key}`);
    }

    experiment.status = 'running';
    experiment.startDate = new Date();
    experiment.updatedAt = new Date();
    this.saveToStorage();
  }

  /**
   * 暂停实验
   */
  pauseExperiment(key: string): void {
    const experiment = this.experiments.get(key);
    if (!experiment) {
      throw new Error(`Experiment not found: ${key}`);
    }

    experiment.status = 'paused';
    experiment.updatedAt = new Date();
    this.saveToStorage();
  }

  /**
   * 停止实验
   */
  stopExperiment(key: string): void {
    const experiment = this.experiments.get(key);
    if (!experiment) {
      throw new Error(`Experiment not found: ${key}`);
    }

    experiment.status = 'stopped';
    experiment.endDate = new Date();
    experiment.updatedAt = new Date();
    this.saveToStorage();
  }

  /**
   * 完成实验
   */
  completeExperiment(key: string, winningVariantId?: string): void {
    const experiment = this.experiments.get(key);
    if (!experiment) {
      throw new Error(`Experiment not found: ${key}`);
    }

    experiment.status = 'completed';
    experiment.endDate = new Date();
    experiment.updatedAt = new Date();

    if (winningVariantId) {
      experiment.metadata = {
        ...experiment.metadata,
        winningVariantId,
      };

      // 如果有获胜变体，更新相关的 Feature Flag
      const winningVariant = experiment.variants.find((v) => v.id === winningVariantId);
      if (winningVariant && !winningVariant.isControl) {
        const featureFlagManager = getFeatureFlagManager();
        // 将获胜变体的配置应用到 Feature Flag
        Object.entries(winningVariant.config).forEach(([flagKey, value]) => {
          if (typeof value === 'boolean') {
            featureFlagManager.override(flagKey, value);
          }
        });
      }
    }

    this.saveToStorage();
  }

  /**
   * 获取用户的实验分配
   */
  getAssignment(experimentKey: string, user?: UserContext): ExperimentAssignment | null {
    const targetUser = user || this.userContext;
    if (!targetUser) return null;

    const experiment = this.experiments.get(experimentKey);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    const assignmentKey = `${targetUser.userId}:${experimentKey}`;

    // 检查现有分配
    let assignment = this.assignments.get(assignmentKey);
    if (assignment) {
      return assignment;
    }

    // 检查受众条件
    if (experiment.targetAudience && !matchesAudience(targetUser, experiment.targetAudience)) {
      return null;
    }

    // 分配变体
    const hash = hashUserForExperiment(targetUser.userId, experimentKey);
    const variant = selectVariantByWeight(experiment.variants, hash);

    assignment = {
      experimentKey,
      variantId: variant.id,
      assignedAt: new Date(),
      userId: targetUser.userId,
    };

    this.assignments.set(assignmentKey, assignment);
    this.saveToStorage();

    // 通知监听器
    this.listeners.get(experimentKey)?.forEach((callback) => callback(assignment!));

    return assignment;
  }

  /**
   * 获取用户的变体
   */
  getVariant(experimentKey: string, user?: UserContext): Variant | null {
    const assignment = this.getAssignment(experimentKey, user);
    if (!assignment) return null;

    const experiment = this.experiments.get(experimentKey);
    return experiment?.variants.find((v) => v.id === assignment.variantId) || null;
  }

  /**
   * 获取变体配置
   */
  getVariantConfig<T = unknown>(experimentKey: string, configKey: string, defaultValue: T): T {
    const variant = this.getVariant(experimentKey);
    if (!variant) return defaultValue;
    return (variant.config[configKey] as T) ?? defaultValue;
  }

  /**
   * 检查用户是否在实验中
   */
  isInExperiment(experimentKey: string, user?: UserContext): boolean {
    return this.getAssignment(experimentKey, user) !== null;
  }

  /**
   * 检查用户是否在指定变体中
   */
  isInVariant(experimentKey: string, variantId: string, user?: UserContext): boolean {
    const assignment = this.getAssignment(experimentKey, user);
    return assignment?.variantId === variantId;
  }

  /**
   * 追踪实验事件
   */
  trackEvent(
    experimentKey: string,
    eventName: string,
    eventValue?: number,
    metadata?: Record<string, unknown>,
  ): void {
    const assignment = this.getAssignment(experimentKey);
    if (!assignment) return;

    const event: ExperimentEvent = {
      experimentKey,
      variantId: assignment.variantId,
      userId: assignment.userId,
      eventName,
      eventValue,
      timestamp: new Date(),
      metadata,
    };

    this.events.push(event);
    this.saveToStorage();

    // 可以在这里发送到分析服务
    this.sendToAnalytics(event);
  }

  /**
   * 追踪转化事件
   */
  trackConversion(experimentKey: string, metadata?: Record<string, unknown>): void {
    this.trackEvent(experimentKey, 'conversion', 1, metadata);
  }

  /**
   * 发送到分析服务
   */
  private sendToAnalytics(event: ExperimentEvent): void {
    // 这里可以集成各种分析服务
    // 例如：Google Analytics, Mixpanel, Amplitude 等
    console.log('A/B Test Event:', event);

    // 示例：发送到自定义后端
    // fetch('/api/analytics/experiment-event', {
    //   method: 'POST',
    //   body: JSON.stringify(event),
    // });
  }

  /**
   * 订阅实验分配
   */
  subscribe(
    experimentKey: string,
    callback: (assignment: ExperimentAssignment) => void,
  ): () => void {
    if (!this.listeners.has(experimentKey)) {
      this.listeners.set(experimentKey, new Set());
    }
    this.listeners.get(experimentKey)!.add(callback);

    return () => {
      this.listeners.get(experimentKey)?.delete(callback);
    };
  }

  /**
   * 分析实验结果
   */
  analyzeExperiment(experimentKey: string): ExperimentResult {
    const experiment = this.experiments.get(experimentKey);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentKey}`);
    }

    // 获取实验相关的事件
    const experimentEvents = this.events.filter((e) => e.experimentKey === experimentKey);

    // 按变体分组
    const variantEvents: Record<string, ExperimentEvent[]> = {};
    experiment.variants.forEach((v) => {
      variantEvents[v.id] = experimentEvents.filter((e) => e.variantId === v.id);
    });

    // 计算各变体的结果
    const controlVariant = experiment.variants.find((v) => v.isControl);
    const variantResults: VariantResult[] = experiment.variants.map((variant) => {
      const events = variantEvents[variant.id] || [];
      const sampleSize = new Set(events.map((e) => e.userId)).size;

      const metricsResults: Record<string, MetricResult> = {};
      experiment.metrics.forEach((metric) => {
        const metricEvents = events.filter((e) => e.eventName === metric.eventName);
        const metricResult = this.calculateMetricResult(
          metric,
          metricEvents,
          sampleSize,
          controlVariant?.id === variant.id ? null : variantEvents[controlVariant?.id || ''],
        );
        metricsResults[metric.id] = metricResult;
      });

      return {
        variantId: variant.id,
        variantName: variant.name,
        sampleSize,
        metrics: metricsResults,
      };
    });

    // 确定获胜者
    const totalSampleSize = variantResults.reduce((sum, v) => sum + v.sampleSize, 0);
    let status: ExperimentResult['status'] = 'no_winner';
    let winningVariant: string | undefined;

    if (experiment.minSampleSize && totalSampleSize < experiment.minSampleSize) {
      status = 'insufficient_data';
    } else {
      // 检查主要指标是否有显著差异
      const primaryMetric = experiment.metrics.find((m) => m.isPrimary);
      if (primaryMetric) {
        const significantVariant = variantResults.find(
          (v) =>
            v.metrics[primaryMetric.id]?.isSignificant &&
            (v.metrics[primaryMetric.id]?.improvementOverControl || 0) > 0,
        );
        if (significantVariant) {
          status = 'winner_found';
          winningVariant = significantVariant.variantId;
        }
      }
    }

    return {
      experimentKey,
      status,
      winningVariant,
      variants: variantResults,
      totalSampleSize,
      analysisDate: new Date(),
    };
  }

  /**
   * 计算指标结果
   */
  private calculateMetricResult(
    metric: ExperimentMetric,
    events: ExperimentEvent[],
    sampleSize: number,
    controlEvents: ExperimentEvent[] | null,
  ): MetricResult {
    if (sampleSize === 0) {
      return { value: 0 };
    }

    let value: number;
    let standardError: number | undefined;

    switch (metric.type) {
      case 'conversion': {
        const conversions = events.filter((e) => e.eventValue && e.eventValue > 0).length;
        value = conversions / sampleSize;
        standardError = Math.sqrt((value * (1 - value)) / sampleSize);
        break;
      }
      case 'count': {
        value = events.length / sampleSize;
        const variance =
          events.reduce((sum, e) => sum + Math.pow((e.eventValue || 1) - value, 2), 0) / sampleSize;
        standardError = Math.sqrt(variance / sampleSize);
        break;
      }
      case 'duration':
      case 'revenue':
      case 'custom': {
        const values = events.map((e) => e.eventValue || 0);
        value = values.reduce((sum, v) => sum + v, 0) / sampleSize;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - value, 2), 0) / sampleSize;
        standardError = Math.sqrt(variance / sampleSize);
        break;
      }
      default:
        value = 0;
    }

    // 计算置信区间 (95%)
    const z = 1.96;
    const confidenceInterval: [number, number] = standardError
      ? [value - z * standardError, value + z * standardError]
      : [value, value];

    // 计算相对于对照组的提升
    let improvementOverControl: number | undefined;
    let pValue: number | undefined;
    let isSignificant: boolean | undefined;

    if (controlEvents && controlEvents.length > 0) {
      const controlResult = this.calculateMetricResult(
        metric,
        controlEvents,
        new Set(controlEvents.map((e) => e.userId)).size,
        null,
      );

      if (controlResult.value !== 0) {
        improvementOverControl = ((value - controlResult.value) / controlResult.value) * 100;

        // 简化的 p-value 计算 (实际应用中应使用更精确的统计方法)
        if (standardError && controlResult.standardError) {
          const pooledSE = Math.sqrt(
            Math.pow(standardError, 2) + Math.pow(controlResult.standardError, 2),
          );
          const zScore = Math.abs(value - controlResult.value) / pooledSE;
          // 使用近似正态分布计算 p-value
          pValue = 2 * (1 - this.normalCDF(zScore));
          isSignificant = pValue < 0.05;
        }
      }
    }

    return {
      value,
      standardError,
      confidenceInterval,
      improvementOverControl,
      pValue,
      isSignificant,
    };
  }

  /**
   * 标准正态分布累积分布函数 (近似)
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * 获取实验的所有事件
   */
  getExperimentEvents(experimentKey: string): ExperimentEvent[] {
    return this.events.filter((e) => e.experimentKey === experimentKey);
  }

  /**
   * 清除实验数据
   */
  clearExperiment(experimentKey: string): void {
    this.experiments.delete(experimentKey);

    // 清除相关分配
    const keysToDelete: string[] = [];
    this.assignments.forEach((assignment, key) => {
      if (assignment.experimentKey === experimentKey) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.assignments.delete(key));

    // 清除相关事件
    this.events = this.events.filter((e) => e.experimentKey !== experimentKey);

    this.saveToStorage();
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.experiments.clear();
    this.assignments.clear();
    this.events = [];
    this.listeners.clear();
  }
}

// ===================== 单例实例 =====================

let abTestingManager: ABTestingManager | null = null;

/**
 * 获取 A/B 测试管理器实例
 */
export function getABTestingManager(): ABTestingManager {
  if (!abTestingManager) {
    abTestingManager = new ABTestingManager();
  }
  return abTestingManager;
}

// ===================== 便捷函数 =====================

/**
 * 获取用户的变体
 */
export function getExperimentVariant(experimentKey: string): Variant | null {
  return getABTestingManager().getVariant(experimentKey);
}

/**
 * 获取变体配置
 */
export function getExperimentConfig<T = unknown>(
  experimentKey: string,
  configKey: string,
  defaultValue: T,
): T {
  return getABTestingManager().getVariantConfig(experimentKey, configKey, defaultValue);
}

/**
 * 检查是否在实验中
 */
export function isInExperiment(experimentKey: string): boolean {
  return getABTestingManager().isInExperiment(experimentKey);
}

/**
 * 追踪实验事件
 */
export function trackExperimentEvent(
  experimentKey: string,
  eventName: string,
  eventValue?: number,
): void {
  getABTestingManager().trackEvent(experimentKey, eventName, eventValue);
}

/**
 * 追踪转化
 */
export function trackExperimentConversion(experimentKey: string): void {
  getABTestingManager().trackConversion(experimentKey);
}

/**
 * 设置 A/B 测试用户上下文
 */
export function setABTestingUserContext(context: UserContext): void {
  getABTestingManager().setUserContext(context);
}

// ===================== 预定义实验 =====================

export const EXPERIMENTS = {
  // 学习相关实验
  LEARNING_PATH_OPTIMIZATION: 'learning_path_optimization',
  REVIEW_UI_REDESIGN: 'review_ui_redesign',
  GAMIFICATION_REWARDS: 'gamification_rewards',

  // 用户体验实验
  ONBOARDING_FLOW: 'onboarding_flow',
  PRICING_PAGE: 'pricing_page',

  // 性能实验
  LAZY_LOADING_STRATEGY: 'lazy_loading_strategy',
} as const;

export type ExperimentKey = (typeof EXPERIMENTS)[keyof typeof EXPERIMENTS];
