/**
 * A/B Testing Platform Tests
 * A/B测试平台单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ABTestEngine,
  ABTestConfig,
  ABVariant,
  createABTestEngine
} from '../../../src/amas/evaluation';

describe('ABTestEngine', () => {
  let engine: ABTestEngine;

  beforeEach(() => {
    engine = createABTestEngine();
  });

  describe('实验创建', () => {
    it('应该创建新实验', () => {
      const config = engine.createExperiment({
        name: 'Test Experiment',
        description: 'Testing A/B framework',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: { strategy: 'conservative' }
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: { strategy: 'aggressive' }
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: true
      });

      expect(config.id).toBeTruthy();
      expect(config.status).toBe('draft');
      expect(config.variants).toHaveLength(2);
    });

    it('应该验证变体权重总和为1', () => {
      expect(() => {
        engine.createExperiment({
          name: 'Invalid Experiment',
          description: 'Invalid weights',
          variants: [
            {
              id: 'control',
              name: 'Control',
              weight: 0.6,
              isControl: true,
              parameters: {}
            },
            {
              id: 'treatment',
              name: 'Treatment',
              weight: 0.6,
              isControl: false,
              parameters: {}
            }
          ],
          trafficAllocation: 'even',
          minSampleSize: 100,
          significanceLevel: 0.05,
          minimumDetectableEffect: 0.05,
          autoDecision: false
        });
      }).toThrow('Variant weights must sum to 1');
    });

    it('应该验证至少有一个对照组', () => {
      expect(() => {
        engine.createExperiment({
          name: 'No Control',
          description: 'No control variant',
          variants: [
            {
              id: 'treatment1',
              name: 'Treatment 1',
              weight: 0.5,
              isControl: false,
              parameters: {}
            },
            {
              id: 'treatment2',
              name: 'Treatment 2',
              weight: 0.5,
              isControl: false,
              parameters: {}
            }
          ],
          trafficAllocation: 'even',
          minSampleSize: 100,
          significanceLevel: 0.05,
          minimumDetectableEffect: 0.05,
          autoDecision: false
        });
      }).toThrow('At least one variant must be marked as control');
    });
  });

  describe('实验启动', () => {
    it('应该启动实验', () => {
      const config = engine.createExperiment({
        name: 'Test Experiment',
        description: 'Test',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      const retrieved = engine.getExperiment(config.id);
      expect(retrieved?.status).toBe('running');
    });

    it('不应该重复启动实验', () => {
      const config = engine.createExperiment({
        name: 'Test',
        description: 'Test',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      expect(() => engine.startExperiment(config.id)).toThrow('already running');
    });
  });

  describe('流量分配', () => {
    it('应该根据权重分配用户', () => {
      const config = engine.createExperiment({
        name: 'Traffic Test',
        description: 'Test traffic allocation',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      // 测试1000次,大约500次应该分配到每个变体
      const controlCount = { count: 0 };
      const treatmentCount = { count: 0 };

      for (let i = 0; i < 1000; i++) {
        const variant = engine.assignVariant(config.id, `user_${i}`);
        if (variant.id === 'control') {
          controlCount.count++;
        } else {
          treatmentCount.count++;
        }
      }

      expect(controlCount.count).toBeGreaterThan(400);
      expect(controlCount.count).toBeLessThan(600);
      expect(treatmentCount.count).toBeGreaterThan(400);
      expect(treatmentCount.count).toBeLessThan(600);
    });

    it('应该为同一用户返回相同的变体', () => {
      const config = engine.createExperiment({
        name: 'Consistency Test',
        description: 'Test assignment consistency',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      const variant1 = engine.assignVariant(config.id, 'user_123');
      const variant2 = engine.assignVariant(config.id, 'user_123');
      const variant3 = engine.assignVariant(config.id, 'user_123');

      expect(variant1.id).toBe(variant2.id);
      expect(variant2.id).toBe(variant3.id);
    });
  });

  describe('指标记录', () => {
    it('应该记录变体指标', () => {
      const config = engine.createExperiment({
        name: 'Metrics Test',
        description: 'Test metrics recording',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      engine.recordMetrics(config.id, 'control', {
        sampleCount: 10,
        primaryMetric: 0.75,
        averageReward: 0.75,
        stdDev: 0.1
      });

      // 验证指标被记录(通过分析接口)
      expect(() => engine.analyzeExperiment(config.id)).not.toThrow();
    });
  });

  describe('实验分析', () => {
    it('应该分析实验结果', () => {
      const config = engine.createExperiment({
        name: 'Analysis Test',
        description: 'Test experiment analysis',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 10,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      // 记录对照组指标
      engine.recordMetrics(config.id, 'control', {
        sampleCount: 20,
        primaryMetric: 0.70,
        averageReward: 0.70,
        stdDev: 0.1
      });

      // 记录处理组指标(显著改进)
      engine.recordMetrics(config.id, 'treatment', {
        sampleCount: 20,
        primaryMetric: 0.85,
        averageReward: 0.85,
        stdDev: 0.1
      });

      const result = engine.analyzeExperiment(config.id);

      expect(result.variantMetrics).toHaveLength(2);
      expect(result.significanceTest).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });

    it('应该推荐部署获胜变体', () => {
      const config = engine.createExperiment({
        name: 'Winner Test',
        description: 'Test winner detection',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 50,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      // 对照组: 低性能
      // m2 = variance * (n - 1) = stdDev^2 * (100 - 1) = 0.0064 * 99 = 0.6336
      engine.recordMetrics(config.id, 'control', {
        sampleCount: 100,
        primaryMetric: 0.60,
        averageReward: 0.60,
        stdDev: 0.08,
        m2: 0.6336
      });

      // 处理组: 高性能(显著改进>10%)
      engine.recordMetrics(config.id, 'treatment', {
        sampleCount: 100,
        primaryMetric: 0.75,
        averageReward: 0.75,
        stdDev: 0.08,
        m2: 0.6336
      });

      const result = engine.analyzeExperiment(config.id);

      expect(result.recommendation).toBe('deploy_winner');
      expect(result.winner).toBe('treatment');
      expect(result.significanceTest.isSignificant).toBe(true);
    });

    it('应该推荐继续测试当样本不足', () => {
      const config = engine.createExperiment({
        name: 'Insufficient Samples',
        description: 'Test insufficient samples',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 1000,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);

      engine.recordMetrics(config.id, 'control', {
        sampleCount: 50,
        primaryMetric: 0.70,
        averageReward: 0.70,
        stdDev: 0.1
      });

      engine.recordMetrics(config.id, 'treatment', {
        sampleCount: 50,
        primaryMetric: 0.75,
        averageReward: 0.75,
        stdDev: 0.1
      });

      const result = engine.analyzeExperiment(config.id);

      expect(result.recommendation).toBe('continue_test');
      expect(result.reason).toContain('Minimum sample size not reached');
    });
  });

  describe('实验完成', () => {
    it('应该完成实验', () => {
      const config = engine.createExperiment({
        name: 'Complete Test',
        description: 'Test experiment completion',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);
      engine.completeExperiment(config.id);

      const retrieved = engine.getExperiment(config.id);
      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.endedAt).toBeDefined();
    });

    it('应该中止实验', () => {
      const config = engine.createExperiment({
        name: 'Abort Test',
        description: 'Test experiment abort',
        variants: [
          {
            id: 'control',
            name: 'Control',
            weight: 0.5,
            isControl: true,
            parameters: {}
          },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 0.5,
            isControl: false,
            parameters: {}
          }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(config.id);
      engine.abortExperiment(config.id, 'Test abort');

      const retrieved = engine.getExperiment(config.id);
      expect(retrieved?.status).toBe('aborted');
    });
  });

  describe('实验列表', () => {
    it('应该列出所有实验', () => {
      engine.createExperiment({
        name: 'Exp 1',
        description: 'Test 1',
        variants: [
          { id: 'control', name: 'Control', weight: 0.5, isControl: true, parameters: {} },
          { id: 'treatment', name: 'Treatment', weight: 0.5, isControl: false, parameters: {} }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.createExperiment({
        name: 'Exp 2',
        description: 'Test 2',
        variants: [
          { id: 'control', name: 'Control', weight: 0.5, isControl: true, parameters: {} },
          { id: 'treatment', name: 'Treatment', weight: 0.5, isControl: false, parameters: {} }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      const experiments = engine.listExperiments();
      expect(experiments).toHaveLength(2);
    });

    it('应该按状态过滤实验', () => {
      const exp1 = engine.createExperiment({
        name: 'Exp 1',
        description: 'Test 1',
        variants: [
          { id: 'control', name: 'Control', weight: 0.5, isControl: true, parameters: {} },
          { id: 'treatment', name: 'Treatment', weight: 0.5, isControl: false, parameters: {} }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      engine.startExperiment(exp1.id);

      engine.createExperiment({
        name: 'Exp 2',
        description: 'Test 2',
        variants: [
          { id: 'control', name: 'Control', weight: 0.5, isControl: true, parameters: {} },
          { id: 'treatment', name: 'Treatment', weight: 0.5, isControl: false, parameters: {} }
        ],
        trafficAllocation: 'even',
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false
      });

      const runningExperiments = engine.listExperiments('running');
      const draftExperiments = engine.listExperiments('draft');

      expect(runningExperiments).toHaveLength(1);
      expect(draftExperiments).toHaveLength(1);
    });
  });
});
