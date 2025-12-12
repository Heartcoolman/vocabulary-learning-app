/**
 * AMAS Feature Flags Configuration
 * 功能开关配置 - 控制各算法模块的启用状态
 *
 * 设计原则：
 * - 所有模块默认启用，通过开关可单独禁用
 * - 支持环境变量覆盖，便于生产环境调试
 * - 提供类型安全的访问接口
 */

import { amasLogger } from '../../logger';
import { redisCacheService, REDIS_CACHE_KEYS } from '../../services/redis-cache.service';

// ==================== 功能开关定义 ====================

/**
 * AMAS 功能开关配置
 */
export interface AMASFeatureFlags {
  // 建模层
  /** TrendAnalyzer - 长期趋势分析模型 */
  enableTrendAnalyzer: boolean;
  /** HabitRecognizer - 用户学习习惯识别器 */
  enableHabitRecognizer: boolean;

  // 学习层 (Ensemble 内部学习器)
  /** HeuristicLearner - 启发式基准学习器 */
  enableHeuristicBaseline: boolean;
  /** ThompsonSampling - Beta分布采样探索 */
  enableThompsonSampling: boolean;
  /** ACTRMemoryModel - 认知架构记忆模型 */
  enableACTRMemory: boolean;

  // 决策层
  /** ColdStartManager - 冷启动管理器 */
  enableColdStartManager: boolean;
  /** EnsembleLearningFramework - 集成学习框架（替换 LinUCB 作为默认） */
  enableEnsemble: boolean;

  // 配置层
  /** UserParamsManager - 用户级超参数管理 */
  enableUserParamsManager: boolean;

  // 评估层
  /** DelayedRewardAggregator - 多时间尺度奖励聚合 */
  enableDelayedRewardAggregator: boolean;
  /** CausalInference - 因果推断验证 */
  enableCausalInference: boolean;

  // 优化层
  /** BayesianOptimizer - 贝叶斯超参数优化 */
  enableBayesianOptimizer: boolean;

  // Native 加速层
  /** LinUCB Native Wrapper - 使用 Rust 实现的 LinUCB */
  enableNativeLinUCB: boolean;
  /** Thompson Sampling Native Wrapper - 使用 Rust 实现的 Thompson Sampling */
  enableNativeThompson: boolean;
  /** ACT-R Native Wrapper - 使用 Rust 实现的 ACT-R 记忆模型 */
  enableNativeACTR: boolean;
}

/**
 * 默认功能开关配置
 * 所有模块默认启用
 */
export const DEFAULT_FEATURE_FLAGS: AMASFeatureFlags = {
  // 建模层
  enableTrendAnalyzer: true,
  enableHabitRecognizer: true,

  // 学习层
  enableHeuristicBaseline: true,
  enableThompsonSampling: true,
  enableACTRMemory: true,

  // 决策层
  enableColdStartManager: true,
  enableEnsemble: true,

  // 配置层
  enableUserParamsManager: true,

  // 评估层
  enableDelayedRewardAggregator: false,
  enableCausalInference: true,

  // 优化层
  enableBayesianOptimizer: true,

  // Native 加速层（默认启用，自动降级到 TS 实现）
  enableNativeLinUCB: true,
  enableNativeThompson: true,
  enableNativeACTR: true,
};

// ==================== 环境变量映射 ====================

/**
 * 环境变量名称映射
 * 格式: AMAS_FEATURE_{FLAG_NAME}
 */
const ENV_VAR_MAP: Record<keyof AMASFeatureFlags, string> = {
  enableTrendAnalyzer: 'AMAS_FEATURE_TREND_ANALYZER',
  enableHabitRecognizer: 'AMAS_FEATURE_HABIT_RECOGNIZER',
  enableHeuristicBaseline: 'AMAS_FEATURE_HEURISTIC_BASELINE',
  enableThompsonSampling: 'AMAS_FEATURE_THOMPSON_SAMPLING',
  enableACTRMemory: 'AMAS_FEATURE_ACTR_MEMORY',
  enableColdStartManager: 'AMAS_FEATURE_COLD_START_MANAGER',
  enableEnsemble: 'AMAS_FEATURE_ENSEMBLE',
  enableUserParamsManager: 'AMAS_FEATURE_USER_PARAMS_MANAGER',
  enableDelayedRewardAggregator: 'AMAS_FEATURE_DELAYED_REWARD_AGGREGATOR',
  enableCausalInference: 'AMAS_FEATURE_CAUSAL_INFERENCE',
  enableBayesianOptimizer: 'AMAS_FEATURE_BAYESIAN_OPTIMIZER',
  enableNativeLinUCB: 'AMAS_FEATURE_NATIVE_LINUCB',
  enableNativeThompson: 'AMAS_FEATURE_NATIVE_THOMPSON',
  enableNativeACTR: 'AMAS_FEATURE_NATIVE_ACTR',
};

// ==================== 运行时配置 ====================

