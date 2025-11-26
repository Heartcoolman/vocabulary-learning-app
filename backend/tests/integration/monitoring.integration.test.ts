/**
 * Monitoring Integration Tests
 * 监控系统集成测试
 * 测试指标采集、健康状态检查和告警API
 *
 * 实际API参考: src/amas/monitoring/monitoring-service.ts
 *
 * 注意: 告警规则有 duration 参数（持续时间需要60-300秒），
 * 告警触发逻辑的详细测试在单元测试中进行。
 * 本集成测试主要验证API正确性和基本功能。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MonitoringService } from '../../src/amas/monitoring/monitoring-service';

describe('Monitoring Integration', () => {
  let service: MonitoringService;

  beforeEach(() => {
    service = new MonitoringService();
    service.start();
  });

  afterEach(() => {
    service.stop();
  });

  describe('指标记录API', () => {
    it('应该正确记录决策延迟', () => {
      for (let i = 0; i < 30; i++) {
        service.recordDecisionLatency(250);
      }

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
      expect(health.components.decision).toBeDefined();
    });

    it('应该正确记录成功和错误', () => {
      for (let i = 0; i < 8; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 2; i++) {
        service.recordError();
      }

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });

    it('应该正确记录熔断器状态', () => {
      for (let i = 0; i < 7; i++) {
        service.recordCircuitState(false);
      }
      for (let i = 0; i < 3; i++) {
        service.recordCircuitState(true);
      }

      const health = service.getHealthStatus();
      expect(health.components.circuit).toBeDefined();
    });

    it('应该正确记录降级', () => {
      for (let i = 0; i < 6; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 4; i++) {
        service.recordDegradation();
      }

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });

    it('应该正确记录超时', () => {
      for (let i = 0; i < 9; i++) {
        service.recordSuccess();
      }
      service.recordTimeout();

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });

    it('应该正确记录奖励结果', () => {
      for (let i = 0; i < 10; i++) {
        service.recordRewardResult(true);
      }
      for (let i = 0; i < 2; i++) {
        service.recordRewardResult(false);
      }

      const health = service.getHealthStatus();
      expect(health.components.reward).toBeDefined();
    });
  });

  describe('健康状态检查', () => {
    it('应该在正常状态下报告healthy', () => {
      for (let i = 0; i < 10; i++) {
        service.recordDecisionLatency(50);
        service.recordSuccess();
      }

      const health = service.getHealthStatus();
      expect(health.status).toBe('healthy');
      expect(health.components.decision.status).toBe('healthy');
    });

    it('应该在高延迟时报告degraded或unhealthy', () => {
      for (let i = 0; i < 20; i++) {
        service.recordDecisionLatency(300);
      }

      const health = service.getHealthStatus();
      expect(['degraded', 'unhealthy']).toContain(health.status);
      expect(['degraded', 'unhealthy']).toContain(health.components.decision.status);
    });

    it('应该包含SLO达成情况', () => {
      const health = service.getHealthStatus();
      expect(health.slo).toHaveProperty('decisionLatency');
      expect(health.slo).toHaveProperty('errorRate');
      expect(health.slo).toHaveProperty('circuitHealth');
      expect(health.slo).toHaveProperty('rewardQueueHealth');
    });

    it('应该包含检查时间', () => {
      const health = service.getHealthStatus();
      expect(health.checkedAt).toBeInstanceOf(Date);
    });
  });

  describe('延迟奖励监控', () => {
    it('应该在奖励处理成功时显示健康', () => {
      for (let i = 0; i < 10; i++) {
        service.recordRewardResult(true);
      }

      const health = service.getHealthStatus();
      expect(health.components.reward.status).toBe('healthy');
    });

    it('应该在奖励处理失败率偏高时显示降级', () => {
      for (let i = 0; i < 10; i++) {
        service.recordRewardResult(true);
      }
      for (let i = 0; i < 2; i++) {
        service.recordRewardResult(false);
      }

      const health = service.getHealthStatus();
      expect(['degraded', 'unhealthy']).toContain(health.components.reward.status);
    });

    it('应该在奖励处理失败率极高时显示不健康', () => {
      for (let i = 0; i < 5; i++) {
        service.recordRewardResult(true);
      }
      for (let i = 0; i < 5; i++) {
        service.recordRewardResult(false);
      }

      const health = service.getHealthStatus();
      expect(health.components.reward.status).toBe('unhealthy');
    });
  });

  describe('熔断器监控', () => {
    it('应该在熔断器正常时显示健康', () => {
      for (let i = 0; i < 10; i++) {
        service.recordCircuitState(false);
      }

      const health = service.getHealthStatus();
      expect(health.components.circuit.status).toBe('healthy');
    });

    it('应该在熔断器频繁打开时显示不健康', () => {
      for (let i = 0; i < 3; i++) {
        service.recordCircuitState(false);
      }
      for (let i = 0; i < 7; i++) {
        service.recordCircuitState(true);
      }

      const health = service.getHealthStatus();
      expect(health.components.circuit.status).toBe('unhealthy');
    });
  });

  describe('告警API', () => {
    it('应该返回活动告警列表', () => {
      const activeAlerts = service.getActiveAlerts();
      expect(Array.isArray(activeAlerts)).toBe(true);
    });

    it('应该返回告警历史', () => {
      const history = service.getAlertHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('应该支持限制历史数量', () => {
      const history = service.getAlertHistory(10);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('应该支持解决告警', () => {
      // 尝试解决不存在的告警应返回false
      const resolved = service.resolveAlert('non-existent-id');
      expect(resolved).toBe(false);
    });
  });

  describe('并发场景', () => {
    it('应该正确处理并发指标记录', () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            service.recordDecisionLatency(Math.random() * 200);
            if (Math.random() > 0.9) {
              service.recordError();
            } else {
              service.recordSuccess();
            }
          })
        );
      }

      return Promise.all(promises).then(() => {
        const health = service.getHealthStatus();
        expect(health).toBeDefined();
        expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      });
    });
  });

  describe('服务启动和停止', () => {
    it('应该正确启动监控服务', () => {
      const newService = new MonitoringService();
      expect(() => newService.start()).not.toThrow();
      newService.stop();
    });

    it('应该正确停止监控服务', () => {
      expect(() => service.stop()).not.toThrow();
    });

    it('应该允许重复启动和停止', () => {
      service.stop();
      service.start();
      service.stop();
      service.start();
      expect(() => service.getHealthStatus()).not.toThrow();
      service.stop();
    });

    it('应该在禁用时不启动', () => {
      const disabledService = new MonitoringService({ enabled: false });
      disabledService.start();
      // 应该正常工作，只是不会自动评估
      expect(() => disabledService.getHealthStatus()).not.toThrow();
      disabledService.stop();
    });
  });

  describe('监控统计', () => {
    it('应该返回完整的统计信息', () => {
      const stats = service.getStats();
      expect(stats).toHaveProperty('running');
      expect(stats).toHaveProperty('activeAlerts');
      expect(stats).toHaveProperty('totalAlerts');
      expect(stats).toHaveProperty('health');
      expect(typeof stats.running).toBe('boolean');
      expect(typeof stats.activeAlerts).toBe('number');
      expect(typeof stats.totalAlerts).toBe('number');
    });

    it('应该正确报告运行状态', () => {
      const stats = service.getStats();
      expect(stats.running).toBe(true);

      service.stop();
      const stoppedStats = service.getStats();
      expect(stoppedStats.running).toBe(false);
    });
  });

  describe('健康状态快照', () => {
    it('应该返回完整的健康状态', () => {
      const health = service.getHealthStatus();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('slo');
      expect(health).toHaveProperty('checkedAt');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    it('应该包含所有组件状态', () => {
      const health = service.getHealthStatus();
      expect(health.components).toHaveProperty('decision');
      expect(health.components).toHaveProperty('circuit');
      expect(health.components).toHaveProperty('reward');
    });

    it('组件状态应该包含详细信息', () => {
      for (let i = 0; i < 10; i++) {
        service.recordDecisionLatency(50);
        service.recordSuccess();
      }

      const health = service.getHealthStatus();
      const decision = health.components.decision;
      expect(decision).toHaveProperty('status');
      expect(decision).toHaveProperty('message');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(decision.status);
    });
  });
});
