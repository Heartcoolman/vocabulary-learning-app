/**
 * AMAS Algorithm Router
 *
 * 负责算法选择的A/B测试路由
 */

import { ABTestEngine } from '../evaluation/ab-testing';
import { LinUCB } from '../learning/linucb';
import { ThompsonSampling } from '../learning/thompson-sampling';
import { THOMPSON_VS_LINUCB_EXPERIMENT } from '../experiments/thompson-vs-linucb';

export type AlgorithmType = 'linucb' | 'thompson';

// 实验ID常量（与experiments配置文件保持一致）
const EXPERIMENT_ID = 'thompson_vs_linucb_2024';

export class AlgorithmRouter {
  private abTestEngine: ABTestEngine;
  private isInitialized: boolean = false;

  constructor() {
    this.abTestEngine = new ABTestEngine();
  }

  /**
   * 初始化实验（延迟初始化，避免循环依赖）
   */
  private initializeExperiments() {
    if (this.isInitialized) return;

    try {
      const created = this.abTestEngine.createExperiment(THOMPSON_VS_LINUCB_EXPERIMENT);
      this.abTestEngine.startExperiment(created.id);
      this.isInitialized = true;
    } catch (e) {
      // 实验可能已存在，忽略错误
      this.isInitialized = true;
    }
  }

  /**
   * 为用户选择算法
   *
   * @param userId 用户ID
   * @returns 选中的算法类型
   */
  selectAlgorithm(userId: string): AlgorithmType {
    this.initializeExperiments();

    try {
      const variant = this.abTestEngine.assignVariant(EXPERIMENT_ID, userId);
      return variant.parameters.algorithm as AlgorithmType;
    } catch (error) {
      // 实验未激活或出错，默认LinUCB
      return 'linucb';
    }
  }

  /**
   * 创建算法学习器实例
   *
   * @param algorithm 算法类型
   * @param config 配置参数
   * @returns 学习器实例
   */
  createLearner(
    algorithm: AlgorithmType,
    config?: { dimension?: number; alpha?: number; lambda?: number }
  ): LinUCB | ThompsonSampling {
    if (algorithm === 'thompson') {
      // Thompson Sampling使用默认配置
      return new ThompsonSampling({
        priorAlpha: 1.0,
        priorBeta: 1.0
      });
    }

    // LinUCB使用传入的配置
    const linucbConfig = {
      dimension: config?.dimension || 22,
      alpha: config?.alpha || 0.7,
      lambda: config?.lambda || 1.0
    };

    return new LinUCB(linucbConfig);
  }

  /**
   * 记录决策指标到A/B测试
   *
   * @param userId 用户ID
   * @param metrics 决策指标
   */
  recordMetrics(
    userId: string,
    metrics: {
      reward: number;
      accuracy: number;
      duration: number;
    }
  ): void {
    if (!this.isInitialized) return;

    try {
      // 使用assignVariant来获取用户变体（会自动处理分配）
      const variant = this.abTestEngine.assignVariant(EXPERIMENT_ID, userId);

      if (!variant) return;

      this.abTestEngine.recordMetrics(EXPERIMENT_ID, variant.id, {
        primaryMetric: metrics.reward,
        sampleCount: 1,
        averageReward: metrics.reward,
        secondaryMetrics: {
          accuracy: metrics.accuracy,
          retention: 1, // 简化：用户继续学习 = 1
          session_duration: metrics.duration
        }
      });
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn('Failed to record A/B test metrics:', error);
    }
  }

  /**
   * 获取实验分析结果
   *
   * @returns 实验分析结果
   */
  analyzeExperiment() {
    this.initializeExperiments();
    return this.abTestEngine.analyzeExperiment(EXPERIMENT_ID);
  }

  /**
   * 检查实验是否激活
   */
  isExperimentActive(): boolean {
    return this.isInitialized;
  }

  /**
   * 获取用户当前变体
   */
  getUserVariant(userId: string) {
    if (!this.isInitialized) return null;

    try {
      return this.abTestEngine.assignVariant(EXPERIMENT_ID, userId);
    } catch (error) {
      return null;
    }
  }
}

// 单例导出
export const algorithmRouter = new AlgorithmRouter();
