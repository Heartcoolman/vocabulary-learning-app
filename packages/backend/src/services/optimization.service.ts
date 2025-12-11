/**
 * AMAS Optimization Service
 * 优化服务
 *
 * 功能:
 * - 贝叶斯超参数优化（BayesianOptimizer）
 * - 参数推荐与评估记录
 * - 优化状态持久化
 */

import { BayesianOptimizerState as PrismaOptimizerState } from '@prisma/client';
import prisma from '../config/database';
import {
  BayesianOptimizer,
  BayesianOptimizerConfig,
  BayesianOptimizerState,
  ParamBound,
  Observation,
  defaultBayesianOptimizer,
} from '../amas';
import { logger } from '../logger';
import { isBayesianOptimizerEnabled } from '../amas/config/feature-flags';

// ==================== 类型定义 ====================

/** 参数边界（无name字段，用于对象形式参数空间） */
type ParamRange = Omit<ParamBound, 'name'>;

/** 优化参数空间定义 */
export interface OptimizationParamSpace {
  /** 复习间隔倍数 [0.5, 2.0] */
  interval_scale: ParamRange;
  /** 新词比例 [0.0, 0.5] */
  new_ratio: ParamRange;
  /** 难度等级 [1, 3] (low/mid/high) */
  difficulty: ParamRange;
  /** 提示级别 [0, 2] */
  hint_level: ParamRange;
}

/** 参数评估结果 */
export interface ParamEvaluationResult {
  params: Record<string, number>;
  value: number;
  timestamp: number;
}

/** 优化历史记录 */
export interface OptimizationHistory {
  observations: ParamEvaluationResult[];
  bestParams: Record<string, number> | null;
  bestValue: number | null;
  evaluationCount: number;
}

// ==================== 默认参数空间 ====================

const DEFAULT_PARAM_SPACE: OptimizationParamSpace = {
  interval_scale: { min: 0.5, max: 2.0 },
  new_ratio: { min: 0.0, max: 0.5 },
  difficulty: { min: 1, max: 3 },
  hint_level: { min: 0, max: 2 },
};

// ==================== 优化服务类 ====================

/**
 * 优化服务
 * 提供超参数自动调优功能
 */
export class OptimizationService {
  /** 贝叶斯优化器实例 */
  private optimizer: BayesianOptimizer | null = null;

  /** 优化器配置 */
  private config: BayesianOptimizerConfig;

  /** 优化任务状态 */
  private isOptimizing = false;

  /** 全局状态ID（单例模式） */
  private readonly GLOBAL_STATE_ID = 'global';

  constructor() {
    this.config = {
      maxEvaluations: 50,
      beta: 2.0,
      noiseVariance: 0.1,
    };

    // 异步初始化，添加错误处理避免 unhandled rejection
    this.initializeOptimizer().catch((err) => {
      // 在测试环境或 Prisma 不可用时静默处理
      if (process.env.NODE_ENV !== 'test') {
        logger.error({ err }, '[OptimizationService] 初始化失败');
      }
    });
  }

  /**
   * 将对象形式的参数空间转换为数组形式
   */
  private convertParamSpaceToArray(): ParamBound[] {
    return Object.entries(DEFAULT_PARAM_SPACE).map(([name, bound]) => ({
      name,
      min: bound.min,
      max: bound.max,
    }));
  }

  /**
   * 初始化优化器
   */
  private async initializeOptimizer(): Promise<void> {
    if (!isBayesianOptimizerEnabled()) {
      return;
    }

    // 将参数空间转换为数组形式并传入构造函数
    const paramSpace = this.convertParamSpaceToArray();
    this.optimizer = new BayesianOptimizer({
      ...this.config,
      paramSpace,
    });

    // 尝试从数据库恢复状态
    await this.loadState();
  }

  /**
   * 获取下一个推荐的参数组合
   * @returns 推荐参数或null（如果优化器未启用）
   */
  suggestNextParams(): Record<string, number> | null {
    if (!isBayesianOptimizerEnabled() || !this.optimizer) {
      return null;
    }

    // suggestNext 返回 number[]，需要转换为命名对象
    const paramsArray = this.optimizer.suggestNext();
    return this.optimizer.paramsToObject(paramsArray);
  }

  /**
   * 记录参数评估结果
   * @param params 参数组合
   * @param value 评估值（学习效果，越高越好）
   */
  async recordEvaluation(params: Record<string, number>, value: number): Promise<void> {
    if (!isBayesianOptimizerEnabled() || !this.optimizer) {
      return;
    }

    // 将命名对象转换为数组形式后记录到优化器
    const paramsArray = this.optimizer.objectToParams(params);
    this.optimizer.recordEvaluation(paramsArray, value);

    // 持久化状态
    await this.saveState();
  }

  /**
   * 获取当前最优参数
   * @returns 最优参数和值
   */
  getBestParams(): { params: Record<string, number>; value: number } | null {
    if (!isBayesianOptimizerEnabled() || !this.optimizer) {
      return null;
    }

    const best = this.optimizer.getBest();
    if (!best) {
      return null;
    }

    return {
      params: this.optimizer.paramsToObject(best.params),
      value: best.value,
    };
  }

  /**
   * 获取优化历史
   */
  getOptimizationHistory(): OptimizationHistory {
    if (!isBayesianOptimizerEnabled() || !this.optimizer) {
      return {
        observations: [],
        bestParams: null,
        bestValue: null,
        evaluationCount: 0,
      };
    }

    const state = this.optimizer.getState();

    return {
      observations: state.observations.map((obs) => ({
        params: this.optimizer!.paramsToObject(obs.params),
        value: obs.value,
        timestamp: obs.timestamp ?? Date.now(),
      })),
      bestParams: state.best ? this.optimizer.paramsToObject(state.best.params) : null,
      bestValue: state.best?.value ?? null,
      evaluationCount: state.observations.length,
    };
  }

