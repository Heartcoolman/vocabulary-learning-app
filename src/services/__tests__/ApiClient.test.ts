import { describe, it, expect, beforeEach, vi } from 'vitest';
import apiClient from '../ApiClient';

describe('ApiClient', () => {
  beforeEach(() => {
    // 清除localStorage
    localStorage.clear();
    // 清除token
    apiClient.clearToken();
  });

  describe('Token管理', () => {
    it('应该能够设置和获取token', () => {
      const testToken = 'test-token-123';
      apiClient.setToken(testToken);
      
      expect(apiClient.getToken()).toBe(testToken);
      expect(localStorage.getItem('auth_token')).toBe(testToken);
    });

    it('应该能够清除token', () => {
      const testToken = 'test-token-123';
      apiClient.setToken(testToken);
      apiClient.clearToken();
      
      expect(apiClient.getToken()).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('应该能够从localStorage持久化token', () => {
      const testToken = 'stored-token';
      apiClient.setToken(testToken);
      
      // 验证token被保存到localStorage
      expect(localStorage.getItem('auth_token')).toBe(testToken);
      
      // 验证可以获取token
      expect(apiClient.getToken()).toBe(testToken);
    });
  });

  describe('请求错误处理', () => {
    it('应该在401错误时清除token', async () => {
      const testToken = 'invalid-token';
      apiClient.setToken(testToken);

      // Mock fetch返回401
      const globalAny = globalThis as any;
      globalAny.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: 'Unauthorized' }),
      });

      try {
        await apiClient.getCurrentUser();
      } catch (error) {
        // 预期会抛出错误
      }

      // Token应该被清除
      expect(apiClient.getToken()).toBeNull();
    });
  });
});
