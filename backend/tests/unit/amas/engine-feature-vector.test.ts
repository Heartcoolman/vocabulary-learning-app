/**
 * AMAS Engine Feature Vector Unit Tests
 * 测试引擎返回featureVector的功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AMASEngine, ProcessResult } from '../../../src/amas/engine';
import { RawEvent, UserState, PersistableFeatureVector } from '../../../src/amas/types';

describe('AMASEngine Feature Vector', () => {
  let engine: AMASEngine;

  const mockRawEvent: RawEvent = {
    wordId: 'test-word-1',
    isCorrect: true,
    responseTime: 2500,
    dwellTime: 1000,
    timestamp: Date.now(),
    pauseCount: 0,
    switchCount: 0,
    retryCount: 0,
    focusLossDuration: 0,
    interactionDensity: 1.0
  };

  beforeEach(() => {
    engine = new AMASEngine();
  });

  describe('ProcessResult Feature Vector', () => {
    it('should return featureVector in ProcessResult', async () => {
      const result = await engine.processEvent('test-user-1', mockRawEvent);

      expect(result.featureVector).toBeDefined();
      expect(result.featureVector).not.toBeNull();
    });

    it('should return featureVector with correct structure', async () => {
      const result = await engine.processEvent('test-user-1', mockRawEvent);
      const fv = result.featureVector as PersistableFeatureVector;

      expect(fv).toHaveProperty('values');
      expect(fv).toHaveProperty('version');
      expect(fv).toHaveProperty('ts');
      expect(fv).toHaveProperty('labels');
    });

    it('should return featureVector values as number array', async () => {
      const result = await engine.processEvent('test-user-1', mockRawEvent);
      const fv = result.featureVector as PersistableFeatureVector;

      expect(Array.isArray(fv.values)).toBe(true);
      expect(fv.values.length).toBeGreaterThan(0);
      fv.values.forEach((value) => {
        expect(typeof value).toBe('number');
      });
    });

    it('should return featureVector with version number', async () => {
      const result = await engine.processEvent('test-user-1', mockRawEvent);
      const fv = result.featureVector as PersistableFeatureVector;

      expect(typeof fv.version).toBe('number');
      expect(fv.version).toBeGreaterThan(0);
    });

    it('should return featureVector with timestamp', async () => {
      const result = await engine.processEvent('test-user-1', mockRawEvent);
      const fv = result.featureVector as PersistableFeatureVector;

      expect(typeof fv.ts).toBe('number');
      expect(fv.ts).toBeGreaterThan(0);
    });

    it('should return featureVector with labels array', async () => {
      const result = await engine.processEvent('test-user-1', mockRawEvent);
      const fv = result.featureVector as PersistableFeatureVector;

      expect(Array.isArray(fv.labels)).toBe(true);
      expect(fv.labels.length).toBeGreaterThan(0);
      fv.labels.forEach((label) => {
        expect(typeof label).toBe('string');
      });
    });

    it('should return consistent featureVector for same event', async () => {
      const result1 = await engine.processEvent('test-user-2', mockRawEvent);

      // 重置引擎以获得一致的初始状态
      const engine2 = new AMASEngine();
      const result2 = await engine2.processEvent('test-user-2', mockRawEvent);

      const fv1 = result1.featureVector as PersistableFeatureVector;
      const fv2 = result2.featureVector as PersistableFeatureVector;

      expect(fv1.values.length).toBe(fv2.values.length);
      expect(fv1.labels).toEqual(fv2.labels);
    });

    it('should return different featureVector for different events', async () => {
      const correctEvent: RawEvent = {
        ...mockRawEvent,
        isCorrect: true,
        responseTime: 1000
      };

      const incorrectEvent: RawEvent = {
        ...mockRawEvent,
        isCorrect: false,
        responseTime: 5000,
        retryCount: 2
      };

      const result1 = await engine.processEvent('test-user-3', correctEvent);
      const result2 = await engine.processEvent('test-user-3', incorrectEvent);

      const fv1 = result1.featureVector as PersistableFeatureVector;
      const fv2 = result2.featureVector as PersistableFeatureVector;

      // 特征值应该不同
      const isDifferent = fv1.values.some((v, i) => v !== fv2.values[i]);
      expect(isDifferent).toBe(true);
    });
  });

  describe('Feature Vector Serialization', () => {
    it('should be JSON serializable', async () => {
      const result = await engine.processEvent('test-user-4', mockRawEvent);
      const fv = result.featureVector as PersistableFeatureVector;

      const serialized = JSON.stringify(fv);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.values).toEqual(fv.values);
      expect(deserialized.version).toBe(fv.version);
      expect(deserialized.ts).toBe(fv.ts);
      expect(deserialized.labels).toEqual(fv.labels);
    });

    it('should not contain Float32Array', async () => {
      const result = await engine.processEvent('test-user-5', mockRawEvent);
      const fv = result.featureVector as PersistableFeatureVector;

      expect(fv.values instanceof Float32Array).toBe(false);
      expect(Array.isArray(fv.values)).toBe(true);
    });
  });

  describe('Feature Vector with Options', () => {
    it('should return featureVector even with skipUpdate option', async () => {
      const result = await engine.processEvent('test-user-6', mockRawEvent, {
        skipUpdate: true
      });

      expect(result.featureVector).toBeDefined();
      expect(result.featureVector?.values.length).toBeGreaterThan(0);
    });

    it('should return featureVector with currentParams option', async () => {
      const result = await engine.processEvent('test-user-7', mockRawEvent, {
        currentParams: {
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 8,
          hint_level: 1
        }
      });

      expect(result.featureVector).toBeDefined();
      expect(result.featureVector?.values.length).toBeGreaterThan(0);
    });
  });
});
