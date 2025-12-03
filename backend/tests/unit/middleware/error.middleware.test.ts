/**
 * Error Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { errorHandler, AppError } from '../../../src/middleware/error.middleware';

vi.mock('../../../src/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('errorHandler', () => {
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
      method: 'POST',
      path: '/api/test',
      log: {
        warn: vi.fn(),
        error: vi.fn(),
      } as any,
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
      statusCode: 200,
    };
    mockNext = vi.fn();
  });

  describe('ZodError handling', () => {
    it('should return 400 for Zod validation error', () => {
      const schema = z.object({ email: z.string().email() });
      let zodError: ZodError;

      try {
        schema.parse({ email: 'invalid' });
      } catch (e) {
        zodError = e as ZodError;
      }

      errorHandler(zodError!, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: expect.any(String),
        code: 'VALIDATION_ERROR',
      });
    });

    it('should extract first error message from ZodError', () => {
      const schema = z.object({
        email: z.string().email('邮箱格式不正确'),
        password: z.string().min(8, '密码至少8位'),
      });

      let zodError: ZodError;
      try {
        schema.parse({ email: 'invalid', password: '123' });
      } catch (e) {
        zodError = e as ZodError;
      }

      errorHandler(zodError!, mockReq as Request, mockRes as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.error).toBeTruthy();
    });
  });

  describe('AppError handling', () => {
    it('should handle AppError.notFound', () => {
      const error = AppError.notFound('用户不存在');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '用户不存在',
        code: 'NOT_FOUND',
      });
    });

    it('should handle AppError.unauthorized', () => {
      const error = AppError.unauthorized('请先登录');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '请先登录',
        code: 'UNAUTHORIZED',
      });
    });

    it('should handle AppError.forbidden', () => {
      const error = AppError.forbidden('权限不足');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '权限不足',
        code: 'FORBIDDEN',
      });
    });

    it('should handle AppError.conflict', () => {
      const error = AppError.conflict('邮箱已被注册');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '邮箱已被注册',
        code: 'CONFLICT',
      });
    });

    it('should handle AppError.badRequest', () => {
      const error = AppError.badRequest('参数错误');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '参数错误',
        code: 'BAD_REQUEST',
      });
    });

    it('should handle non-operational errors without exposing message', () => {
      const error = AppError.internal('数据库连接失败');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '服务器内部错误',
        code: 'INTERNAL_ERROR',
      });
    });
  });

  describe('Error inference', () => {
    it('should infer notFound for messages containing 不存在', () => {
      const error = new Error('资源不存在');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
    });

    it('should infer conflict for messages containing 已被注册', () => {
      const error = new Error('该邮箱已被注册');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it('should infer unauthorized for messages containing 密码错误', () => {
      const error = new Error('密码错误');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should infer unauthorized for messages containing 令牌', () => {
      const error = new Error('无效的认证令牌');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should default to badRequest for unknown error messages', () => {
      const error = new Error('未知错误');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('unknown errors', () => {
    it('should return 500 for non-Error objects', () => {
      const error = { message: 'Something went wrong' };

      errorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: '服务器内部错误',
        code: 'INTERNAL_ERROR',
      });
    });
  });
});

describe('AppError', () => {
  it('should create error with correct properties', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR', true);

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.isOperational).toBe(true);
  });

  it('should use default values', () => {
    const error = new AppError('Test error');

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.isOperational).toBe(true);
  });

  it('should be instance of Error', () => {
    const error = new AppError('Test error');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});
