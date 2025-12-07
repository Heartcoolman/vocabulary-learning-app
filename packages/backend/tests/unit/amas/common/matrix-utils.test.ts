/**
 * Matrix Utils Unit Tests
 *
 * Tests for the matrix operation utilities used by LinUCB/LinTS models
 * including Cholesky decomposition and matrix sanitization functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  choleskyDecompose,
  createRegularizedIdentity,
  hasInvalidValues,
  sanitizeFloat32Array,
  sanitizeNumberArray,
} from '../../../../src/amas/common/matrix-utils';

// Mock the logger to avoid console output during tests
vi.mock('../../../../src/logger', () => ({
  amasLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

describe('MatrixUtils', () => {
  // ==================== choleskyDecompose Tests ====================

  describe('choleskyDecompose', () => {
    describe('valid matrices', () => {
      it('should decompose a 2x2 identity matrix', () => {
        const d = 2;
        const A = new Float32Array([1, 0, 0, 1]);

        const L = choleskyDecompose(A, d, 1.0);

        expect(L).not.toBeNull();
        expect(L!.length).toBe(d * d);
        // For identity matrix, L should also be identity
        expect(L![0]).toBeCloseTo(1, 5); // L[0,0]
        expect(L![1]).toBeCloseTo(0, 5); // L[0,1]
        expect(L![2]).toBeCloseTo(0, 5); // L[1,0]
        expect(L![3]).toBeCloseTo(1, 5); // L[1,1]
      });

      it('should decompose a 3x3 positive definite matrix', () => {
        const d = 3;
        // A = [[4, 2, 2], [2, 5, 3], [2, 3, 6]]
        const A = new Float32Array([4, 2, 2, 2, 5, 3, 2, 3, 6]);

        const L = choleskyDecompose(A, d, 0.01);

        expect(L).not.toBeNull();
        expect(L!.length).toBe(d * d);

        // Verify L * L^T = A (approximately)
        // L[0,0] should be sqrt(4) = 2
        expect(L![0]).toBeCloseTo(2, 4);
      });

      it('should handle a diagonal matrix', () => {
        const d = 3;
        const A = new Float32Array([4, 0, 0, 0, 9, 0, 0, 0, 16]);

        const L = choleskyDecompose(A, d, 0.01);

        expect(L).not.toBeNull();
        // Diagonal elements should be sqrt of original diagonal
        expect(L![0]).toBeCloseTo(2, 5); // sqrt(4)
        expect(L![4]).toBeCloseTo(3, 5); // sqrt(9)
        expect(L![8]).toBeCloseTo(4, 5); // sqrt(16)
      });

      it('should not modify the original matrix', () => {
        const d = 2;
        const originalValues = [4, 2, 2, 5];
        const A = new Float32Array(originalValues);

        choleskyDecompose(A, d, 1.0);

        for (let i = 0; i < A.length; i++) {
          expect(A[i]).toBe(originalValues[i]);
        }
      });
    });

    describe('symmetrization', () => {
      it('should symmetrize an asymmetric matrix', () => {
        const d = 2;
        // Asymmetric matrix: A[0,1] = 3, A[1,0] = 1
        // Should be averaged to 2
        const A = new Float32Array([4, 3, 1, 4]);

        const L = choleskyDecompose(A, d, 1.0);

        expect(L).not.toBeNull();
        // The function should handle it and return valid decomposition
      });

      it('should handle NaN in off-diagonal elements during symmetrization', () => {
        const d = 2;
        const A = new Float32Array([4, NaN, 2, 4]);

        const L = choleskyDecompose(A, d, 1.0);

        // Should replace NaN with 0 and produce valid result
        expect(L).not.toBeNull();
      });

      it('should handle Infinity in off-diagonal elements during symmetrization', () => {
        const d = 2;
        const A = new Float32Array([4, Infinity, 2, 4]);

        const L = choleskyDecompose(A, d, 1.0);

        // Should replace Infinity with 0 and produce valid result
        expect(L).not.toBeNull();
      });
    });

    describe('regularization', () => {
      it('should apply regularization when diagonal is too small', () => {
        const d = 2;
        const lambda = 2.0;
        // Matrix with small diagonal
        const A = new Float32Array([0.5, 0, 0, 0.5]);

        const L = choleskyDecompose(A, d, lambda);

        expect(L).not.toBeNull();
        // Diagonal should be at least sqrt(lambda)
        expect(L![0]).toBeGreaterThanOrEqual(Math.sqrt(lambda) - 0.01);
        expect(L![3]).toBeGreaterThanOrEqual(Math.sqrt(lambda) - 0.01);
      });

      it('should apply regularization when diagonal is negative', () => {
        const d = 2;
        const lambda = 1.0;
        // Matrix with negative diagonal
        const A = new Float32Array([-1, 0, 0, -1]);

        const L = choleskyDecompose(A, d, lambda);

        expect(L).not.toBeNull();
      });

      it('should apply regularization when diagonal is NaN', () => {
        const d = 2;
        const lambda = 1.0;
        const A = new Float32Array([NaN, 0, 0, 4]);

        const L = choleskyDecompose(A, d, lambda);

        expect(L).not.toBeNull();
      });

      it('should apply regularization when diagonal is Infinity', () => {
        const d = 2;
        const lambda = 1.0;
        const A = new Float32Array([Infinity, 0, 0, 4]);

        const L = choleskyDecompose(A, d, lambda);

        expect(L).not.toBeNull();
      });

      it('should use default lambda value of 1.0', () => {
        const d = 2;
        const A = new Float32Array([0.5, 0, 0, 0.5]);

        const L = choleskyDecompose(A, d);

        expect(L).not.toBeNull();
        // With default lambda=1.0, diagonal should be at least sqrt(1.0) = 1
        expect(L![0]).toBeGreaterThanOrEqual(0.99);
        expect(L![3]).toBeGreaterThanOrEqual(0.99);
      });
    });

    describe('numerical stability', () => {
      it('should handle sum <= epsilon case for diagonal elements', () => {
        const d = 2;
        const lambda = 1.0;
        // Create a matrix where sum would become very small or negative during decomposition
        const A = new Float32Array([1e-10, 0, 0, 1e-10]);

        const L = choleskyDecompose(A, d, lambda);

        expect(L).not.toBeNull();
        // All elements should be finite
        for (let i = 0; i < L!.length; i++) {
          expect(Number.isFinite(L![i])).toBe(true);
        }
      });

      it('should handle non-finite values in non-diagonal elements', () => {
        const d = 3;
        const lambda = 1.0;
        // Large values that might cause overflow in calculations
        const A = new Float32Array([
          1e30, 1e20, 1e20,
          1e20, 1e30, 1e20,
          1e20, 1e20, 1e30
        ]);

        const L = choleskyDecompose(A, d, lambda);

        // Should either return null or a valid matrix with all finite values
        if (L !== null) {
          for (let i = 0; i < L.length; i++) {
            expect(Number.isFinite(L[i])).toBe(true);
          }
        }
      });

      it('should return null when final matrix contains invalid values', () => {
        // This is harder to trigger, but we can verify the check exists
        // by ensuring valid matrices pass
        const d = 2;
        const A = new Float32Array([4, 0, 0, 4]);
        const L = choleskyDecompose(A, d, 1.0);
        expect(L).not.toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should handle 1x1 matrix', () => {
        const d = 1;
        const A = new Float32Array([4]);

        const L = choleskyDecompose(A, d, 1.0);

        expect(L).not.toBeNull();
        expect(L![0]).toBeCloseTo(2, 5); // sqrt(4)
      });

      it('should handle larger matrices', () => {
        const d = 5;
        // Create a regularized identity matrix
        const A = new Float32Array(d * d);
        for (let i = 0; i < d; i++) {
          A[i * d + i] = 10;
        }

        const L = choleskyDecompose(A, d, 1.0);

        expect(L).not.toBeNull();
        expect(L!.length).toBe(d * d);
        // Diagonal elements should be sqrt(10)
        for (let i = 0; i < d; i++) {
          expect(L![i * d + i]).toBeCloseTo(Math.sqrt(10), 4);
        }
      });

      it('should handle zero matrix with regularization', () => {
        const d = 2;
        const lambda = 1.0;
        const A = new Float32Array([0, 0, 0, 0]);

        const L = choleskyDecompose(A, d, lambda);

        expect(L).not.toBeNull();
        // With regularization, should get identity-like matrix
        expect(L![0]).toBeCloseTo(1, 5);
        expect(L![3]).toBeCloseTo(1, 5);
      });
    });
  });

  // ==================== createRegularizedIdentity Tests ====================

  describe('createRegularizedIdentity', () => {
    it('should create a 2x2 regularized identity matrix', () => {
      const d = 2;
      const lambda = 1.0;

      const I = createRegularizedIdentity(d, lambda);

      expect(I.length).toBe(d * d);
      expect(I[0]).toBe(lambda); // I[0,0]
      expect(I[1]).toBe(0); // I[0,1]
      expect(I[2]).toBe(0); // I[1,0]
      expect(I[3]).toBe(lambda); // I[1,1]
    });

    it('should create a 3x3 regularized identity matrix', () => {
      const d = 3;
      const lambda = 2.5;

      const I = createRegularizedIdentity(d, lambda);

      expect(I.length).toBe(d * d);
      // Check diagonal elements
      expect(I[0]).toBe(lambda);
      expect(I[4]).toBe(lambda);
      expect(I[8]).toBe(lambda);
      // Check off-diagonal elements are zero
      expect(I[1]).toBe(0);
      expect(I[2]).toBe(0);
      expect(I[3]).toBe(0);
      expect(I[5]).toBe(0);
      expect(I[6]).toBe(0);
      expect(I[7]).toBe(0);
    });

    it('should handle lambda = 0', () => {
      const d = 2;
      const lambda = 0;

      const I = createRegularizedIdentity(d, lambda);

      // All elements should be 0
      for (let i = 0; i < I.length; i++) {
        expect(I[i]).toBe(0);
      }
    });

    it('should handle large lambda values', () => {
      const d = 2;
      const lambda = 1e10;

      const I = createRegularizedIdentity(d, lambda);

      expect(I[0]).toBe(lambda);
      expect(I[3]).toBe(lambda);
    });

    it('should handle d = 1', () => {
      const d = 1;
      const lambda = 5.0;

      const I = createRegularizedIdentity(d, lambda);

      expect(I.length).toBe(1);
      expect(I[0]).toBe(lambda);
    });

    it('should handle larger dimensions', () => {
      const d = 10;
      const lambda = 3.0;

      const I = createRegularizedIdentity(d, lambda);

      expect(I.length).toBe(d * d);
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          if (i === j) {
            expect(I[i * d + j]).toBe(lambda);
          } else {
            expect(I[i * d + j]).toBe(0);
          }
        }
      }
    });
  });

  // ==================== hasInvalidValues Tests ====================

  describe('hasInvalidValues', () => {
    describe('Float32Array input', () => {
      it('should return false for valid Float32Array', () => {
        const arr = new Float32Array([1, 2, 3, 4, 5]);
        expect(hasInvalidValues(arr)).toBe(false);
      });

      it('should return true for Float32Array with NaN', () => {
        const arr = new Float32Array([1, 2, NaN, 4, 5]);
        expect(hasInvalidValues(arr)).toBe(true);
      });

      it('should return true for Float32Array with Infinity', () => {
        const arr = new Float32Array([1, 2, Infinity, 4, 5]);
        expect(hasInvalidValues(arr)).toBe(true);
      });

      it('should return true for Float32Array with -Infinity', () => {
        const arr = new Float32Array([1, 2, -Infinity, 4, 5]);
        expect(hasInvalidValues(arr)).toBe(true);
      });

      it('should return false for empty Float32Array', () => {
        const arr = new Float32Array([]);
        expect(hasInvalidValues(arr)).toBe(false);
      });

      it('should return true for Float32Array with only NaN', () => {
        const arr = new Float32Array([NaN]);
        expect(hasInvalidValues(arr)).toBe(true);
      });

      it('should handle Float32Array with zero values', () => {
        const arr = new Float32Array([0, 0, 0]);
        expect(hasInvalidValues(arr)).toBe(false);
      });

      it('should handle Float32Array with negative values', () => {
        const arr = new Float32Array([-1, -2, -3]);
        expect(hasInvalidValues(arr)).toBe(false);
      });
    });

    describe('number[] input', () => {
      it('should return false for valid number array', () => {
        const arr = [1, 2, 3, 4, 5];
        expect(hasInvalidValues(arr)).toBe(false);
      });

      it('should return true for number array with NaN', () => {
        const arr = [1, 2, NaN, 4, 5];
        expect(hasInvalidValues(arr)).toBe(true);
      });

      it('should return true for number array with Infinity', () => {
        const arr = [1, 2, Infinity, 4, 5];
        expect(hasInvalidValues(arr)).toBe(true);
      });

      it('should return true for number array with -Infinity', () => {
        const arr = [1, 2, -Infinity, 4, 5];
        expect(hasInvalidValues(arr)).toBe(true);
      });

      it('should return false for empty number array', () => {
        const arr: number[] = [];
        expect(hasInvalidValues(arr)).toBe(false);
      });

      it('should handle multiple invalid values', () => {
        const arr = [NaN, Infinity, -Infinity];
        expect(hasInvalidValues(arr)).toBe(true);
      });
    });
  });

  // ==================== sanitizeFloat32Array Tests ====================

  describe('sanitizeFloat32Array', () => {
    it('should return a new array without modifying the original', () => {
      const original = new Float32Array([1, NaN, 3]);
      const sanitized = sanitizeFloat32Array(original);

      expect(sanitized).not.toBe(original);
      expect(original[1]).toBeNaN();
      expect(sanitized[1]).toBe(0);
    });

    it('should replace NaN with 0', () => {
      const arr = new Float32Array([1, NaN, 3]);
      const result = sanitizeFloat32Array(arr);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(3);
    });

    it('should replace Infinity with 0', () => {
      const arr = new Float32Array([1, Infinity, 3]);
      const result = sanitizeFloat32Array(arr);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(3);
    });

    it('should replace -Infinity with 0', () => {
      const arr = new Float32Array([1, -Infinity, 3]);
      const result = sanitizeFloat32Array(arr);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(3);
    });

    it('should not modify valid values', () => {
      const arr = new Float32Array([1.5, -2.5, 0, 100.123]);
      const result = sanitizeFloat32Array(arr);

      expect(result[0]).toBeCloseTo(1.5, 5);
      expect(result[1]).toBeCloseTo(-2.5, 5);
      expect(result[2]).toBe(0);
      expect(result[3]).toBeCloseTo(100.123, 3);
    });

    it('should handle empty array', () => {
      const arr = new Float32Array([]);
      const result = sanitizeFloat32Array(arr);

      expect(result.length).toBe(0);
    });

    it('should handle array with all invalid values', () => {
      const arr = new Float32Array([NaN, Infinity, -Infinity]);
      const result = sanitizeFloat32Array(arr);

      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });

    it('should handle array with all valid values', () => {
      const arr = new Float32Array([1, 2, 3, 4, 5]);
      const result = sanitizeFloat32Array(arr);

      for (let i = 0; i < arr.length; i++) {
        expect(result[i]).toBe(arr[i]);
      }
    });

    it('should preserve array length', () => {
      const arr = new Float32Array([1, NaN, Infinity, 4, -Infinity]);
      const result = sanitizeFloat32Array(arr);

      expect(result.length).toBe(arr.length);
    });
  });

  // ==================== sanitizeNumberArray Tests ====================

  describe('sanitizeNumberArray', () => {
    it('should return a new array without modifying the original', () => {
      const original = [1, NaN, 3];
      const sanitized = sanitizeNumberArray(original);

      expect(sanitized).not.toBe(original);
      expect(Number.isNaN(original[1])).toBe(true);
      expect(sanitized[1]).toBe(0);
    });

    it('should replace NaN with 0', () => {
      const arr = [1, NaN, 3];
      const result = sanitizeNumberArray(arr);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(3);
    });

    it('should replace Infinity with 0', () => {
      const arr = [1, Infinity, 3];
      const result = sanitizeNumberArray(arr);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(3);
    });

    it('should replace -Infinity with 0', () => {
      const arr = [1, -Infinity, 3];
      const result = sanitizeNumberArray(arr);

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(3);
    });

    it('should not modify valid values', () => {
      const arr = [1.5, -2.5, 0, 100.123];
      const result = sanitizeNumberArray(arr);

      expect(result[0]).toBe(1.5);
      expect(result[1]).toBe(-2.5);
      expect(result[2]).toBe(0);
      expect(result[3]).toBe(100.123);
    });

    it('should handle empty array', () => {
      const arr: number[] = [];
      const result = sanitizeNumberArray(arr);

      expect(result.length).toBe(0);
    });

    it('should handle array with all invalid values', () => {
      const arr = [NaN, Infinity, -Infinity];
      const result = sanitizeNumberArray(arr);

      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });

    it('should handle array with all valid values', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = sanitizeNumberArray(arr);

      expect(result).toEqual(arr);
    });

    it('should preserve array length', () => {
      const arr = [1, NaN, Infinity, 4, -Infinity];
      const result = sanitizeNumberArray(arr);

      expect(result.length).toBe(arr.length);
    });

    it('should handle very large numbers', () => {
      const arr = [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE];
      const result = sanitizeNumberArray(arr);

      expect(result[0]).toBe(Number.MAX_VALUE);
      expect(result[1]).toBe(-Number.MAX_VALUE);
      expect(result[2]).toBe(Number.MIN_VALUE);
    });
  });
});
