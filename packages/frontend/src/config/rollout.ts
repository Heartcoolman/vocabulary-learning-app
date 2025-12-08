/**
 * Rollout Configuration - 灰度发布配置
 *
 * 定义发布阶段、用户分组和流量控制
 */

import { UserContext, getFeatureFlagManager } from '../utils/featureFlags';

// ===================== 类型定义 =====================

/** 发布阶段 */
export type RolloutStage = 'canary' | 'beta' | 'stable';

/** 发布状态 */
export type RolloutStatus =
  | 'pending' // 待发布
  | 'in_progress' // 发布中
  | 'paused' // 已暂停
  | 'completed' // 已完成
  | 'rolled_back'; // 已回滚

/** 用户分组 */
export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  priority: number; // 优先级，数字越大越先匹配
  matcher: UserGroupMatcher;
}

/** 用户分组匹配器 */
export interface UserGroupMatcher {
  type: 'whitelist' | 'attribute' | 'percentage' | 'expression';
  config: UserGroupMatcherConfig;
}

export type UserGroupMatcherConfig =
  | { userIds: string[] } // whitelist
  | { field: string; operator: string; value: unknown } // attribute
  | { percentage: number; salt?: string } // percentage
  | { expression: string }; // expression

/** 发布阶段配置 */
export interface RolloutStageConfig {
  stage: RolloutStage;
  percentage: number; // 流量百分比
  groups: string[]; // 包含的用户组
  minDuration: number; // 最小持续时间（毫秒）
  autoProgress: boolean; // 是否自动进入下一阶段
  healthCheck: HealthCheckConfig;
}

/** 健康检查配置 */
export interface HealthCheckConfig {
  errorRateThreshold: number; // 错误率阈值 (0-1)
  latencyP99Threshold: number; // P99 延迟阈值 (毫秒)
  minSampleSize: number; // 最小样本数
  checkInterval: number; // 检查间隔 (毫秒)
}

/** 发布配置 */
export interface RolloutConfig {
  id: string;
  featureKey: string;
  name: string;
  description?: string;
  stages: RolloutStageConfig[];
  currentStage: RolloutStage;
  status: RolloutStatus;
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  rollbackReason?: string;
  metadata?: Record<string, unknown>;
}

/** 流量分配结果 */
export interface TrafficAllocation {
  stage: RolloutStage;
  allocated: boolean;
  reason: string;
  groupId?: string;
}

// ===================== 默认配置 =====================

/** 默认用户分组 */
export const DEFAULT_USER_GROUPS: UserGroup[] = [
  {
    id: 'internal',
    name: '内部用户',
    description: '公司内部员工',
    priority: 100,
    matcher: {
      type: 'attribute',
      config: { field: 'email', operator: 'contains', value: '@company.com' },
    },
  },
  {
    id: 'beta_testers',
    name: 'Beta 测试用户',
    description: '报名参与 Beta 测试的用户',
    priority: 90,
    matcher: {
      type: 'attribute',
      config: { field: 'groups', operator: 'contains', value: 'beta' },
    },
  },
  {
    id: 'premium_users',
    name: '付费用户',
    description: '已付费的高级用户',
    priority: 80,
    matcher: {
      type: 'attribute',
      config: { field: 'isPremium', operator: 'equals', value: true },
    },
  },
  {
    id: 'early_adopters',
    name: '早期用户',
    description: '注册时间较早的用户',
    priority: 70,
    matcher: {
      type: 'attribute',
      config: { field: 'createdAt', operator: 'less_than', value: '2024-01-01' },
    },
  },
  {
    id: 'all_users',
    name: '所有用户',
    description: '所有用户',
    priority: 0,
    matcher: {
      type: 'percentage',
      config: { percentage: 100 },
    },
  },
];

