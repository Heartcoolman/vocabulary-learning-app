/**
 * Auth Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../../../src/middleware/auth.middleware';

vi.mock('../../../src/services/auth.service', () => ({
  default: {
    verifyToken: vi.fn(),
  },
}));

vi.mock('../../../src/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import authService from '../../../src/services/auth.service';

describe('authMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      headers: {},
      path: '/test',
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = vi.fn();
  });

  describe('missing token', () => {
    it('should return 401 when no authorization header', async () => {
      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '未提供认证令牌',
        code: 'UNAUTHORIZED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header does not start with Bearer', async () => {
      mockReq.headers = { authorization: 'Basic token123' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '未提供认证令牌',
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 when authorization header is empty', async () => {
      mockReq.headers = { authorization: '' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('valid token', () => {
    it('should call next and set req.user on valid token', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com', role: 'USER' };
      vi.mocked(authService.verifyToken).mockResolvedValue(mockUser as any);

      mockReq.headers = { authorization: 'Bearer valid-token' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(authService.verifyToken).toHaveBeenCalledWith('valid-token');
      expect((mockReq as any).user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should extract token correctly from Bearer header', async () => {
      const mockUser = { id: 'user-123' };
      vi.mocked(authService.verifyToken).mockResolvedValue(mockUser as any);

      mockReq.headers = { authorization: 'Bearer my-jwt-token-here' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(authService.verifyToken).toHaveBeenCalledWith('my-jwt-token-here');
    });
  });

  describe('invalid token', () => {
    it('should return 401 when token verification fails', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('Token expired'));

      mockReq.headers = { authorization: 'Bearer invalid-token' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '认证失败，请重新登录',
        code: 'UNAUTHORIZED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is malformed', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('jwt malformed'));

      mockReq.headers = { authorization: 'Bearer malformed.token' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should return 401 when user not found', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('User not found'));

      mockReq.headers = { authorization: 'Bearer valid-but-deleted-user' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});

describe('optionalAuthMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      headers: {},
      path: '/test',
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = vi.fn();
  });

  describe('no token provided', () => {
    it('should call next without setting user when no authorization header', async () => {
      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next without setting user when authorization header does not start with Bearer', async () => {
      mockReq.headers = { authorization: 'Basic token123' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next without setting user when authorization header is empty', async () => {
      mockReq.headers = { authorization: '' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
    });

    it('should call next without setting user when authorization is undefined', async () => {
      mockReq.headers = { authorization: undefined };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
    });
  });

  describe('valid token', () => {
    it('should call next and set req.user on valid token', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com', role: 'USER' };
      vi.mocked(authService.verifyToken).mockResolvedValue(mockUser as any);

      mockReq.headers = { authorization: 'Bearer valid-token' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(authService.verifyToken).toHaveBeenCalledWith('valid-token');
      expect((mockReq as any).user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should extract token correctly from Bearer header', async () => {
      const mockUser = { id: 'user-123' };
      vi.mocked(authService.verifyToken).mockResolvedValue(mockUser as any);

      mockReq.headers = { authorization: 'Bearer my-jwt-token-here' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(authService.verifyToken).toHaveBeenCalledWith('my-jwt-token-here');
    });

    it('should set user with all properties from verification', async () => {
      const mockUser = {
        id: 'user-456',
        email: 'admin@example.com',
        role: 'ADMIN',
        createdAt: new Date(),
      };
      vi.mocked(authService.verifyToken).mockResolvedValue(mockUser as any);

      mockReq.headers = { authorization: 'Bearer admin-token' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect((mockReq as any).user).toEqual(mockUser);
    });
  });

  describe('invalid token', () => {
    it('should call next without setting user when token verification fails', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('Token expired'));

      mockReq.headers = { authorization: 'Bearer expired-token' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next without setting user when token is malformed', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('jwt malformed'));

      mockReq.headers = { authorization: 'Bearer malformed.token' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next without setting user when user not found', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('User not found'));

      mockReq.headers = { authorization: 'Bearer valid-but-deleted-user' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should continue request even with non-Error exception', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue('string error');

      mockReq.headers = { authorization: 'Bearer some-token' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
    });

    it('should not return error response unlike authMiddleware', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('Any error'));

      mockReq.headers = { authorization: 'Bearer invalid-token' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);

      // The key difference from authMiddleware: no 401 response
      expect(statusMock).not.toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('comparison with authMiddleware', () => {
    it('optionalAuthMiddleware allows access without token, authMiddleware does not', async () => {
      // optionalAuthMiddleware - no token, should continue
      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      vi.clearAllMocks();
      mockReq.headers = {};

      // authMiddleware - no token, should reject
      await authMiddleware(mockReq as any, mockRes as Response, mockNext);
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('optionalAuthMiddleware continues on invalid token, authMiddleware rejects', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValue(new Error('Invalid token'));
      mockReq.headers = { authorization: 'Bearer invalid-token' };

      // optionalAuthMiddleware - invalid token, should continue without user
      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();

      vi.clearAllMocks();
      mockReq.headers = { authorization: 'Bearer invalid-token' };

      // authMiddleware - invalid token, should reject
      await authMiddleware(mockReq as any, mockRes as Response, mockNext);
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('both middlewares set user on valid token', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com', role: 'USER' };
      vi.mocked(authService.verifyToken).mockResolvedValue(mockUser as any);
      mockReq.headers = { authorization: 'Bearer valid-token' };

      await optionalAuthMiddleware(mockReq as any, mockRes as Response, mockNext);
      expect((mockReq as any).user).toEqual(mockUser);

      vi.clearAllMocks();
      delete (mockReq as any).user;
      mockReq.headers = { authorization: 'Bearer valid-token' };

      await authMiddleware(mockReq as any, mockRes as Response, mockNext);
      expect((mockReq as any).user).toEqual(mockUser);
    });
  });
});
