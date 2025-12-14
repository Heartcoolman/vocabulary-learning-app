/**
 * AMAS Learning Layer - LinUCB Async Wrapper
 * LinUCB 异步包装器
 *
 * 核心功能:
 * - 将 LinUCB 的计算密集型操作卸载到 Worker 池
 * - 防止 O(d²) 和 O(d³) 的矩阵运算阻塞 Event Loop
 * - 支持同步降级（Worker 失败时回退）
 *
 * 设计原则:
 * - 小维度直接同步计算（避免线程间传输开销）
 * - 大维度使用 Worker 池异步计算
 * - 完全兼容原始 LinUCB 接口
 */

import {
  getComputePool,
  isPoolInitialized,
  LinUCBSelectPayload,
  LinUCBSelectResult,
  LinUCBUpdatePayload,
  LinUCBUpdateResult,
} from '../workers/pool';
import { LinUCB, LinUCBOptions, LinUCBContext, ContextBuildInput } from '../algorithms/learners';
import { Action, UserState, BanditModel } from '../types';
import { ActionSelection, LearnerCapabilities } from '../algorithms/learners';
import { ACTION_SPACE } from '../config/action-space';
import { amasLogger } from '../../logger';

// ==================== 配置常量 ====================

/** 维度阈值：超过此维度时使用 Worker */
const WORKER_THRESHOLD_DIMENSION = 10;

/** 任务超时时间 (ms) */
const TASK_TIMEOUT = 5000;

// ==================== 类型定义 ====================

/**
 * LinUCBAsync 配置选项
 */
export interface LinUCBAsyncOptions extends LinUCBOptions {
  /** 是否启用 Worker 池 (默认: true) */
  useWorker?: boolean;
  /** 使用 Worker 的维度阈值 (默认: 10) */
  workerThreshold?: number;
  /** 任务超时时间 (ms, 默认: 5000) */
  taskTimeout?: number;
}

// ==================== 异步包装器类 ====================

/**
 * LinUCB 异步包装器
 *
 * 将计算密集型操作卸载到 Worker 池，避免阻塞主线程。
 *
 * 使用策略:
 * - 维度 < workerThreshold: 同步计算（线程传输开销大于计算开销）
 * - 维度 >= workerThreshold: 使用 Worker 异步计算
 * - Worker 失败: 自动降级到同步计算
 *
 * @example
 * ```typescript
 * const linucb = new LinUCBAsync({ dimension: 22 });
 *
 * // 异步选择最优动作
 * const result = await linucb.selectActionAsync(state, actions, context);
 *
 * // 异步更新模型
 * await linucb.updateAsync(state, action, reward, context);
 * ```
 */
export class LinUCBAsync {
  private readonly linucb: LinUCB;
  private readonly useWorker: boolean;
  private readonly workerThreshold: number;
  private readonly taskTimeout: number;

  /** Worker 降级计数（用于监控） */
  private fallbackCount = 0;

  private toFloat32Array(featureVector: Float32Array | number[]): Float32Array {
    return featureVector instanceof Float32Array ? featureVector : new Float32Array(featureVector);
  }

  constructor(options: LinUCBAsyncOptions = {}) {
    const {
      useWorker = true,
      workerThreshold = WORKER_THRESHOLD_DIMENSION,
      taskTimeout = TASK_TIMEOUT,
      ...linucbOptions
    } = options;

    this.linucb = new LinUCB(linucbOptions);
    this.useWorker = useWorker;
    this.workerThreshold = workerThreshold;
    this.taskTimeout = taskTimeout;
  }

  // ==================== 核心异步方法 ====================

  /**
   * 异步选择最优动作
   *
   * @param state 用户状态
   * @param actions 候选动作列表
   * @param context 上下文信息
   * @returns 动作选择结果
   */
  async selectActionAsync(
    state: UserState,
    actions: Action[],
    context: LinUCBContext,
  ): Promise<ActionSelection<Action>> {
    // 小维度或禁用 Worker 时直接同步计算
    if (!this.shouldUseWorker()) {
      return this.linucb.selectAction(state, actions, context);
    }

    try {
      // 构建所有候选动作的特征向量
      const featureVectors = actions.map((action) =>
        Array.from(
          this.linucb.buildContextVector({
            state,
            action,
            recentErrorRate: context.recentErrorRate,
            recentResponseTime: context.recentResponseTime,
            timeBucket: context.timeBucket,
          }),
        ),
      );

      const model = this.linucb.getModel();

      const payload: LinUCBSelectPayload = {
        model: {
          d: model.d,
          alpha: model.alpha,
          A: Array.from(model.A),
          b: Array.from(model.b),
          L: Array.from(model.L),
        },
        featureVectors,
      };

      const pool = getComputePool();
      const result = (await pool.run(
        { type: 'linucb_select', payload },
        { signal: AbortSignal.timeout(this.taskTimeout) },
      )) as LinUCBSelectResult;

      // 构建返回结果
      return {
        action: actions[result.bestIndex],
        score: result.score,
        confidence: result.confidence,
        meta: {
          exploitation: result.exploitation,
          exploration: model.alpha * result.confidence,
          workerUsed: true,
        },
      };
    } catch (error) {
      // Worker 失败，降级到同步计算
      this.handleWorkerFailure('selectActionAsync', error);
      return this.linucb.selectAction(state, actions, context);
    }
  }

