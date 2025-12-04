/**
 * AMAS Learning Layer - LinUCB Algorithm
 * 线性上置信界算法
 *
 * 核心算法: LinUCB (Linear Upper Confidence Bound)
 * 用于在线学习最优策略
 */

import {
  Action,
  BanditModel,
  UserState
} from '../types';
import {
  DEFAULT_ALPHA,
  DEFAULT_DIMENSION,
  DEFAULT_LAMBDA,
  ACTION_SPACE
} from '../config/action-space';
import {
  ActionSelection,
  BaseLearner,
  BaseLearnerContext,
  LearnerCapabilities
} from './base-learner';
import {
  choleskyRank1Update,
  addOuterProduct,
  addScaledVector,
  hasInvalidValues
} from './math-utils';
import { amasLogger } from '../../logger';

// 数值稳定常量
const MIN_LAMBDA = 1e-3;
const MIN_RANK1_DIAG = 1e-6;
const MAX_COVARIANCE = 1e9;
const MAX_FEATURE_ABS = 50;

// ==================== 类型定义 ====================

/**
 * LinUCB上下文（覆盖基础上下文中的可选字段为必需）
 */
export interface LinUCBContext extends BaseLearnerContext {
  /** 近期错误率 [0,1] - LinUCB必需 */
  recentErrorRate: number;
  /** 近期平均反应时间(ms) - LinUCB必需 */
  recentResponseTime: number;
  /** 时间段 (0-23小时) - LinUCB必需 */
  timeBucket: number;
}

/**
 * 特征构建输入
 */
export interface ContextBuildInput extends LinUCBContext {
  state: UserState;
  action: Action;
}

/**
 * LinUCB配置选项
 */
export interface LinUCBOptions {
  alpha?: number;
  lambda?: number;
  dimension?: number;
}

// ==================== 工具函数 ====================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 归一化难度等级
 */
function normalizeDifficulty(level: Action['difficulty']): number {
  switch (level) {
    case 'easy':
      return 0.2;
    case 'hard':
      return 0.8;
    case 'mid':
    default:
      return 0.5;
  }
}

/**
 * 归一化提示级别 (0/1/2 → 0/0.5/1)
 */
function normalizeHintLevel(hintLevel: number): number {
  return clamp(hintLevel / 2, 0, 1);
}

/**
 * 归一化批量大小 (假设16为基准)
 */
function normalizeBatchSize(batchSize: number): number {
  return clamp(batchSize / 16, 0, 1);
}

/**
 * 时间特征归一化 (norm + sin/cos周期编码)
 */
function normalizeTimeFeatures(timeBucket: number): {
  norm: number;
  sin: number;
  cos: number;
} {
  const bucket = clamp(timeBucket, 0, 24);
  const norm = bucket / 24;
  const phase = (2 * Math.PI * bucket) / 24;
  return {
    norm,
    sin: Math.sin(phase),
    cos: Math.cos(phase)
  };
}

// ==================== LinUCB算法实现 ====================

/**
 * LinUCB算法
 *
 * 数学原理:
 * θ_a = A_a^(-1) b_a
 * score_a = θ_a^T x + α √(x^T A_a^(-1) x)
 * a* = argmax_a score_a
 */
export class LinUCB implements BaseLearner<UserState, Action, LinUCBContext, BanditModel> {
  private static readonly NAME = 'LinUCB';
  private static readonly VERSION = '2.0.0';

  private model: BanditModel;

  constructor(opts: LinUCBOptions = {}) {
    const d = opts.dimension ?? DEFAULT_DIMENSION;
    const lambda = Math.max(opts.lambda ?? DEFAULT_LAMBDA, MIN_LAMBDA);
    const alpha = opts.alpha ?? DEFAULT_ALPHA;

    // 初始化模型
    this.model = {
      d,
      lambda,
      alpha,
      A: this.initIdentityMatrix(d, lambda),
      b: new Float32Array(d),
      L: this.initIdentityMatrix(d, lambda),
      updateCount: 0
    };
  }

