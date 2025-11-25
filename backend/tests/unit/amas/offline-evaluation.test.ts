/**
 * Offline Replay Evaluation Tests
 * 离线重放评估单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OfflineReplayEvaluator,
  HistoricalRecord,
  PolicyEvaluator,
  createOfflineEvaluator
} from '../../../src/amas/evaluation';
import { UserState, StrategyParams } from '../../../src/amas/types';

describe('OfflineReplayEvaluator', () => {
  let evaluator: OfflineReplayEvaluator;
  let mockHistoricalData: HistoricalRecord[];

  beforeEach(() => {
    evaluator = createOfflineEvaluator();

    // 创建模拟历史数据
    mockHistoricalData = [];
    for (let i = 0; i < 100; i++) {
      mockHistoricalData.push({
        userId: `user_${i % 10}`,
        timestamp: Date.now() - (100 - i) * 1000,
        state: {
          A: 0.5 + Math.random() * 0.3,
          F: Math.random() * 0.5,
          M: Math.random() * 0.4 - 0.2,
          C: {
            mem: 0.7 + Math.random() * 0.2,
            lex: 0.6,
            pho: 0.65,
            sem: 0.7
          },
          history: [],
          env: {
            device: 'mobile',
            network: '4g',
            appVersion: '1.0.0'
          }
        },
        context: {
          timeOfDay: Math.floor(Math.random() * 24),
          dayOfWeek: Math.floor(Math.random() * 7)
        },
        actionTaken: {
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1
        },
        rewardReceived: Math.random() * 0.5 + 0.5 // 0.5-1.0
      });
    }
  });

  describe('单策略评估', () => {
    it('应该评估单个策略', () => {
      const mockPolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1
        })
      };

      const result = evaluator.evaluate('TestPolicy', mockPolicy, mockHistoricalData);

      expect(result.policyName).toBe('TestPolicy');
      expect(result.recordCount).toBe(100);
      expect(result.averageReward).toBeGreaterThan(0);
      expect(result.cumulativeReward).toBeGreaterThan(0);
      expect(result.confidenceInterval).toHaveLength(2);
      expect(result.segmentStats).toHaveLength(10);
    });

    it('应该计算正确的统计量', () => {
      const fixedRewardPolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1
        }),
        estimateReward: () => 0.8 // 固定奖励
      };

      const result = evaluator.evaluate('FixedPolicy', fixedRewardPolicy, mockHistoricalData);

      // 由于部分记录会使用实际奖励,平均值应该接近但不完全等于0.8
      expect(result.averageReward).toBeGreaterThan(0.5);
      expect(result.averageReward).toBeLessThan(1.0);
    });

    it('应该计算置信区间', () => {
      const mockPolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1
        })
      };

      const result = evaluator.evaluate('TestPolicy', mockPolicy, mockHistoricalData);

      const [lower, upper] = result.confidenceInterval;
      expect(lower).toBeLessThan(result.averageReward);
      expect(upper).toBeGreaterThan(result.averageReward);
      expect(upper - lower).toBeGreaterThan(0);
    });
  });

  describe('多策略比较', () => {
    it('应该比较多个策略', () => {
      const conservativePolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.2,
          new_ratio: 0.1,
          difficulty: 'easy',
          batch_size: 6,
          hint_level: 2
        }),
        estimateReward: () => 0.7
      };

      const aggressivePolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 0.8,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 15,
          hint_level: 0
        }),
        estimateReward: () => 0.75
      };

      const result = evaluator.comparePolicies(
        [
          { name: 'Conservative', evaluator: conservativePolicy },
          { name: 'Aggressive', evaluator: aggressivePolicy }
        ],
        mockHistoricalData
      );

      expect(result.results).toHaveLength(2);
      expect(result.bestPolicy).toBeDefined();
      expect(result.improvements).toHaveLength(2);
      expect(result.summary).toContain('Evaluated 2 policies');
    });

    it('应该正确识别最佳策略', () => {
      const goodPolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1
        }),
        estimateReward: () => 0.9 // 高奖励
      };

      const badPolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.0,
          new_ratio: 0.5,
          difficulty: 'hard',
          batch_size: 20,
          hint_level: 0
        }),
        estimateReward: () => 0.5 // 低奖励
      };

      const result = evaluator.comparePolicies(
        [
          { name: 'Good', evaluator: goodPolicy },
          { name: 'Bad', evaluator: badPolicy }
        ],
        mockHistoricalData
      );

      expect(result.bestPolicy.policyName).toBe('Good');
      expect(result.bestPolicy.averageReward).toBeGreaterThan(
        result.results.find(r => r.policyName === 'Bad')!.averageReward
      );
    });

    it('应该计算相对改进', () => {
      const baseline: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.2,
          new_ratio: 0.1,
          difficulty: 'easy',
          batch_size: 6,
          hint_level: 2
        }),
        estimateReward: () => 0.7
      };

      const improved: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 0.9,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 12,
          hint_level: 0
        }),
        estimateReward: () => 0.85 // 21%改进
      };

      const result = evaluator.comparePolicies(
        [
          { name: 'Baseline', evaluator: baseline },
          { name: 'Improved', evaluator: improved }
        ],
        mockHistoricalData
      );

      const improvedPolicyImprovement = result.improvements.find(i => i.policyName === 'Improved');
      expect(improvedPolicyImprovement?.absoluteImprovement).toBeGreaterThanOrEqual(0);
      expect(improvedPolicyImprovement?.relativeImprovement).toBeGreaterThanOrEqual(0);
    });
  });

  describe('分段统计', () => {
    it('应该生成时间分段统计', () => {
      const mockPolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1
        })
      };

      const result = evaluator.evaluate('TestPolicy', mockPolicy, mockHistoricalData);

      expect(result.segmentStats).toHaveLength(10);
      result.segmentStats.forEach(segment => {
        expect(segment.count).toBeGreaterThan(0);
        expect(segment.averageReward).toBeGreaterThan(0);
      });
    });
  });

  describe('累积遗憾计算', () => {
    it('应该计算累积遗憾', () => {
      const suboptimalPolicy: PolicyEvaluator = {
        selectStrategy: () => ({
          interval_scale: 1.0,
          new_ratio: 0.1,
          difficulty: 'easy',
          batch_size: 5,
          hint_level: 2
        }),
        estimateReward: () => 0.6 // 次优策略
      };

      const result = evaluator.evaluate('Suboptimal', suboptimalPolicy, mockHistoricalData);

      expect(result.cumulativeRegret).toBeGreaterThanOrEqual(0);
    });
  });
});
