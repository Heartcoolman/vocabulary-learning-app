/**
 * Deprecation Middleware Tests
 *
 * 测试 API 废弃中间件的功能：
 * - 添加正确的响应头
 * - 记录废弃 API 访问日志
 * - 支持不同的废弃级别
 * - 处理已下线的 API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  deprecationMiddleware,
  createDeprecationWarning,
  createSunsetWarning,
  immediateDeprecation,
  applyDeprecationToRouter,
  DeprecationOptions,
} from '../../../src/middleware/deprecation.middleware';

// Mock logger
vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../../../src/logger';

describe('deprecationMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    setHeaderMock = vi.fn();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      method: 'GET',
      path: '/api/v1/users',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
      get: vi.fn((header: string) => {
        if (header === 'user-agent') return 'test-agent/1.0';
        return undefined;
      }),
    };

    mockRes = {
      setHeader: setHeaderMock,
      status: statusMock,
      json: jsonMock,
    };

    mockNext = vi.fn();
  });

  describe('基础功能', () => {
    it('应该添加 Deprecation 响应头', () => {
      const middleware = deprecationMiddleware({
        deprecatedAt: new Date('2024-01-01T00:00:00.000Z'),
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Deprecation', expect.stringContaining('2024'));
    });

    it('应该添加 Sunset 响应头', () => {
      const sunsetDate = new Date('2024-06-01T00:00:00.000Z');
      const middleware = deprecationMiddleware({
        sunset: sunsetDate,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Sunset', expect.stringContaining('2024'));
    });

    it('应该添加 Link 响应头指向替代 API', () => {
      const middleware = deprecationMiddleware({
        alternative: '/api/v2/users',
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Link',
        '</api/v2/users>; rel="successor-version"',
      );
    });

    it('应该添加自定义警告消息响应头', () => {
      const message = 'Please migrate to the new API';
      const middleware = deprecationMiddleware({
        message,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Message', message);
      expect(setHeaderMock).not.toHaveBeenCalledWith(
        'X-API-Deprecation-Message-Encoding',
        expect.any(String),
      );
    });

    it('非 ASCII 警告消息应该进行百分号编码并声明编码方式', () => {
      const message = '请使用新版 API';
      const middleware = deprecationMiddleware({
        message,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Message', encodeURI(message));
      expect(setHeaderMock).toHaveBeenCalledWith(
        'X-API-Deprecation-Message-Encoding',
        'utf-8,percent-encoded',
      );
    });

    it('应该添加废弃级别响应头', () => {
      const middleware = deprecationMiddleware({
        level: 'sunset',
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Level', 'sunset');
    });

    it('应该调用 next() 继续处理请求', () => {
      const middleware = deprecationMiddleware();

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('废弃级别', () => {
    it('warning 级别应该使用 info 日志', () => {
      const middleware = deprecationMiddleware({
        level: 'warning',
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.info).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('sunset 级别应该使用 warn 日志', () => {
      const middleware = deprecationMiddleware({
        level: 'sunset',
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('日志记录', () => {
    it('应该记录请求方法和路径', () => {
      const middleware = deprecationMiddleware({
        level: 'warning',
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          deprecation: expect.objectContaining({
            method: 'GET',
            path: '/api/v1/users',
          }),
        }),
        expect.any(String),
      );
    });

    it('应该记录客户端 IP 和 User-Agent', () => {
      const middleware = deprecationMiddleware();

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          deprecation: expect.objectContaining({
            clientIp: '127.0.0.1',
            userAgent: 'test-agent/1.0',
          }),
        }),
        expect.any(String),
      );
    });

    it('应该记录用户 ID（如果已认证）', () => {
      (mockReq as any).user = { id: 'user-123' };
      const middleware = deprecationMiddleware();

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          deprecation: expect.objectContaining({
            userId: 'user-123',
          }),
        }),
        expect.any(String),
      );
    });

    it('enableLogging 为 false 时不应该记录日志', () => {
      const middleware = deprecationMiddleware({
        enableLogging: false,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('完整配置', () => {
    it('应该正确处理所有配置选项', () => {
      const options: DeprecationOptions = {
        level: 'sunset',
        deprecatedAt: new Date('2024-01-01T00:00:00.000Z'),
        sunset: new Date('2024-06-01T00:00:00.000Z'),
        alternative: '/api/v2/users',
        message: '自定义警告消息',
      };

      const middleware = deprecationMiddleware(options);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // 验证所有响应头都被设置
      expect(setHeaderMock).toHaveBeenCalledWith('Deprecation', expect.any(String));
      expect(setHeaderMock).toHaveBeenCalledWith('Sunset', expect.any(String));
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Link',
        '</api/v2/users>; rel="successor-version"',
      );
      expect(setHeaderMock).toHaveBeenCalledWith(
        'X-API-Deprecation-Message',
        encodeURI('自定义警告消息'),
      );
      expect(setHeaderMock).toHaveBeenCalledWith(
        'X-API-Deprecation-Message-Encoding',
        'utf-8,percent-encoded',
      );
      expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Level', 'sunset');

      // 验证日志被记录
      expect(logger.warn).toHaveBeenCalled();

      // 验证请求继续处理
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('默认值', () => {
    it('应该使用默认的 warning 级别', () => {
      const middleware = deprecationMiddleware({});

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Level', 'warning');
    });

    it('应该生成默认的废弃时间', () => {
      const middleware = deprecationMiddleware({});

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Deprecation', expect.any(String));
    });

    it('应该生成默认的下线时间（180天后）', () => {
      const middleware = deprecationMiddleware({});

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Sunset', expect.any(String));
    });

    it('应该生成默认警告消息', () => {
      const middleware = deprecationMiddleware({
        alternative: '/api/v2/users',
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      const messageHeader = setHeaderMock.mock.calls.find(
        (call) => call[0] === 'X-API-Deprecation-Message',
      )?.[1] as string | undefined;

      expect(messageHeader).toBeDefined();
      expect(decodeURI(messageHeader!)).toContain('已废弃');
    });
  });
});

describe('createDeprecationWarning', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    setHeaderMock = vi.fn();

    mockReq = {
      method: 'GET',
      path: '/api/v1/test',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
      get: vi.fn(() => 'test-agent'),
    };

    mockRes = {
      setHeader: setHeaderMock,
    };

    mockNext = vi.fn();
  });

  it('应该创建 warning 级别的中间件', () => {
    const middleware = createDeprecationWarning('/api/v2/test');

    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Level', 'warning');
  });

  it('应该设置替代 API', () => {
    const middleware = createDeprecationWarning('/api/v2/test');

    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(setHeaderMock).toHaveBeenCalledWith('Link', '</api/v2/test>; rel="successor-version"');
  });

  it('应该使用提供的下线时间', () => {
    const sunsetDate = new Date('2024-12-31T00:00:00.000Z');
    const middleware = createDeprecationWarning('/api/v2/test', sunsetDate);

    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(setHeaderMock).toHaveBeenCalledWith('Sunset', expect.any(String));
  });
});

describe('createSunsetWarning', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    setHeaderMock = vi.fn();

    mockReq = {
      method: 'GET',
      path: '/api/v1/legacy',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
      get: vi.fn(() => 'test-agent'),
    };

    mockRes = {
      setHeader: setHeaderMock,
    };

    mockNext = vi.fn();
  });

  it('应该创建 sunset 级别的中间件', () => {
    const sunsetDate = new Date('2024-12-31T00:00:00.000Z');
    const middleware = createSunsetWarning(sunsetDate, '/api/v2/new');

    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Level', 'sunset');
  });

  it('应该设置下线时间和替代 API', () => {
    const sunsetDate = new Date('2024-12-31T00:00:00.000Z');
    const middleware = createSunsetWarning(sunsetDate, '/api/v2/new');

    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(setHeaderMock).toHaveBeenCalledWith('Sunset', expect.any(String));
    expect(setHeaderMock).toHaveBeenCalledWith('Link', '</api/v2/new>; rel="successor-version"');
  });

  it('应该使用 warn 级别记录日志', () => {
    const sunsetDate = new Date('2024-12-31T00:00:00.000Z');
    const middleware = createSunsetWarning(sunsetDate, '/api/v2/new');

    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('immediateDeprecation', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let setHeaderMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    setHeaderMock = vi.fn();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      method: 'GET',
      path: '/api/v0/old',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
      get: vi.fn(() => 'test-agent'),
    };

    mockRes = {
      setHeader: setHeaderMock,
      status: statusMock,
      json: jsonMock,
    };
  });

  it('应该返回 410 Gone 状态码', () => {
    const handler = immediateDeprecation('/api/v2/replacement');

    handler(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(410);
  });

  it('应该返回包含替代 API 的错误响应', () => {
    const handler = immediateDeprecation('/api/v2/replacement');

    handler(mockReq as Request, mockRes as Response);

    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: expect.any(String),
      code: 'API_GONE',
      alternative: '/api/v2/replacement',
    });
  });

  it('应该使用自定义错误消息', () => {
    const customMessage = '此功能已迁移到新系统';
    const handler = immediateDeprecation('/api/v2/replacement', customMessage);

    handler(mockReq as Request, mockRes as Response);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: customMessage,
      }),
    );
  });

  it('应该添加 Link 响应头', () => {
    const handler = immediateDeprecation('/api/v2/replacement');

    handler(mockReq as Request, mockRes as Response);

    expect(setHeaderMock).toHaveBeenCalledWith(
      'Link',
      '</api/v2/replacement>; rel="successor-version"',
    );
  });

  it('应该记录警告日志', () => {
    const handler = immediateDeprecation('/api/v2/replacement');

    handler(mockReq as Request, mockRes as Response);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v0/old',
        module: 'deprecation',
      }),
      expect.stringContaining('已下线'),
    );
  });

  it('应该记录已认证用户的 ID', () => {
    (mockReq as any).user = { id: 'user-456' };
    const handler = immediateDeprecation('/api/v2/replacement');

    handler(mockReq as Request, mockRes as Response);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-456',
      }),
      expect.any(String),
    );
  });
});

describe('applyDeprecationToRouter', () => {
  it('应该将中间件应用到路由器', () => {
    const mockRouter = {
      use: vi.fn(),
    };

    const options: DeprecationOptions = {
      level: 'warning',
      alternative: '/api/v2',
    };

    applyDeprecationToRouter(mockRouter, options);

    expect(mockRouter.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('应用的中间件应该正常工作', () => {
    const usedMiddleware: any[] = [];
    const mockRouter = {
      use: vi.fn((middleware) => {
        usedMiddleware.push(middleware);
      }),
    };

    const options: DeprecationOptions = {
      level: 'sunset',
      alternative: '/api/v2',
    };

    applyDeprecationToRouter(mockRouter, options);

    // 执行应用的中间件
    const setHeaderMock = vi.fn();
    const mockReq = {
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
      get: vi.fn(() => 'test-agent'),
    };
    const mockRes = {
      setHeader: setHeaderMock,
    };
    const mockNext = vi.fn();

    usedMiddleware[0](mockReq, mockRes, mockNext);

    expect(setHeaderMock).toHaveBeenCalledWith('X-API-Deprecation-Level', 'sunset');
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('HTTP 日期格式', () => {
  it('应该生成符合 RFC 7231 的 HTTP-date 格式', () => {
    const setHeaderMock = vi.fn();
    const mockReq = {
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
      get: vi.fn(() => 'test-agent'),
    };
    const mockRes = {
      setHeader: setHeaderMock,
    };
    const mockNext = vi.fn();

    const testDate = new Date('2024-01-15T10:30:00.000Z');
    const middleware = deprecationMiddleware({
      deprecatedAt: testDate,
      sunset: testDate,
    });

    middleware(mockReq as Request, mockRes as Response, mockNext);

    // HTTP-date 格式应该类似: "Mon, 15 Jan 2024 10:30:00 GMT"
    const deprecationHeader = setHeaderMock.mock.calls.find(
      (call) => call[0] === 'Deprecation',
    )?.[1];
    const sunsetHeader = setHeaderMock.mock.calls.find((call) => call[0] === 'Sunset')?.[1];

    expect(deprecationHeader).toMatch(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
    expect(sunsetHeader).toMatch(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
  });
});

describe('边界情况', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    setHeaderMock = vi.fn();

    mockReq = {
      method: 'POST',
      path: '/api/test',
      ip: undefined,
      socket: {} as any,
      get: vi.fn(() => undefined),
    };

    mockRes = {
      setHeader: setHeaderMock,
    };

    mockNext = vi.fn();
  });

  it('应该处理缺少 IP 地址的请求', () => {
    const middleware = deprecationMiddleware();

    expect(() => {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    }).not.toThrow();

    expect(mockNext).toHaveBeenCalled();
  });

  it('应该处理缺少 User-Agent 的请求', () => {
    const middleware = deprecationMiddleware();

    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        deprecation: expect.objectContaining({
          userAgent: undefined,
        }),
      }),
      expect.any(String),
    );
  });

  it('应该处理没有替代 API 的情况', () => {
    const middleware = deprecationMiddleware({
      alternative: undefined,
    });

    middleware(mockReq as Request, mockRes as Response, mockNext);

    // 应该生成包含联系开发团队提示的默认消息
    const messageHeader = setHeaderMock.mock.calls.find(
      (call) => call[0] === 'X-API-Deprecation-Message',
    )?.[1] as string | undefined;

    expect(messageHeader).toBeDefined();
    expect(decodeURI(messageHeader!)).toContain('联系开发团队');
  });
});
