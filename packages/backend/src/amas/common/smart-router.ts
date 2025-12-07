/**
 * Smart Router - 智能路由选择器
 * 根据操作复杂度自动选择 Native (Rust) 或 TypeScript 实现
 *
 * 设计原则:
 * - Rust 优势: 大规模并行计算 (Bootstrap 3318x 加速)、矩阵运算 (fitPropensity 73-107x)
 * - TypeScript 优势: 简单操作避免 NAPI 开销 (getExpectedValue 14x, retrievalProbability 11x)
 * - 根据数据量阈值动态决策
 */

/**
 * 操作复杂度级别
 */
export enum OperationComplexity {
  /** 简单操作：单次计算、简单公式 - 用 TS */
  SIMPLE = 'simple',
  /** 中等操作：小规模迭代 - 根据数据量决定 */
  MEDIUM = 'medium',
  /** 复杂操作：大规模并行、矩阵运算 - 用 Rust */
  COMPLEX = 'complex',
}

/**
 * 路由决策
 */
export enum RouteDecision {
  USE_NATIVE = 'native',
  USE_TYPESCRIPT = 'typescript',
}

/**
 * 操作配置
 */
export interface OperationConfig {
  /** 操作复杂度 */
  complexity: OperationComplexity;
  /** 数据量阈值 (超过此值使用 Native) */
  dataThreshold?: number;
  /** 迭代次数阈值 */
  iterationThreshold?: number;
  /** 强制使用指定实现 */
  forceRoute?: RouteDecision;
}

/**
 * 路由决策选项
 */
export interface RouteOptions {
  /** 数据大小 */
  dataSize?: number;
  /** 迭代次数 */
  iterations?: number;
  /** Native 是否可用 */
  nativeAvailable?: boolean;
}

/**
 * 路由统计信息
 */
export interface RouterStats {
  /** 各操作的路由决策统计 */
  decisions: Map<string, { native: number; typescript: number }>;
  /** 总决策次数 */
  totalDecisions: number;
  /** Native 决策次数 */
  nativeDecisions: number;
  /** TypeScript 决策次数 */
  typescriptDecisions: number;
}

/**
 * 默认操作配置
 * 基于性能数据定义各操作的路由策略
 */