  /**
   * 选择最优动作（实现 BaseLearner 接口）
   *
   * @returns ActionSelection 包含动作、评分和置信度
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: LinUCBContext
  ): ActionSelection<Action> {
    if (!actions || actions.length === 0) {
      throw new Error('[LinUCB] actions array must not be empty');
    }

    let bestSelection: ActionSelection<Action> | null = null;

    for (const action of actions) {
      const x = this.buildContextVector({
        state,
        action,
        recentErrorRate: context.recentErrorRate,
        recentResponseTime: context.recentResponseTime,
        timeBucket: context.timeBucket
      });

      const { score, confidence, exploitation } = this.computeUCBStats(x);

      if (!bestSelection || score > bestSelection.score) {
        bestSelection = {
          action,
          score,
          confidence,
          meta: { exploitation, exploration: this.model.alpha * confidence }
        };
      }
    }

    // 回退保护
    if (!bestSelection) {
      return {
        action: actions[0],
        score: -Number.MAX_VALUE,
        confidence: 0
      };
    }

    return bestSelection;
  }

  /**
   * 使用默认动作空间选择（便捷方法，返回Action而非ActionSelection）
   */
  selectFromActionSpace(
    state: UserState,
    context: LinUCBContext
  ): Action {
    return this.selectAction(state, ACTION_SPACE, context).action;
  }

  /**
   * 更新模型（实现 BaseLearner 接口）
   */
  update(
    state: UserState,
    action: Action,
    reward: number,
    context: LinUCBContext
  ): void {
    const x = this.buildContextVector({
      state,
      action,
      recentErrorRate: context.recentErrorRate,
      recentResponseTime: context.recentResponseTime,
      timeBucket: context.timeBucket
    });

    this.updateWithFeatureVector(x, reward);
  }

  /**
   * 使用预构建的特征向量更新模型 (用于延迟奖励)
   *
   * 优化: 使用Cholesky Rank-1增量更新，O(d²) vs O(d³)
   *
   * @param featureVector 特征向量 (d维Float32Array或数组)
   * @param reward 奖励值
   */
  updateWithFeatureVector(
    featureVector: Float32Array | number[],
    reward: number
  ): void {
    const rawX = featureVector instanceof Float32Array
      ? featureVector
      : new Float32Array(featureVector);

    const { d, lambda } = this.model;
    const A = this.model.A;
    const b = this.model.b;
    const L = this.model.L;
    const x = this.sanitizeFeatureVector(rawX);

    // 验证维度匹配
    if (x.length !== d) {
      throw new Error(
        `[LinUCB] 特征向量维度不匹配: expected d=${d}, got ${x.length}`
      );
    }

    // 验证特征向量的数值有效性
    if (hasInvalidValues(x)) {
      amasLogger.warn('[LinUCB] 特征向量包含无效值，跳过更新');
      return;
    }

    // 验证奖励值的有效性
    if (!Number.isFinite(reward)) {
      amasLogger.warn('[LinUCB] 奖励值无效，跳过更新');
      return;
    }

    // A += x x^T (使用工具函数)
    addOuterProduct(A, x, d);

    // b += r * x (使用工具函数)
    addScaledVector(b, x, reward, d);

    this.model.updateCount++;

    // 检查A矩阵的对角线元素和L矩阵幅度，防止数值不稳定
    let needsFullRecompute = hasInvalidValues(L);

    // 检查L矩阵幅度
    const maxCovSqrt = Math.sqrt(MAX_COVARIANCE);
    for (let i = 0; i < L.length; i++) {
      if (Math.abs(L[i]) > maxCovSqrt) {
        needsFullRecompute = true;
        break;
      }
    }

    // 检查A矩阵对角线
    for (let i = 0; i < d; i++) {
      const diag = A[i * d + i];
      if (
        !Number.isFinite(diag) ||
        diag < lambda * 0.1 ||
        Math.abs(diag) > MAX_COVARIANCE
      ) {
        needsFullRecompute = true;
        // 确保对角线元素至少为lambda
        if (!Number.isFinite(diag) || diag < lambda) {
          A[i * d + i] = lambda;
        } else if (Math.abs(diag) > MAX_COVARIANCE) {
          A[i * d + i] = clamp(diag, -MAX_COVARIANCE, MAX_COVARIANCE);
        }
      }
    }

    const minDiagForUpdate = Math.max(lambda * 0.01, MIN_RANK1_DIAG);

    if (needsFullRecompute) {
      // A矩阵不稳定，需要完整重算Cholesky
      amasLogger.warn('[LinUCB] 检测到A矩阵不稳定，执行完整Cholesky分解');
      const sanitizedA = this.sanitizeCovariance(A, d, lambda);
      this.model.A = sanitizedA;
      this.model.L = this.choleskyDecompose(sanitizedA, d, lambda);
    } else {
      // 正常情况：使用O(d²)的Rank-1增量更新
      const updateResult = choleskyRank1Update(L, x, d, minDiagForUpdate);

      if (!updateResult.success) {
        // 增量更新失败，回退到完整分解
        amasLogger.warn('[LinUCB] Rank-1更新失败，回退到完整Cholesky分解');
        const sanitizedA = this.sanitizeCovariance(A, d, lambda);
        this.model.A = sanitizedA;
        this.model.L = this.choleskyDecompose(sanitizedA, d, lambda);
      } else {
        this.model.L = updateResult.L;
      }
    }
  }

