/**
 * Feature Flags System - 特性开关系统
 *
 * 提供基于用户、百分比、环境的特性开关控制
 */

// ===================== 类型定义 =====================

/** 特性开关状态 */
export type FeatureFlagStatus = 'enabled' | 'disabled' | 'conditional';

/** 特性开关类型 */
export type FeatureFlagType =
  | 'release' // 发布开关 - 控制新功能发布
  | 'experiment' // 实验开关 - A/B 测试
  | 'ops' // 运维开关 - 系统行为控制
  | 'permission'; // 权限开关 - 用户权限控制

/** 用户上下文 */
export interface UserContext {
  userId: string;
  email?: string;
  groups?: string[];
  attributes?: Record<string, string | number | boolean>;
  createdAt?: Date;
  isPremium?: boolean;
  region?: string;
}

/** 环境上下文 */
export interface EnvironmentContext {
  environment: 'development' | 'staging' | 'production';
  version: string;
  buildNumber?: string;
}

/** 特性开关规则 */
export interface FeatureFlagRule {
  id: string;
  description?: string;
  priority: number;
  conditions: FeatureFlagCondition[];
  result: boolean;
}

/** 特性开关条件 */
export interface FeatureFlagCondition {
  type: 'user' | 'group' | 'percentage' | 'attribute' | 'environment' | 'date' | 'custom';
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'in'
    | 'not_in'
    | 'greater_than'
    | 'less_than'
    | 'between'
    | 'regex';
  field?: string;
  value: unknown;
}