/** 当前生效的功能开关 */
let currentFlags: AMASFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };

/**
 * 从环境变量解析布尔值
 */
function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }
  return undefined;
}

/**
 * 从环境变量加载功能开关覆盖
 */
function loadFromEnvironment(): Partial<AMASFeatureFlags> {
  const overrides: Partial<AMASFeatureFlags> = {};

  for (const [key, envVar] of Object.entries(ENV_VAR_MAP)) {
    const envValue = process.env[envVar];
    const parsed = parseEnvBoolean(envValue);
    if (parsed !== undefined) {
      overrides[key as keyof AMASFeatureFlags] = parsed;
    }
  }

  return overrides;
}

/**
 * 初始化功能开关
 * 合并默认配置和环境变量覆盖
 */
export function initializeFeatureFlags(overrides?: Partial<AMASFeatureFlags>): AMASFeatureFlags {
  const envOverrides = loadFromEnvironment();

  currentFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    ...envOverrides,
    ...overrides,
  };

  return currentFlags;
}

// ==================== 访问接口 ====================

/**
 * 获取当前功能开关配置
 */
export function getFeatureFlags(): Readonly<AMASFeatureFlags> {
  return currentFlags;
}

/**
 * 检查单个功能是否启用
 */
export function isFeatureEnabled(feature: keyof AMASFeatureFlags): boolean {
  return currentFlags[feature];
}

// 功能开关变更回调（用于通知引擎清空缓存）
type FeatureFlagsChangeCallback = () => void;
const changeCallbacks: FeatureFlagsChangeCallback[] = [];

/**
 * 注册功能开关变更回调
 */
export function onFeatureFlagsChange(callback: FeatureFlagsChangeCallback): void {
  changeCallbacks.push(callback);
}

/**
 * 触发变更回调
 */
function notifyChange(): void {
  for (const cb of changeCallbacks) {
    try {
      cb();
    } catch (e) {
      amasLogger.error({ err: e }, 'Feature flags change callback error');
    }
  }
}

/**
 * 更新功能开关（运行时动态调整）
 * 同时清除相关的 Redis 缓存，确保配置变更立即生效
 */
export async function updateFeatureFlags(
  updates: Partial<AMASFeatureFlags>,
): Promise<AMASFeatureFlags> {
  currentFlags = {
    ...currentFlags,
    ...updates,
  };

  // 清除 Redis 中的用户状态和模型缓存
  // 确保配置变更后不会使用过期的缓存数据
  try {
    const deletedStateCount = await redisCacheService.delByPrefix(REDIS_CACHE_KEYS.USER_STATE);
    const deletedModelCount = await redisCacheService.delByPrefix(REDIS_CACHE_KEYS.USER_MODEL);
    amasLogger.info(
      {
        updates,
        deletedStateCount,
        deletedModelCount,
      },
      '[FeatureFlags] 功能开关已更新，Redis 缓存已清除',
    );
  } catch (error) {
    amasLogger.warn(
      {
        updates,
        error: (error as Error).message,
      },
      '[FeatureFlags] 清除 Redis 缓存失败，配置变更可能延迟生效',
    );
  }

  notifyChange();
  return currentFlags;
}

/**
 * 重置为默认配置
 * 同时清除相关的 Redis 缓存
 */
export async function resetFeatureFlags(): Promise<AMASFeatureFlags> {
  currentFlags = { ...DEFAULT_FEATURE_FLAGS };

  // 清除 Redis 缓存
  try {
    await redisCacheService.delByPrefix(REDIS_CACHE_KEYS.USER_STATE);
    await redisCacheService.delByPrefix(REDIS_CACHE_KEYS.USER_MODEL);
    amasLogger.info('[FeatureFlags] 功能开关已重置，Redis 缓存已清除');
  } catch (error) {
    amasLogger.warn(
      {
        error: (error as Error).message,
      },
      '[FeatureFlags] 重置时清除 Redis 缓存失败',
    );
  }

  notifyChange();
  return currentFlags;
}

// ==================== 便捷检查函数 ====================

/** 检查 Ensemble 决策框架是否启用 */
export function isEnsembleEnabled(): boolean {
  return currentFlags.enableEnsemble;
}

/** 检查冷启动管理器是否启用 */
export function isColdStartEnabled(): boolean {
  return currentFlags.enableColdStartManager;
}

/** 检查延迟奖励聚合器是否启用 */
export function isDelayedRewardAggregatorEnabled(): boolean {
  return currentFlags.enableDelayedRewardAggregator;
}

/** 检查因果推断是否启用 */
export function isCausalInferenceEnabled(): boolean {
  return currentFlags.enableCausalInference;
}

/** 检查贝叶斯优化器是否启用 */
export function isBayesianOptimizerEnabled(): boolean {
  return currentFlags.enableBayesianOptimizer;
}

/** 检查趋势分析器是否启用 */
export function isTrendAnalyzerEnabled(): boolean {
  return currentFlags.enableTrendAnalyzer;
}

