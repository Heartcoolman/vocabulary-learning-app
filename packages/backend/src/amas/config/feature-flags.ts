/**
 * AMAS Feature Flags Configuration
 * 功能开关配置 - 控制各算法模块的启用状态
 *
 * 设计原则：
 * - 所有模块默认启用，通过开关可单独禁用
 * - 支持环境变量覆盖，便于生产环境调试
 * - 提供类型安全的访问接口
 */

// ==================== 功能开关定义 ====================

/**
 * AMAS 功能开关配置
 */
export interface AMASFeatureFlags {
  // 建模层
  /** TrendAnalyzer - 长期趋势分析模型 */
  enableTrendAnalyzer: boolean;

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
}

/**
 * 默认功能开关配置
 * 所有模块默认启用
 */
export const DEFAULT_FEATURE_FLAGS: AMASFeatureFlags = {
  // 建模层
  enableTrendAnalyzer: true,

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
  enableDelayedRewardAggregator: true,
  enableCausalInference: true,

  // 优化层
  enableBayesianOptimizer: true
};

// ==================== 环境变量映射 ====================

/**
 * 环境变量名称映射
 * 格式: AMAS_FEATURE_{FLAG_NAME}
 */
const ENV_VAR_MAP: Record<keyof AMASFeatureFlags, string> = {
  enableTrendAnalyzer: 'AMAS_FEATURE_TREND_ANALYZER',
  enableHeuristicBaseline: 'AMAS_FEATURE_HEURISTIC_BASELINE',
  enableThompsonSampling: 'AMAS_FEATURE_THOMPSON_SAMPLING',
  enableACTRMemory: 'AMAS_FEATURE_ACTR_MEMORY',
  enableColdStartManager: 'AMAS_FEATURE_COLD_START_MANAGER',
  enableEnsemble: 'AMAS_FEATURE_ENSEMBLE',
  enableUserParamsManager: 'AMAS_FEATURE_USER_PARAMS_MANAGER',
  enableDelayedRewardAggregator: 'AMAS_FEATURE_DELAYED_REWARD_AGGREGATOR',
  enableCausalInference: 'AMAS_FEATURE_CAUSAL_INFERENCE',
  enableBayesianOptimizer: 'AMAS_FEATURE_BAYESIAN_OPTIMIZER'
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
export function initializeFeatureFlags(
  overrides?: Partial<AMASFeatureFlags>
): AMASFeatureFlags {
  const envOverrides = loadFromEnvironment();

  currentFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    ...envOverrides,
    ...overrides
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

/**
 * 更新功能开关（运行时动态调整）
 */
export function updateFeatureFlags(
  updates: Partial<AMASFeatureFlags>
): AMASFeatureFlags {
  currentFlags = {
    ...currentFlags,
    ...updates
  };
  return currentFlags;
}

/**
 * 重置为默认配置
 */
export function resetFeatureFlags(): AMASFeatureFlags {
  currentFlags = { ...DEFAULT_FEATURE_FLAGS };
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
    actr: currentFlags.enableACTRMemory
  };
}

/**
 * 检查是否有任何评估层模块启用
 */
export function hasEvaluationModulesEnabled(): boolean {
  return (
    currentFlags.enableDelayedRewardAggregator ||
    currentFlags.enableCausalInference
  );
}

/**
 * 检查是否有任何高级优化模块启用
 */
export function hasAdvancedOptimizationEnabled(): boolean {
  return (
    currentFlags.enableBayesianOptimizer ||
    currentFlags.enableCausalInference
  );
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
    `  Disabled (${disabled.length}): ${disabled.join(', ') || 'none'}`
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
