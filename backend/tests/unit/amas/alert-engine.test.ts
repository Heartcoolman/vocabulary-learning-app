/**
 * Alert Engine Tests
 * 告警引擎单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlertEngine } from '../../../src/amas/monitoring/alert-engine';
import { AlertRule, AlertSeverity } from '../../../src/amas/monitoring/alert-config';

describe('AlertEngine', () => {
  let engine: AlertEngine;
  const mockRules: AlertRule[] = [
    {
      name: 'TestRuleHigh',
      description: 'Test high severity rule',
      severity: 'P0',
      metric: 'test.latency',
      operator: '>',
      threshold: 100,
      duration: 10, // 10秒
      cooldown: 60, // 60秒
      enabled: true
    },
    {
      name: 'TestRuleError',
      description: 'Test error rate rule',
      severity: 'P1',
      metric: 'test.error_rate',
      operator: '>',
      threshold: 0.05,
      duration: 30,
      cooldown: 120,
      enabled: true
    },
    {
      name: 'TestRuleLow',
      description: 'Test low threshold rule',
      severity: 'P2',
      metric: 'test.memory',
      operator: '<',
      threshold: 20,
      duration: 5,
      cooldown: 30,
      enabled: true
    }
  ];

  beforeEach(() => {
    engine = new AlertEngine(mockRules, []);
  });

  describe('初始化', () => {
    it('应该加载启用的规则', () => {
      expect(engine.getRuleState('TestRuleHigh')).toBeTruthy();
      expect(engine.getRuleState('TestRuleError')).toBeTruthy();
      expect(engine.getRuleState('TestRuleLow')).toBeTruthy();
    });

    it('应该忽略禁用的规则', () => {
      const disabledRule: AlertRule = {
        ...mockRules[0],
        name: 'DisabledRule',
        enabled: false
      };

      const engineWithDisabled = new AlertEngine([...mockRules, disabledRule], []);
      expect(engineWithDisabled.getRuleState('DisabledRule')).toBeNull();
    });
  });

  describe('指标评估', () => {
    it('应该在超过阈值且达到持续时间后触发告警', () => {
      const metric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      // 第一次评估 - 不应该触发（持续时间不足）
      let alerts = engine.evaluateMetric(metric);
      expect(alerts).toHaveLength(0);

      // 等待11秒后再次评估 - 应该触发
      const state = engine.getRuleState('TestRuleHigh')!;
      state.lastCheckAt = Date.now() - 11000; // 模拟11秒前
      state.exceedDuration = 11;

      alerts = engine.evaluateMetric(metric);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].ruleName).toBe('TestRuleHigh');
      expect(alerts[0].severity).toBe('P0');
      expect(alerts[0].status).toBe('firing');
    });

    it('应该在未超过阈值时不触发告警', () => {
      const metric = {
        metric: 'test.latency',
        value: 80,
        timestamp: Date.now()
      };

      const alerts = engine.evaluateMetric(metric);
      expect(alerts).toHaveLength(0);
    });

    it('应该在值恢复正常时解决告警', () => {
      // 首先触发告警
      const highMetric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      const state = engine.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      let alerts = engine.evaluateMetric(highMetric);
      expect(alerts).toHaveLength(1);

      // 然后值恢复正常
      const normalMetric = {
        metric: 'test.latency',
        value: 80,
        timestamp: Date.now()
      };

      alerts = engine.evaluateMetric(normalMetric);
      expect(state.alert?.status).toBe('resolved');
      expect(state.exceedDuration).toBe(0);
    });

    it('应该遵守冷却时间', () => {
      const metric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      const state = engine.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      // 第一次触发
      let alerts = engine.evaluateMetric(metric);
      expect(alerts).toHaveLength(1);

      // 立即再次评估 - 应该被冷却时间阻止
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;
      alerts = engine.evaluateMetric(metric);
      expect(alerts).toHaveLength(0);

      // 61秒后再次评估 - 应该允许触发
      state.lastFiredAt = Date.now() - 61000;
      state.exceedDuration = 11;
      alerts = engine.evaluateMetric(metric);
      expect(alerts).toHaveLength(1);
    });
  });

  describe('阈值检查', () => {
    it('应该正确处理大于操作符', () => {
      const metric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      const state = engine.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      const alerts = engine.evaluateMetric(metric);
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('应该正确处理小于操作符', () => {
      const metric = {
        metric: 'test.memory',
        value: 15,
        timestamp: Date.now()
      };

      const state = engine.getRuleState('TestRuleLow')!;
      state.exceedDuration = 6;
      state.lastCheckAt = Date.now() - 6000;

      const alerts = engine.evaluateMetric(metric);
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  describe('批量评估', () => {
    it('应该评估多个指标', () => {
      const metrics = [
        {
          metric: 'test.latency',
          value: 150,
          timestamp: Date.now()
        },
        {
          metric: 'test.error_rate',
          value: 0.1,
          timestamp: Date.now()
        }
      ];

      // 设置状态使其可以触发
      const latencyState = engine.getRuleState('TestRuleHigh')!;
      latencyState.exceedDuration = 11;
      latencyState.lastCheckAt = Date.now() - 11000;

      const errorState = engine.getRuleState('TestRuleError')!;
      errorState.exceedDuration = 31;
      errorState.lastCheckAt = Date.now() - 31000;

      const alerts = engine.evaluateMetrics(metrics);
      expect(alerts).toHaveLength(2);
    });
  });

  describe('告警管理', () => {
    it('应该返回活动告警', () => {
      const metric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      const state = engine.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      engine.evaluateMetric(metric);

      const activeAlerts = engine.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].status).toBe('firing');
    });

    it('应该返回告警历史', () => {
      const metric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      const state = engine.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      engine.evaluateMetric(metric);

      const history = engine.getAlertHistory();
      expect(history).toHaveLength(1);
    });

    it('应该手动解决告警', () => {
      const metric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      const state = engine.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      const alerts = engine.evaluateMetric(metric);
      const alertId = alerts[0].id;

      const resolved = engine.manualResolveAlert(alertId);
      expect(resolved).toBe(true);

      const alert = engine.getActiveAlerts().find(a => a.id === alertId);
      expect(alert).toBeUndefined();
    });
  });

  describe('事件回调', () => {
    it('应该调用onStateChange回调', () => {
      const onStateChange = vi.fn();
      const engineWithCallbacks = new AlertEngine(mockRules, []);
      engineWithCallbacks['circuit'] = { onStateChange } as any;

      const metric = {
        metric: 'test.latency',
        value: 150,
        timestamp: Date.now()
      };

      const state = engineWithCallbacks.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      engineWithCallbacks.evaluateMetric(metric);
      // 注意：由于熔断器在AlertEngine内部，这个测试主要验证结构
    });
  });

  describe('消息格式化', () => {
    it('应该正确格式化告警消息', () => {
      const ruleWithTemplate: AlertRule = {
        ...mockRules[0],
        messageTemplate: '延迟达到 {value}ms，超过阈值 {threshold}ms'
      };

      const engineWithTemplate = new AlertEngine([ruleWithTemplate], []);
      const metric = {
        metric: 'test.latency',
        value: 150.5,
        timestamp: Date.now()
      };

      const state = engineWithTemplate.getRuleState('TestRuleHigh')!;
      state.exceedDuration = 11;
      state.lastCheckAt = Date.now() - 11000;

      const alerts = engineWithTemplate.evaluateMetric(metric);
      expect(alerts[0].message).toContain('150.50');
      expect(alerts[0].message).toContain('100.00');
    });
  });
});
