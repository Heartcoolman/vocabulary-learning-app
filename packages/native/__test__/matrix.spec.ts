import { describe, it, expect } from 'vitest';
import { LinUcbNative } from '../index.js';

describe('Matrix Operations', () => {
  describe('Cholesky Decomposition', () => {
    it('should initialize with correct L matrix (sqrt(lambda) * I)', () => {
      const linucb = new LinUcbNative(0.3, 1.0);
      const model = linucb.getModel();

      // L should be identity matrix when lambda = 1.0
      const d = model.d;
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          const expected = i === j ? 1.0 : 0.0;
          expect(model.L[i * d + j]).toBeCloseTo(expected, 6);
        }
      }
    });

    it('should maintain numerical stability after multiple updates', () => {
      const linucb = new LinUcbNative(0.3, 1.0);

      const state = {
        masteryLevel: 0.5,
        recentAccuracy: 0.7,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000
      };

      const action = { wordId: 'test', difficulty: 'recall', scheduledAt: undefined };
      const context = { timeOfDay: 0.5, dayOfWeek: 3, sessionDuration: 1800, fatigueFactor: 0.2 };

      // Perform 100 updates
      for (let i = 0; i < 100; i++) {
        linucb.update(state, action, Math.random(), context);
      }

      // Model should still be healthy
      expect(linucb.selfTest()).toBe(true);

      const diag = linucb.diagnose();
      expect(diag.isHealthy).toBe(true);
      expect(diag.hasNaN).toBe(false);
      expect(diag.hasInf).toBe(false);
    });
  });

  describe('Numerical Consistency', () => {
    it('should produce consistent results for same inputs', () => {
      const linucb1 = new LinUcbNative(0.3, 1.0);
      const linucb2 = new LinUcbNative(0.3, 1.0);

      const state = {
        masteryLevel: 0.6,
        recentAccuracy: 0.8,
        studyStreak: 10,
        totalInteractions: 50,
        averageResponseTime: 1500
      };

      const actions = [
        { wordId: 'w1', difficulty: 'recognition', scheduledAt: undefined },
        { wordId: 'w2', difficulty: 'recall', scheduledAt: undefined },
      ];

      const context = { timeOfDay: 0.3, dayOfWeek: 1, sessionDuration: 900, fatigueFactor: 0.1 };

      const result1 = linucb1.selectAction(state, actions, context);
      const result2 = linucb2.selectAction(state, actions, context);

      expect(result1.selectedIndex).toBe(result2.selectedIndex);
      expect(result1.score).toBeCloseTo(result2.score, 10);
    });

    it('should have error less than 1e-6 for basic operations', () => {
      const linucb = new LinUcbNative(0.3, 1.0);
      const model = linucb.getModel();

      // Check A matrix is lambda * I
      const d = model.d;
      for (let i = 0; i < d; i++) {
        expect(Math.abs(model.A[i * d + i] - 1.0)).toBeLessThan(1e-6);
      }

      // Check b vector is zero
      for (let i = 0; i < d; i++) {
        expect(Math.abs(model.b[i])).toBeLessThan(1e-6);
      }
    });
  });

  describe('FFI Performance', () => {
    it('should complete single selectAction in reasonable time', () => {
      const linucb = new LinUcbNative(0.3, 1.0);

      const state = {
        masteryLevel: 0.5,
        recentAccuracy: 0.7,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000
      };

      const actions = [
        { wordId: 'w1', difficulty: 'recognition', scheduledAt: undefined },
        { wordId: 'w2', difficulty: 'recall', scheduledAt: undefined },
        { wordId: 'w3', difficulty: 'spelling', scheduledAt: undefined },
      ];

      const context = { timeOfDay: 0.5, dayOfWeek: 3, sessionDuration: 1800, fatigueFactor: 0.2 };

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        linucb.selectAction(state, actions, context);
      }
      const elapsed = performance.now() - start;

      // Average should be < 0.5ms per call
      expect(elapsed / 1000).toBeLessThan(0.5);
    });
  });
});
