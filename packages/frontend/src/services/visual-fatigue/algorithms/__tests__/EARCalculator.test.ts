/**
 * EARCalculator Tests
 *
 * 测试 EAR (Eye Aspect Ratio) 计算器
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EARCalculator, type EARResult } from '../EARCalculator';
import { EYE_LANDMARKS } from '@danci/shared';

// Helper to create mock landmarks with specific eye positions
function createMockLandmarks(
  leftEye: {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    p3: { x: number; y: number };
    p4: { x: number; y: number };
    p5: { x: number; y: number };
    p6: { x: number; y: number };
  },
  rightEye: {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    p3: { x: number; y: number };
    p4: { x: number; y: number };
    p5: { x: number; y: number };
    p6: { x: number; y: number };
  },
): { x: number; y: number; z?: number }[] {
  // Create 478 landmarks (MediaPipe Face Mesh output)
  const landmarks: { x: number; y: number; z?: number }[] = Array(478)
    .fill(null)
    .map(() => ({ x: 0.5, y: 0.5, z: 0 }));

  // Set left eye landmarks
  landmarks[EYE_LANDMARKS.LEFT.P1] = leftEye.p1;
  landmarks[EYE_LANDMARKS.LEFT.P2] = leftEye.p2;
  landmarks[EYE_LANDMARKS.LEFT.P3] = leftEye.p3;
  landmarks[EYE_LANDMARKS.LEFT.P4] = leftEye.p4;
  landmarks[EYE_LANDMARKS.LEFT.P5] = leftEye.p5;
  landmarks[EYE_LANDMARKS.LEFT.P6] = leftEye.p6;

  // Set right eye landmarks
  landmarks[EYE_LANDMARKS.RIGHT.P1] = rightEye.p1;
  landmarks[EYE_LANDMARKS.RIGHT.P2] = rightEye.p2;
  landmarks[EYE_LANDMARKS.RIGHT.P3] = rightEye.p3;
  landmarks[EYE_LANDMARKS.RIGHT.P4] = rightEye.p4;
  landmarks[EYE_LANDMARKS.RIGHT.P5] = rightEye.p5;
  landmarks[EYE_LANDMARKS.RIGHT.P6] = rightEye.p6;

  return landmarks;
}

// Helper to create eye landmarks with a specific EAR value
function createEyeWithEAR(ear: number, centerX: number = 0.3, centerY: number = 0.3) {
  // EAR = (|P2-P6| + |P3-P5|) / (2 * |P1-P4|)
  // For simplicity, set horizontal distance to 0.1 and calculate vertical
  const horizontalDist = 0.1;
  // ear = verticalSum / (2 * horizontalDist)
  // verticalSum = ear * 2 * horizontalDist
  const verticalDist = (ear * 2 * horizontalDist) / 2; // Divide by 2 since we have two vertical distances

  return {
    p1: { x: centerX - horizontalDist / 2, y: centerY }, // Left corner
    p2: { x: centerX - 0.02, y: centerY - verticalDist / 2 }, // Upper left
    p3: { x: centerX + 0.02, y: centerY - verticalDist / 2 }, // Upper right
    p4: { x: centerX + horizontalDist / 2, y: centerY }, // Right corner
    p5: { x: centerX + 0.02, y: centerY + verticalDist / 2 }, // Lower right
    p6: { x: centerX - 0.02, y: centerY + verticalDist / 2 }, // Lower left
  };
}

describe('EARCalculator', () => {
  let calculator: EARCalculator;

  beforeEach(() => {
    calculator = new EARCalculator();
  });

  describe('initialization', () => {
    it('should initialize with default smoothing factor', () => {
      const calc = new EARCalculator();
      expect(calc).toBeDefined();
    });

    it('should accept custom smoothing factor', () => {
      const calc = new EARCalculator(0.5);
      expect(calc).toBeDefined();
    });
  });

  describe('EAR calculation', () => {
    it('should calculate EAR correctly for open eyes (~0.3)', () => {
      const leftEye = createEyeWithEAR(0.3, 0.3, 0.3);
      const rightEye = createEyeWithEAR(0.3, 0.7, 0.3);
      const landmarks = createMockLandmarks(leftEye, rightEye);

      const result = calculator.calculate(landmarks);

      expect(result.isValid).toBe(true);
      expect(result.avgEAR).toBeGreaterThan(0.2);
      expect(result.avgEAR).toBeLessThan(0.4);
    });

    it('should calculate low EAR for closed eyes (~0.15)', () => {
      const leftEye = createEyeWithEAR(0.12, 0.3, 0.3);
      const rightEye = createEyeWithEAR(0.12, 0.7, 0.3);
      const landmarks = createMockLandmarks(leftEye, rightEye);

      const result = calculator.calculate(landmarks);

      expect(result.isValid).toBe(true);
      // Due to smoothing from initial lastEAR of 0.3, result will be higher than raw 0.12
      expect(result.avgEAR).toBeLessThan(0.25);
    });

    it('should return separate left and right EAR values', () => {
      const leftEye = createEyeWithEAR(0.25, 0.3, 0.3);
      const rightEye = createEyeWithEAR(0.35, 0.7, 0.3);
      const landmarks = createMockLandmarks(leftEye, rightEye);

      const result = calculator.calculate(landmarks);

      expect(result.isValid).toBe(true);
      expect(result.leftEAR).toBeLessThan(result.rightEAR);
    });

    it('should calculate average of both eyes', () => {
      const leftEye = createEyeWithEAR(0.2, 0.3, 0.3);
      const rightEye = createEyeWithEAR(0.4, 0.7, 0.3);
      const landmarks = createMockLandmarks(leftEye, rightEye);

      const result = calculator.calculate(landmarks);

      expect(result.isValid).toBe(true);
      // Average should be approximately 0.3 (smoothed)
      expect(result.avgEAR).toBeGreaterThan(0.2);
      expect(result.avgEAR).toBeLessThan(0.4);
    });
  });

  describe('invalid input handling', () => {
    it('should return invalid result for insufficient landmarks', () => {
      const landmarks = Array(100).fill({ x: 0.5, y: 0.5 });
      const result = calculator.calculate(landmarks);

      expect(result.isValid).toBe(false);
      expect(result.avgEAR).toBe(-1);
    });

    it('should return invalid result for null landmarks', () => {
      const result = calculator.calculate(null as any);

      expect(result.isValid).toBe(false);
    });

    it('should return invalid result for empty array', () => {
      const result = calculator.calculate([]);

      expect(result.isValid).toBe(false);
    });

    it('should handle zero horizontal distance gracefully', () => {
      // Create landmarks where P1 and P4 are at the same position
      const landmarks = Array(478)
        .fill(null)
        .map(() => ({ x: 0.5, y: 0.5 }));

      // Set left eye with P1 = P4 (zero horizontal distance)
      landmarks[EYE_LANDMARKS.LEFT.P1] = { x: 0.3, y: 0.3 };
      landmarks[EYE_LANDMARKS.LEFT.P2] = { x: 0.28, y: 0.25 };
      landmarks[EYE_LANDMARKS.LEFT.P3] = { x: 0.32, y: 0.25 };
      landmarks[EYE_LANDMARKS.LEFT.P4] = { x: 0.3, y: 0.3 }; // Same as P1
      landmarks[EYE_LANDMARKS.LEFT.P5] = { x: 0.32, y: 0.35 };
      landmarks[EYE_LANDMARKS.LEFT.P6] = { x: 0.28, y: 0.35 };

      const result = calculator.calculate(landmarks);

      expect(result.isValid).toBe(false);
      expect(result.leftEAR).toBe(-1);
    });
  });

  describe('smoothing', () => {
    it('should apply exponential smoothing to EAR values', () => {
      // First calculation
      const landmarks1 = createMockLandmarks(
        createEyeWithEAR(0.3, 0.3, 0.3),
        createEyeWithEAR(0.3, 0.7, 0.3),
      );
      const result1 = calculator.calculate(landmarks1);

      // Second calculation with lower EAR
      const landmarks2 = createMockLandmarks(
        createEyeWithEAR(0.1, 0.3, 0.3),
        createEyeWithEAR(0.1, 0.7, 0.3),
      );
      const result2 = calculator.calculate(landmarks2);

      // Due to smoothing, result2.avgEAR should be higher than raw 0.1
      expect(result2.avgEAR).toBeGreaterThan(0.1);
    });

    it('should respect custom smoothing factor', () => {
      const highSmoothCalc = new EARCalculator(0.9); // High smoothing = follow current value more
      const lowSmoothCalc = new EARCalculator(0.1); // Low smoothing = follow history more

      // Initialize both with same value
      const openEyeLandmarks = createMockLandmarks(
        createEyeWithEAR(0.3, 0.3, 0.3),
        createEyeWithEAR(0.3, 0.7, 0.3),
      );
      highSmoothCalc.calculate(openEyeLandmarks);
      lowSmoothCalc.calculate(openEyeLandmarks);

      // Now calculate with closed eyes
      const closedEyeLandmarks = createMockLandmarks(
        createEyeWithEAR(0.1, 0.3, 0.3),
        createEyeWithEAR(0.1, 0.7, 0.3),
      );
      const highResult = highSmoothCalc.calculate(closedEyeLandmarks);
      const lowResult = lowSmoothCalc.calculate(closedEyeLandmarks);

      // High smoothing should respond faster to change (lower value)
      expect(highResult.avgEAR).toBeLessThan(lowResult.avgEAR);
    });
  });

  describe('isEyeClosed', () => {
    it('should return true when EAR is below threshold', () => {
      expect(calculator.isEyeClosed(0.15)).toBe(true);
      expect(calculator.isEyeClosed(0.19)).toBe(true);
    });

    it('should return false when EAR is above threshold', () => {
      expect(calculator.isEyeClosed(0.25)).toBe(false);
      expect(calculator.isEyeClosed(0.3)).toBe(false);
    });

    it('should return false for invalid EAR values', () => {
      expect(calculator.isEyeClosed(-1)).toBe(false);
      expect(calculator.isEyeClosed(0)).toBe(false);
    });

    it('should accept custom threshold', () => {
      expect(calculator.isEyeClosed(0.22, 0.25)).toBe(true);
      expect(calculator.isEyeClosed(0.22, 0.2)).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset smoothing state', () => {
      // Build up some history
      const landmarks = createMockLandmarks(
        createEyeWithEAR(0.1, 0.3, 0.3),
        createEyeWithEAR(0.1, 0.7, 0.3),
      );

      for (let i = 0; i < 5; i++) {
        calculator.calculate(landmarks);
      }

      // Reset
      calculator.reset();

      // After reset, the next calculation should use default lastEAR (0.3)
      const openLandmarks = createMockLandmarks(
        createEyeWithEAR(0.3, 0.3, 0.3),
        createEyeWithEAR(0.3, 0.7, 0.3),
      );
      const result = calculator.calculate(openLandmarks);

      // Should be close to 0.3 since smoothing starts fresh
      expect(result.avgEAR).toBeGreaterThan(0.25);
    });
  });

  describe('edge cases', () => {
    it('should handle landmarks with z coordinate', () => {
      const landmarks = createMockLandmarks(
        createEyeWithEAR(0.3, 0.3, 0.3),
        createEyeWithEAR(0.3, 0.7, 0.3),
      );
      // Add z coordinates
      landmarks.forEach((point) => {
        point.z = 0.1;
      });

      const result = calculator.calculate(landmarks);
      expect(result.isValid).toBe(true);
    });

    it('should handle extreme EAR values', () => {
      // Very open eye (EAR = 0.5)
      const landmarks = createMockLandmarks(
        createEyeWithEAR(0.5, 0.3, 0.3),
        createEyeWithEAR(0.5, 0.7, 0.3),
      );

      const result = calculator.calculate(landmarks);
      expect(result.isValid).toBe(true);
      expect(result.avgEAR).toBeGreaterThan(0.3);
    });
  });
});
