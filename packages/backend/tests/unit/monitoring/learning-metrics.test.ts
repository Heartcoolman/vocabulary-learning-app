/**
 * 学习体验指标系统测试
 */

import {
  updateRetentionRate,
  recordReview,
  recordAnswerLatency,
  recordSessionStart,
  recordSessionComplete,
  recordSessionDropout,
  recordForgettingPrediction,
  recordFlowSession,
  getLearningMetricsJson,
  getLearningMetricsPrometheus,
  resetAllLearningMetrics,
  learningMetricsService,
} from '../../../src/monitoring/learning-metrics';

describe('LearningMetrics', () => {
  beforeEach(() => {
    resetAllLearningMetrics();
  });

  describe('留存率指标', () => {
    it('应该正确记录次日留存率', () => {
      updateRetentionRate('1d', 0.75);
      const metrics = getLearningMetricsJson();
      expect(metrics['learning_retention_rate_1d']).toMatchObject({
        type: 'gauge',
        value: 75,
      });
    });

    it('应该正确记录7日留存率', () => {
      updateRetentionRate('7d', 0.6);
      const metrics = getLearningMetricsJson();
      expect(metrics['learning_retention_rate_7d']).toMatchObject({
        type: 'gauge',
        value: 60,
      });
    });

    it('应该正确记录30日留存率', () => {
      updateRetentionRate('30d', 0.45);
      const metrics = getLearningMetricsJson();
      expect(metrics['learning_retention_rate_30d']).toMatchObject({
        type: 'gauge',
        value: 45,
      });
    });

    it('应该限制留存率在0-100之间', () => {
      updateRetentionRate('1d', 1.5);
      let metrics = getLearningMetricsJson();
      expect(metrics['learning_retention_rate_1d']).toMatchObject({
        value: 100,
      });

      updateRetentionRate('1d', -0.5);
      metrics = getLearningMetricsJson();
      expect(metrics['learning_retention_rate_1d']).toMatchObject({
        value: 0,
      });
    });
  });

  describe('复习命中率指标', () => {
    it('应该正确记录复习行为', () => {
      recordReview(100, 80);
      const metrics = getLearningMetricsJson();

      expect(metrics['learning_review_expected_total']).toMatchObject({
        type: 'counter',
        values: { total: 100 },
      });
      expect(metrics['learning_review_actual_total']).toMatchObject({
        type: 'counter',
        values: { total: 80 },
      });
      expect(metrics['learning_review_hit_rate']).toMatchObject({
        type: 'gauge',
        value: 0.8,
      });
    });

    it('应该累积多次复习记录', () => {
      recordReview(100, 80);
      recordReview(50, 45);
      const metrics = getLearningMetricsJson();

      expect(metrics['learning_review_expected_total']).toMatchObject({
        values: { total: 150 },
      });
      expect(metrics['learning_review_actual_total']).toMatchObject({
        values: { total: 125 },
      });
      expect(metrics['learning_review_hit_rate']).toMatchObject({
        value: 125 / 150,
      });
    });
  });

  describe('答题时延指标', () => {
    it('应该正确记录答题时延', () => {
      recordAnswerLatency(1500);
      recordAnswerLatency(2500);
      recordAnswerLatency(3500);

      const metrics = getLearningMetricsJson();
      const latencyMetric = metrics['learning_answer_latency_ms'] as any;

      expect(latencyMetric.type).toBe('histogram');
      expect(latencyMetric.count).toBe(3);
      expect(latencyMetric.sum).toBe(7500);
      expect(latencyMetric.avg).toBe(2500);
    });

    it('应该忽略无效的时延值', () => {
      recordAnswerLatency(-100);
      recordAnswerLatency(NaN);
      recordAnswerLatency(Infinity);

      const metrics = getLearningMetricsJson();
      const latencyMetric = metrics['learning_answer_latency_ms'] as any;

      expect(latencyMetric.count).toBe(0);
    });

    it('应该正确计算P99时延', () => {
      // 记录100个时延值
      for (let i = 1; i <= 100; i++) {
        recordAnswerLatency(i * 100); // 100ms, 200ms, ..., 10000ms
      }

      const metrics = getLearningMetricsJson();
      const latencyMetric = metrics['learning_answer_latency_ms'] as any;

      expect(latencyMetric.count).toBe(100);
      // 对于这个均匀分布，P99=9900ms会落在bucket[5000, 10000]之间
      // 由于我们找第一个累积值>=count*0.99的bucket，可能是5000或10000
      expect(latencyMetric.p99).toBeGreaterThanOrEqual(5000);
      expect(latencyMetric.p95).toBeGreaterThan(0);
      expect(latencyMetric.p50).toBeGreaterThan(0);
    });
  });

  describe('会话中断率指标', () => {
    it('应该正确记录会话开始', () => {
      recordSessionStart();
      recordSessionStart();

      const metrics = getLearningMetricsJson();
      expect(metrics['learning_session_started_total']).toMatchObject({
        values: { total: 2 },
      });
    });

    it('应该正确记录会话完成', () => {
      recordSessionStart();
      recordSessionComplete();

      const metrics = getLearningMetricsJson();
      expect(metrics['learning_session_completed_total']).toMatchObject({
        values: { total: 1 },
      });
    });

    it('应该正确计算中断率', () => {
      recordSessionStart();
      recordSessionStart();
      recordSessionStart();
      recordSessionComplete();
      recordSessionDropout();

      const metrics = getLearningMetricsJson();
      expect(metrics['learning_session_dropout_rate']).toMatchObject({
        type: 'gauge',
        value: 1 / 3,
      });
    });
  });

  describe('遗忘预测准确率指标', () => {
    it('应该正确记录预测结果', () => {
      recordForgettingPrediction(true);
      recordForgettingPrediction(true);
      recordForgettingPrediction(false);

      const metrics = getLearningMetricsJson();
      expect(metrics['learning_forgetting_prediction_total']).toMatchObject({
        values: { total: 3 },
      });
      expect(metrics['learning_forgetting_prediction_correct_total']).toMatchObject({
        values: { total: 2 },
      });
      expect(metrics['learning_forgetting_prediction_accuracy']).toMatchObject({
        type: 'gauge',
        value: (2 / 3) * 100,
      });
    });

    it('应该正确计算准确率', () => {
      // 80% 准确率
      for (let i = 0; i < 8; i++) {
        recordForgettingPrediction(true);
      }
      for (let i = 0; i < 2; i++) {
        recordForgettingPrediction(false);
      }

      const metrics = getLearningMetricsJson();
      expect(metrics['learning_forgetting_prediction_accuracy']).toMatchObject({
        value: 80,
      });
    });
  });

  describe('心流会话占比指标', () => {
    it('应该正确记录心流会话', () => {
      recordSessionStart();
      recordSessionStart();
      recordFlowSession();

      const metrics = getLearningMetricsJson();
      expect(metrics['learning_flow_session_total']).toMatchObject({
        values: { total: 1 },
      });
      expect(metrics['learning_flow_session_ratio']).toMatchObject({
        type: 'gauge',
        value: 0.5,
      });
    });

    it('应该正确计算心流会话占比', () => {
      recordSessionStart();
      recordSessionStart();
      recordSessionStart();
      recordSessionStart();
      recordFlowSession();
      recordFlowSession();

      const metrics = getLearningMetricsJson();
      expect(metrics['learning_flow_session_ratio']).toMatchObject({
        value: 0.5,
      });
    });
  });

  describe('Prometheus格式导出', () => {
    it('应该导出Prometheus格式的指标', () => {
      updateRetentionRate('1d', 0.75);
      recordReview(100, 80);
      recordAnswerLatency(1500);

      const prometheus = getLearningMetricsPrometheus();

      expect(prometheus).toContain('# HELP learning_retention_rate_1d');
      expect(prometheus).toContain('# TYPE learning_retention_rate_1d gauge');
      expect(prometheus).toContain('learning_retention_rate_1d 75');

      expect(prometheus).toContain('# HELP learning_review_hit_rate');
      expect(prometheus).toContain('# TYPE learning_review_hit_rate gauge');
      expect(prometheus).toContain('learning_review_hit_rate 0.8');

      expect(prometheus).toContain('# HELP learning_answer_latency_ms');
      expect(prometheus).toContain('# TYPE learning_answer_latency_ms histogram');
    });

    it('应该正确格式化histogram bucket', () => {
      recordAnswerLatency(1500);
      const prometheus = getLearningMetricsPrometheus();

      expect(prometheus).toContain('learning_answer_latency_ms_bucket{le="2000"}');
      expect(prometheus).toContain('learning_answer_latency_ms_bucket{le="+Inf"}');
      expect(prometheus).toContain('learning_answer_latency_ms_sum');
      expect(prometheus).toContain('learning_answer_latency_ms_count');
    });
  });

  describe('LearningMetricsService', () => {
    it('应该提供服务接口', () => {
      expect(learningMetricsService).toBeDefined();
      expect(learningMetricsService.getMetricsJson).toBeInstanceOf(Function);
      expect(learningMetricsService.getMetricsPrometheus).toBeInstanceOf(Function);
      expect(learningMetricsService.resetMetrics).toBeInstanceOf(Function);
    });

    it('应该正确获取JSON指标', () => {
      updateRetentionRate('1d', 0.75);
      const metrics = learningMetricsService.getMetricsJson();
      expect(metrics['learning_retention_rate_1d']).toBeDefined();
    });

    it('应该正确获取Prometheus指标', () => {
      updateRetentionRate('1d', 0.75);
      const prometheus = learningMetricsService.getMetricsPrometheus();
      expect(prometheus).toContain('learning_retention_rate_1d');
    });

    it('应该正确重置指标', () => {
      updateRetentionRate('1d', 0.75);
      learningMetricsService.resetMetrics();
      const metrics = learningMetricsService.getMetricsJson();
      const retentionMetric = metrics['learning_retention_rate_1d'] as any;
      expect(retentionMetric.value).toBe(0);
    });
  });

  describe('指标重置', () => {
    it('应该重置所有指标', () => {
      updateRetentionRate('1d', 0.75);
      recordReview(100, 80);
      recordAnswerLatency(1500);
      recordSessionStart();
      recordForgettingPrediction(true);
      recordFlowSession();

      resetAllLearningMetrics();
      const metrics = getLearningMetricsJson();

      // 所有gauge应该归零
      expect((metrics['learning_retention_rate_1d'] as any).value).toBe(0);
      expect((metrics['learning_review_hit_rate'] as any).value).toBe(0);
      expect((metrics['learning_session_dropout_rate'] as any).value).toBe(0);

      // 所有counter应该清空
      expect((metrics['learning_review_expected_total'] as any).values).toEqual({});

      // 所有histogram应该清空
      expect((metrics['learning_answer_latency_ms'] as any).count).toBe(0);
    });
  });
});
