/**
 * Offline Replay Evaluation - 离线重放评估
 * 使用历史数据评估不同策略的效果
 */

import { UserState, StrategyParams } from '../types';

/**
 * 历史交互记录
 */
export interface HistoricalRecord {
  /** 用户ID */
  userId: string;
  /** 时间戳 */
  timestamp: number;
  /** 用户状态 */
  state: UserState;
  /** 上下文特征 */
  context: Record<string, any>;
  /** 实际采取的策略 */
  actionTaken: StrategyParams;
  /** 实际获得的奖励 */
  rewardReceived: number;
  /** 可能的所有动作及其奖励 (如果可用) */
  allActions?: Array<{ strategy: StrategyParams; reward: number }>;
}

/**
 * 策略评估器接口
 */
export interface PolicyEvaluator {
  /** 根据状态选择策略 */
  selectStrategy(state: UserState, context: Record<string, any>): StrategyParams;
  /** 估计策略的期望奖励 */
  estimateReward?(state: UserState, strategy: StrategyParams): number;
}

/**
 * 评估结果
 */
export interface EvaluationResult {
  /** 策略名称 */
  policyName: string;
  /** 评估的记录数 */
  recordCount: number;
  /** 平均奖励 */
  averageReward: number;
  /** 累积奖励 */
  cumulativeReward: number;
  /** 累积遗憾 (与最优策略的差距) */
  cumulativeRegret: number;
  /** 标准差 */
  rewardStdDev: number;
  /** 置信区间 (95%) */
  confidenceInterval: [number, number];
  /** 分段统计 */
  segmentStats: SegmentStats[];
}

/**
 * 分段统计
 */
export interface SegmentStats {
  /** 时间段描述 */
  segment: string;
  /** 记录数 */
  count: number;
  /** 平均奖励 */
  averageReward: number;
  /** 改进率 (相对于基准) */
  improvement?: number;
}

/**
 * 离线重放评估器
 */
export class OfflineReplayEvaluator {
  /**
   * 评估单个策略
   */
  evaluate(
    policyName: string,
    policy: PolicyEvaluator,
    historicalData: HistoricalRecord[]
  ): EvaluationResult {
    const rewards: number[] = [];
    const optimalRewards: number[] = [];
    const segmentSize = Math.floor(historicalData.length / 10); // 10个时间段
    const segmentRewards: number[][] = Array.from({ length: 10 }, () => []);

    for (let i = 0; i < historicalData.length; i++) {
      const record = historicalData[i];

      // 使用策略选择动作
      const selectedStrategy = policy.selectStrategy(record.state, record.context);

      // 估计奖励 (使用逆倾向评分或直接方法)
      const estimatedReward = this.estimateReward(record, selectedStrategy, policy);
      rewards.push(estimatedReward);

      // 估计最优奖励
      const optimalReward = this.estimateOptimalReward(record);
      optimalRewards.push(optimalReward);

      // 记录分段数据
      const segmentIndex = Math.floor(i / segmentSize);
      if (segmentIndex < 10) {
        segmentRewards[segmentIndex].push(estimatedReward);
      }
    }

    // 计算统计量
    const averageReward = this.mean(rewards);
    const cumulativeReward = this.sum(rewards);
    const cumulativeRegret = this.sum(optimalRewards) - cumulativeReward;
    const rewardStdDev = this.stdDev(rewards);
    const confidenceInterval = this.calculateCI(rewards, 0.95);

    // 计算分段统计
    const segmentStats: SegmentStats[] = segmentRewards.map((segmentReward, idx) => ({
      segment: `Segment ${idx + 1}`,
      count: segmentReward.length,
      averageReward: this.mean(segmentReward)
    }));

    return {
      policyName,
      recordCount: historicalData.length,
      averageReward,
      cumulativeReward,
      cumulativeRegret,
      rewardStdDev,
      confidenceInterval,
      segmentStats
    };
  }