  /**
   * 获取冷启动阶段的探索率
   */
  getColdStartAlpha(
    interactionCount: number,
    recentAccuracy: number,
    fatigue: number
  ): number {
    if (interactionCount < 15) {
      return 0.5; // 低探索，安全策略
    }
    if (interactionCount < 50) {
      // 表现触发探索
      return recentAccuracy > 0.75 && fatigue < 0.5 ? 2.0 : 1.0;
    }
    return 0.7; // 正常运行
  }

  /**
   * 设置探索系数
   */
  setAlpha(alpha: number): void {
    this.model.alpha = Math.max(0, alpha);
  }

  /**
   * 获取当前探索系数
   */
  getAlpha(): number {
    return this.model.alpha;
  }

  /**
   * 获取更新次数
   */
  getUpdateCount(): number {
    return this.model.updateCount;
  }

  /**
   * 获取模型状态(用于持久化)
   */
  getModel(): BanditModel {
    return {
      d: this.model.d,
      lambda: this.model.lambda,
      alpha: this.model.alpha,
      A: new Float32Array(this.model.A),
      b: new Float32Array(this.model.b),
      L: new Float32Array(this.model.L),
      updateCount: this.model.updateCount
    };
  }

  /**
   * 恢复模型状态 (支持自动零填充迁移)
   */
  setModel(model: BanditModel): void {
    const targetD = this.model.d;
    const effectiveLambda = Math.max(model.lambda ?? DEFAULT_LAMBDA, MIN_LAMBDA);

    // 如果模型维度不匹配,自动扩展 (d=12 → d=22)
    if (model.d !== targetD) {
      amasLogger.debug({ from: model.d, to: targetD }, '[LinUCB] 迁移模型维度');
      this.model = this.expandModel(model, targetD, effectiveLambda);
      return;
    }

    const sanitizedA = this.sanitizeCovariance(
      new Float32Array(model.A),
      targetD,
      effectiveLambda
    );
    let sanitizedL: Float32Array;
    const loadedL = new Float32Array(model.L);
    if (hasInvalidValues(loadedL)) {
      sanitizedL = this.choleskyDecompose(sanitizedA, targetD, effectiveLambda);
    } else {
      sanitizedL = loadedL;
    }

    // 维度匹配,直接加载
    this.model = {
      d: model.d,
      lambda: effectiveLambda,
      alpha: model.alpha,
      A: sanitizedA,
      b: new Float32Array(model.b),
      L: sanitizedL,
      updateCount: model.updateCount
    };
  }

