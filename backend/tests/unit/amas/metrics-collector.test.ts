/**
 * Metrics Collector Tests
 * 指标采集器单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsCollector } from '../../../src/amas/monitoring/metrics-collector';
import { SLOConfig } from '../../../src/amas/monitoring/alert-config';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  const mockSLO: SLOConfig = {
    decisionLatencyP95: 100,
    decisionLatencyP99: 200,
    errorRate: 0.05,
    circuitOpenRate: 0.1,
    degradationRate: 0.2,
    timeoutRate: 0.05,
    rewardQueueBacklog: 1000,
    rewardFailureRate: 0.1
  };

  beforeEach(() => {
    collector = new MetricsCollector(mockSLO);
  });

  describe('决策延迟记录', () => {
    it('应该正确记录延迟指标', () => {
      collector.recordDecisionLatency(50);
      collector.recordDecisionLatency(100);
      collector.recordDecisionLatency(150);

      const metrics = collector.collectMetrics();
      const latencyMetrics = metrics.filter(m => m.metric.startsWith('amas.decision.latency'));

      expect(latencyMetrics.length).toBeGreaterThan(0);
    });

    it('应该正确计算P95/P99百分位', () => {
      // 添加100个样本
      for (let i = 1; i <= 100; i++) {
        collector.recordDecisionLatency(i);
      }

      const metrics = collector.collectMetrics();
      const p95 = metrics.find(m => m.metric === 'amas.decision.latency_p95');
      const p99 = metrics.find(m => m.metric === 'amas.decision.latency_p99');
      const mean = metrics.find(m => m.metric === 'amas.decision.latency_mean');

      expect(p95?.value).toBeCloseTo(95, -1); // 约95
      expect(p99?.value).toBeCloseTo(99, -1); // 约99
      expect(mean?.value).toBeCloseTo(50, -1); // 约50
    });

    it('应该限制延迟样本窗口大小', () => {
      // 添加超过窗口大小的样本
      for (let i = 0; i < 2000; i++) {
        collector.recordDecisionLatency(i);
      }

      const metrics = collector.collectMetrics();
      const latencyMetric = metrics.find(m => m.metric === 'amas.decision.latency_p95');

      // 确保只保留最近的样本
      expect(latencyMetric).toBeDefined();
    });
  });

  describe('错误率统计', () => {
    it('应该正确计算错误率', () => {
      // 7个成功, 3个错误 = 30%错误率
      for (let i = 0; i < 7; i++) {
        collector.recordSuccess();
      }
      for (let i = 0; i < 3; i++) {
        collector.recordError();
      }

      const metrics = collector.collectMetrics();
      const errorRate = metrics.find(m => m.metric === 'amas.error_rate');

      expect(errorRate).toBeDefined();
      expect(errorRate!.value).toBeCloseTo(0.3, 2);
    });

    it('应该在没有请求时不返回错误率指标', () => {
      const metrics = collector.collectMetrics();
      const errorRate = metrics.find(m => m.metric === 'amas.error_rate');

      // 没有请求时，不会产生错误率指标
      expect(errorRate).toBeUndefined();
    });
  });

  describe('熔断器指标', () => {
    it('应该记录熔断器状态', () => {
      collector.recordCircuitState(true);  // 打开
      collector.recordCircuitState(true);  // 打开
      collector.recordCircuitState(false); // 关闭

      const metrics = collector.collectMetrics();
      const openRate = metrics.find(m => m.metric === 'amas.circuit.open_rate');

      // 3次检查,2次打开 = 66.7%打开率
      expect(openRate).toBeDefined();
      expect(openRate!.value).toBeCloseTo(0.667, 1);
    });

    it('应该计算熔断器打开率', () => {
      // 8个关闭, 2个打开 = 20%打开率
      for (let i = 0; i < 8; i++) {
        collector.recordCircuitState(false);
      }
      collector.recordCircuitState(true);
      collector.recordCircuitState(true);

      const metrics = collector.collectMetrics();
      const openRate = metrics.find(m => m.metric === 'amas.circuit.open_rate');

      expect(openRate).toBeDefined();
      expect(openRate!.value).toBeCloseTo(0.2, 2);
    });
  });

  describe('降级指标', () => {
    it('应该计算降级率', () => {
      // 7个成功, 3个降级 = 3/7 ≈ 42.9%降级率
      for (let i = 0; i < 7; i++) {
        collector.recordSuccess();
      }
      for (let i = 0; i < 3; i++) {
        collector.recordDegradation();
      }

      const metrics = collector.collectMetrics();
      const degradationRate = metrics.find(m => m.metric === 'amas.degradation_rate');

      expect(degradationRate).toBeDefined();
      expect(degradationRate!.value).toBeCloseTo(0.4286, 2);
    });
  });

  describe('超时指标', () => {
    it('应该计算超时率', () => {
      // 9个成功, 1个超时 = 1/9 ≈ 11.1%超时率
      for (let i = 0; i < 9; i++) {
        collector.recordSuccess();
      }
      collector.recordTimeout();

      const metrics = collector.collectMetrics();
      const timeoutRate = metrics.find(m => m.metric === 'amas.timeout_rate');

      expect(timeoutRate).toBeDefined();
      expect(timeoutRate!.value).toBeCloseTo(0.1111, 2);
    });
  });

  describe('延迟奖励指标', () => {
    it('应该计算奖励失败率', () => {
      // 8个成功, 2个失败 = 20%失败率
      for (let i = 0; i < 8; i++) {
        collector.recordRewardResult(true);
      }
      for (let i = 0; i < 2; i++) {
        collector.recordRewardResult(false);
      }

      const metrics = collector.collectMetrics();
      const failureRate = metrics.find(m => m.metric === 'amas.reward.failure_rate');

      expect(failureRate).toBeDefined();
      expect(failureRate!.value).toBeCloseTo(0.2, 2);
    });
  });

  describe('健康状态评估', () => {
    it('应该在所有指标健康时返回healthy', () => {
      // 所有指标都在SLO范围内
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(50); // < P95(100)
        collector.recordSuccess();
      }

      const health = collector.getHealthStatus();
      expect(health.status).toBe('healthy');
      expect(health.components.decision.status).toBe('healthy');
      expect(health.components.circuit.status).toBe('healthy');
      expect(health.components.reward.status).toBe('healthy');
    });

    it('应该在决策延迟超标时返回degraded', () => {
      // P95延迟超过SLO
      for (let i = 0; i < 20; i++) {
        collector.recordDecisionLatency(160); // 超过150但未超过500
        collector.recordSuccess();
      }

      const health = collector.getHealthStatus();
      expect(health.status).toBe('degraded');
      expect(health.components.decision.status).toBe('degraded');
      expect(health.components.decision.message).toContain('决策');
    });

    it('应该在错误率过高时返回degraded', () => {
      // 错误率10% > SLO(5%)
      for (let i = 0; i < 9; i++) {
        collector.recordSuccess();
      }
      collector.recordError();

      const health = collector.getHealthStatus();
      expect(health.status).toBe('degraded');
      expect(health.components.decision.status).toBe('degraded');
    });

    it('应该在熔断器频繁打开时返回unhealthy', () => {
      // 熔断率>50%触发unhealthy
      for (let i = 0; i < 10; i++) {
        collector.recordSuccess();
        collector.recordCircuitState(true);
      }

      const health = collector.getHealthStatus();
      expect(health.status).toBe('unhealthy');
      expect(health.components.circuit.status).toBe('unhealthy');
      expect(health.components.circuit.message).toContain('熔断器');
    });

    it('应该在降级率过高时返回degraded', () => {
      // 降级率31% > 阈值(30%)
      for (let i = 0; i < 69; i++) {
        collector.recordSuccess();
      }
      for (let i = 0; i < 31; i++) {
        collector.recordDegradation();
      }

      const health = collector.getHealthStatus();
      expect(health.status).toBe('degraded');
      expect(health.components.decision.status).toBe('degraded');
    });

    it('应该在奖励失败率过高时返回degraded', () => {
      // 奖励失败率15% > SLO(10%)
      for (let i = 0; i < 17; i++) {
        collector.recordRewardResult(true);
      }
      for (let i = 0; i < 3; i++) {
        collector.recordRewardResult(false);
      }

      const health = collector.getHealthStatus();
      expect(health.status).toBe('degraded');
      expect(health.components.reward.status).toBe('degraded');
      expect(health.components.reward.message).toContain('奖励');
    });

    it('应该返回完整的健康状态结构', () => {
      // 触发多个问题
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(600); // 超过500触发unhealthy
      }
      for (let i = 0; i < 8; i++) {
        collector.recordSuccess();
      }
      for (let i = 0; i < 2; i++) {
        collector.recordError(); // 错误率20%
      }

      const health = collector.getHealthStatus();
      expect(health.status).toBe('unhealthy');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('slo');
      expect(health).toHaveProperty('checkedAt');
      expect(health.components.decision.status).toBe('unhealthy');
    });
  });

  describe('指标收集', () => {
    it('应该收集所有类型的指标', () => {
      collector.recordDecisionLatency(50);
      collector.recordSuccess();
      collector.recordError();
      collector.recordCircuitState(true);
      collector.recordDegradation();
      collector.recordTimeout();
      collector.recordRewardResult(true);
      collector.recordRewardResult(false);

      const metrics = collector.collectMetrics();

      // 验证关键指标都存在
      const metricNames = metrics.map(m => m.metric);
      expect(metricNames).toContain('amas.decision.latency_p95');
      expect(metricNames).toContain('amas.decision.latency_p99');
      expect(metricNames).toContain('amas.decision.latency_mean');
      expect(metricNames).toContain('amas.error_rate');
      expect(metricNames).toContain('amas.circuit.open_rate');
      expect(metricNames).toContain('amas.degradation_rate');
      expect(metricNames).toContain('amas.timeout_rate');
      expect(metricNames).toContain('amas.reward.failure_rate');
    });

    it('应该包含时间戳', () => {
      collector.recordSuccess();
      collector.recordDecisionLatency(50);

      const metrics = collector.collectMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      metrics.forEach(m => {
        expect(m.timestamp).toBeGreaterThan(0);
      });
    });
  });

  describe('指标重置', () => {
    it('应该正确重置所有计数器', () => {
      // 记录一些指标
      collector.recordDecisionLatency(100);
      collector.recordSuccess();
      collector.recordError();
      collector.recordCircuitState(true);

      // 重置
      collector.reset();

      // 验证指标已重置(没有请求时不会有rate指标)
      const metrics = collector.collectMetrics();
      const errorRate = metrics.find(m => m.metric === 'amas.error_rate');
      const circuitRate = metrics.find(m => m.metric === 'amas.circuit.open_rate');
      const latencyMetric = metrics.find(m => m.metric === 'amas.decision.latency_p95');

      // 重置后没有数据,所以这些指标不应该存在
      expect(errorRate).toBeUndefined();
      expect(circuitRate).toBeUndefined();
      expect(latencyMetric).toBeUndefined();
    });
  });
});
