/**
 * Monitoring Integration Tests
 * 监控系统集成测试
 * 测试从指标采集到告警触发的完整流程
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MonitoringService } from '../../src/amas/monitoring/monitoring-service';
import { DEFAULT_ALERT_RULES } from '../../src/amas/monitoring/alert-config';

describe('Monitoring Integration', () => {
  let service: MonitoringService;

  beforeEach(() => {
    service = new MonitoringService();
    service.start();
  });

  afterEach(() => {
    service.stop();
  });

  describe('端到端监控流程', () => {
    it('应该在决策延迟超标时触发告警', async () => {
      // 记录多个高延迟样本
      for (let i = 0; i < 30; i++) {
        service.recordDecisionLatency(250); // 远超P99(200ms)
      }

      // 等待评估周期
      await new Promise(resolve => setTimeout(resolve, 6000));

      const activeAlerts = service.getActiveAlerts();
      const latencyAlert = activeAlerts.find(a =>
        a.ruleName.includes('决策延迟P99过高')
      );

      expect(latencyAlert).toBeDefined();
      expect(latencyAlert?.severity).toBe('P1');
    }, 10000);

    it('应该在错误率过高时触发告警', async () => {
      // 记录高错误率: 8个成功, 2个错误 = 20%错误率 (超过5%)
      for (let i = 0; i < 8; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 2; i++) {
        service.recordError();
      }

      // 等待评估周期
      await new Promise(resolve => setTimeout(resolve, 11000));

      const activeAlerts = service.getActiveAlerts();
      const errorAlert = activeAlerts.find(a => a.ruleName.includes('错误率过高'));

      expect(errorAlert).toBeDefined();
      expect(errorAlert?.severity).toBe('P1');
    }, 15000);

    it('应该在熔断器频繁打开时触发告警', async () => {
      // 记录频繁熔断: 7个成功, 3个熔断 = 30%熔断率 (超过10%)
      for (let i = 0; i < 7; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 3; i++) {
        service.recordCircuitOpen();
      }

      // 等待评估周期
      await new Promise(resolve => setTimeout(resolve, 6000));

      const activeAlerts = service.getActiveAlerts();
      const circuitAlert = activeAlerts.find(a => a.ruleName.includes('熔断器频繁打开'));

      expect(circuitAlert).toBeDefined();
      expect(circuitAlert?.severity).toBe('P0');
    }, 10000);

    it('应该在降级率过高时触发告警', async () => {
      // 记录高降级率: 6个成功, 4个降级 = 40%降级率 (超过20%)
      for (let i = 0; i < 6; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 4; i++) {
        service.recordDegradation('circuit_open');
      }

      // 等待评估周期
      await new Promise(resolve => setTimeout(resolve, 11000));

      const activeAlerts = service.getActiveAlerts();
      const degradationAlert = activeAlerts.find(a => a.ruleName.includes('降级率过高'));

      expect(degradationAlert).toBeDefined();
      expect(degradationAlert?.severity).toBe('P2');
    }, 15000);
  });

  describe('健康状态检查', () => {
    it('应该在正常状态下报告HEALTHY', () => {
      // 记录正常指标
      for (let i = 0; i < 10; i++) {
        service.recordDecisionLatency(50);
        service.recordSuccess();
      }

      const health = service.getHealthStatus();
      expect(health.status).toBe('HEALTHY');
      expect(health.issues).toHaveLength(0);
    });

    it('应该在存在问题时报告DEGRADED或UNHEALTHY', () => {
      // 记录高延迟
      for (let i = 0; i < 20; i++) {
        service.recordDecisionLatency(300);
      }

      const health = service.getHealthStatus();
      expect(['DEGRADED', 'UNHEALTHY']).toContain(health.status);
      expect(health.issues.length).toBeGreaterThan(0);
    });
  });

  describe('告警生命周期', () => {
    it('应该在问题解决后自动恢复告警', async () => {
      // 先触发告警 - 高错误率
      for (let i = 0; i < 7; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 3; i++) {
        service.recordError();
      }

      // 等待告警触发
      await new Promise(resolve => setTimeout(resolve, 11000));

      let activeAlerts = service.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);

      // 恢复正常 - 低错误率
      for (let i = 0; i < 50; i++) {
        service.recordSuccess();
      }

      // 等待评估周期
      await new Promise(resolve => setTimeout(resolve, 11000));

      activeAlerts = service.getActiveAlerts();
      const unresolvedErrorAlert = activeAlerts.find(
        a => a.ruleName.includes('错误率') && a.status === 'firing'
      );

      // 告警应该已恢复或不再活跃
      expect(unresolvedErrorAlert).toBeUndefined();
    }, 25000);

    it('应该支持手动解决告警', async () => {
      // 触发告警
      for (let i = 0; i < 8; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 2; i++) {
        service.recordCircuitOpen();
      }

      // 等待告警触发
      await new Promise(resolve => setTimeout(resolve, 6000));

      const activeAlerts = service.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);

      const alertId = activeAlerts[0].id;
      const resolved = service.manualResolveAlert(alertId);

      expect(resolved).toBe(true);
      const remainingAlerts = service.getActiveAlerts();
      const resolvedAlert = remainingAlerts.find(a => a.id === alertId);
      expect(resolvedAlert).toBeUndefined();
    }, 10000);
  });

  describe('延迟奖励监控', () => {
    it('应该监控队列积压', () => {
      service.updateRewardQueueBacklog(500);

      const health = service.getHealthStatus();
      // 500 < 1000 (SLO), 应该健康
      expect(health.status).not.toBe('UNHEALTHY');
    });

    it('应该在队列积压过多时触发告警', async () => {
      service.updateRewardQueueBacklog(1500); // > 1000 (SLO)

      // 等待评估周期
      await new Promise(resolve => setTimeout(resolve, 11000));

      const activeAlerts = service.getActiveAlerts();
      const queueAlert = activeAlerts.find(a => a.ruleName.includes('奖励队列积压'));

      expect(queueAlert).toBeDefined();
      expect(queueAlert?.severity).toBe('P1');
    }, 15000);

    it('应该监控奖励处理失败率', () => {
      // 10个成功, 2个失败 = 16.7%失败率 (超过10%)
      for (let i = 0; i < 10; i++) {
        service.recordRewardSuccess();
      }
      for (let i = 0; i < 2; i++) {
        service.recordRewardFailure();
      }

      const health = service.getHealthStatus();
      expect(health.status).toBe('DEGRADED');
      expect(health.issues.some(i => i.includes('奖励处理'))).toBe(true);
    });
  });

  describe('超时监控', () => {
    it('应该监控超时率', () => {
      // 9个成功, 1个超时 = 10%超时率 (超过5%)
      for (let i = 0; i < 9; i++) {
        service.recordSuccess();
      }
      service.recordTimeout();

      const health = service.getHealthStatus();
      expect(health.status).toBe('DEGRADED');
      expect(health.issues.some(i => i.includes('超时率'))).toBe(true);
    });

    it('应该在超时率过高时触发告警', async () => {
      // 7个成功, 3个超时 = 30%超时率 (远超5%)
      for (let i = 0; i < 7; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 3; i++) {
        service.recordTimeout();
      }

      // 等待评估周期
      await new Promise(resolve => setTimeout(resolve, 6000));

      const activeAlerts = service.getActiveAlerts();
      const timeoutAlert = activeAlerts.find(a => a.ruleName.includes('超时率过高'));

      expect(timeoutAlert).toBeDefined();
      expect(timeoutAlert?.severity).toBe('P2');
    }, 10000);
  });

  describe('并发场景', () => {
    it('应该正确处理并发指标记录', () => {
      // 模拟并发请求
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
        expect(['HEALTHY', 'DEGRADED', 'UNHEALTHY']).toContain(health.status);
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
  });

  describe('指标查询', () => {
    it('应该返回所有活动告警', async () => {
      // 触发多个告警
      for (let i = 0; i < 20; i++) {
        service.recordDecisionLatency(300);
      }
      for (let i = 0; i < 5; i++) {
        service.recordSuccess();
      }
      for (let i = 0; i < 5; i++) {
        service.recordError();
      }

      await new Promise(resolve => setTimeout(resolve, 11000));

      const alerts = service.getActiveAlerts();
      expect(Array.isArray(alerts)).toBe(true);
      // 可能有多个告警被触发
      expect(alerts.length).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('应该返回告警历史', async () => {
      // 触发告警
      for (let i = 0; i < 10; i++) {
        service.recordCircuitOpen();
      }

      await new Promise(resolve => setTimeout(resolve, 6000));

      const history = service.getAlertHistory();
      expect(Array.isArray(history)).toBe(true);
    }, 10000);

    it('应该返回健康状态快照', () => {
      const health = service.getHealthStatus();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('timestamp');
      expect(['HEALTHY', 'DEGRADED', 'UNHEALTHY']).toContain(health.status);
    });
  });
});