  /**
   * 重置模型
   */
  reset(): void {
    const d = this.model.d;
    const lambda = this.model.lambda;
    this.model.A = this.initIdentityMatrix(d, lambda);
    this.model.b = new Float32Array(d);
    this.model.L = this.initIdentityMatrix(d, lambda);
    this.model.updateCount = 0;
  }

  // ==================== BaseLearner 接口方法 ====================

  /**
   * 获取模型状态（BaseLearner接口）
   */
  getState(): BanditModel {
    return this.getModel();
  }

  /**
   * 恢复模型状态（BaseLearner接口）
   */
  setState(state: BanditModel): void {
    this.setModel(state);
  }

  /**
   * 获取学习器名称
   */
  getName(): string {
    return LinUCB.NAME;
  }

  /**
   * 获取学习器版本
   */
  getVersion(): string {
    return LinUCB.VERSION;
  }

  /**
   * 获取学习器能力描述
   */
  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: true,
      requiresPretraining: false,
      minSamplesForReliability: 50,
      primaryUseCase: '基于上下文的动态策略选择，适合稳定期利用'
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 初始化单位矩阵 * lambda
   */
  private initIdentityMatrix(d: number, lambda: number): Float32Array {
    const I = new Float32Array(d * d);
    for (let i = 0; i < d; i++) {
      I[i * d + i] = lambda;
    }
    return I;
  }

  /**
   * 计算UCB分数（兼容旧方法）
   */
  private computeUCBScore(x: Float32Array): number {
    return this.computeUCBStats(x).score;
  }

  /**
   * 计算UCB统计量（新方法，返回详细信息）
   * 使用 Float64 进行高精度计算，提高数值稳定性
   */
  private computeUCBStats(x: Float32Array): {
    score: number;
    confidence: number;
    exploitation: number;
  } {
    // 转换为 Float64 进行高精度计算
    const L64 = Float64Array.from(this.model.L);
    const b64 = Float64Array.from(this.model.b);
    const x64 = Float64Array.from(x);

    const theta = this.solveLinearSystemHighPrecision(L64, b64, this.model.d);
    const exploitation = this.dotProductHighPrecision(theta, x64);
    const confidence = this.computeConfidenceHighPrecision(L64, x64);
    const score = exploitation + this.model.alpha * confidence;

    return { score, confidence, exploitation };
  }

  /**
   * 计算置信度 sqrt(x^T A^(-1) x)
   */
  private computeConfidence(L: Float32Array, x: Float32Array): number {
    const d = this.model.d;
    const y = new Float32Array(d);
    const minDiag = MIN_RANK1_DIAG;

    // Forward substitution: L y = x
    for (let i = 0; i < d; i++) {
      let sum = x[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i * d + j] * y[j];
      }
      y[i] = sum / Math.max(L[i * d + i], minDiag);
    }

    // ||y||^2
    let normSq = 0;
    for (let i = 0; i < d; i++) {
      normSq += y[i] * y[i];
    }

    const result = Math.sqrt(normSq);

    // 校验数值有效性，防止 NaN/Infinity 传播
    if (!Number.isFinite(result)) {
      return 0;
    }

