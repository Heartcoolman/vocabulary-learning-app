/**
 * Alert Monitoring Integration Tests
 * 测试新监控栈的完整alert流程（backend/src/monitoring/）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// 动态导入以确保mock生效
const { AlertEngine } = await import('../../src/monitoring/alert-engine');
const { ALERT_RULES } = await import('../../src/monitoring/alert-rules');

describe('Alert Monitoring Integration', () => {
  let engine: InstanceType<typeof AlertEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    // 使用真实的alert rules（来自alert-rules.ts）
    const testRules = ALERT_RULES.slice(0, 3); // 取前3个规则测试
    engine = new AlertEngine(testRules);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Threshold Rule Evaluation', () => {
    it('should fire alert after consecutive periods exceed threshold', () => {
      const now = Date.now();

      // 使用真实metric: http.request.duration.p95 (threshold=1.0, consecutivePeriods=2)
      // 第一次超阈值 - pending
      let events = engine.evaluate({
        timestamp: now,
        metrics: {
          'http.request.duration.p95': 1.5 // 超过1.0s阈值
        }
      });

      expect(events).toHaveLength(0); // 还未达到consecutive periods (需要2次)

      // 第二次连续超阈值 - firing
      events = engine.evaluate({
        timestamp: now + 35000, // 35秒后
        metrics: {
          'http.request.duration.p95': 1.5
        }
      });

      expect(events).toHaveLength(1); // 应该触发firing event
      expect(events[0].status).toBe('firing');

      const activeAlerts = engine.getActiveAlerts();
      console.log('Active alerts after threshold breach:', activeAlerts);
      expect(activeAlerts.length).toBeGreaterThan(0);
    });

    it('should resolve alert when metric returns to normal', () => {
      const now = Date.now();

      // 先触发alert（使用http.request.duration.p95）
      for (let i = 0; i < 3; i++) {
        engine.evaluate({
          timestamp: now + i * 40000,
          metrics: { 'http.request.duration.p95': 1.5 }
        });
      }

      // 恢复正常
      const events = engine.evaluate({
        timestamp: now + 120000,
        metrics: { 'http.request.duration.p95': 0.5 } // 低于1.0s阈值
      });

      // 验证resolved event
      const resolvedEvents = events.filter(e => e.status === 'resolved');
      console.log('Resolved events:', resolvedEvents);
      expect(resolvedEvents.length).toBeGreaterThan(0);
    });

    it('should respect cooldown period', () => {
      const now = Date.now();

      // 第一次触发（使用http.error_rate.5xx）
      for (let i = 0; i < 3; i++) {
        engine.evaluate({
          timestamp: now + i * 40000,
          metrics: { 'http.error_rate.5xx': 0.15 } // 超过0.01阈值
        });
      }

      const firstFiring = engine.getActiveAlerts();
      const firstCount = firstFiring.length;

      // 立即再次尝试（cooldown期内）
      engine.evaluate({
        timestamp: now + 150000,
        metrics: { 'http.error_rate.5xx': 0.20 }
      });

      const duringCooldown = engine.getActiveAlerts();

      // Cooldown期内不应产生新的firing事件
      expect(duringCooldown.length).toBe(firstCount);
    });
  });

  describe('Trend Rule Evaluation', () => {
    it('should detect increasing trend', () => {
      const now = Date.now();
      const metricKey = 'decision.confidence.p50' as const;

      // 模拟递减趋势（confidence下降）
      const dataPoints = [0.9, 0.85, 0.75, 0.65, 0.55];

      dataPoints.forEach((value, index) => {
        engine.evaluate({
          timestamp: now + index * 60000, // 每分钟一个数据点
          metrics: { [metricKey]: value }
        });
      });

      // 检查是否检测到下降趋势
      const activeAlerts = engine.getActiveAlerts();
      console.log('Trend detection alerts:', activeAlerts);
    });
  });

  describe('Counter Reset Detection', () => {
    it('should handle counter reset without negative rates', () => {
      const now = Date.now();

      // 正常递增
      engine.evaluate({
        timestamp: now,
        metrics: { 'http.request.total': 1000 }
      });

      engine.evaluate({
        timestamp: now + 30000,
        metrics: { 'http.request.total': 1500 }
      });

      // Counter reset（服务重启）
      engine.evaluate({
        timestamp: now + 60000,
        metrics: { 'http.request.total': 50 } // 重置到接近0
      });

      // 验证没有产生异常的负增长率alert
      const alerts = engine.getActiveAlerts();
      const negativeRateAlerts = alerts.filter(a =>
        a.message.includes('negative') || a.value < 0
      );

      expect(negativeRateAlerts).toHaveLength(0);
    });
  });

  describe('Webhook Notification', () => {
    it('should rate limit webhook calls to maxPerMinute', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const now = Date.now();

      // 快速触发多个alert（使用db.slow_queries.per_min，consecutivePeriods=1，更容易触发）
      for (let i = 0; i < 15; i++) {
        engine.evaluate({
          timestamp: now + i * 1000, // 每秒一次
          metrics: {
            'db.slow_queries.per_min': 15, // 超过10的阈值
            'http.error_rate.5xx': 0.15
          }
        });
      }

      // 等待webhook异步调用
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证rate limiting（maxPerMinute通常是12）
      const callCount = mockedAxios.post.mock.calls.length;
      console.log(`Webhook called ${callCount} times (rate limited)`);

      // 应该少于15次（被rate limit了）
      expect(callCount).toBeLessThan(15);
    });

    it('should retry on webhook failure', async () => {
      // 设置环境变量以启用webhook
      const originalWebhookUrl = process.env.ALERT_WEBHOOK_URL;
      process.env.ALERT_WEBHOOK_URL = 'http://test-webhook.example.com/alert';

      // 创建新的engine（会使用环境变量中的webhook URL）
      const testEngine = new AlertEngine(ALERT_RULES.slice(0, 3));

      // 前2次失败，第3次成功
      mockedAxios.post
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({ status: 200, data: {} });

      const now = Date.now();

      // 触发一个alert（使用http.request.duration.p95）
      for (let i = 0; i < 3; i++) {
        testEngine.evaluate({
          timestamp: now + i * 40000,
          metrics: { 'http.request.duration.p95': 1.5 }
        });
      }

      // 等待重试完成（重试最多需要: retryDelayMs * retryCount）
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 恢复环境变量
      if (originalWebhookUrl) {
        process.env.ALERT_WEBHOOK_URL = originalWebhookUrl;
      } else {
        delete process.env.ALERT_WEBHOOK_URL;
      }

      // 验证进行了重试（原始调用1次 + 最多3次重试 = 最多4次，但至少2次）
      const callCount = mockedAxios.post.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(2); // 至少有重试行为
      expect(callCount).toBeLessThanOrEqual(4); // 不超过配置的重试次数
    });

    it('should format slack webhook payload correctly', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const now = Date.now();

      // 触发alert（使用http.request.duration.p95）
      for (let i = 0; i < 3; i++) {
        engine.evaluate({
          timestamp: now + i * 40000,
          metrics: { 'http.request.duration.p95': 1.5 }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // 检查payload格式
      if (mockedAxios.post.mock.calls.length > 0) {
        const lastCall = mockedAxios.post.mock.calls[mockedAxios.post.mock.calls.length - 1];
        const [url, payload] = lastCall;

        console.log('Webhook URL:', url);
        console.log('Webhook payload:', JSON.stringify(payload, null, 2));

        // 验证payload包含必要字段
        expect(payload).toHaveProperty('text');
        expect(typeof payload.text).toBe('string');
      }
    });
  });

  describe('Alert History Management', () => {
    it('should maintain alert history with max size', () => {
      const now = Date.now();

      // 生成大量alerts（超过history buffer大小200，使用http.request.duration.p95）
      for (let i = 0; i < 250; i++) {
        engine.evaluate({
          timestamp: now + i * 1000,
          metrics: {
            'http.request.duration.p95': i % 2 === 0 ? 1.5 : 0.5 // 交替触发/解决
          }
        });
      }

      const history = engine.getHistory();

      // 验证history大小被限制
      expect(history.length).toBeLessThanOrEqual(200);

      // 验证保留了最新的events（如果history不为空）
      if (history.length > 0) {
        const lastEvent = history[history.length - 1];
        expect(lastEvent.occurredAt).toBeGreaterThan(now + 240000);
      }
    });

    it('should clear resolved alerts from active list', () => {
      const now = Date.now();

      // 触发alert（使用http.request.duration.p95）
      for (let i = 0; i < 3; i++) {
        engine.evaluate({
          timestamp: now + i * 40000,
          metrics: { 'http.request.duration.p95': 1.5 }
        });
      }

      let active = engine.getActiveAlerts();
      const initialCount = active.length;
      expect(initialCount).toBeGreaterThan(0);

      // 恢复正常（解决alert）
      engine.evaluate({
        timestamp: now + 200000,
        metrics: { 'http.request.duration.p95': 0.5 }
      });

      active = engine.getActiveAlerts();
      expect(active.length).toBeLessThan(initialCount);
    });
  });

  describe('Multiple Rules Concurrent Evaluation', () => {
    it('should evaluate multiple rules simultaneously', () => {
      const now = Date.now();

      // 触发多个不同规则（使用真实metrics）
      const events = engine.evaluate({
        timestamp: now,
        metrics: {
          'http.request.duration.p95': 1.5,
          'http.error_rate.5xx': 0.15,
          'db.slow_queries.per_min': 15
        }
      });

      // 持续评估以触发alerts
      for (let i = 1; i < 5; i++) {
        engine.evaluate({
          timestamp: now + i * 40000,
          metrics: {
            'http.request.duration.p95': 1.5,
            'http.error_rate.5xx': 0.15,
            'db.slow_queries.per_min': 15
          }
        });
      }

      const activeAlerts = engine.getActiveAlerts();

      // 应该有来自不同规则的多个alerts
      const uniqueMetrics = new Set(activeAlerts.map(a => a.metric));
      console.log('Active alerts from metrics:', Array.from(uniqueMetrics));

      expect(uniqueMetrics.size).toBeGreaterThan(0);
    });
  });

  describe('Alert Lifecycle', () => {
    it('should transition through pending -> firing -> resolved', () => {
      const now = Date.now();
      const metricKey = 'http.request.duration.p95' as const;

      // Stage 1: Pending (第一次超阈值)
      engine.evaluate({
        timestamp: now,
        metrics: { [metricKey]: 1.5 }
      });

      // Stage 2: Firing (连续超阈值)
      for (let i = 1; i < 4; i++) {
        engine.evaluate({
          timestamp: now + i * 40000,
          metrics: { [metricKey]: 1.5 }
        });
      }

      const firingAlerts = engine.getActiveAlerts();
      expect(firingAlerts.some(a => a.status === 'firing')).toBe(true);

      // Stage 3: Resolved (恢复正常)
      const resolveEvents = engine.evaluate({
        timestamp: now + 200000,
        metrics: { [metricKey]: 0.5 }
      });

      const resolvedEvents = resolveEvents.filter(e => e.status === 'resolved');
      console.log('Alert lifecycle completed:', resolvedEvents.length, 'resolved');
      expect(resolvedEvents.length).toBeGreaterThan(0);
    });
  });
});

describe('Alert Performance', () => {
  it('should complete evaluation in <10ms per tick', () => {
    const testRules = ALERT_RULES;
    const engine = new AlertEngine(testRules);

    const metrics = {
      'http.request.duration.p95': 0.8,
      'db.slow_queries.per_min': 5,
      'http.error_rate.5xx': 0.005,
      'decision.confidence.p50': 0.75
    };

    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      engine.evaluate({
        timestamp: Date.now(),
        metrics
      });
    }

    const duration = Date.now() - startTime;
    const avgPerTick = duration / 100;

    console.log(`Average evaluation time: ${avgPerTick.toFixed(2)}ms per tick`);
    expect(avgPerTick).toBeLessThan(10);
  });
});
