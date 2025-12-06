/**
 * AlertEngine Unit Tests
 *
 * Tests for the alert evaluation and management module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AlertEngine,
  Alert,
  MetricValue,
  createDefaultAlertEngine
} from '../../../../src/amas/monitoring/alert-engine';
import {
  AlertRule,
  AlertSeverity,
  ALERT_RULES,
  DEFAULT_ALERT_CHANNELS
} from '../../../../src/amas/monitoring/alert-config';

describe('AlertEngine', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    // Create engine with test rules
    engine = new AlertEngine(ALERT_RULES, DEFAULT_ALERT_CHANNELS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default rules', () => {
      const defaultEngine = new AlertEngine();

      expect(defaultEngine).toBeDefined();
    });

    it('should initialize with custom rules', () => {
      const customRules: AlertRule[] = [
        {
          name: 'TestRule',
          description: 'Test rule',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 60,
          cooldown: 300,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(customRules);

      expect(customEngine).toBeDefined();
    });

    it('should filter out disabled rules', () => {
      const rules: AlertRule[] = [
        {
          name: 'EnabledRule',
          description: 'Enabled',
          severity: 'P2',
          metric: 'test.enabled',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true
        },
        {
          name: 'DisabledRule',
          description: 'Disabled',
          severity: 'P2',
          metric: 'test.disabled',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: false
        }
      ];

      const customEngine = new AlertEngine(rules);

      // Evaluate metric for disabled rule - should not trigger
      const alerts = customEngine.evaluateMetric({
        metric: 'test.disabled',
        value: 200,
        timestamp: Date.now()
      });

      expect(alerts.length).toBe(0);
    });
  });

  // ==================== evaluateMetric Tests ====================

  describe('evaluateMetric', () => {
    it('should not trigger alert when below threshold', () => {
      const metric: MetricValue = {
        metric: 'amas.decision.latency_p99',
        value: 100, // Below 500ms threshold
        timestamp: Date.now()
      };

      const alerts = engine.evaluateMetric(metric);

      expect(alerts.length).toBe(0);
    });

    it('should trigger alert when above threshold and duration met', () => {
      const rules: AlertRule[] = [
        {
          name: 'ImmediateAlert',
          description: 'Alert with no duration',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0, // Immediate
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules, DEFAULT_ALERT_CHANNELS);

      const alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      expect(alerts.length).toBe(1);
      expect(alerts[0].ruleName).toBe('ImmediateAlert');
    });

    it('should require duration before firing alert', () => {
      const rules: AlertRule[] = [
        {
          name: 'DelayedAlert',
          description: 'Alert with duration',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 60, // 60 seconds
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules, DEFAULT_ALERT_CHANNELS);

      // First evaluation - should not trigger
      let alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });
      expect(alerts.length).toBe(0);

      // Advance time by 30 seconds - still should not trigger
      vi.advanceTimersByTime(30 * 1000);
      alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });
      expect(alerts.length).toBe(0);

      // Advance time by another 35 seconds - now should trigger
      vi.advanceTimersByTime(35 * 1000);
      alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });
      expect(alerts.length).toBe(1);
    });

    it('should respect cooldown period', () => {
      const rules: AlertRule[] = [
        {
          name: 'CooldownAlert',
          description: 'Alert with cooldown',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 300, // 5 minutes
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules, DEFAULT_ALERT_CHANNELS);

      // First alert
      let alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });
      expect(alerts.length).toBe(1);

      // Immediate second evaluation - should not trigger (cooldown)
      vi.advanceTimersByTime(1000);
      alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });
      expect(alerts.length).toBe(0);

      // After cooldown period
      vi.advanceTimersByTime(300 * 1000);
      alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });
      expect(alerts.length).toBe(1);
    });

    it('should reset duration when metric drops below threshold', () => {
      const rules: AlertRule[] = [
        {
          name: 'ResetAlert',
          description: 'Alert that resets',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 60,
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules, DEFAULT_ALERT_CHANNELS);

      // Start building duration
      customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      vi.advanceTimersByTime(30 * 1000);

      // Drop below threshold
      customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 50,
        timestamp: Date.now()
      });

      vi.advanceTimersByTime(35 * 1000);

      // Back above threshold - should not trigger (duration reset)
      const alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });
      expect(alerts.length).toBe(0);
    });
  });

  // ==================== Operator Tests ====================

  describe('threshold operators', () => {
    const createEngineWithOperator = (operator: string, threshold: number) => {
      return new AlertEngine([
        {
          name: 'OperatorTest',
          description: 'Test operator',
          severity: 'P2',
          metric: 'test.metric',
          operator: operator as any,
          threshold,
          duration: 0,
          cooldown: 0,
          enabled: true
        }
      ]);
    };

    it('should handle > operator', () => {
      const eng = createEngineWithOperator('>', 100);

      expect(eng.evaluateMetric({ metric: 'test.metric', value: 101, timestamp: Date.now() }).length).toBe(1);
      expect(eng.evaluateMetric({ metric: 'test.metric', value: 100, timestamp: Date.now() }).length).toBe(0);
    });

    it('should handle < operator', () => {
      const eng = createEngineWithOperator('<', 100);

      expect(eng.evaluateMetric({ metric: 'test.metric', value: 99, timestamp: Date.now() }).length).toBe(1);
      expect(eng.evaluateMetric({ metric: 'test.metric', value: 100, timestamp: Date.now() }).length).toBe(0);
    });

    it('should handle >= operator', () => {
      const eng = createEngineWithOperator('>=', 100);

      expect(eng.evaluateMetric({ metric: 'test.metric', value: 100, timestamp: Date.now() }).length).toBe(1);
      expect(eng.evaluateMetric({ metric: 'test.metric', value: 99, timestamp: Date.now() }).length).toBe(0);
    });

    it('should handle <= operator', () => {
      const eng = createEngineWithOperator('<=', 100);

      expect(eng.evaluateMetric({ metric: 'test.metric', value: 100, timestamp: Date.now() }).length).toBe(1);
      expect(eng.evaluateMetric({ metric: 'test.metric', value: 101, timestamp: Date.now() }).length).toBe(0);
    });

    it('should handle == operator', () => {
      const eng = createEngineWithOperator('==', 100);

      expect(eng.evaluateMetric({ metric: 'test.metric', value: 100, timestamp: Date.now() }).length).toBe(1);
      expect(eng.evaluateMetric({ metric: 'test.metric', value: 99, timestamp: Date.now() }).length).toBe(0);
    });

    it('should handle != operator', () => {
      const eng = createEngineWithOperator('!=', 100);

      expect(eng.evaluateMetric({ metric: 'test.metric', value: 99, timestamp: Date.now() }).length).toBe(1);
      expect(eng.evaluateMetric({ metric: 'test.metric', value: 100, timestamp: Date.now() }).length).toBe(0);
    });
  });

  // ==================== evaluateMetrics Tests ====================

  describe('evaluateMetrics', () => {
    it('should evaluate multiple metrics', () => {
      const rules: AlertRule[] = [
        {
          name: 'Alert1',
          description: 'Alert 1',
          severity: 'P2',
          metric: 'test.metric1',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true
        },
        {
          name: 'Alert2',
          description: 'Alert 2',
          severity: 'P2',
          metric: 'test.metric2',
          operator: '>',
          threshold: 50,
          duration: 0,
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      const alerts = customEngine.evaluateMetrics([
        { metric: 'test.metric1', value: 200, timestamp: Date.now() },
        { metric: 'test.metric2', value: 100, timestamp: Date.now() }
      ]);

      expect(alerts.length).toBe(2);
    });
  });

  // ==================== Alert Properties Tests ====================

  describe('alert properties', () => {
    it('should set correct alert properties', () => {
      const rules: AlertRule[] = [
        {
          name: 'PropertyTest',
          description: 'Test properties',
          severity: 'P1',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true,
          labels: { env: 'test' },
          messageTemplate: 'Value {value} exceeded {threshold}'
        }
      ];

      const customEngine = new AlertEngine(rules);

      const alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      expect(alerts[0].ruleName).toBe('PropertyTest');
      expect(alerts[0].severity).toBe('P1');
      expect(alerts[0].status).toBe('firing');
      expect(alerts[0].value).toBe(200);
      expect(alerts[0].threshold).toBe(100);
      expect(alerts[0].labels).toEqual({ env: 'test' });
      expect(alerts[0].message).toContain('200');
      expect(alerts[0].firedAt).toBeInstanceOf(Date);
    });
  });

  // ==================== Active Alerts Tests ====================

  describe('getActiveAlerts', () => {
    it('should return active alerts', () => {
      const rules: AlertRule[] = [
        {
          name: 'ActiveAlert',
          description: 'Active alert',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 300,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      const activeAlerts = customEngine.getActiveAlerts();

      expect(activeAlerts.length).toBe(1);
      expect(activeAlerts[0].status).toBe('firing');
    });

    it('should not include resolved alerts', () => {
      const rules: AlertRule[] = [
        {
          name: 'ResolveTest',
          description: 'Resolve test',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      // Fire alert
      customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      // Resolve by going below threshold
      vi.advanceTimersByTime(1000);
      customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 50,
        timestamp: Date.now()
      });

      const activeAlerts = customEngine.getActiveAlerts();

      expect(activeAlerts.length).toBe(0);
    });
  });

  // ==================== Alert History Tests ====================

  describe('getAlertHistory', () => {
    it('should return alert history', () => {
      const rules: AlertRule[] = [
        {
          name: 'HistoryTest',
          description: 'History test',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      const history = customEngine.getAlertHistory();

      expect(history.length).toBe(1);
    });

    it('should respect limit parameter', () => {
      const rules: AlertRule[] = [
        {
          name: 'LimitTest',
          description: 'Limit test',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(1000);
        customEngine.evaluateMetric({
          metric: 'test.metric',
          value: 200,
          timestamp: Date.now()
        });
      }

      const history = customEngine.getAlertHistory(5);

      expect(history.length).toBe(5);
    });
  });

  // ==================== Rule State Tests ====================

  describe('getRuleState', () => {
    it('should return rule state', () => {
      const rules: AlertRule[] = [
        {
          name: 'StateTest',
          description: 'State test',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      const state = customEngine.getRuleState('StateTest');

      expect(state).not.toBeNull();
      expect(state?.alert).toBeNull();
    });

    it('should return null for unknown rule', () => {
      const state = engine.getRuleState('UnknownRule');

      expect(state).toBeNull();
    });
  });

  // ==================== Manual Resolution Tests ====================

  describe('manualResolveAlert', () => {
    it('should manually resolve alert', () => {
      const rules: AlertRule[] = [
        {
          name: 'ManualResolve',
          description: 'Manual resolve',
          severity: 'P2',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 300,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      const alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      const result = customEngine.manualResolveAlert(alerts[0].id);

      expect(result).toBe(true);
      expect(customEngine.getActiveAlerts().length).toBe(0);
    });

    it('should return false for unknown alert ID', () => {
      const result = engine.manualResolveAlert('unknown-id');

      expect(result).toBe(false);
    });
  });

  // ==================== Severity Tests ====================

  describe('alert severity', () => {
    it('should handle P0 alerts', () => {
      const rules: AlertRule[] = [
        {
          name: 'P0Alert',
          description: 'Critical alert',
          severity: 'P0',
          metric: 'test.metric',
          operator: '>',
          threshold: 100,
          duration: 0,
          cooldown: 0,
          enabled: true
        }
      ];

      const customEngine = new AlertEngine(rules);

      const alerts = customEngine.evaluateMetric({
        metric: 'test.metric',
        value: 200,
        timestamp: Date.now()
      });

      expect(alerts[0].severity).toBe('P0');
    });

    const severities: AlertSeverity[] = ['P0', 'P1', 'P2', 'P3'];

    severities.forEach(severity => {
      it(`should correctly assign ${severity} severity`, () => {
        const rules: AlertRule[] = [
          {
            name: `${severity}Test`,
            description: `${severity} test`,
            severity,
            metric: 'test.metric',
            operator: '>',
            threshold: 100,
            duration: 0,
            cooldown: 0,
            enabled: true
          }
        ];

        const customEngine = new AlertEngine(rules);

        const alerts = customEngine.evaluateMetric({
          metric: 'test.metric',
          value: 200,
          timestamp: Date.now()
        });

        expect(alerts[0].severity).toBe(severity);
      });
    });
  });
});

// ==================== Factory Function Tests ====================

describe('createDefaultAlertEngine', () => {
  it('should create AlertEngine with default configuration', () => {
    const engine = createDefaultAlertEngine();

    expect(engine).toBeInstanceOf(AlertEngine);
  });
});