    return result;
  }

  /**
   * 解线性方程组 (通过Cholesky分解)
   */
  private solveLinearSystem(L: Float32Array, b: Float32Array, d: number): Float32Array {
    const y = new Float32Array(d);
    const x = new Float32Array(d);
    const minDiag = MIN_RANK1_DIAG;

    // Forward substitution: L y = b
    for (let i = 0; i < d; i++) {
      let sum = b[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i * d + j] * y[j];
      }
      y[i] = sum / Math.max(L[i * d + i], minDiag);
    }

    // Backward substitution: L^T x = y
    for (let i = d - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < d; j++) {
        sum -= L[j * d + i] * x[j];
      }
      x[i] = sum / Math.max(L[i * d + i], minDiag);
    }

    // 校验数值有效性，防止 NaN/Infinity 传播
    for (let i = 0; i < d; i++) {
      if (!Number.isFinite(x[i])) {
        // 返回零向量作为安全回退
        return new Float32Array(d);
      }
    }

    return x;
  }

  /**
   * Cholesky分解: A = L L^T
   *
   * 修复问题#4: 不再原地修改输入矩阵A，而是先复制再处理
   *
   * 增强版：添加对称化处理和 SPD 失败回退，与math-utils实现对齐
   * 优化：内部使用 Float64 进行高精度计算，最终转回 Float32 存储
   *
   * @param A 输入矩阵
   * @param d 维度
   * @param lambda 正则化系数（可选，默认使用模型的lambda）
   */
  private choleskyDecompose(A: Float32Array, d: number, lambda?: number): Float32Array {
    // 使用传入的lambda或模型的lambda
    const effectiveLambda = Math.max(lambda ?? this.model.lambda, MIN_LAMBDA);

    // 使用 Float64 进行高精度计算
    const matrix = Float64Array.from(A);

    // 对称化处理：确保 matrix 是对称矩阵
    for (let i = 0; i < d; i++) {
      for (let j = i + 1; j < d; j++) {
        const avg = (matrix[i * d + j] + matrix[j * d + i]) / 2;
        matrix[i * d + j] = avg;
        matrix[j * d + i] = avg;
      }
    }

    const L64 = new Float64Array(d * d);
    const EPSILON = 1e-10;

    for (let i = 0; i < d; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = matrix[i * d + j];
        for (let k = 0; k < j; k++) {
          sum -= L64[i * d + k] * L64[j * d + k];
        }

        if (i === j) {
          // 对角元素为负或非有限数时，使用正则化修复
          if (sum <= EPSILON || !Number.isFinite(sum)) {
            sum = effectiveLambda + EPSILON;
          }
          L64[i * d + j] = Math.sqrt(Math.min(Math.max(sum, EPSILON), MAX_COVARIANCE));
        } else {
          // 非对角元素 - 使用与math-utils一致的分母下界
          const denom = Math.max(L64[j * d + j], Math.sqrt(effectiveLambda));
          L64[i * d + j] = sum / denom;
        }
      }
    }

    // 校验结果有效性 - 添加幅度检查
    for (let i = 0; i < L64.length; i++) {
      if (!Number.isFinite(L64[i]) || Math.abs(L64[i]) > Math.sqrt(MAX_COVARIANCE)) {
        // 分解失败，返回正则化单位矩阵
        amasLogger.warn('[LinUCB] Cholesky分解失败，回退到正则化单位矩阵');
        return this.initIdentityMatrix(d, effectiveLambda);
      }
    }

    // 转换回 Float32 存储
    return new Float32Array(L64);
  }

  /**
   * 点积
   */
  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * 高精度点积（使用 Float64）
   */
  private dotProductHighPrecision(a: Float64Array, b: Float64Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * 高精度置信度计算 sqrt(x^T A^(-1) x)
   * 使用 Float64 进行中间计算，提高数值稳定性
   */
  private computeConfidenceHighPrecision(L: Float64Array, x: Float64Array): number {
    const d = this.model.d;
    const y = new Float64Array(d);
    const minDiag = MIN_RANK1_DIAG;

    // Forward substitution: L y = x
    for (let i = 0; i < d; i++) {
      let sum = x[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i * d + j] * y[j];
      }
      y[i] = sum / Math.max(L[i * d + i], minDiag);
    }

    // ||y||^2
    let normSq = 0;
    for (let i = 0; i < d; i++) {
      normSq += y[i] * y[i];
    }

    const result = Math.sqrt(normSq);

    // 校验数值有效性，防止 NaN/Infinity 传播
    if (!Number.isFinite(result)) {
      return 0;
    }

    return result;
  }

  /**
   * 高精度线性方程组求解 (通过 Cholesky 分解)
   * 使用 Float64 进行中间计算，提高数值稳定性
   */
  private solveLinearSystemHighPrecision(L: Float64Array, b: Float64Array, d: number): Float64Array {
    const y = new Float64Array(d);
    const x = new Float64Array(d);
    const minDiag = MIN_RANK1_DIAG;

    // Forward substitution: L y = b
    for (let i = 0; i < d; i++) {
      let sum = b[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i * d + j] * y[j];
      }
      y[i] = sum / Math.max(L[i * d + i], minDiag);
    }

    // Backward substitution: L^T x = y
    for (let i = d - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < d; j++) {
        sum -= L[j * d + i] * x[j];
      }
      x[i] = sum / Math.max(L[i * d + i], minDiag);
    }

    // 校验数值有效性，防止 NaN/Infinity 传播
    for (let i = 0; i < d; i++) {
      if (!Number.isFinite(x[i])) {
        // 返回零向量作为安全回退
        return new Float64Array(d);
      }
    }

    return x;
  }

  /**
   * Zero padding扩展: 将旧维度模型扩展到新维度 (d=12 → d=22)
   * @param model 旧模型
   * @param targetD 目标维度
   * @param lambda 正则化系数
   * @returns 扩展后的模型
   */
  private expandModel(model: BanditModel, targetD: number, lambda: number): BanditModel {
    const sourceD = model.d;

    // 防御: 如果降维(sourceD > targetD),直接重置为新维度的单位矩阵
    if (sourceD > targetD) {
      amasLogger.warn({ from: sourceD, to: targetD }, '[LinUCB] 降维不支持，重置模型');
      return {
        d: targetD,
        lambda,
        alpha: model.alpha,
        A: this.initIdentityMatrix(targetD, lambda),
        b: new Float32Array(targetD),
        L: this.initIdentityMatrix(targetD, lambda),
        updateCount: 0
      };
    }

    // 升维(sourceD < targetD): 零填充
    const newA = this.initIdentityMatrix(targetD, lambda);
    const newB = new Float32Array(targetD);

    // 复制旧数据到新矩阵的左上角
    for (let i = 0; i < sourceD; i++) {
      newB[i] = model.b[i];
      for (let j = 0; j < sourceD; j++) {
        newA[i * targetD + j] = model.A[i * sourceD + j];
      }
    }

    // 重新Cholesky分解（使用新的lambda参数）
    const newL = this.choleskyDecompose(newA, targetD, lambda);

    return {
      d: targetD,
      lambda,
      alpha: model.alpha,
      A: newA,
      b: newB,
      L: newL,
      // 保留原始 updateCount，旧特征的学习进度仍然有价值
      // 新特征维度会通过后续更新自然学习
      // 仅在降维时重置为 0（见上方分支）
      updateCount: model.updateCount
    };
  }

  /**
   * 矫正异常特征向量幅度，防止溢出导致的数值问题
   */
  private sanitizeFeatureVector(vec: Float32Array): Float32Array {
    const bounded = new Float32Array(vec.length);
    let clipped = false;

    for (let i = 0; i < vec.length; i++) {
      let v = vec[i];
      if (!Number.isFinite(v)) {
        v = 0;
        clipped = true;
      } else if (Math.abs(v) > MAX_FEATURE_ABS) {
        v = Math.sign(v) * MAX_FEATURE_ABS;
        clipped = true;
      }
      bounded[i] = v;
    }

    if (clipped) {
      amasLogger.warn('[LinUCB] 特征向量存在异常幅度，已裁剪处理');
    }

    return bounded;
  }

  /**
   * 清理协方差矩阵的异常值并强制对称/正则化
   */
  private sanitizeCovariance(
    A: Float32Array,
    d: number,
    lambda: number
  ): Float32Array {
    const safe = new Float32Array(d * d);
    const diagFloor = Math.max(lambda, MIN_LAMBDA);
    let corrected = false;

    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        const idx = i * d + j;
        let v = A[idx];
        if (!Number.isFinite(v)) {
          v = i === j ? diagFloor : 0;
          corrected = true;
        } else if (Math.abs(v) > MAX_COVARIANCE) {
          v = clamp(v, -MAX_COVARIANCE, MAX_COVARIANCE);
          corrected = true;
        }
        safe[idx] = v;
      }
    }

    // 对称化
    for (let i = 0; i < d; i++) {
      for (let j = i + 1; j < d; j++) {
        const avg = (safe[i * d + j] + safe[j * d + i]) / 2;
        safe[i * d + j] = avg;
        safe[j * d + i] = avg;
      }
    }

    // 对角线下界
    for (let i = 0; i < d; i++) {
      const idx = i * d + i;
      if (safe[idx] < diagFloor) {
        safe[idx] = diagFloor;
        corrected = true;
      }
    }

    if (corrected) {
      amasLogger.warn('[LinUCB] 协方差矩阵存在异常值，已矫正后重分解');
    }

    return safe;
  }

  /**
   * 构建上下文特征向量 v2
   * 维度: d = 22 (状态5 + 错误1 + 动作5 + 交互1 + 时间3 + 处理键6 + bias1)
   */
  buildContextVector(input: ContextBuildInput): Float32Array {
    const { state, action, recentErrorRate, recentResponseTime, timeBucket } = input;
    const vec = new Float32Array(this.model.d);

    // 归一化反应时间
    const rtNorm = recentResponseTime > 0
      ? clamp(5000 / Math.max(recentResponseTime, 1000), 0, 2)
      : 0;

    // 时间特征 (norm + sin/cos)
    const { norm: timeNorm, sin: timeSin, cos: timeCos } = normalizeTimeFeatures(timeBucket);

    // 动作归一化
    const difficulty = normalizeDifficulty(action.difficulty);
    const hintNorm = normalizeHintLevel(action.hint_level);
    const batchNorm = normalizeBatchSize(action.batch_size);

    // 交叉特征 (处理键)
    const attentionFatigue = clamp(state.A * (1 - state.F), 0, 1);
    const motivationFatigue = clamp(state.M * (1 - state.F), -1, 1);
    const paceMatch = clamp(state.C.speed * action.interval_scale, 0, 2);
    const memoryNewRatio = clamp(state.C.mem * action.new_ratio, 0, 1);
    const fatigueLatency = clamp(state.F * rtNorm, 0, 2);
    const motivation01 = clamp((state.M + 1) / 2, 0, 1);
    const newRatioMotivation = clamp(action.new_ratio * motivation01, 0, 1);

    let idx = 0;
    const push = (v: number) => {
      if (idx < vec.length) {
        vec[idx] = v;
      }
      idx++;
    };

    // 状态特征 (5维)
    push(clamp(state.A, 0, 1));        // 注意力
    push(clamp(state.F, 0, 1));        // 疲劳度
    push(clamp(state.C.mem, 0, 1));    // 记忆力
    push(clamp(state.C.speed, 0, 1));  // 速度
    push(clamp(state.M, -1, 1));       // 动机

    // 错误率 (1维)
    push(clamp(recentErrorRate, 0, 1));

    // 动作特征 (5维)
    push(action.interval_scale);       // 间隔缩放
    push(action.new_ratio);            // 新词比例
    push(difficulty);                  // 难度等级 (0.2/0.5/0.8)
    push(hintNorm);                    // 提示级别 (0..1)
    push(batchNorm);                   // 批量大小归一化

    // 交互特征 (1维)
    push(rtNorm);                      // 近期反应时

    // 时间特征 (3维: norm + sin/cos)
    push(timeNorm);
    push(timeSin);
    push(timeCos);

    // 处理键 (6维: 交叉特征)
    push(attentionFatigue);            // 注意力 × (1-F)
    push(motivationFatigue);           // 动机 × (1-F)
    push(paceMatch);                   // 速度 × interval
    push(memoryNewRatio);              // 记忆 × new_ratio
    push(fatigueLatency);              // F × rt
    push(newRatioMotivation);          // new_ratio × motivation

    // bias项 (1维)
    push(1.0);

    return vec;
  }
}

// ==================== 导出默认实例 ====================

export const defaultLinUCB = new LinUCB();
