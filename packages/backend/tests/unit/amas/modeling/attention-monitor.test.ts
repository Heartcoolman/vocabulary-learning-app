/**
 * AttentionMonitor Unit Tests
 *
 * Tests for the attention monitoring model that tracks user focus levels
 * using weighted sigmoid activation and EMA smoothing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AttentionMonitor,
  AttentionFeatures
} from '../../../../src/amas/modeling/attention-monitor';

describe('AttentionMonitor', () => {
  let monitor: AttentionMonitor;

  beforeEach(() => {
    monitor = new AttentionMonitor();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default attention value of 0.7', () => {
      expect(monitor.get()).toBe(0.7);
    });

    it('should accept custom initial attention value', () => {
      const customMonitor = new AttentionMonitor(undefined, undefined, 0.5);
      expect(customMonitor.get()).toBe(0.5);
    });

    it('should accept custom weights', () => {
      const weights = new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
      const customMonitor = new AttentionMonitor(weights);
      expect(customMonitor.get()).toBe(0.7);
    });

    it('should accept out-of-range initial attention (not clamped in constructor)', () => {
      // Note: AttentionMonitor does not clamp initial value in constructor
      // Clamping happens during update/reset operations
      const high = new AttentionMonitor(undefined, undefined, 1.5);
      expect(high.get()).toBe(1.5);

      const low = new AttentionMonitor(undefined, undefined, -0.5);
      expect(low.get()).toBe(-0.5);
    });
  });

  // ==================== Update Tests ====================

  describe('update', () => {
    it('should decrease attention with high distraction features', () => {
      const initial = monitor.get();
      const features: AttentionFeatures = {
        z_rt_mean: 2.0, // slow response
        z_rt_cv: 1.5, // high variability
        z_pace_cv: 1.0,
        z_pause: 2.0, // many pauses
        z_switch: 3.0, // many screen switches
        z_drift: 1.0,
        interaction_density: 0.2, // low interaction
        focus_loss_duration: 60 // long focus loss
      };

      const result = monitor.update(features);
      expect(result).toBeLessThan(initial);
    });

    it('should maintain high attention with good focus features', () => {
      const features: AttentionFeatures = {
        z_rt_mean: -0.5, // fast response
        z_rt_cv: -0.3, // low variability
        z_pace_cv: 0,
        z_pause: 0, // no pauses
        z_switch: 0, // no screen switches
        z_drift: -0.2,
        interaction_density: 0.8, // high interaction
        focus_loss_duration: 0
      };

      const result = monitor.update(features);
      expect(result).toBeGreaterThanOrEqual(0.5);
    });

    it('should apply EMA smoothing across updates', () => {
      // High distraction features
      const badFeatures: AttentionFeatures = {
        z_rt_mean: 3.0,
        z_rt_cv: 2.0,
        z_pace_cv: 2.0,
        z_pause: 3.0,
        z_switch: 3.0,
        z_drift: 2.0,
        interaction_density: 0.1,
        focus_loss_duration: 120
      };

      const first = monitor.update(badFeatures);
      const second = monitor.update(badFeatures);

      // Second update should continue decreasing due to EMA
      expect(second).toBeLessThanOrEqual(first);
    });

    it('should keep attention in [0,1] range', () => {
      // Extreme distraction
      const extreme: AttentionFeatures = {
        z_rt_mean: 10,
        z_rt_cv: 10,
        z_pace_cv: 10,
        z_pause: 10,
        z_switch: 10,
        z_drift: 10,
        interaction_density: 0,
        focus_loss_duration: 1000
      };

      for (let i = 0; i < 100; i++) {
        monitor.update(extreme);
      }

      expect(monitor.get()).toBeGreaterThanOrEqual(0);
      expect(monitor.get()).toBeLessThanOrEqual(1);
    });
  });

  // ==================== updateFromArray Tests ====================

  describe('updateFromArray', () => {
    it('should update from Float32Array features', () => {
      const features = new Float32Array([0, 0, 0, 0, 0, 0, 0.8, 0]);
      const result = monitor.updateFromArray(features);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should throw error for array with fewer than 8 elements', () => {
      const shortArray = new Float32Array([0, 0, 0]);
      expect(() => monitor.updateFromArray(shortArray)).toThrow(
        'Attention features array must have at least 8 elements'
      );
    });
  });

  // ==================== State Management Tests ====================

  describe('state management', () => {
    it('should reset to default value', () => {
      // Update to change state
      monitor.update({
        z_rt_mean: 5,
        z_rt_cv: 5,
        z_pace_cv: 5,
        z_pause: 5,
        z_switch: 5,
        z_drift: 5,
        interaction_density: 0,
        focus_loss_duration: 100
      });

      monitor.reset();
      expect(monitor.get()).toBe(0.7);
    });

    it('should reset to custom value', () => {
      monitor.reset(0.3);
      expect(monitor.get()).toBe(0.3);
    });

    it('should clamp reset value to [0,1]', () => {
      monitor.reset(1.5);
      expect(monitor.get()).toBe(1);

      monitor.reset(-0.5);
      expect(monitor.get()).toBe(0);
    });

    it('should persist and restore state correctly', () => {
      const features: AttentionFeatures = {
        z_rt_mean: 1,
        z_rt_cv: 1,
        z_pace_cv: 0,
        z_pause: 0,
        z_switch: 0,
        z_drift: 0,
        interaction_density: 0.5,
        focus_loss_duration: 0
      };
      monitor.update(features);

      const state = monitor.getState();
      expect(state).toHaveProperty('prevAttention');
      expect(state).toHaveProperty('beta');

      const newMonitor = new AttentionMonitor();
      newMonitor.setState(state);

      expect(newMonitor.get()).toBe(monitor.get());
    });
  });

  // ==================== Configuration Tests ====================

  describe('configuration', () => {
    it('should set beta (EMA smoothing coefficient)', () => {
      monitor.setBeta(0.5);
      const state = monitor.getState();
      expect(state.beta).toBe(0.5);
    });

    it('should clamp beta to [0,1]', () => {
      monitor.setBeta(1.5);
      expect(monitor.getState().beta).toBe(1);

      monitor.setBeta(-0.5);
      expect(monitor.getState().beta).toBe(0);
    });

    it('should set custom weights', () => {
      const weights = new Float32Array([0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
      monitor.setWeights(weights);

      // Should not throw and monitor should still work
      const result = monitor.update({
        z_rt_mean: 0,
        z_rt_cv: 0,
        z_pace_cv: 0,
        z_pause: 0,
        z_switch: 0,
        z_drift: 0,
        interaction_density: 0.5,
        focus_loss_duration: 0
      });
      expect(result).toBeGreaterThan(0);
    });

    it('should throw error for weights array with wrong length', () => {
      const wrongLength = new Float32Array([0.1, 0.1, 0.1]);
      expect(() => monitor.setWeights(wrongLength)).toThrow(
        'Weights array must have exactly 8 elements'
      );
    });
  });

  // ==================== Alias Tests ====================

  describe('aliases', () => {
    it('getAttention should be alias for get', () => {
      expect(monitor.getAttention()).toBe(monitor.get());

      monitor.update({
        z_rt_mean: 1,
        z_rt_cv: 0,
        z_pace_cv: 0,
        z_pause: 0,
        z_switch: 0,
        z_drift: 0,
        interaction_density: 0.5,
        focus_loss_duration: 0
      });

      expect(monitor.getAttention()).toBe(monitor.get());
    });
  });
});