  /**
   * 触发优化周期（定时任务调用）
   * 基于近期学习数据自动评估参数效果
   */
  async runOptimizationCycle(): Promise<{
    suggested: Record<string, number> | null;
    evaluated: boolean;
  }> {
    if (!isBayesianOptimizerEnabled() || !this.optimizer) {
      return { suggested: null, evaluated: false };
    }

    if (this.isOptimizing) {
      return { suggested: null, evaluated: false };
    }

    try {
      this.isOptimizing = true;

      // 获取推荐参数（转换为命名对象形式）
      const suggestedArray = this.optimizer.suggestNext();
      const suggested = this.optimizer.paramsToObject(suggestedArray);

      // 评估近期学习效果作为目标函数值
      const evaluationValue = await this.evaluateRecentLearningEffect();

      if (evaluationValue !== null && suggested) {
        // 记录评估结果
        await this.recordEvaluation(suggested, evaluationValue);
        return { suggested, evaluated: true };
      }

      return { suggested, evaluated: false };
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * 评估近期学习效果
   * 使用过去24小时的学习数据计算综合效果
   */
  private async evaluateRecentLearningEffect(): Promise<number | null> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 获取近24小时的学习记录
    const records = await prisma.answerRecord.findMany({
      where: {
        timestamp: { gte: oneDayAgo },
      },
      select: {
        isCorrect: true,
        responseTime: true,
      },
    });

    if (records.length < 10) {
      return null; // 数据不足
    }

    // 计算综合效果分数
    // 效果 = 正确率 * 0.6 + 速度分 * 0.4
    const correctCount = records.filter((r) => r.isCorrect).length;
    const accuracy = correctCount / records.length;

    const validResponseTimes = records
      .filter((r) => r.responseTime !== null && r.responseTime > 0)
      .map((r) => r.responseTime as number);

    let speedScore = 0.5; // 默认中等
    if (validResponseTimes.length > 0) {
      const avgResponseTime =
        validResponseTimes.reduce((a, b) => a + b, 0) / validResponseTimes.length;
      // 响应时间越短，分数越高（3秒最优，10秒以上最差）
      speedScore = Math.max(0, Math.min(1, 1 - (avgResponseTime - 3000) / 7000));
    }

    const effectScore = accuracy * 0.6 + speedScore * 0.4;

    return effectScore;
  }

  /**
   * 保存优化器状态到数据库
   */
  async saveState(): Promise<void> {
    if (!this.optimizer) {
      return;
    }

    const state = this.optimizer.getState();

    await prisma.bayesianOptimizerState.upsert({
      where: { id: this.GLOBAL_STATE_ID },
      create: {
        id: this.GLOBAL_STATE_ID,
        observations: state.observations as unknown as object,
        bestParams: (state.best?.params as unknown as object) ?? null,
        bestValue: state.best?.value ?? null,
        evaluationCount: state.observations.length,
      },
      update: {
        observations: state.observations as unknown as object,
        bestParams: (state.best?.params as unknown as object) ?? null,
        bestValue: state.best?.value ?? null,
        evaluationCount: state.observations.length,
      },
    });
  }

  /**
   * 从数据库恢复优化器状态
   */
  async loadState(): Promise<void> {
    if (!this.optimizer) {
      return;
    }

    const saved = await prisma.bayesianOptimizerState.findUnique({
      where: { id: this.GLOBAL_STATE_ID },
    });

    if (saved && saved.observations) {
      const observations = saved.observations as unknown as Observation[];

      // 重放历史观测（params 已经是 number[] 格式）
      for (const obs of observations) {
        if (obs.params && typeof obs.value === 'number') {
          this.optimizer.recordEvaluation(obs.params, obs.value);
        }
      }
    }
  }

  /**
   * 重置优化器状态
   */
  async resetOptimizer(): Promise<void> {
    if (!isBayesianOptimizerEnabled()) {
      return;
    }

    // 重新创建优化器实例，传入正确的参数空间
    const paramSpace = this.convertParamSpaceToArray();
    this.optimizer = new BayesianOptimizer({
      ...this.config,
      paramSpace,
    });

    // 清除数据库状态
    await prisma.bayesianOptimizerState.deleteMany({
      where: { id: this.GLOBAL_STATE_ID },
    });
  }

  /**
   * 获取参数空间定义
   */
  getParamSpace(): OptimizationParamSpace {
    return { ...DEFAULT_PARAM_SPACE };
  }

  /**
   * 检查优化器是否已启用
   */
  isEnabled(): boolean {
    return isBayesianOptimizerEnabled() && this.optimizer !== null;
  }

  /**
   * 获取优化器诊断信息
   */
  getDiagnostics(): {
    enabled: boolean;
    isOptimizing: boolean;
    evaluationCount: number;
    paramSpace: OptimizationParamSpace;
    bestParams: Record<string, number> | null;
    bestValue: number | null;
  } {
    const history = this.getOptimizationHistory();

    return {
      enabled: this.isEnabled(),
      isOptimizing: this.isOptimizing,
      evaluationCount: history.evaluationCount,
      paramSpace: this.getParamSpace(),
      bestParams: history.bestParams,
      bestValue: history.bestValue,
    };
  }
}

// 导出单例
export const optimizationService = new OptimizationService();