  /**
   * 异步更新模型
   *
   * @param state 用户状态
   * @param action 执行的动作
   * @param reward 奖励值
   * @param context 上下文信息
   */
  async updateAsync(
    state: UserState,
    action: Action,
    reward: number,
    context: LinUCBContext,
  ): Promise<void> {
    // 小维度或禁用 Worker 时直接同步计算
    if (!this.shouldUseWorker()) {
      return this.linucb.update(state, action, reward, context);
    }

    try {
      // 构建特征向量
      const featureVector = Array.from(
        this.linucb.buildContextVector({
          state,
          action,
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        }),
      );

      const model = this.linucb.getModel();

      const payload: LinUCBUpdatePayload = {
        model: {
          d: model.d,
          lambda: model.lambda,
          A: Array.from(model.A),
          b: Array.from(model.b),
          L: Array.from(model.L),
        },
        featureVector,
        reward,
      };

      const pool = getComputePool();
      const result = (await pool.run(
        { type: 'linucb_update', payload },
        { signal: AbortSignal.timeout(this.taskTimeout) },
      )) as LinUCBUpdateResult;

      if (result.success) {
        // 更新本地模型状态
        const updatedModel: BanditModel = {
          ...model,
          A: new Float32Array(result.A),
          b: new Float32Array(result.b),
          L: new Float32Array(result.L),
          updateCount: model.updateCount + 1,
        };
        this.linucb.setModel(updatedModel);
      } else {
        // Worker 内部更新失败，使用同步降级
        amasLogger.warn('[LinUCBAsync] Worker update failed, falling back to sync');
        this.linucb.update(state, action, reward, context);
      }
    } catch (error) {
      // Worker 失败，降级到同步计算
      this.handleWorkerFailure('updateAsync', error);
      this.linucb.update(state, action, reward, context);
    }
  }

  /**
   * 异步使用特征向量更新模型
   *
   * @param featureVector 特征向量
   * @param reward 奖励值
   */
  async updateWithFeatureVectorAsync(
    featureVector: Float32Array | number[],
    reward: number,
  ): Promise<void> {
    const floatVec = this.toFloat32Array(featureVector);
    if (!this.shouldUseWorker()) {
      this.linucb.updateWithFeatureVector(floatVec, reward);
      return;
    }

    try {
      const model = this.linucb.getModel();
      const fv = Array.from(floatVec);

      const payload: LinUCBUpdatePayload = {
        model: {
          d: model.d,
          lambda: model.lambda,
          A: Array.from(model.A),
          b: Array.from(model.b),
          L: Array.from(model.L),
        },
        featureVector: fv,
        reward,
      };

      const pool = getComputePool();
      const result = (await pool.run(
        { type: 'linucb_update', payload },
        { signal: AbortSignal.timeout(this.taskTimeout) },
      )) as LinUCBUpdateResult;

      if (result.success) {
        const updatedModel: BanditModel = {
          ...model,
          A: new Float32Array(result.A),
          b: new Float32Array(result.b),
          L: new Float32Array(result.L),
          updateCount: model.updateCount + 1,
        };
        this.linucb.setModel(updatedModel);
      } else {
        amasLogger.warn('[LinUCBAsync] Worker update failed, falling back to sync');
        this.linucb.updateWithFeatureVector(floatVec, reward);
      }
    } catch (error) {
      this.handleWorkerFailure('updateWithFeatureVectorAsync', error);
      this.linucb.updateWithFeatureVector(floatVec, reward);
    }
  }

  // ==================== 同步代理方法 ====================

  /**
   * 同步选择动作（直接调用底层 LinUCB）
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: LinUCBContext,
  ): ActionSelection<Action> {
    return this.linucb.selectAction(state, actions, context);
  }

  /**
   * 同步更新模型
   */
  update(state: UserState, action: Action, reward: number, context: LinUCBContext): void {
    return this.linucb.update(state, action, reward, context);
  }

  /**
   * 使用默认动作空间选择
   */
  selectFromActionSpace(state: UserState, context: LinUCBContext): Action {
    return this.linucb.selectAction(state, ACTION_SPACE, context).action;
  }

  /**
   * 异步使用默认动作空间选择
   */
  async selectFromActionSpaceAsync(state: UserState, context: LinUCBContext): Promise<Action> {
    const result = await this.selectActionAsync(state, ACTION_SPACE, context);
    return result.action;
  }

  /**
   * 使用特征向量更新模型（同步）
   */
  updateWithFeatureVector(featureVector: Float32Array | number[], reward: number): void {
    this.linucb.updateWithFeatureVector(this.toFloat32Array(featureVector), reward);
  }