/** 特性开关定义 */
export interface FeatureFlag {
  key: string;
  name: string;
  description?: string;
  type: FeatureFlagType;
  status: FeatureFlagStatus;
  defaultValue: boolean;
  rules: FeatureFlagRule[];
  percentage?: number; // 百分比灰度
  targetUsers?: string[]; // 目标用户列表
  targetGroups?: string[]; // 目标用户组
  environments?: string[]; // 启用的环境
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** 特性开关评估结果 */
export interface FeatureFlagEvaluation {
  key: string;
  enabled: boolean;
  reason: string;
  ruleId?: string;
  timestamp: Date;
}

/** 特性开关管理器配置 */
export interface FeatureFlagManagerConfig {
  storageKey?: string;
  refreshInterval?: number; // 毫秒
  onEvaluation?: (evaluation: FeatureFlagEvaluation) => void;
  onError?: (error: Error) => void;
  remoteConfigUrl?: string;
}

// ===================== 工具函数 =====================

/**
 * 生成用户一致性哈希值 (0-100)
 * 确保同一用户对同一功能始终获得相同的结果
 */
function hashUserForPercentage(userId: string, featureKey: string): number {
  const str = `${userId}:${featureKey}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash % 100);
}

/**
 * 评估单个条件
 */
function evaluateCondition(
  condition: FeatureFlagCondition,
  userContext?: UserContext,
  envContext?: EnvironmentContext,
): boolean {
  const { type, operator, field, value } = condition;

  switch (type) {
    case 'user': {
      if (!userContext?.userId) return false;
      return compareValues(userContext.userId, operator, value);
    }

    case 'group': {
      if (!userContext?.groups) return false;
      const groups = userContext.groups;
      if (operator === 'in') {
        return (value as string[]).some((v) => groups.includes(v));
      }
      if (operator === 'not_in') {
        return !(value as string[]).some((v) => groups.includes(v));
      }
      return false;
    }

    case 'attribute': {
      if (!userContext?.attributes || !field) return false;
      const attrValue = userContext.attributes[field];
      return compareValues(attrValue, operator, value);
    }

    case 'environment': {
      if (!envContext?.environment) return false;
      return compareValues(envContext.environment, operator, value);
    }

    case 'date': {
      const now = new Date();
      if (operator === 'greater_than') {
        return now > new Date(value as string);
      }
      if (operator === 'less_than') {
        return now < new Date(value as string);
      }
      if (operator === 'between') {
        const [start, end] = value as string[];
        return now >= new Date(start) && now <= new Date(end);
      }
      return false;
    }

    case 'percentage': {
      if (!userContext?.userId) return false;
      // percentage 类型使用 field 作为特性 key
      const hash = hashUserForPercentage(userContext.userId, field || '');
      return hash < (value as number);
    }

    case 'custom': {
      // 自定义条件需要外部处理
      return false;
    }

    default:
      return false;
  }
}

/**
 * 比较值
 */
function compareValues(
  actual: unknown,
  operator: FeatureFlagCondition['operator'],
  expected: unknown,
): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return String(actual).includes(String(expected));
    case 'in':
      return (expected as unknown[]).includes(actual);
    case 'not_in':
      return !(expected as unknown[]).includes(actual);
    case 'greater_than':
      return (actual as number) > (expected as number);
    case 'less_than':
      return (actual as number) < (expected as number);
    case 'between': {
      const [min, max] = expected as [number, number];
      return (actual as number) >= min && (actual as number) <= max;
    }
    case 'regex':
      return new RegExp(expected as string).test(String(actual));
    default:
      return false;
  }
}

// ===================== 特性开关管理器 =====================

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private userContext?: UserContext;
  private envContext: EnvironmentContext;
  private config: FeatureFlagManagerConfig;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private evaluationCache: Map<string, FeatureFlagEvaluation> = new Map();
  private listeners: Map<string, Set<(enabled: boolean) => void>> = new Map();

  constructor(config: FeatureFlagManagerConfig = {}) {
    this.config = {
      storageKey: 'feature_flags',
      refreshInterval: 5 * 60 * 1000, // 5分钟
      ...config,
    };

    this.envContext = {
      environment: this.detectEnvironment(),
      version: this.getAppVersion(),
    };

    this.loadFromStorage();
    this.startRefresh();
  }

  /**
   * 检测当前环境
   */
  private detectEnvironment(): 'development' | 'staging' | 'production' {
    if (typeof window === 'undefined') return 'production';

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }
    if (hostname.includes('staging') || hostname.includes('test')) {
      return 'staging';
    }
    return 'production';
  }

  /**
   * 获取应用版本
   */
  private getAppVersion(): string {
    return import.meta.env?.VITE_APP_VERSION || '1.0.0';
  }

  /**
   * 从本地存储加载
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey!);
      if (stored) {
        const data = JSON.parse(stored) as FeatureFlag[];
        data.forEach((flag) => this.flags.set(flag.key, flag));
      }
    } catch (error) {
      this.config.onError?.(error as Error);
    }
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.flags.values());
      localStorage.setItem(this.config.storageKey!, JSON.stringify(data));
    } catch (error) {
      this.config.onError?.(error as Error);
    }
  }

  /**
   * 开始定时刷新
   */
  private startRefresh(): void {
    if (this.config.remoteConfigUrl && this.config.refreshInterval) {
      this.refreshTimer = setInterval(() => {
        this.fetchRemoteFlags();
      }, this.config.refreshInterval);
    }
  }

  /**
   * 从远程获取配置
   */
  async fetchRemoteFlags(): Promise<void> {
    if (!this.config.remoteConfigUrl) return;

    try {
      const response = await fetch(this.config.remoteConfigUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...(this.userContext?.userId && { 'X-User-Id': this.userContext.userId }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch feature flags: ${response.status}`);
      }

      const data = (await response.json()) as FeatureFlag[];
      this.updateFlags(data);
    } catch (error) {
      this.config.onError?.(error as Error);
    }
  }

  /**
   * 更新特性开关
   */
  updateFlags(flags: FeatureFlag[]): void {
    const changedFlags: string[] = [];

    flags.forEach((flag) => {
      const existing = this.flags.get(flag.key);
      const wasEnabled = existing ? this.evaluate(flag.key).enabled : undefined;

      this.flags.set(flag.key, flag);

      const isEnabled = this.evaluate(flag.key).enabled;
      if (wasEnabled !== undefined && wasEnabled !== isEnabled) {
        changedFlags.push(flag.key);
      }
    });

    this.saveToStorage();
    this.evaluationCache.clear();

    // 通知变更
    changedFlags.forEach((key) => {
      const enabled = this.isEnabled(key);
      this.listeners.get(key)?.forEach((callback) => callback(enabled));
    });
  }

  /**
   * 注册特性开关
   */
  register(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag);
    this.saveToStorage();
  }

  /**
   * 批量注册特性开关
   */
  registerAll(flags: FeatureFlag[]): void {
    flags.forEach((flag) => this.flags.set(flag.key, flag));
    this.saveToStorage();
  }

  /**
   * 设置用户上下文
   */
  setUserContext(context: UserContext): void {
    this.userContext = context;
    this.evaluationCache.clear();
  }

  /**
   * 设置环境上下文
   */
  setEnvironmentContext(context: Partial<EnvironmentContext>): void {
    this.envContext = { ...this.envContext, ...context };
    this.evaluationCache.clear();
  }

  /**
   * 评估特性开关
   */
  evaluate(key: string): FeatureFlagEvaluation {
    // 检查缓存
    const cacheKey = `${key}:${this.userContext?.userId || 'anonymous'}`;
    const cached = this.evaluationCache.get(cacheKey);
    if (cached) return cached;

    const flag = this.flags.get(key);
    const timestamp = new Date();

    if (!flag) {
      const result: FeatureFlagEvaluation = {
        key,
        enabled: false,
        reason: 'Flag not found',
        timestamp,
      };
      this.config.onEvaluation?.(result);
      return result;
    }

    // 检查状态
    if (flag.status === 'disabled') {
      const result: FeatureFlagEvaluation = {
        key,
        enabled: false,
        reason: 'Flag is disabled',
        timestamp,
      };
      this.evaluationCache.set(cacheKey, result);
      this.config.onEvaluation?.(result);
      return result;
    }

    if (flag.status === 'enabled') {
      const result: FeatureFlagEvaluation = {
        key,
        enabled: true,
        reason: 'Flag is enabled globally',
        timestamp,
      };
      this.evaluationCache.set(cacheKey, result);
      this.config.onEvaluation?.(result);
      return result;
    }

    // 检查环境
    if (flag.environments && flag.environments.length > 0) {
      if (!flag.environments.includes(this.envContext.environment)) {
        const result: FeatureFlagEvaluation = {
          key,
          enabled: false,
          reason: `Not enabled for environment: ${this.envContext.environment}`,
          timestamp,
        };
        this.evaluationCache.set(cacheKey, result);
        this.config.onEvaluation?.(result);
        return result;
      }
    }

    // 检查日期范围
    const now = new Date();
    if (flag.startDate && now < new Date(flag.startDate)) {
      const result: FeatureFlagEvaluation = {
        key,
        enabled: false,
        reason: 'Flag not yet active',
        timestamp,
      };
      this.evaluationCache.set(cacheKey, result);
      this.config.onEvaluation?.(result);
      return result;
    }

    if (flag.endDate && now > new Date(flag.endDate)) {
      const result: FeatureFlagEvaluation = {
        key,
        enabled: false,
        reason: 'Flag has expired',
        timestamp,
      };
      this.evaluationCache.set(cacheKey, result);
      this.config.onEvaluation?.(result);
      return result;
    }

    // 检查目标用户
    if (flag.targetUsers && flag.targetUsers.length > 0) {
      if (this.userContext?.userId && flag.targetUsers.includes(this.userContext.userId)) {
        const result: FeatureFlagEvaluation = {
          key,
          enabled: true,
          reason: 'User is in target users list',
          timestamp,
        };
        this.evaluationCache.set(cacheKey, result);
        this.config.onEvaluation?.(result);
        return result;
      }
    }

    // 检查目标用户组
    if (flag.targetGroups && flag.targetGroups.length > 0) {
      if (this.userContext?.groups?.some((g) => flag.targetGroups!.includes(g))) {
        const result: FeatureFlagEvaluation = {
          key,
          enabled: true,
          reason: 'User is in target group',
          timestamp,
        };
        this.evaluationCache.set(cacheKey, result);
        this.config.onEvaluation?.(result);
        return result;
      }
    }

    // 评估规则 (按优先级排序)
    const sortedRules = [...flag.rules].sort((a, b) => b.priority - a.priority);
    for (const rule of sortedRules) {
      const allConditionsMet = rule.conditions.every((condition) =>
        evaluateCondition(condition, this.userContext, this.envContext),
      );

      if (allConditionsMet) {
        const result: FeatureFlagEvaluation = {
          key,
          enabled: rule.result,
          reason: rule.description || `Matched rule: ${rule.id}`,
          ruleId: rule.id,
          timestamp,
        };
        this.evaluationCache.set(cacheKey, result);
        this.config.onEvaluation?.(result);
        return result;
      }
    }

    // 检查百分比灰度
    if (flag.percentage !== undefined && this.userContext?.userId) {
      const hash = hashUserForPercentage(this.userContext.userId, key);
      const enabled = hash < flag.percentage;
      const result: FeatureFlagEvaluation = {
        key,
        enabled,
        reason: `Percentage rollout: ${flag.percentage}% (user hash: ${hash})`,
        timestamp,
      };
      this.evaluationCache.set(cacheKey, result);
      this.config.onEvaluation?.(result);
      return result;
    }

    // 返回默认值
    const result: FeatureFlagEvaluation = {
      key,
      enabled: flag.defaultValue,
      reason: 'Using default value',
      timestamp,
    };
    this.evaluationCache.set(cacheKey, result);
    this.config.onEvaluation?.(result);
    return result;
  }

  /**
   * 检查特性是否启用
   */
  isEnabled(key: string): boolean {
    return this.evaluate(key).enabled;
  }

  /**
   * 获取所有特性开关
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * 获取特性开关
   */
  getFlag(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  /**
   * 订阅特性开关变更
   */
  subscribe(key: string, callback: (enabled: boolean) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  /**
   * 覆盖特性开关 (用于测试)
   */
  override(key: string, enabled: boolean): void {
    const flag = this.flags.get(key);
    if (flag) {
      flag.status = enabled ? 'enabled' : 'disabled';
      this.evaluationCache.delete(`${key}:${this.userContext?.userId || 'anonymous'}`);
    }
  }

  /**
   * 清除覆盖
   */
  clearOverride(key: string): void {
    const flag = this.flags.get(key);
    if (flag) {
      flag.status = 'conditional';
      this.evaluationCache.delete(`${key}:${this.userContext?.userId || 'anonymous'}`);
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.flags.clear();
    this.evaluationCache.clear();
    this.listeners.clear();
  }
}

// ===================== 单例实例 =====================

let featureFlagManager: FeatureFlagManager | null = null;

/**
 * 获取特性开关管理器实例
 */
export function getFeatureFlagManager(): FeatureFlagManager {
  if (!featureFlagManager) {
    featureFlagManager = new FeatureFlagManager();
  }
  return featureFlagManager;
}

/**
 * 初始化特性开关管理器
 */
export function initFeatureFlagManager(config?: FeatureFlagManagerConfig): FeatureFlagManager {
  if (featureFlagManager) {
    featureFlagManager.destroy();
  }
  featureFlagManager = new FeatureFlagManager(config);
  return featureFlagManager;
}

// ===================== 便捷函数 =====================

/**
 * 检查特性是否启用
 */
export function isFeatureEnabled(key: string): boolean {
  return getFeatureFlagManager().isEnabled(key);
}

/**
 * 评估特性开关
 */
export function evaluateFeature(key: string): FeatureFlagEvaluation {
  return getFeatureFlagManager().evaluate(key);
}

/**
 * 设置用户上下文
 */
export function setFeatureFlagUserContext(context: UserContext): void {
  getFeatureFlagManager().setUserContext(context);
}

// ===================== 预定义特性开关 =====================

export const FEATURE_FLAGS = {
  // UI 相关
  NEW_DASHBOARD: 'new_dashboard',
  DARK_MODE: 'dark_mode',
  COMPACT_VIEW: 'compact_view',

  // 学习功能
  SPACED_REPETITION_V2: 'spaced_repetition_v2',
  AI_PRONUNCIATION: 'ai_pronunciation',
  ADAPTIVE_DIFFICULTY: 'adaptive_difficulty',
  GAMIFICATION: 'gamification',

  // 性能优化
  LAZY_LOADING: 'lazy_loading',
  VIRTUAL_LIST: 'virtual_list',
  SERVICE_WORKER: 'service_worker',

  // 实验功能
  EXPERIMENT_REVIEW_UI: 'experiment_review_ui',
  EXPERIMENT_LEARNING_PATH: 'experiment_learning_path',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];