  /**
   * 比较多个策略
   */
  comparePolicies(
    policies: Array<{ name: string; evaluator: PolicyEvaluator }>,
    historicalData: HistoricalRecord[]
  ): ComparisonResult {
    const results = policies.map(({ name, evaluator }) =>
      this.evaluate(name, evaluator, historicalData)
    );

    // 找出最佳策略
    const bestPolicy = results.reduce((best, current) =>
      current.averageReward > best.averageReward ? current : best
    );

    // 计算相对改进
    const baselineReward = results[0].averageReward;
    const improvements = results.map(r => ({
      policyName: r.policyName,
      absoluteImprovement: r.averageReward - baselineReward,
      relativeImprovement: ((r.averageReward - baselineReward) / Math.abs(baselineReward)) * 100
    }));

    return {
      results,
      bestPolicy,
      improvements,
      summary: this.generateSummary(results)
    };
  }

  /**
   * 估计奖励 (逆倾向评分 - Inverse Propensity Scoring)
   */
  private estimateReward(
    record: HistoricalRecord,
    selectedStrategy: StrategyParams,
    policy: PolicyEvaluator
  ): number {
    // 简化实现: 如果策略选择与实际一致,使用实际奖励
    // 否则使用模型估计 (如果可用)
    if (this.strategiesMatch(selectedStrategy, record.actionTaken)) {
      return record.rewardReceived;
    }

    // 使用模型估计 (如果可用)
    if (policy.estimateReward) {
      return policy.estimateReward(record.state, selectedStrategy);
    }

    // 如果有所有动作的奖励,直接使用
    if (record.allActions) {
      const matchingAction = record.allActions.find(a =>
        this.strategiesMatch(a.strategy, selectedStrategy)
      );
      if (matchingAction) {
        return matchingAction.reward;
      }
    }

    // 默认: 返回0 (保守估计)
    return 0;
  }

  /**
   * 估计最优奖励
   */
  private estimateOptimalReward(record: HistoricalRecord): number {
    if (record.allActions && record.allActions.length > 0) {
      return Math.max(...record.allActions.map(a => a.reward));
    }
    return record.rewardReceived; // 假设实际奖励接近最优
  }

  /**
   * 判断两个策略是否匹配
   */
  private strategiesMatch(s1: StrategyParams, s2: StrategyParams): boolean {
    return (
      Math.abs(s1.interval_scale - s2.interval_scale) < 0.1 &&
      Math.abs(s1.new_ratio - s2.new_ratio) < 0.05 &&
      s1.difficulty === s2.difficulty &&
      Math.abs(s1.batch_size - s2.batch_size) <= 2 &&
      s1.hint_level === s2.hint_level
    );
  }

  /**
   * 计算平均值
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 计算总和
   */
  private sum(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0);
  }

  /**
   * 计算标准差
   */
  private stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * 计算置信区间
   */
  private calculateCI(values: number[], confidence: number): [number, number] {
    if (values.length === 0) return [0, 0];
    const mean = this.mean(values);
    const stdDev = this.stdDev(values);
    const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;
    const margin = z * (stdDev / Math.sqrt(values.length));
    return [mean - margin, mean + margin];
  }

  /**
   * 生成摘要
   */
  private generateSummary(results: EvaluationResult[]): string {
    const best = results.reduce((b, r) => (r.averageReward > b.averageReward ? r : b));
    const worst = results.reduce((w, r) => (r.averageReward < w.averageReward ? r : w));
    const improvement = ((best.averageReward - worst.averageReward) / Math.abs(worst.averageReward)) * 100;

    return `Evaluated ${results.length} policies. Best: ${best.policyName} (avg reward: ${best.averageReward.toFixed(3)}). Improvement over worst: ${improvement.toFixed(1)}%.`;
  }
}

/**
 * 比较结果
 */
export interface ComparisonResult {
  /** 所有策略的评估结果 */
  results: EvaluationResult[];
  /** 最佳策略 */
  bestPolicy: EvaluationResult;
  /** 改进统计 */
  improvements: Array<{
    policyName: string;
    absoluteImprovement: number;
    relativeImprovement: number;
  }>;
  /** 摘要文本 */
  summary: string;
}

/**
 * 创建默认离线评估器
 */
export function createOfflineEvaluator(): OfflineReplayEvaluator {
  return new OfflineReplayEvaluator();
}
