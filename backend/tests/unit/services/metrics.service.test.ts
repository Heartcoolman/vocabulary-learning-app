/**
 * Metrics Service Unit Tests
 * 测试监控指标服务的核心功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  incCounter,
  setGauge,
  incGauge,
  decGauge,
  observeHistogram,
  recordRewardProcessed,
  recordFeatureVectorSaved,
  updateRewardQueueLength,
  recordRewardProcessingDuration,
  getMetricsJson,
  getMetricsPrometheus,
  resetAllMetrics
} from '../../../src/services/metrics.service';

describe('Metrics Service', () => {
  beforeEach(() => {
    resetAllMetrics();
  });

  describe('Counter Operations', () => {
    it('should increment counter with labels', () => {
      recordRewardProcessed('success');
      recordRewardProcessed('success');
      recordRewardProcessed('failure');

      const metrics = getMetricsJson();
      const counter = metrics['amas_reward_processed_total'] as {
        type: string;
        values: Record<string, number>;
      };

      expect(counter.type).toBe('counter');
      expect(counter.values['status="success"']).toBe(2);
      expect(counter.values['status="failure"']).toBe(1);
    });

    it('should record feature vector saved metrics', () => {
      recordFeatureVectorSaved('success');
      recordFeatureVectorSaved('failure');
      recordFeatureVectorSaved('success');

      const metrics = getMetricsJson();
      const counter = metrics['amas_feature_vector_saved_total'] as {
        type: string;
        values: Record<string, number>;
      };

      expect(counter.values['status="success"']).toBe(2);
      expect(counter.values['status="failure"']).toBe(1);
    });
  });

  describe('Gauge Operations', () => {
    it('should set and update gauge values', () => {
      updateRewardQueueLength(10);

      const metrics = getMetricsJson();
      const gauge = metrics['amas_reward_queue_length'] as {
        type: string;
        value: number;
      };

      expect(gauge.type).toBe('gauge');
      expect(gauge.value).toBe(10);
    });

    it('should update gauge to new value', () => {
      updateRewardQueueLength(5);
      updateRewardQueueLength(15);

      const metrics = getMetricsJson();
      const gauge = metrics['amas_reward_queue_length'] as {
        type: string;
        value: number;
      };

      expect(gauge.value).toBe(15);
    });
  });

  describe('Histogram Operations', () => {
    it('should record histogram observations', () => {
      recordRewardProcessingDuration(0.05);
      recordRewardProcessingDuration(0.15);
      recordRewardProcessingDuration(0.5);
      recordRewardProcessingDuration(2.0);

      const metrics = getMetricsJson();
      const histogram = metrics['amas_reward_processing_duration_seconds'] as {
        type: string;
        count: number;
        sum: number;
        buckets: Record<string, number>;
      };

      expect(histogram.type).toBe('histogram');
      expect(histogram.count).toBe(4);
      expect(histogram.sum).toBeCloseTo(2.7, 5);
    });

    it('should correctly bucket histogram values', () => {
      recordRewardProcessingDuration(0.01); // <= 0.01
      recordRewardProcessingDuration(0.03); // <= 0.05
      recordRewardProcessingDuration(0.08); // <= 0.1

      const metrics = getMetricsJson();
      const histogram = metrics['amas_reward_processing_duration_seconds'] as {
        buckets: Record<string, number>;
      };

      // 0.01桶应该有1个（只有0.01落入）
      expect(histogram.buckets['le_0.01']).toBe(1);
      // 0.05桶应该有2个（0.01和0.03都落入）
      expect(histogram.buckets['le_0.05']).toBe(2);
      // 0.1桶应该有3个（所有值都落入）
      expect(histogram.buckets['le_0.1']).toBe(3);
    });
  });

  describe('Prometheus Export', () => {
    it('should export metrics in Prometheus format', () => {
      recordRewardProcessed('success');
      updateRewardQueueLength(5);

      const output = getMetricsPrometheus();

      expect(output).toContain('# HELP amas_reward_processed_total');
      expect(output).toContain('# TYPE amas_reward_processed_total counter');
      expect(output).toContain('amas_reward_processed_total{status="success"} 1');
      expect(output).toContain('# HELP amas_reward_queue_length');
      expect(output).toContain('# TYPE amas_reward_queue_length gauge');
      expect(output).toContain('amas_reward_queue_length 5');
    });

    it('should export histogram with buckets', () => {
      recordRewardProcessingDuration(0.1);

      const output = getMetricsPrometheus();

      expect(output).toContain('# TYPE amas_reward_processing_duration_seconds histogram');
      expect(output).toContain('amas_reward_processing_duration_seconds_bucket{le="0.1"}');
      expect(output).toContain('amas_reward_processing_duration_seconds_sum');
      expect(output).toContain('amas_reward_processing_duration_seconds_count');
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all metrics to initial state', () => {
      recordRewardProcessed('success');
      updateRewardQueueLength(10);
      recordRewardProcessingDuration(1.0);

      resetAllMetrics();

      const metrics = getMetricsJson();
      const counter = metrics['amas_reward_processed_total'] as {
        values: Record<string, number>;
      };
      const gauge = metrics['amas_reward_queue_length'] as { value: number };
      const histogram = metrics['amas_reward_processing_duration_seconds'] as {
        count: number;
        sum: number;
      };

      expect(Object.keys(counter.values).length).toBe(0);
      expect(gauge.value).toBe(0);
      expect(histogram.count).toBe(0);
      expect(histogram.sum).toBe(0);
    });
  });
});