  /**
   * 构建上下文特征向量
   */
  buildContextVector(input: ContextBuildInput): Float32Array {
    return this.linucb.buildContextVector(input);
  }

  // ==================== 状态管理方法 ====================

  /**
   * 获取模型状态
   */
  getModel(): BanditModel {
    return this.linucb.getModel();
  }

  /**
   * 设置模型状态
   */
  setModel(model: BanditModel): void {
    this.linucb.setModel(model);
  }

  /**
   * 获取状态（BaseLearner 兼容）
   */
  getState(): BanditModel {
    return this.linucb.getState();
  }

  /**
   * 设置状态（BaseLearner 兼容）
   */
  setState(state: BanditModel): void {
    this.linucb.setState(state);
  }

  /**
   * 序列化模型状态为 JSON 字符串
   */
  serialize(): string {
    const model = this.linucb.getModel();
    return JSON.stringify({
      d: model.d,
      lambda: model.lambda,
      alpha: model.alpha,
      A: Array.from(model.A),
      b: Array.from(model.b),
      L: Array.from(model.L),
      updateCount: model.updateCount,
    });
  }

  /**
   * 从 JSON 字符串反序列化模型状态
   */
  deserialize(state: string): void {
    const parsed = JSON.parse(state);
    const model: BanditModel = {
      d: parsed.d,
      lambda: parsed.lambda,
      alpha: parsed.alpha,
      A: new Float32Array(parsed.A),
      b: new Float32Array(parsed.b),
      L: new Float32Array(parsed.L),
      updateCount: parsed.updateCount,
    };
    this.linucb.setModel(model);
  }

  /**
   * 重置模型
   */
  reset(): void {
    this.linucb.reset();
    this.fallbackCount = 0;
  }

  // ==================== 配置方法 ====================

  /**
   * 设置探索系数
   */
  setAlpha(alpha: number): void {
    this.linucb.setAlpha(alpha);
  }

  /**
   * 获取探索系数
   */
  getAlpha(): number {
    return this.linucb.getAlpha();
  }

  /**
   * 获取更新次数
   */
  getUpdateCount(): number {
    return this.linucb.getUpdateCount();
  }

  /**
   * 获取冷启动探索率
   */
  getColdStartAlpha(interactionCount: number, recentAccuracy: number, fatigue: number): number {
    return this.linucb.getColdStartAlpha(interactionCount, recentAccuracy, fatigue);
  }

  // ==================== BaseLearner 兼容方法 ====================

  /**
   * 获取学习器名称
   */
  getName(): string {
    return 'LinUCBAsync';
  }

  /**
   * 获取学习器版本
   */
  getVersion(): string {
    return '2.0.0-async';
  }

  /**
   * 获取学习器能力
   */
  getCapabilities(): LearnerCapabilities {
    const base = this.linucb.getCapabilities();
    return {
      ...base,
      primaryUseCase: base.primaryUseCase + ' (异步版本，支持 Worker 池)',
    };
  }

  // ==================== 诊断方法 ====================

  /**
   * 获取 Worker 使用统计
   */
  getWorkerStats(): {
    useWorker: boolean;
    workerThreshold: number;
    dimension: number;
    willUseWorker: boolean;
    fallbackCount: number;
    poolInitialized: boolean;
  } {
    const model = this.linucb.getModel();
    return {
      useWorker: this.useWorker,
      workerThreshold: this.workerThreshold,
      dimension: model.d,
      willUseWorker: this.shouldUseWorker(),
      fallbackCount: this.fallbackCount,
      poolInitialized: isPoolInitialized(),
    };
  }

  /**
   * 获取底层 LinUCB 实例（高级用途）
   */
  getUnderlyingLinUCB(): LinUCB {
    return this.linucb;
  }

  // ==================== 私有方法 ====================

  /**
   * 判断是否应该使用 Worker
   */
  private shouldUseWorker(): boolean {
    if (!this.useWorker) {
      return false;
    }
    const model = this.linucb.getModel();
    return model.d >= this.workerThreshold;
  }

  /**
   * 处理 Worker 失败
   */
  private handleWorkerFailure(method: string, error: unknown): void {
    this.fallbackCount++;
    amasLogger.warn(
      {
        method,
        error: error instanceof Error ? error.message : String(error),
        fallbackCount: this.fallbackCount,
      },
      '[LinUCBAsync] Worker failed, falling back to sync',
    );
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 LinUCBAsync 实例的便捷函数
 */
export function createLinUCBAsync(options?: LinUCBAsyncOptions): LinUCBAsync {
  return new LinUCBAsync(options);
}

/**
 * 创建禁用 Worker 的 LinUCBAsync（用于测试）
 */
export function createLinUCBAsyncSync(
  options?: Omit<LinUCBAsyncOptions, 'useWorker'>,
): LinUCBAsync {
  return new LinUCBAsync({ ...options, useWorker: false });
}