/** 检查用户参数管理器是否启用 */
export function isUserParamsManagerEnabled(): boolean {
  return currentFlags.enableUserParamsManager;
}

/** 检查习惯识别器是否启用 */
export function isHabitRecognizerEnabled(): boolean {
  return currentFlags.enableHabitRecognizer;
}

/** 检查 Native LinUCB 是否启用 */
export function isNativeLinUCBEnabled(): boolean {
  return currentFlags.enableNativeLinUCB;
}

/** 检查 Native Thompson Sampling 是否启用 */
export function isNativeThompsonEnabled(): boolean {
  return currentFlags.enableNativeThompson;
}

/** 检查 Native ACT-R 是否启用 */
export function isNativeACTREnabled(): boolean {
  return currentFlags.enableNativeACTR;
}

// ==================== 模块分组检查 ====================

/**
 * 获取 Ensemble 内部学习器的启用状态
 */
export function getEnsembleLearnerFlags(): {
  heuristic: boolean;
  thompson: boolean;
  actr: boolean;
} {
  return {
    heuristic: currentFlags.enableHeuristicBaseline,
    thompson: currentFlags.enableThompsonSampling,
    actr: currentFlags.enableACTRMemory,
  };
}

/**
 * 检查是否有任何评估层模块启用
 */
export function hasEvaluationModulesEnabled(): boolean {
  return currentFlags.enableDelayedRewardAggregator || currentFlags.enableCausalInference;
}

/**
 * 检查是否有任何高级优化模块启用
 */
export function hasAdvancedOptimizationEnabled(): boolean {
  return currentFlags.enableBayesianOptimizer || currentFlags.enableCausalInference;
}

// ==================== 调试与诊断 ====================

/**
 * 获取功能开关摘要（用于日志和诊断）
 */
export function getFeatureFlagsSummary(): string {
  const enabled: string[] = [];
  const disabled: string[] = [];

  for (const [key, value] of Object.entries(currentFlags)) {
    const name = key.replace('enable', '');
    if (value) {
      enabled.push(name);
    } else {
      disabled.push(name);
    }
  }

  return [
    `AMAS Feature Flags:`,
    `  Enabled (${enabled.length}): ${enabled.join(', ') || 'none'}`,
    `  Disabled (${disabled.length}): ${disabled.join(', ') || 'none'}`,
  ].join('\n');
}

/**
 * 导出功能开关配置为 JSON
 */
export function exportFeatureFlagsAsJSON(): string {
  return JSON.stringify(currentFlags, null, 2);
}

// 初始化时自动加载环境变量
initializeFeatureFlags();

// ==================== 用户级功能开关覆盖（用于 A/B 测试） ====================

/**
 * 用户级功能开关覆盖缓存
 * key: userId, value: 功能开关覆盖配置
 */
const userFeatureFlagOverrides = new Map<string, Partial<AMASFeatureFlags>>();

/**
 * 应用实验变体的功能开关覆盖
 * @param userId 用户ID
 * @param overrides 变体参数（来自 ABVariant.parameters）
 */
export function applyExperimentOverrides(userId: string, overrides: Record<string, unknown>): void {
  const validOverrides: Partial<AMASFeatureFlags> = {};

  // 只接受已定义的功能开关键
  const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS) as Array<keyof AMASFeatureFlags>;

  for (const key of flagKeys) {
    if (key in overrides && typeof overrides[key] === 'boolean') {
      validOverrides[key] = overrides[key] as boolean;
    }
  }

  if (Object.keys(validOverrides).length > 0) {
    userFeatureFlagOverrides.set(userId, validOverrides);
    amasLogger.debug({ userId, overrides: validOverrides }, '[FeatureFlags] 应用用户级实验覆盖');
  }
}

/**
 * 获取用户的功能开关配置（合并全局配置和用户覆盖）
 * @param userId 用户ID
 */
export function getUserFeatureFlags(userId: string): Readonly<AMASFeatureFlags> {
  const userOverrides = userFeatureFlagOverrides.get(userId);
  if (!userOverrides) {
    return currentFlags;
  }

  return {
    ...currentFlags,
    ...userOverrides,
  };
}

/**
 * 清除用户的功能开关覆盖
 * @param userId 用户ID
 */
export function clearUserFeatureFlagOverrides(userId: string): void {
  userFeatureFlagOverrides.delete(userId);
}

/**
 * 清除所有用户的功能开关覆盖
 */
export function clearAllUserFeatureFlagOverrides(): void {
  userFeatureFlagOverrides.clear();
}

/**
 * 获取用户级覆盖统计（用于调试）
 */
export function getUserOverridesStats(): {
  totalUsers: number;
  overrides: Map<string, Partial<AMASFeatureFlags>>;
} {
  return {
    totalUsers: userFeatureFlagOverrides.size,
    overrides: new Map(userFeatureFlagOverrides),
  };
}