const DEFAULT_OPERATION_CONFIGS: ReadonlyArray<[string, OperationConfig]> = [
  // ==================== ACT-R 操作 ====================
  ['actr.computeActivation', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 500,  // 超过 500 条痕迹用 Rust
  }],
  ['actr.computeFullActivation', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 500,
  }],
  ['actr.retrievalProbability', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,  // 简单公式，强制用 TS (11x 更快)
  }],
  ['actr.computeRecallProbability', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,
  }],
  ['actr.computeOptimalInterval', {
    complexity: OperationComplexity.COMPLEX,  // 60次二分搜索
    forceRoute: RouteDecision.USE_NATIVE,
  }],
  ['actr.computeMemoryStrength', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 100,
  }],
  ['actr.predictOptimalInterval', {
    complexity: OperationComplexity.COMPLEX,
    forceRoute: RouteDecision.USE_NATIVE,
  }],
  ['actr.batchCompute', {
    complexity: OperationComplexity.COMPLEX,
    dataThreshold: 10,  // 超过 10 个批次用 Rust
  }],
  ['actr.selectAction', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 20,
  }],
  ['actr.update', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,  // 简单计数更新
  }],

  // ==================== 因果推断操作 ====================
  ['causal.fitPropensity', {
    complexity: OperationComplexity.COMPLEX,
    forceRoute: RouteDecision.USE_NATIVE,  // 107x 加速!
  }],
  ['causal.fitOutcome', {
    complexity: OperationComplexity.COMPLEX,
    forceRoute: RouteDecision.USE_NATIVE,
  }],
  ['causal.fit', {
    complexity: OperationComplexity.COMPLEX,
    forceRoute: RouteDecision.USE_NATIVE,  // 矩阵运算密集
  }],
  ['causal.estimateATE', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 200,
  }],
  ['causal.estimateCATTE', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 200,
  }],
  ['causal.bootstrapSE', {
    complexity: OperationComplexity.COMPLEX,
    forceRoute: RouteDecision.USE_NATIVE,  // 3318x 加速!!
  }],
  ['causal.getPropensityScore', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,  // 简单公式
  }],
  ['causal.predictOutcome', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,
  }],
  ['causal.diagnosePropensity', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 100,
  }],
  ['causal.compareStrategies', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 100,
  }],
  ['causal.addObservation', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,  // 简单数据添加
  }],
  ['causal.addObservations', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 50,
  }],

  // ==================== Thompson Sampling 操作 ====================
  ['thompson.sampleBeta', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,  // 单次采样用 TS (避免 NAPI 开销)
  }],
  ['thompson.batchSample', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 50,  // 超过 50 个采样用 Rust
  }],
  ['thompson.selectAction', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 20,  // 超过 20 个动作用 Rust
  }],
  ['thompson.update', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,  // 简单参数更新
  }],
  ['thompson.updateParams', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,
  }],
  ['thompson.getExpectedReward', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,  // 简单除法 (14x 更快)
  }],
  ['thompson.getSampleCount', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,
  }],

  // ==================== LinUCB 操作 ====================
  ['linucb.selectAction', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 10,  // 超过 10 个动作用 Rust
  }],
  ['linucb.update', {
    complexity: OperationComplexity.MEDIUM,
    forceRoute: RouteDecision.USE_NATIVE,  // 矩阵更新 (Sherman-Morrison)
  }],
  ['linucb.updateBatch', {
    complexity: OperationComplexity.COMPLEX,
    forceRoute: RouteDecision.USE_NATIVE,  // 批量矩阵运算
  }],
  ['linucb.computeUCB', {
    complexity: OperationComplexity.MEDIUM,
    dataThreshold: 20,
  }],
  ['linucb.getTheta', {
    complexity: OperationComplexity.SIMPLE,
    forceRoute: RouteDecision.USE_TYPESCRIPT,
  }],
];

/**
 * 智能路由器
 * 根据操作类型和数据规模选择最优实现
 */
export class SmartRouter {
  private static operationConfigs: Map<string, OperationConfig> = new Map(DEFAULT_OPERATION_CONFIGS);

  /** 统计数据 */
  private static stats: RouterStats = {
    decisions: new Map(),
    totalDecisions: 0,
    nativeDecisions: 0,
    typescriptDecisions: 0,
  };

  /** 是否启用统计 */
  private static statsEnabled = false;

  /**
   * 决定使用哪个实现
   *
   * @param operation 操作名称，格式: "module.method" (例如 "causal.bootstrapSE")
   * @param options 路由选项
   * @returns 路由决策
   *
   * @example
   * ```typescript
   * // 简单操作 - 使用 TS
   * SmartRouter.decide('thompson.getExpectedReward')
   * // => RouteDecision.USE_TYPESCRIPT
   *
   * // 复杂操作 - 使用 Native
   * SmartRouter.decide('causal.bootstrapSE')
   * // => RouteDecision.USE_NATIVE
   *
   * // 中等操作 - 根据数据量决定
   * SmartRouter.decide('actr.computeActivation', { dataSize: 1000 })
   * // => RouteDecision.USE_NATIVE (超过阈值 500)
   *
   * SmartRouter.decide('actr.computeActivation', { dataSize: 100 })
   * // => RouteDecision.USE_TYPESCRIPT (未超过阈值)
   * ```
   */
  static decide(operation: string, options?: RouteOptions): RouteDecision {
    const { dataSize = 0, iterations = 1, nativeAvailable = true } = options || {};

    // Native 不可用时强制用 TS
    if (!nativeAvailable) {
      this.recordDecision(operation, RouteDecision.USE_TYPESCRIPT);
      return RouteDecision.USE_TYPESCRIPT;
    }

    const config = this.operationConfigs.get(operation);

    // 未配置的操作默认用 Native (保守策略)
    if (!config) {
      this.recordDecision(operation, RouteDecision.USE_NATIVE);
      return RouteDecision.USE_NATIVE;
    }

    // 强制路由
    if (config.forceRoute !== undefined) {
      this.recordDecision(operation, config.forceRoute);
      return config.forceRoute;
    }

    // 根据复杂度和数据量决定
    let decision: RouteDecision;

    switch (config.complexity) {
      case OperationComplexity.SIMPLE:
        decision = RouteDecision.USE_TYPESCRIPT;
        break;

      case OperationComplexity.COMPLEX:
        decision = RouteDecision.USE_NATIVE;
        break;

      case OperationComplexity.MEDIUM:
        // 检查数据量阈值
        if (config.dataThreshold !== undefined && dataSize >= config.dataThreshold) {
          decision = RouteDecision.USE_NATIVE;
          break;
        }
        // 检查迭代次数阈值
        if (config.iterationThreshold !== undefined && iterations >= config.iterationThreshold) {
          decision = RouteDecision.USE_NATIVE;
          break;
        }
        // 默认用 TS (避免 NAPI 开销)
        decision = RouteDecision.USE_TYPESCRIPT;
        break;

      default:
        decision = RouteDecision.USE_NATIVE;
    }

    this.recordDecision(operation, decision);
    return decision;
  }