/** 默认发布阶段配置 */
export const DEFAULT_STAGE_CONFIGS: Record<RolloutStage, Omit<RolloutStageConfig, 'stage'>> = {
  canary: {
    percentage: 5,
    groups: ['internal'],
    minDuration: 24 * 60 * 60 * 1000, // 24小时
    autoProgress: false,
    healthCheck: {
      errorRateThreshold: 0.01, // 1%
      latencyP99Threshold: 1000, // 1秒
      minSampleSize: 100,
      checkInterval: 5 * 60 * 1000, // 5分钟
    },
  },
  beta: {
    percentage: 20,
    groups: ['internal', 'beta_testers', 'premium_users'],
    minDuration: 72 * 60 * 60 * 1000, // 72小时
    autoProgress: false,
    healthCheck: {
      errorRateThreshold: 0.02, // 2%
      latencyP99Threshold: 1500, // 1.5秒
      minSampleSize: 500,
      checkInterval: 10 * 60 * 1000, // 10分钟
    },
  },
  stable: {
    percentage: 100,
    groups: ['all_users'],
    minDuration: 0,
    autoProgress: false,
    healthCheck: {
      errorRateThreshold: 0.05, // 5%
      latencyP99Threshold: 2000, // 2秒
      minSampleSize: 1000,
      checkInterval: 30 * 60 * 1000, // 30分钟
    },
  },
};

// ===================== 工具函数 =====================

/**
 * 生成用户哈希值 (用于百分比分配)
 */
function hashUserForRollout(userId: string, salt: string = ''): number {
  const str = `${userId}:${salt}:rollout`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash % 100);
}

/**
 * 检查用户是否匹配分组
 */
