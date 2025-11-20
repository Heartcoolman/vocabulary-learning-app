import { describe, it, expect } from 'vitest';
import { isValidSpelling, isValidMeanings, validateTestOptions } from '../validation';

describe('Validation Utils', () => {
  describe('isValidSpelling', () => {
    it('should return true for non-empty spelling', () => {
      expect(isValidSpelling('hello')).toBe(true);
      expect(isValidSpelling('world')).toBe(true);
    });

    it('should return false for empty or whitespace-only spelling', () => {
      expect(isValidSpelling('')).toBe(false);
      expect(isValidSpelling('   ')).toBe(false);
      expect(isValidSpelling('\t\n')).toBe(false);
    });
  });

  describe('isValidMeanings', () => {
    it('should return true for non-empty meanings array', () => {
      expect(isValidMeanings(['你好'])).toBe(true);
      expect(isValidMeanings(['你好', '问候'])).toBe(true);
    });

    it('should return false for empty meanings array', () => {
      expect(isValidMeanings([])).toBe(false);
    });

    it('should return false when all meanings are empty', () => {
      expect(isValidMeanings(['', '  '])).toBe(false);
    });

    it('should return true when at least one meaning is valid', () => {
      expect(isValidMeanings(['', '你好', '  '])).toBe(true);
    });
  });

  describe('validateTestOptions', () => {
    it('should validate correct options', () => {
      const result = validateTestOptions(['你好', '世界', '朋友'], '你好');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject options with wrong count', () => {
      const result1 = validateTestOptions(['你好'], '你好');
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('选项数量必须在2-4之间');

      const result2 = validateTestOptions(['a', 'b', 'c', 'd', 'e'], 'a');
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('选项数量必须在2-4之间');
    });

    it('should reject options without correct answer', () => {
      const result = validateTestOptions(['世界', '朋友'], '你好');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('选项中必须包含正确答案');
    });

    it('should reject options with duplicate correct answers', () => {
      const result = validateTestOptions(['你好', '你好', '世界'], '你好');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('选项中只能有一个正确答案');
    });

    it('should reject options with duplicates', () => {
      const result = validateTestOptions(['你好', '世界', '世界'], '你好');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('选项中不能有重复项');
    });
  });
});
