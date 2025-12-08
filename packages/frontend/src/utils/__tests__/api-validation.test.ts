/**
 * API Validation 单元测试
 * 测试 API 响应验证工具的功能
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  validateApiResponse,
  validateOrThrow,
  validateOrPassthrough,
  validateAuthResponse,
  validateUserStatistics,
  validateWordList,
  validateStudyProgress,
  validateWord,
} from '../api-validation';

// Mock logger
vi.mock('../logger', () => ({
  apiLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('API Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateApiResponse', () => {
    const TestSchema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number().optional(),
    });

    it('should validate correct data', () => {
      const data = { id: '1', name: 'test', age: 25 };

      const result = validateApiResponse(TestSchema, data, 'test');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should fail on invalid data', () => {
      const data = { id: 123, name: 'test' }; // id should be string

      const result = validateApiResponse(TestSchema, data, 'test');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error details', () => {
      const data = { id: 123, name: 'test' };

      const result = validateApiResponse(TestSchema, data, 'test');

      expect(result.details).toBeDefined();
      expect(result.details?.issues).toBeDefined();
    });

    it('should handle null data', () => {
      const result = validateApiResponse(TestSchema, null, 'test');

      expect(result.success).toBe(false);
    });

    it('should handle undefined data', () => {
      const result = validateApiResponse(TestSchema, undefined, 'test');

      expect(result.success).toBe(false);
    });

    it('should handle array validation', () => {
      const ArraySchema = z.array(TestSchema);
      const data = [
        { id: '1', name: 'test1' },
        { id: '2', name: 'test2' },
      ];

      const result = validateApiResponse(ArraySchema, data, 'test');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });
  });

  describe('validateOrThrow', () => {
    const TestSchema = z.object({
      id: z.string(),
    });

    it('should return data on valid input', () => {
      const data = { id: '1' };

      const result = validateOrThrow(TestSchema, data, 'test');

      expect(result).toEqual(data);
    });

    it('should throw error on invalid input', () => {
      const data = { id: 123 };

      expect(() => validateOrThrow(TestSchema, data, 'test')).toThrow(/API 响应验证失败/);
    });
  });

  describe('validateOrPassthrough', () => {
    const TestSchema = z.object({
      id: z.string(),
    });

    it('should return validated data on valid input', () => {
      const data = { id: '1' };

      const result = validateOrPassthrough(TestSchema, data, 'test');

      expect(result).toEqual(data);
    });

    it('should return original data on invalid input', () => {
      const data = { id: 123 } as unknown as { id: string };

      const result = validateOrPassthrough(TestSchema, data, 'test');

      expect(result).toEqual(data);
    });
  });

  describe('validateAuthResponse', () => {
    it('should validate valid auth response', () => {
      const data = {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'test@example.com',
          username: 'testuser',
          role: 'USER',
          createdAt: '2024-01-01T00:00:00Z',
        },
        token: 'jwt-token',
      };

      const result = validateAuthResponse(data);

      expect(result.success).toBe(true);
    });

    it('should fail on missing token', () => {
      const data = {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'test@example.com',
          username: 'testuser',
          role: 'USER',
          createdAt: '2024-01-01T00:00:00Z',
        },
      };

      const result = validateAuthResponse(data);

      expect(result.success).toBe(false);
    });

    it('should fail on invalid user role', () => {
      const data = {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          username: 'testuser',
          role: 'INVALID',
          createdAt: '2024-01-01T00:00:00Z',
        },
        token: 'jwt-token',
      };

      const result = validateAuthResponse(data);

      expect(result.success).toBe(false);
    });
  });

  describe('validateUserStatistics', () => {
    it('should validate valid statistics', () => {
      const data = {
        totalWords: 100,
        totalRecords: 500,
        correctRate: 0.85,
      };

      const result = validateUserStatistics(data);

      expect(result.success).toBe(true);
    });

    it('should fail on negative values', () => {
      const data = {
        totalWords: -10,
        totalRecords: 500,
        correctRate: 0.85,
      };

      const result = validateUserStatistics(data);

      expect(result.success).toBe(false);
    });
  });

  describe('validateWordList', () => {
    const now = new Date().toISOString();

    it('should validate valid word list', () => {
      const data = [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          spelling: 'apple',
          phonetic: '/ˈæp.əl/',
          meanings: ['苹果'],
          examples: ['I eat an apple.'],
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = validateWordList(data);

      expect(result.success).toBe(true);
    });

    it('should validate empty word list', () => {
      const data: unknown[] = [];

      const result = validateWordList(data);

      expect(result.success).toBe(true);
    });

    it('should fail on non-array', () => {
      const data = {
        id: 'word-1',
        spelling: 'apple',
      };

      const result = validateWordList(data);

      expect(result.success).toBe(false);
    });
  });

  describe('validateStudyProgress', () => {
    it('should validate valid study progress', () => {
      const data = {
        todayStudied: 10,
        todayTarget: 20,
        totalStudied: 100,
        correctRate: 0.85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      const result = validateStudyProgress(data);

      expect(result.success).toBe(true);
    });
  });

  describe('validateWord', () => {
    const now = new Date().toISOString();

    it('should validate valid word', () => {
      const data = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        spelling: 'apple',
        phonetic: '/ˈæp.əl/',
        meanings: ['苹果', '水果'],
        examples: ['I eat an apple.'],
        createdAt: now,
        updatedAt: now,
      };

      const result = validateWord(data);

      expect(result.success).toBe(true);
    });

    it('should validate word with optional audioUrl', () => {
      const data = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        spelling: 'apple',
        phonetic: '/ˈæp.əl/',
        meanings: ['苹果'],
        examples: ['I eat an apple.'],
        audioUrl: 'https://example.com/apple.mp3',
        createdAt: now,
        updatedAt: now,
      };

      const result = validateWord(data);

      expect(result.success).toBe(true);
    });

    it('should pass with empty meanings array', () => {
      // WordApiSchema 允许空 meanings 数组（用于 API 响应）
      // 只有 CreateWordDtoSchema 有 .min(1) 约束
      const data = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        spelling: 'apple',
        phonetic: '/ˈæp.əl/',
        meanings: [],
        examples: ['I eat an apple.'],
        createdAt: now,
        updatedAt: now,
      };

      const result = validateWord(data);

      expect(result.success).toBe(true);
    });

    it('should pass with empty examples array', () => {
      const data = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        spelling: 'apple',
        phonetic: '/ˈæp.əl/',
        meanings: ['苹果'],
        examples: [],
        createdAt: now,
        updatedAt: now,
      };

      const result = validateWord(data);

      // WordApiSchema 允许空 examples 数组
      expect(result.success).toBe(true);
    });
  });
});