  /**
   * 批量决策 - 对多个操作同时进行路由决策
   *
   * @param operations 操作列表，每个包含操作名和选项
   * @returns 决策结果映射
   */
  static decideBatch(
    operations: Array<{ operation: string; options?: RouteOptions }>
  ): Map<string, RouteDecision> {
    const results = new Map<string, RouteDecision>();
    for (const { operation, options } of operations) {
      results.set(operation, this.decide(operation, options));
    }
    return results;
  }

  /**
   * 检查操作是否应该使用 Native
   * 便捷方法，等价于 decide() === RouteDecision.USE_NATIVE
   */
  static shouldUseNative(operation: string, options?: RouteOptions): boolean {
    return this.decide(operation, options) === RouteDecision.USE_NATIVE;
  }

  /**
   * 检查操作是否应该使用 TypeScript
   * 便捷方法，等价于 decide() === RouteDecision.USE_TYPESCRIPT
   */
  static shouldUseTypeScript(operation: string, options?: RouteOptions): boolean {
    return this.decide(operation, options) === RouteDecision.USE_TYPESCRIPT;
  }

  /**
   * 注册自定义操作配置
   * 允许在运行时添加或覆盖操作配置
   *
   * @param operation 操作名称
   * @param config 操作配置
   */
  static registerOperation(operation: string, config: OperationConfig): void {
    this.operationConfigs.set(operation, config);
  }

  /**
   * 批量注册操作配置
   */
  static registerOperations(configs: Map<string, OperationConfig> | Array<[string, OperationConfig]>): void {
    if (configs instanceof Map) {
      configs.forEach((config, operation) => {
        this.operationConfigs.set(operation, config);
      });
    } else {
      for (const [operation, config] of configs) {
        this.operationConfigs.set(operation, config);
      }
    }
  }

  /**
   * 取消注册操作配置
   */
  static unregisterOperation(operation: string): boolean {
    return this.operationConfigs.delete(operation);
  }

  /**
   * 获取操作配置
   */
  static getConfig(operation: string): OperationConfig | undefined {
    return this.operationConfigs.get(operation);
  }

  /**
   * 检查操作是否已配置
   */
  static hasConfig(operation: string): boolean {
    return this.operationConfigs.has(operation);
  }

  /**
   * 获取所有配置的副本
   */
  static getAllConfigs(): Map<string, OperationConfig> {
    return new Map(this.operationConfigs);
  }

  /**
   * 获取所有已注册的操作名称
   */
  static getOperationNames(): string[] {
    return Array.from(this.operationConfigs.keys());
  }

  /**
   * 重置为默认配置
   */
  static resetToDefaults(): void {
    this.operationConfigs = new Map(DEFAULT_OPERATION_CONFIGS);
  }

