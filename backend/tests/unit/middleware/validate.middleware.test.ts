/**
 * Validate Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate, validateQuery, validateBody, validateParams, validateRequest } from '../../../src/middleware/validate.middleware';

describe('validate middleware', () => {
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
      body: {},
      query: {},
      params: {},
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = vi.fn();
  });

  describe('validate()', () => {
    const testSchema = z.object({
      email: z.string().email('邮箱格式不正确'),
      password: z.string().min(8, '密码至少8位'),
    });

    it('should call next on valid body', () => {
      mockReq.body = { email: 'test@example.com', password: 'password123' };

      const middleware = validate(testSchema, 'body');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedBody).toEqual({ email: 'test@example.com', password: 'password123' });
    });

    it('should return 400 on invalid body', () => {
      mockReq.body = { email: 'invalid', password: '123' };

      const middleware = validate(testSchema, 'body');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'VALIDATION_ERROR',
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should validate query parameters', () => {
      const querySchema = z.object({ page: z.string() });
      mockReq.query = { page: '1' };

      const middleware = validate(querySchema, 'query');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedQuery).toEqual({ page: '1' });
    });

    it('should validate path params', () => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      mockReq.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const middleware = validate(paramsSchema, 'params');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedParams).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
    });

    it('should include error details', () => {
      mockReq.body = { email: 'invalid', password: '123' };

      const middleware = validate(testSchema, 'body');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).toBeDefined();
      expect(response.details.length).toBeGreaterThan(0);
    });
  });

  describe('validateQuery()', () => {
    it('should validate query with helper function', () => {
      const schema = z.object({ limit: z.string() });
      mockReq.query = { limit: '10' };

      const middleware = validateQuery(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedQuery).toEqual({ limit: '10' });
    });
  });

  describe('validateBody()', () => {
    it('should validate body with helper function', () => {
      const schema = z.object({ name: z.string() });
      mockReq.body = { name: 'Test' };

      const middleware = validateBody(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedBody).toEqual({ name: 'Test' });
    });
  });

  describe('validateParams()', () => {
    it('should validate params with helper function', () => {
      const schema = z.object({ id: z.string() });
      mockReq.params = { id: '123' };

      const middleware = validateParams(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedParams).toEqual({ id: '123' });
    });
  });

  describe('validateRequest()', () => {
    it('should validate multiple sources', async () => {
      const schemas = {
        body: z.object({ name: z.string() }),
        query: z.object({ page: z.string() }),
        params: z.object({ id: z.string() }),
      };

      mockReq.body = { name: 'Test' };
      mockReq.query = { page: '1' };
      mockReq.params = { id: '123' };

      const middleware = validateRequest(schemas);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedBody).toEqual({ name: 'Test' });
      expect(mockReq.validatedQuery).toEqual({ page: '1' });
      expect(mockReq.validatedParams).toEqual({ id: '123' });
    });

    it('should return error if any validation fails', async () => {
      const schemas = {
        body: z.object({ name: z.string().min(5) }),
      };

      mockReq.body = { name: 'ab' };

      const middleware = validateRequest(schemas);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip undefined schemas', async () => {
      const schemas = {
        body: z.object({ name: z.string() }),
      };

      mockReq.body = { name: 'Test' };
      mockReq.query = { extra: 'value' };

      const middleware = validateRequest(schemas);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedBody).toEqual({ name: 'Test' });
      expect(mockReq.validatedQuery).toBeUndefined();
    });

    it('should pass non-Zod errors to next', async () => {
      const badSchema = {
        parse: () => {
          throw new Error('Unexpected error');
        },
      };

      const schemas = { body: badSchema as any };
      mockReq.body = {};

      const middleware = validateRequest(schemas);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
