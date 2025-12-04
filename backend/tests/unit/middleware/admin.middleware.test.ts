/**
 * Admin Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, NextFunction } from 'express';
import { adminMiddleware } from '../../../src/middleware/admin.middleware';
import { AuthRequest } from '../../../src/types';
import { UserRole } from '@prisma/client';

describe('adminMiddleware', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {};
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = vi.fn();
  });

  describe('unauthorized access', () => {
    it('should return 401 when user is not set', async () => {
      mockReq.user = undefined;

      await adminMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '未登录',
        code: 'UNAUTHORIZED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user is null', async () => {
      mockReq.user = null as any;

      await adminMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('forbidden access', () => {
    it('should return 403 when user is not admin', async () => {
      mockReq.user = {
        id: 'user-123',
        email: 'user@example.com',
        role: UserRole.USER,
      } as any;

      await adminMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '权限不足，需要管理员权限',
        code: 'FORBIDDEN',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('admin access', () => {
    it('should call next when user is admin', async () => {
      mockReq.user = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      } as any;

      await adminMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should not modify request when user is admin', async () => {
      const originalUser = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      };
      mockReq.user = { ...originalUser } as any;

      await adminMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual(originalUser);
    });
  });

  describe('error handling', () => {
    it('should call next with error when exception occurs', async () => {
      mockReq.user = {
        id: 'admin-123',
        role: UserRole.ADMIN,
      } as any;

      // Simulate an error by making role getter throw
      Object.defineProperty(mockReq.user, 'role', {
        get() {
          throw new Error('Unexpected error');
        },
      });

      await adminMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