function matchesGroup(user: UserContext, group: UserGroup): boolean {
  const { matcher } = group;

  switch (matcher.type) {
    case 'whitelist': {
      const config = matcher.config as { userIds: string[] };
      return config.userIds.includes(user.userId);
    }

    case 'attribute': {
      const config = matcher.config as { field: string; operator: string; value: unknown };
      const userValue = user[config.field as keyof UserContext] ?? user.attributes?.[config.field];

      switch (config.operator) {
        case 'equals':
          return userValue === config.value;
        case 'not_equals':
          return userValue !== config.value;
        case 'contains':
          if (Array.isArray(userValue)) {
            return userValue.includes(config.value as string);
          }
          return String(userValue).includes(String(config.value));
        case 'greater_than':
          return (userValue as number) > (config.value as number);
        case 'less_than':
          if (userValue instanceof Date || config.value instanceof Date) {
            return new Date(userValue as string) < new Date(config.value as string);
          }
          return (userValue as number) < (config.value as number);
        default:
          return false;
      }
    }

    case 'percentage': {
      const config = matcher.config as { percentage: number; salt?: string };
      const hash = hashUserForRollout(user.userId, config.salt);
      return hash < config.percentage;
    }

    case 'expression': {
      // 简单的表达式评估 (生产环境可使用更复杂的解析器)
      const config = matcher.config as { expression: string };
      try {
        // 安全的表达式评估
        const fn = new Function('user', `return ${config.expression}`);
        return fn(user);
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

// ===================== 灰度发布管理器 =====================

export class RolloutManager {
  private rollouts: Map<string, RolloutConfig> = new Map();
  private userGroups: UserGroup[] = [...DEFAULT_USER_GROUPS];
  private userContext?: UserContext;
  private healthCheckTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private metricsCollector: MetricsCollector;

  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.loadFromStorage();
  }

  /**
   * 从存储加载
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('rollout_configs');
      if (stored) {
        const data = JSON.parse(stored) as RolloutConfig[];
        data.forEach((config) => this.rollouts.set(config.id, config));
      }
    } catch (error) {
      console.error('Failed to load rollout configs:', error);
    }
  }

  /**
   * 保存到存储
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.rollouts.values());
      localStorage.setItem('rollout_configs', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save rollout configs:', error);
    }
  }

  /**
   * 设置用户上下文
   */
  setUserContext(context: UserContext): void {
    this.userContext = context;
  }

  /**
   * 注册用户分组
   */
  registerUserGroup(group: UserGroup): void {
    const existingIndex = this.userGroups.findIndex((g) => g.id === group.id);
    if (existingIndex >= 0) {
      this.userGroups[existingIndex] = group;
    } else {
      this.userGroups.push(group);
    }
    // 按优先级排序
    this.userGroups.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取用户所属分组
   */
  getUserGroups(user?: UserContext): UserGroup[] {
    const targetUser = user || this.userContext;
    if (!targetUser) return [];

    return this.userGroups.filter((group) => matchesGroup(targetUser, group));
  }

  /**
   * 创建发布配置
   */
  createRollout(
    featureKey: string,
    name: string,
    options: Partial<RolloutConfig> = {},
  ): RolloutConfig {
    const id = `rollout_${featureKey}_${Date.now()}`;

    const stages: RolloutStageConfig[] = [
      { stage: 'canary', ...DEFAULT_STAGE_CONFIGS.canary },
      { stage: 'beta', ...DEFAULT_STAGE_CONFIGS.beta },
      { stage: 'stable', ...DEFAULT_STAGE_CONFIGS.stable },
    ];

    const config: RolloutConfig = {
      id,
      featureKey,
      name,
      stages,
      currentStage: 'canary',
      status: 'pending',
      ...options,
    };

    this.rollouts.set(id, config);
    this.saveToStorage();

    return config;
  }

  /**
   * 开始发布
   */
  startRollout(rolloutId: string): void {
    const config = this.rollouts.get(rolloutId);
    if (!config) {
      throw new Error(`Rollout not found: ${rolloutId}`);
    }

    config.status = 'in_progress';
    config.startedAt = new Date();
    this.saveToStorage();

    // 更新 Feature Flag
    this.syncFeatureFlag(config);

    // 启动健康检查
    this.startHealthCheck(config);
  }

  /**
   * 推进到下一阶段
   */
  progressToNextStage(rolloutId: string): void {
    const config = this.rollouts.get(rolloutId);
    if (!config) {
      throw new Error(`Rollout not found: ${rolloutId}`);
    }

    const stageOrder: RolloutStage[] = ['canary', 'beta', 'stable'];
    const currentIndex = stageOrder.indexOf(config.currentStage);

    if (currentIndex >= stageOrder.length - 1) {
      config.status = 'completed';
      config.completedAt = new Date();
    } else {
      config.currentStage = stageOrder[currentIndex + 1];
    }

    this.saveToStorage();
    this.syncFeatureFlag(config);
  }

  /**
   * 暂停发布
   */
  pauseRollout(rolloutId: string): void {
    const config = this.rollouts.get(rolloutId);
    if (!config) {
      throw new Error(`Rollout not found: ${rolloutId}`);
    }

    config.status = 'paused';
    config.pausedAt = new Date();
    this.saveToStorage();

    // 停止健康检查
    this.stopHealthCheck(rolloutId);
  }

  /**
   * 恢复发布
   */
  resumeRollout(rolloutId: string): void {
    const config = this.rollouts.get(rolloutId);
    if (!config) {
      throw new Error(`Rollout not found: ${rolloutId}`);
    }

    config.status = 'in_progress';
    config.pausedAt = undefined;
    this.saveToStorage();

    // 重新启动健康检查
    this.startHealthCheck(config);
  }

  /**
   * 回滚发布
   */
  rollbackRollout(rolloutId: string, reason: string): void {
    const config = this.rollouts.get(rolloutId);
    if (!config) {
      throw new Error(`Rollout not found: ${rolloutId}`);
    }

    config.status = 'rolled_back';
    config.rollbackReason = reason;
    this.saveToStorage();

    // 停止健康检查
    this.stopHealthCheck(rolloutId);

    // 禁用 Feature Flag
    const featureFlagManager = getFeatureFlagManager();
    featureFlagManager.override(config.featureKey, false);

    console.warn(`Rollout ${rolloutId} rolled back: ${reason}`);
  }

  /**
   * 同步 Feature Flag 配置
   */
  private syncFeatureFlag(config: RolloutConfig): void {
    const stageConfig = config.stages.find((s) => s.stage === config.currentStage);
    if (!stageConfig) return;

    const featureFlagManager = getFeatureFlagManager();
    const flag = featureFlagManager.getFlag(config.featureKey);

    if (flag) {
      // 更新百分比和目标组
      flag.percentage = stageConfig.percentage;
      flag.targetGroups = stageConfig.groups;
      flag.status = 'conditional';
      featureFlagManager.register(flag);
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(config: RolloutConfig): void {
    const stageConfig = config.stages.find((s) => s.stage === config.currentStage);
    if (!stageConfig) return;

    const timer = setInterval(() => {
      this.performHealthCheck(config, stageConfig);
    }, stageConfig.healthCheck.checkInterval);

    this.healthCheckTimers.set(config.id, timer);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(rolloutId: string): void {
    const timer = this.healthCheckTimers.get(rolloutId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(rolloutId);
    }
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck(config: RolloutConfig, stageConfig: RolloutStageConfig): void {
    const metrics = this.metricsCollector.getMetrics(config.featureKey);
    const { healthCheck } = stageConfig;

    // 检查样本量
    if (metrics.sampleSize < healthCheck.minSampleSize) {
      console.log(
        `Health check: Insufficient samples (${metrics.sampleSize}/${healthCheck.minSampleSize})`,
      );
      return;
    }

    // 检查错误率
    if (metrics.errorRate > healthCheck.errorRateThreshold) {
      this.rollbackRollout(
        config.id,
        `Error rate exceeded threshold: ${(metrics.errorRate * 100).toFixed(2)}% > ${(healthCheck.errorRateThreshold * 100).toFixed(2)}%`,
      );
      return;
    }

    // 检查延迟
    if (metrics.latencyP99 > healthCheck.latencyP99Threshold) {
      this.rollbackRollout(
        config.id,
        `P99 latency exceeded threshold: ${metrics.latencyP99}ms > ${healthCheck.latencyP99Threshold}ms`,
      );
      return;
    }

    console.log(`Health check passed for ${config.featureKey}:`, metrics);

    // 检查是否可以自动推进
    if (stageConfig.autoProgress) {
      const elapsed = Date.now() - (config.startedAt?.getTime() || 0);
      if (elapsed >= stageConfig.minDuration) {
        this.progressToNextStage(config.id);
      }
    }
  }

  /**
   * 分配流量
   */
  allocateTraffic(rolloutId: string, user?: UserContext): TrafficAllocation {
    const config = this.rollouts.get(rolloutId);
    if (!config) {
      return {
        stage: 'stable',
        allocated: false,
        reason: 'Rollout not found',
      };
    }

    const targetUser = user || this.userContext;
    if (!targetUser) {
      return {
        stage: config.currentStage,
        allocated: false,
        reason: 'No user context',
      };
    }

    const stageConfig = config.stages.find((s) => s.stage === config.currentStage);
    if (!stageConfig) {
      return {
        stage: config.currentStage,
        allocated: false,
        reason: 'Stage config not found',
      };
    }

    // 检查用户分组
    const userGroups = this.getUserGroups(targetUser);
    const matchedGroup = userGroups.find((g) => stageConfig.groups.includes(g.id));

    if (matchedGroup) {
      // 再检查百分比
      const hash = hashUserForRollout(targetUser.userId, config.featureKey);
      if (hash < stageConfig.percentage) {
        return {
          stage: config.currentStage,
          allocated: true,
          reason: `Matched group: ${matchedGroup.name}`,
          groupId: matchedGroup.id,
        };
      }
    }

    return {
      stage: config.currentStage,
      allocated: false,
      reason: 'User not in target groups or percentage',
    };
  }

  /**
   * 获取发布配置
   */
  getRollout(rolloutId: string): RolloutConfig | undefined {
    return this.rollouts.get(rolloutId);
  }

  /**
   * 获取功能的发布配置
   */
  getRolloutByFeature(featureKey: string): RolloutConfig | undefined {
    return Array.from(this.rollouts.values()).find(
      (r) => r.featureKey === featureKey && r.status === 'in_progress',
    );
  }

  /**
   * 获取所有发布配置
   */
  getAllRollouts(): RolloutConfig[] {
    return Array.from(this.rollouts.values());
  }

  /**
   * 获取当前用户的发布阶段
   */
  getCurrentStage(featureKey: string, user?: UserContext): RolloutStage {
    const rollout = this.getRolloutByFeature(featureKey);
    if (!rollout) return 'stable';

    const allocation = this.allocateTraffic(rollout.id, user);
    return allocation.allocated ? allocation.stage : 'stable';
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.healthCheckTimers.forEach((timer) => clearInterval(timer));
    this.healthCheckTimers.clear();
  }
}

// ===================== 指标收集器 =====================

interface Metrics {
  sampleSize: number;
  errorRate: number;
  latencyP50: number;
  latencyP90: number;
  latencyP99: number;
  successCount: number;
  errorCount: number;
}

class MetricsCollector {
  private metricsData: Map<
    string,
    {
      latencies: number[];
      errors: number;
      successes: number;
    }
  > = new Map();

  /**
   * 记录成功请求
   */
  recordSuccess(featureKey: string, latency: number): void {
    const data = this.getOrCreateData(featureKey);
    data.latencies.push(latency);
    data.successes++;

    // 保持最近 1000 条记录
    if (data.latencies.length > 1000) {
      data.latencies.shift();
    }
  }

  /**
   * 记录错误
   */
  recordError(featureKey: string): void {
    const data = this.getOrCreateData(featureKey);
    data.errors++;
  }

  /**
   * 获取指标
   */
  getMetrics(featureKey: string): Metrics {
    const data = this.metricsData.get(featureKey);
    if (!data) {
      return {
        sampleSize: 0,
        errorRate: 0,
        latencyP50: 0,
        latencyP90: 0,
        latencyP99: 0,
        successCount: 0,
        errorCount: 0,
      };
    }

    const total = data.successes + data.errors;
    const sortedLatencies = [...data.latencies].sort((a, b) => a - b);

    return {
      sampleSize: total,
      errorRate: total > 0 ? data.errors / total : 0,
      latencyP50: this.percentile(sortedLatencies, 50),
      latencyP90: this.percentile(sortedLatencies, 90),
      latencyP99: this.percentile(sortedLatencies, 99),
      successCount: data.successes,
      errorCount: data.errors,
    };
  }

  /**
   * 计算百分位数
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 获取或创建数据
   */
  private getOrCreateData(featureKey: string) {
    let data = this.metricsData.get(featureKey);
    if (!data) {
      data = { latencies: [], errors: 0, successes: 0 };
      this.metricsData.set(featureKey, data);
    }
    return data;
  }

  /**
   * 重置指标
   */
  reset(featureKey: string): void {
    this.metricsData.delete(featureKey);
  }
}

// ===================== 单例实例 =====================

let rolloutManager: RolloutManager | null = null;

/**
 * 获取灰度发布管理器实例
 */
export function getRolloutManager(): RolloutManager {
  if (!rolloutManager) {
    rolloutManager = new RolloutManager();
  }
  return rolloutManager;
}

// ===================== 便捷函数 =====================

/**
 * 获取用户当前发布阶段
 */
export function getUserRolloutStage(featureKey: string): RolloutStage {
  return getRolloutManager().getCurrentStage(featureKey);
}

/**
 * 检查用户是否在指定阶段
 */
export function isInRolloutStage(featureKey: string, stage: RolloutStage): boolean {
  return getUserRolloutStage(featureKey) === stage;
}

/**
 * 设置灰度发布用户上下文
 */
export function setRolloutUserContext(context: UserContext): void {
  getRolloutManager().setUserContext(context);
}
