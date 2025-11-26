import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

vi.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

vi.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '1h',
  },
}));

vi.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
}));

import authService from '../../../src/services/auth.service';
import prisma from '../../../src/config/database';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const mockPrisma = prisma as DeepMockProxy<PrismaClient>;

// 辅助函数：计算token的SHA256哈希（与实现保持一致）
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

describe('AuthService', () => {
  const now = new Date('2024-01-01T00:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mockReset(mockPrisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('register', () => {
    it('应该成功注册新用户并返回用户信息和token', async () => {
      const createdUser = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        createdAt: now,
      };
      
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as any);
      vi.mocked(jwt.sign).mockReturnValue('jwt-token' as any);
      
      // Mock transaction - 传入的回调会收到一个tx对象
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const txMock = {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdUser),
          },
          session: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(txMock);
      });

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password123',
        username: 'testuser',
      });

      expect(result).toEqual({ user: createdUser, token: 'jwt-token' });
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123', 10);
    });

    it('当邮箱已存在时应该抛出错误', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const txMock = {
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }),
            create: vi.fn(),
          },
          session: {
            create: vi.fn(),
          },
        };
        return callback(txMock);
      });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password123',
          username: 'testuser',
        })
      ).rejects.toThrow('该邮箱已被注册');
    });
  });

  describe('login', () => {
    it('应该成功登录并返回用户信息和token', async () => {
      const dbUser = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        passwordHash: 'hashed',
        createdAt: now,
      };
      
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);
      vi.mocked(jwt.sign).mockReturnValue('jwt-token' as any);
      
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const txMock = {
          user: {
            findUnique: vi.fn().mockResolvedValue(dbUser),
          },
          session: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(txMock);
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result).toEqual({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          username: 'testuser',
          role: 'USER',
          createdAt: now,
        },
        token: 'jwt-token',
      });
    });

    it('当用户不存在时应该抛出错误', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const txMock = {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
          session: {
            create: vi.fn(),
          },
        };
        return callback(txMock);
      });

      await expect(
        authService.login({ email: 'none@example.com', password: 'Password123' })
      ).rejects.toThrow('邮箱或密码错误');
    });

    it('当密码错误时应该抛出错误', async () => {
      const dbUser = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        passwordHash: 'hashed',
        createdAt: now,
      };
      
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const txMock = {
          user: {
            findUnique: vi.fn().mockResolvedValue(dbUser),
          },
          session: {
            create: vi.fn(),
          },
        };
        return callback(txMock);
      });

      await expect(
        authService.login({ email: 'test@example.com', password: 'wrong' })
      ).rejects.toThrow('邮箱或密码错误');
    });
  });

  describe('logout', () => {
    it('应该删除指定token的会话', async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 } as any);

      await authService.logout('jwt-token');

      // 实现使用SHA256哈希存储token
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { token: hashToken('jwt-token') },
      });
    });
  });

  describe('verifyToken', () => {
    it('当token有效时应该返回用户信息', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        createdAt: now,
        updatedAt: now,
      };
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1' } as any);
      // session需要包含userId以匹配JWT中的userId
      mockPrisma.session.findUnique.mockResolvedValue({
        token: hashToken('jwt-token'),
        userId: 'user-1',
        expiresAt: new Date(now.getTime() + 1000),
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue(user as any);

      const result = await authService.verifyToken('jwt-token');

      expect(result).toEqual(user);
    });

    it('当token无效时应该抛出错误', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('invalid');
      });

      // 实现返回具体的错误消息
      await expect(authService.verifyToken('bad-token')).rejects.toThrow('JWT验证失败');
    });

    it('当会话不存在时应该抛出错误', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1' } as any);
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(authService.verifyToken('jwt-token')).rejects.toThrow('会话不存在');
    });

    it('当会话过期时应该抛出错误', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1' } as any);
      mockPrisma.session.findUnique.mockResolvedValue({
        token: hashToken('jwt-token'),
        userId: 'user-1',
        expiresAt: new Date('2023-12-31T23:59:59.000Z'), // 过期时间
      } as any);

      await expect(authService.verifyToken('jwt-token')).rejects.toThrow('会话已过期');
    });

    it('当用户不存在时应该抛出错误', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1' } as any);
      mockPrisma.session.findUnique.mockResolvedValue({
        token: hashToken('jwt-token'),
        userId: 'user-1',
        expiresAt: new Date(now.getTime() + 1000),
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.verifyToken('jwt-token')).rejects.toThrow('用户不存在');
    });
  });

  describe('generateToken', () => {
    it('应该生成JWT token', () => {
      vi.mocked(jwt.sign).mockReturnValue('jwt-token' as any);

      const token = authService.generateToken('user-1');

      expect(token).toBe('jwt-token');
      // 实现添加了algorithm: 'HS256'
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user-1' },
        'test-secret',
        { expiresIn: '1h', algorithm: 'HS256' }
      );
    });
  });
});