  // ==================== 统计相关方法 ====================

  /**
   * 启用统计
   */
  static enableStats(): void {
    this.statsEnabled = true;
  }

  /**
   * 禁用统计
   */
  static disableStats(): void {
    this.statsEnabled = false;
  }

  /**
   * 获取统计数据
   */
  static getStats(): RouterStats {
    return {
      decisions: new Map(this.stats.decisions),
      totalDecisions: this.stats.totalDecisions,
      nativeDecisions: this.stats.nativeDecisions,
      typescriptDecisions: this.stats.typescriptDecisions,
    };
  }

  /**
   * 重置统计数据
   */
  static resetStats(): void {
    this.stats = {
      decisions: new Map(),
      totalDecisions: 0,
      nativeDecisions: 0,
      typescriptDecisions: 0,
    };
  }

  /**
   * 记录决策 (内部方法)
   */
  private static recordDecision(operation: string, decision: RouteDecision): void {
    if (!this.statsEnabled) return;

    this.stats.totalDecisions++;

    if (decision === RouteDecision.USE_NATIVE) {
      this.stats.nativeDecisions++;
    } else {
      this.stats.typescriptDecisions++;
    }

    const opStats = this.stats.decisions.get(operation) || { native: 0, typescript: 0 };
    if (decision === RouteDecision.USE_NATIVE) {
      opStats.native++;
    } else {
      opStats.typescript++;
    }
    this.stats.decisions.set(operation, opStats);
  }

  // ==================== 调试和诊断 ====================

  /**
   * 获取操作的推荐实现说明
   */
  static explainDecision(operation: string, options?: RouteOptions): string {
    const config = this.getConfig(operation);
    const decision = this.decide(operation, options);

    if (!config) {
      return `[${operation}] => ${decision} (未配置，使用默认策略)`;
    }

    const reasons: string[] = [];

    if (config.forceRoute !== undefined) {
      reasons.push(`强制路由: ${config.forceRoute}`);
    } else {
      reasons.push(`复杂度: ${config.complexity}`);

      if (config.dataThreshold !== undefined) {
        const dataSize = options?.dataSize ?? 0;
        reasons.push(`数据阈值: ${config.dataThreshold} (当前: ${dataSize})`);
      }

      if (config.iterationThreshold !== undefined) {
        const iterations = options?.iterations ?? 1;
        reasons.push(`迭代阈值: ${config.iterationThreshold} (当前: ${iterations})`);
      }
    }

    return `[${operation}] => ${decision} (${reasons.join(', ')})`;
  }

  /**
   * 导出配置为 JSON
   */
  static exportConfig(): Record<string, OperationConfig> {
    const result: Record<string, OperationConfig> = {};
    this.operationConfigs.forEach((value, key) => {
      result[key] = { ...value };
    });
    return result;
  }

  /**
   * 从 JSON 导入配置
   */
  static importConfig(config: Record<string, OperationConfig>, merge = true): void {
    if (!merge) {
      this.operationConfigs.clear();
    }
    for (const [key, value] of Object.entries(config)) {
      this.operationConfigs.set(key, value);
    }
  }
}

/**
 * 创建带有自定义配置的路由器实例
 * 用于需要独立配置的场景
 */
export function createSmartRouter(
  customConfigs?: Map<string, OperationConfig> | Array<[string, OperationConfig]>
): typeof SmartRouter {
  // 创建一个新的类，继承 SmartRouter 但使用独立的配置
  class CustomSmartRouter extends SmartRouter {
    private static customOperationConfigs: Map<string, OperationConfig>;

    static {
      this.customOperationConfigs = new Map(DEFAULT_OPERATION_CONFIGS);
      if (customConfigs) {
        if (customConfigs instanceof Map) {
          customConfigs.forEach((config, operation) => {
            this.customOperationConfigs.set(operation, config);
          });
        } else {
          for (const [operation, config] of customConfigs) {
            this.customOperationConfigs.set(operation, config);
          }
        }
      }
    }
  }

  return CustomSmartRouter;
}

export default SmartRouter;
