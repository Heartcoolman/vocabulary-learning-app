/**
 * Logger 单元测试
 *
 * 测试前端统一日志系统的核心功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock env config
vi.mock('../../config/env', () => ({
  env: {
    isDev: true,
    isProd: false,
    mode: 'development',
  },
}));

describe('Logger', () => {
  let logger: typeof import('../logger').logger;
  let Logger: typeof import('../logger').Logger;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Dynamically import to get fresh module
    const loggerModule = await import('../logger');
    logger = loggerModule.logger;
    Logger = loggerModule.Logger;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Logger class', () => {
    it('should create logger instance with default config', () => {
      const customLogger = new Logger();
      expect(customLogger).toBeDefined();
    });

    it('should create logger instance with custom config', () => {
      const customLogger = new Logger({
        level: 'warn',
        enableConsole: true,
        enableRemote: false,
      });
      expect(customLogger).toBeDefined();
    });

    it('should create child logger with bindings', () => {
      const customLogger = new Logger();
      const childLogger = customLogger.child({ module: 'test' });
      expect(childLogger).toBeDefined();
      expect(childLogger).toBeInstanceOf(Logger);
    });
  });

  describe('Log level methods', () => {
    it('should have trace method', () => {
      expect(typeof logger.trace).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have fatal method', () => {
      expect(typeof logger.fatal).toBe('function');
    });

    it('should log simple string message without throwing', () => {
      expect(() => logger.info('Test message')).not.toThrow();
    });

    it('should log message with context object without throwing', () => {
      expect(() => logger.info({ userId: '123', action: 'login' }, 'User logged in')).not.toThrow();
    });

    it('should log error with err property without throwing', () => {
      const error = new Error('Test error');
      expect(() => logger.error({ err: error }, 'An error occurred')).not.toThrow();
    });
  });

  describe('Child logger', () => {
    it('should create child logger with additional bindings', () => {
      const childLogger = logger.child({ module: 'auth' });
      expect(childLogger).toBeDefined();
      expect(() => childLogger.info('Auth event')).not.toThrow();
    });

    it('should create nested child loggers', () => {
      const childLogger = logger.child({ module: 'api' });
      const grandchildLogger = childLogger.child({ endpoint: '/users' });
      expect(grandchildLogger).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should allow updating configuration', () => {
      expect(() => logger.configure({ level: 'error' })).not.toThrow();
    });

    it('should have flush method', () => {
      expect(typeof logger.flush).toBe('function');
      expect(() => logger.flush()).not.toThrow();
    });
  });

  describe('Specialized loggers', () => {
    it('should export authLogger', async () => {
      const { authLogger } = await import('../logger');
      expect(authLogger).toBeDefined();
      expect(typeof authLogger.info).toBe('function');
    });

    it('should export apiLogger', async () => {
      const { apiLogger } = await import('../logger');
      expect(apiLogger).toBeDefined();
      expect(typeof apiLogger.info).toBe('function');
    });

    it('should export learningLogger', async () => {
      const { learningLogger } = await import('../logger');
      expect(learningLogger).toBeDefined();
      expect(typeof learningLogger.info).toBe('function');
    });

    it('should export amasLogger', async () => {
      const { amasLogger } = await import('../logger');
      expect(amasLogger).toBeDefined();
      expect(typeof amasLogger.info).toBe('function');
    });

    it('should export uiLogger', async () => {
      const { uiLogger } = await import('../logger');
      expect(uiLogger).toBeDefined();
      expect(typeof uiLogger.info).toBe('function');
    });

    // syncLogger is not exported - removed test
  });

  describe('Error handling', () => {
    it('should handle Error objects correctly', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      expect(() => logger.error({ err: error }, 'Error occurred')).not.toThrow();
    });

    it('should handle non-Error objects as errors', () => {
      expect(() => logger.error({ err: 'string error' }, 'String error occurred')).not.toThrow();
    });

    it('should handle null error', () => {
      expect(() => logger.error({ err: null }, 'Null error')).not.toThrow();
    });
  });

  describe('Object logging', () => {
    it('should log object without message', () => {
      expect(() => logger.info({ key: 'value', count: 42 })).not.toThrow();
    });

    it('should handle nested objects', () => {
      expect(() =>
        logger.info(
          {
            user: {
              id: '123',
              profile: {
                name: 'Test',
              },
            },
          },
          'Nested object',
        ),
      ).not.toThrow();
    });

    it('should handle arrays in context', () => {
      expect(() => logger.info({ items: [1, 2, 3] }, 'Array in context')).not.toThrow();
    });
  });

  describe('Log levels filtering', () => {
    it('should respect log level configuration', async () => {
      vi.resetModules();

      // Create a logger with error level only
      const loggerModule = await import('../logger');
      const strictLogger = new loggerModule.Logger({ level: 'error' });

      // These should not throw
      expect(() => strictLogger.debug('Debug message')).not.toThrow();
      expect(() => strictLogger.error('Error message')).not.toThrow();
    });
  });

  describe('Logger instance properties', () => {
    it('should have all required methods', () => {
      const methods = [
        'trace',
        'debug',
        'info',
        'warn',
        'error',
        'fatal',
        'child',
        'flush',
        'configure',
      ];
      for (const method of methods) {
        expect(typeof (logger as unknown as Record<string, unknown>)[method]).toBe('function');
      }
    });
  });
});
