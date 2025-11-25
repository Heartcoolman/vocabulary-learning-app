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
  StrategyParams,
  UserState
} from '../types';
import {
  DEFAULT_ALPHA,
  DEFAULT_DIMENSION,
  DEFAULT_LAMBDA,
  CHOLESKY_RECOMPUTE_INTERVAL,
  ACTION_SPACE
} from '../config/action-space';

// ==================== 类型定义 ====================

/**
 * 特征构建输入
 */
export interface ContextBuildInput {
  state: UserState;
  action: Action;
  recentErrorRate: number;
  recentResponseTime: number;
  timeBucket: number;
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
export class LinUCB {
  private model: BanditModel;

  constructor(opts: LinUCBOptions = {}) {
    const d = opts.dimension ?? DEFAULT_DIMENSION;
    const lambda = opts.lambda ?? DEFAULT_LAMBDA;
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
   * 选择最优动作
   *
   * 修复问题#13: 添加空数组检查，防止崩溃
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: {
      recentErrorRate: number;
      recentResponseTime: number;
      timeBucket: number;
    }
  ): Action {
    // 修复#13: 空数组检查
    if (!actions || actions.length === 0) {
      throw new Error('[LinUCB] actions array must not be empty');
    }

    let bestAction: Action | null = null;
    let bestScore = -Number.MAX_VALUE;

    for (const action of actions) {
      const x = this.buildContextVector({
        state,
        action,
        recentErrorRate: context.recentErrorRate,
        recentResponseTime: context.recentResponseTime,
        timeBucket: context.timeBucket
      });

      const score = this.computeUCBScore(x);

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestAction ?? actions[0];
  }

  /**
   * 使用默认动作空间选择
   */
  selectFromActionSpace(
    state: UserState,
    context: {
      recentErrorRate: number;
      recentResponseTime: number;
      timeBucket: number;
    }
  ): Action {
    return this.selectAction(state, ACTION_SPACE, context);
  }

  /**
   * 更新模型
   */
  update(
    state: UserState,
    action: Action,
    reward: number,
    context: {
      recentErrorRate: number;
      recentResponseTime: number;
      timeBucket: number;
    }
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
   * 修复问题#7: 添加数值稳定性检查，防止A矩阵变得奇异
   *
   * @param featureVector 特征向量 (d维Float32Array或数组)
   * @param reward 奖励值
   */
  updateWithFeatureVector(
    featureVector: Float32Array | number[],
    reward: number
  ): void {
    const x = featureVector instanceof Float32Array
      ? featureVector
      : new Float32Array(featureVector);

    const { d, A, b, lambda } = this.model;

    // 验证维度匹配
    if (x.length !== d) {
      throw new Error(
        `[LinUCB] 特征向量维度不匹配: expected d=${d}, got ${x.length}`
      );
    }

    // 验证特征向量的数值有效性
    for (let i = 0; i < d; i++) {
      if (!Number.isFinite(x[i])) {
        console.warn('[LinUCB] 特征向量包含无效值，跳过更新');
        return;
      }
    }

    // 验证奖励值的有效性
    if (!Number.isFinite(reward)) {
      console.warn('[LinUCB] 奖励值无效，跳过更新');
      return;
    }

    // A += x x^T
    for (let i = 0; i < d; i++) {
      const xi = x[i];
      for (let j = 0; j < d; j++) {
        A[i * d + j] += xi * x[j];
      }
    }

    // b += r * x
    for (let i = 0; i < d; i++) {
      b[i] += reward * x[i];
    }

    this.model.updateCount++;

    // 检查A矩阵的对角线元素，防止数值不稳定
    // 如果对角线元素过小，增加正则化
    let needsRegularization = false;
    for (let i = 0; i < d; i++) {
      const diag = A[i * d + i];
      if (!Number.isFinite(diag) || diag < lambda * 0.1) {
        needsRegularization = true;
        break;
      }
    }

    if (needsRegularization) {
      console.warn('[LinUCB] 检测到A矩阵不稳定，应用正则化修复');
      for (let i = 0; i < d; i++) {
        // 确保对角线元素至少为lambda
        if (A[i * d + i] < lambda) {
          A[i * d + i] = lambda;
        }
      }
    }

    // 每次更新后重新Cholesky分解（确保L与A同步）
    this.model.L = this.choleskyDecompose(A, d);
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

    // 如果模型维度不匹配,自动扩展 (d=12 → d=22)
    if (model.d !== targetD) {
      console.log(`[LinUCB] 迁移模型: d=${model.d} → d=${targetD}`);
      this.model = this.expandModel(model, targetD, model.lambda ?? DEFAULT_LAMBDA);
      return;
    }

    // 维度匹配,直接加载
    this.model = {
      d: model.d,
      lambda: model.lambda,
      alpha: model.alpha,
      A: new Float32Array(model.A),
      b: new Float32Array(model.b),
      L: new Float32Array(model.L),
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
   * 计算UCB分数
   */
  private computeUCBScore(x: Float32Array): number {
    const theta = this.solveLinearSystem(this.model.L, this.model.b, this.model.d);
    const exploitation = this.dotProduct(theta, x);
    const confidence = this.computeConfidence(this.model.L, x);
    return exploitation + this.model.alpha * confidence;
  }

  /**
   * 计算置信度 sqrt(x^T A^(-1) x)
   */
  private computeConfidence(L: Float32Array, x: Float32Array): number {
    const d = this.model.d;
    const y = new Float32Array(d);

    // Forward substitution: L y = x
    for (let i = 0; i < d; i++) {
      let sum = x[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i * d + j] * y[j];
      }
      y[i] = sum / Math.max(L[i * d + i], 1e-10);
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

    // Forward substitution: L y = b
    for (let i = 0; i < d; i++) {
      let sum = b[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i * d + j] * y[j];
      }
      y[i] = sum / Math.max(L[i * d + i], 1e-10);
    }

    // Backward substitution: L^T x = y
    for (let i = d - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < d; j++) {
        sum -= L[j * d + i] * x[j];
      }
      x[i] = sum / Math.max(L[i * d + i], 1e-10);
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
   * 增强版：添加对称化处理和 SPD 失败回退
   */
  private choleskyDecompose(A: Float32Array, d: number): Float32Array {
    // 修复#4: 复制矩阵，避免原地修改输入
    const matrix = new Float32Array(A);

    // 对称化处理：确保 matrix 是对称矩阵
    for (let i = 0; i < d; i++) {
      for (let j = i + 1; j < d; j++) {
        const avg = (matrix[i * d + j] + matrix[j * d + i]) / 2;
        matrix[i * d + j] = avg;
        matrix[j * d + i] = avg;
      }
    }

    const L = new Float32Array(d * d);

    for (let i = 0; i < d; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = matrix[i * d + j];
        for (let k = 0; k < j; k++) {
          sum -= L[i * d + k] * L[j * d + k];
        }

        if (i === j) {
          // 对角元素为负或非有限数时，使用正则化修复
          if (sum <= 1e-9 || !Number.isFinite(sum)) {
            sum = this.model.lambda + 1e-6;
          }
          L[i * d + j] = Math.sqrt(Math.max(sum, 1e-9));
        } else {
          L[i * d + j] = sum / Math.max(L[j * d + j], 1e-10);
        }
      }
    }

    // 校验结果有效性
    for (let i = 0; i < L.length; i++) {
      if (!Number.isFinite(L[i])) {
        // 分解失败，返回正则化单位矩阵
        console.warn('[LinUCB] Cholesky分解失败，回退到正则化单位矩阵');
        return this.initIdentityMatrix(d, this.model.lambda);
      }
    }

    return L;
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
      console.warn(`[LinUCB] 降维不支持: d=${sourceD} → d=${targetD},重置模型`);
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

    // 重新Cholesky分解
    const newL = this.choleskyDecompose(newA, targetD);

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
