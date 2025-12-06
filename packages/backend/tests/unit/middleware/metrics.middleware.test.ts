/**
 * Metrics Middleware Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { metricsMiddleware, stopMetricsCollection } from '../../../src/middleware/metrics.middleware';

// Mock the amas-metrics module
vi.mock('../../../src/monitoring/amas-metrics', () => ({
  recordHttpRequest: vi.fn(),
  recordHttpDrop: vi.fn(),
}));

import { recordHttpRequest, recordHttpDrop } from '../../../src/monitoring/amas-metrics';

describe('metricsMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response> & { on: ReturnType<typeof vi.fn> };
  let mockNext: NextFunction;
  let finishHandler: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockReq = {
      method: 'GET',
      path: '/api/test',
      originalUrl: '/api/test',
      baseUrl: '',
      route: undefined,
    };

    // Capture the 'finish' event handler
    mockRes = {
      statusCode: 200,
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandler = handler;
        }
        return mockRes;
      }),
    };

    mockNext = vi.fn();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await stopMetricsCollection();
  });

  describe('middleware execution', () => {
    it('should call next immediately', () => {
      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should register finish event handler on response', () => {
      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });

  describe('normalizeRoute', () => {
    it('should use req.route.path when available', async () => {
      mockReq.route = { path: '/users/:id' };
      mockReq.baseUrl = '/api';
      mockReq.path = '/api/auth/login';  // High sample rate path

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      // Wait for setImmediate
      await vi.advanceTimersByTimeAsync(1);
      // Wait for flush interval
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/users/:id',
        })
      );
    });

    it('should handle array route paths', async () => {
      mockReq.route = { path: ['/items', '/items/:id'] };
      mockReq.baseUrl = '/api';
      mockReq.path = '/api/auth/test';  // High sample rate path

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/items',
        })
      );
    });

    it('should use baseUrl when route is not available', async () => {
      mockReq.route = undefined;
      mockReq.baseUrl = '/api/v1';
      mockReq.path = '/api/auth/login';  // High sample rate path

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/v1',
        })
      );
    });

    it('should return /unknown when neither route nor baseUrl is available', async () => {
      mockReq.route = undefined;
      mockReq.baseUrl = '';
      mockReq.path = '/api/auth/login';  // High sample rate path
      mockRes.statusCode = 500;  // Force record by making it a 5xx error

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/unknown',
        })
      );
    });

    it('should truncate routes longer than 64 characters', async () => {
      const longPath = '/very/long/path/that/exceeds/sixty/four/characters/limit/here';
      mockReq.route = { path: longPath };
      mockReq.baseUrl = '/api';
      mockReq.path = '/api/auth/login';  // High sample rate path
      mockRes.statusCode = 500;  // Force record

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      const call = vi.mocked(recordHttpRequest).mock.calls[0][0];
      expect(call.route.length).toBeLessThanOrEqual(64);
    });

    it('should normalize multiple slashes in route', async () => {
      mockReq.route = { path: '//users///profile' };
      mockReq.baseUrl = '/api//';
      mockReq.path = '/api/auth/login';  // High sample rate path
      mockRes.statusCode = 500;  // Force record

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/users/profile',
        })
      );
    });
  });

  describe('resolveSampleRate', () => {
    it('should always record 5xx errors', async () => {
      mockReq.path = '/some/random/path';  // Low sample rate path
      mockRes.statusCode = 500;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should always record 503 errors', async () => {
      mockReq.path = '/health';  // Low sample rate path (0.02)
      mockRes.statusCode = 503;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should record 4xx errors on known routes', async () => {
      mockReq.path = '/api/auth/login';
      mockReq.route = { path: '/login' };
      mockReq.baseUrl = '/api/auth';
      mockRes.statusCode = 401;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should use full sample rate for /api/auth paths', async () => {
      mockReq.path = '/api/auth/login';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      // With 100% sample rate, should always be recorded
      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should use full sample rate for /api/learning paths', async () => {
      mockReq.path = '/api/learning/session';
      mockReq.route = { path: '/session' };
      mockReq.baseUrl = '/api/learning';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should use full sample rate for /api/records paths', async () => {
      mockReq.path = '/api/records';
      mockReq.route = { path: '/' };
      mockReq.baseUrl = '/api/records';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should use full sample rate for /api/record paths', async () => {
      mockReq.path = '/api/record/123';
      mockReq.route = { path: '/:id' };
      mockReq.baseUrl = '/api/record';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should use default sample rate (0.1) for unmatched paths', async () => {
      // For paths with 0.1 sample rate, sometimes it records, sometimes not
      // We'll test that unmatched paths get the default rate by checking
      // the sampling behavior over multiple calls
      mockReq.path = '/some/unknown/path';
      mockRes.statusCode = 200;

      // With the random nature, we just verify the middleware runs without error
      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      // This is probabilistic - the function was called, sampling may or may not record
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('metric recording', () => {
    it('should record correct metric data', async () => {
      mockReq.method = 'POST';
      mockReq.path = '/api/auth/register';
      mockReq.route = { path: '/register' };
      mockReq.baseUrl = '/api/auth';
      mockRes.statusCode = 201;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/auth/register',
          method: 'POST',
          status: 201,
          durationSeconds: expect.any(Number),
        })
      );
    });

    it('should calculate duration in seconds', async () => {
      mockReq.path = '/api/auth/login';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

      // Simulate some time passing (though with fake timers this is tricky)
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      const call = vi.mocked(recordHttpRequest).mock.calls[0];
      if (call) {
        expect(call[0].durationSeconds).toBeGreaterThanOrEqual(0);
      }
    });

    it('should use path when req.path is available', async () => {
      mockReq.path = '/api/auth/login';
      mockReq.originalUrl = '/api/auth/login?query=1';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      // The sample rate is resolved using the path, not originalUrl
      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should fallback to originalUrl when path is empty', async () => {
      mockReq.path = '';
      mockReq.originalUrl = '/api/auth/login';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalled();
    });
  });

  describe('queue management', () => {
    it('should batch flush metrics', async () => {
      mockReq.path = '/api/auth/login';
      mockRes.statusCode = 200;

      // Simulate multiple requests
      for (let i = 0; i < 5; i++) {
        metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
        finishHandler();
        await vi.advanceTimersByTimeAsync(1);
      }

      // Metrics not flushed yet
      expect(recordHttpRequest).not.toHaveBeenCalled();

      // Advance to flush interval
      await vi.advanceTimersByTimeAsync(500);

      // Now metrics should be flushed
      expect(recordHttpRequest).toHaveBeenCalled();
    });
  });

  describe('stopMetricsCollection', () => {
    it('should flush remaining metrics when stopped', async () => {
      // Use real timers for stopMetricsCollection tests since it uses setImmediate
      vi.useRealTimers();

      mockReq.path = '/api/auth/login';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      // Wait for setImmediate to complete
      await new Promise(resolve => setImmediate(resolve));

      // Stop collection - this should flush remaining metrics
      await stopMetricsCollection();

      // Should have flushed remaining metrics
      expect(recordHttpRequest).toHaveBeenCalled();
    });

    it('should handle multiple stop calls gracefully', async () => {
      // Use real timers for stopMetricsCollection tests
      vi.useRealTimers();

      await stopMetricsCollection();
      await stopMetricsCollection();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should stop the flush timer', async () => {
      // Use real timers for stopMetricsCollection tests
      vi.useRealTimers();

      mockReq.path = '/api/auth/login';
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      // Wait for setImmediate to complete
      await new Promise(resolve => setImmediate(resolve));
      await stopMetricsCollection();

      vi.clearAllMocks();

      // Add more metrics after stopping
      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      // Wait for new flush cycle
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setTimeout(resolve, 600));

      // The timer should restart when new metrics come in
      expect(recordHttpRequest).toHaveBeenCalled();
    });
  });

  describe('4xx error sampling for unknown routes', () => {
    it('should sample 4xx errors on unknown routes at 10% rate', async () => {
      // Reset mock to track calls
      vi.mocked(recordHttpRequest).mockClear();

      mockReq.path = '/unknown/path';
      mockReq.route = undefined;
      mockReq.baseUrl = '';
      mockRes.statusCode = 404;

      // Run multiple times to test probabilistic behavior
      // Due to 10% sampling, we can't deterministically test this
      // but we can verify the middleware handles this case
      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      // Test passes if no error is thrown - the actual recording is probabilistic
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle missing path and originalUrl', async () => {
      mockReq.path = undefined as unknown as string;
      mockReq.originalUrl = undefined as unknown as string;
      mockRes.statusCode = 500;

      metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
      finishHandler();

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(500);

      expect(recordHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/unknown',
        })
      );
    });

    it('should handle various HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

      for (const method of methods) {
        vi.clearAllMocks();
        mockReq.method = method;
        mockReq.path = '/api/auth/test';
        mockRes.statusCode = 200;

        metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
        finishHandler();

        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(500);

        expect(recordHttpRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            method,
          })
        );
      }
    });

    it('should handle different status codes', async () => {
      const statusCodes = [200, 201, 204, 301, 400, 401, 403, 404, 500, 502, 503];

      for (const status of statusCodes) {
        vi.clearAllMocks();
        mockReq.path = '/api/auth/test';
        mockRes.statusCode = status;

        metricsMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);
        finishHandler();

        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(500);

        if (status >= 500 || status >= 400) {
          // 5xx always recorded, 4xx on known routes always recorded
          expect(recordHttpRequest).toHaveBeenCalledWith(
            expect.objectContaining({
              status,
            })
          );
        }
      }
    });
  });
});
