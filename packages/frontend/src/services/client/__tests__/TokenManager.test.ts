/**
 * TokenManager 单元测试
 * 测试 JWT 令牌管理功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TokenManager from '../base/TokenManager';

// 生成模拟 JWT token
function createMockJwt(payload: { userId: string; exp: number; iat: number }): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const payloadStr = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const signature = 'mock_signature';
  return `${header}.${payloadStr}.${signature}`;
}

describe('TokenManager', () => {
  let originalLocalStorage: Storage;
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    // 保存原始 localStorage
    originalLocalStorage = window.localStorage;

    // 创建 mock localStorage
    mockLocalStorage = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
      clear: vi.fn(() => {
        mockLocalStorage = {};
      }),
      get length() {
        return Object.keys(mockLocalStorage).length;
      },
      key: vi.fn((index: number) => Object.keys(mockLocalStorage)[index] ?? null),
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // 重置单例实例 (通过访问私有属性)
    // @ts-expect-error - 访问私有属性用于测试
    TokenManager.instance = undefined;
  });

  afterEach(() => {
    // 恢复原始 localStorage
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = TokenManager.getInstance();
      const instance2 = TokenManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should load token from localStorage on init', () => {
      // 设置有效的 token
      const validToken = createMockJwt({
        userId: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1小时后过期
        iat: Math.floor(Date.now() / 1000),
      });
      mockLocalStorage['auth_token'] = validToken;

      const instance = TokenManager.getInstance();

      expect(instance.getToken()).toBe(validToken);
    });

    it('should clear expired token on init', () => {
      // 设置已过期的 token
      const expiredToken = createMockJwt({
        userId: 'user-1',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1小时前过期
        iat: Math.floor(Date.now() / 1000) - 7200,
      });
      mockLocalStorage['auth_token'] = expiredToken;

      const instance = TokenManager.getInstance();

      expect(instance.getToken()).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });
  });

  describe('setToken', () => {
    it('should set token in memory and localStorage', () => {
      const instance = TokenManager.getInstance();
      const token = createMockJwt({
        userId: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      instance.setToken(token);

      expect(instance.getToken()).toBe(token);
      expect(localStorage.setItem).toHaveBeenCalledWith('auth_token', token);
    });
  });

  describe('getToken', () => {
    it('should return null when no token is set', () => {
      const instance = TokenManager.getInstance();

      expect(instance.getToken()).toBeNull();
    });

    it('should return the set token', () => {
      const instance = TokenManager.getInstance();
      const token = createMockJwt({
        userId: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      instance.setToken(token);

      expect(instance.getToken()).toBe(token);
    });
  });

  describe('clearToken', () => {
    it('should clear token from memory and localStorage', () => {
      const instance = TokenManager.getInstance();
      const token = createMockJwt({
        userId: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      instance.setToken(token);
      instance.clearToken();

      expect(instance.getToken()).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });
  });

  describe('hasValidToken', () => {
    it('should return false when no token is set', () => {
      const instance = TokenManager.getInstance();

      expect(instance.hasValidToken()).toBe(false);
    });

    it('should return true for valid non-expired token', () => {
      const instance = TokenManager.getInstance();
      const validToken = createMockJwt({
        userId: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      instance.setToken(validToken);

      expect(instance.hasValidToken()).toBe(true);
    });

    it('should return false for expired token', () => {
      const instance = TokenManager.getInstance();
      const expiredToken = createMockJwt({
        userId: 'user-1',
        exp: Math.floor(Date.now() / 1000) - 1, // 已过期
        iat: Math.floor(Date.now() / 1000) - 3600,
      });

      // 直接设置到内部状态（绕过 setToken 的验证）
      // @ts-expect-error - 访问私有属性用于测试
      instance.token = expiredToken;

      expect(instance.hasValidToken()).toBe(false);
    });

    it('should return false for invalid token format', () => {
      const instance = TokenManager.getInstance();

      // @ts-expect-error - 访问私有属性用于测试
      instance.token = 'invalid-token-format';

      expect(instance.hasValidToken()).toBe(false);
    });

    it('should return false for token without exp claim', () => {
      const instance = TokenManager.getInstance();
      // 创建没有 exp 的 token
      const tokenWithoutExp =
        btoa(JSON.stringify({ alg: 'HS256' }))
          .replace(/\+/g, '-')
          .replace(/\//g, '_') +
        '.' +
        btoa(JSON.stringify({ userId: 'user-1' }))
          .replace(/\+/g, '-')
          .replace(/\//g, '_') +
        '.signature';

      // @ts-expect-error - 访问私有属性用于测试
      instance.token = tokenWithoutExp;

      expect(instance.hasValidToken()).toBe(false);
    });
  });
});
