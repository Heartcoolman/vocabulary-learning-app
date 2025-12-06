/**
 * Log Storage Service Unit Tests
 * Tests for the LogStorageService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/config/database', () => ({
  default: {
    systemLog: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      deleteMany: vi.fn()
    },
    $queryRaw: vi.fn()
  }
}));

vi.mock('../../../src/logger', () => ({
  serviceLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import prisma from '../../../src/config/database';

describe('LogStorageService', () => {
  let logStorageService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Import fresh instance
    const module = await import('../../../src/services/log-storage.service');
    logStorageService = module.logStorageService;
  });

  afterEach(async () => {
    // Flush any remaining logs
    if (logStorageService?.flush) {
      await logStorageService.flush();
    }
    vi.resetModules();
  });

  describe('writeLog', () => {
    it('should add log to buffer', async () => {
      (prisma.systemLog.createMany as any).mockResolvedValue({ count: 1 });

      logStorageService.writeLog({
        level: 'INFO',
        message: 'Test log message',
        module: 'test',
        source: 'BACKEND'
      });

      // Force flush
      await logStorageService.flush();

      expect(prisma.systemLog.createMany).toHaveBeenCalled();
    });

    it('should include all optional fields', async () => {
      (prisma.systemLog.createMany as any).mockResolvedValue({ count: 1 });

      logStorageService.writeLog({
        level: 'ERROR',
        message: 'Error occurred',
        module: 'auth',
        source: 'BACKEND',
        context: { userId: 'user-123' },
        error: { message: 'Auth failed', name: 'AuthError', stack: 'stack trace' },
        requestId: 'req-123',
        userId: 'user-123',
        clientIp: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        app: 'danci',
        env: 'test'
      });

      await logStorageService.flush();

      expect(prisma.systemLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              level: 'ERROR',
              message: 'Error occurred',
              module: 'auth',
              requestId: 'req-123'
            })
          ])
        })
      );
    });

    it('should use default values for missing optional fields', async () => {
      (prisma.systemLog.createMany as any).mockResolvedValue({ count: 1 });

      logStorageService.writeLog({
        level: 'INFO',
        message: 'Simple log'
      });

      await logStorageService.flush();

      expect(prisma.systemLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              level: 'INFO',
              message: 'Simple log',
              app: 'danci',
              source: 'BACKEND'
            })
          ])
        })
      );
    });
  });

  describe('flush', () => {
    it('should write buffered logs to database', async () => {
      (prisma.systemLog.createMany as any).mockResolvedValue({ count: 2 });

      logStorageService.writeLog({ level: 'INFO', message: 'Log 1' });
      logStorageService.writeLog({ level: 'WARN', message: 'Log 2' });

      await logStorageService.flush();

      expect(prisma.systemLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ message: 'Log 1' }),
            expect.objectContaining({ message: 'Log 2' })
          ])
        })
      );
    });

    it('should do nothing when buffer is empty', async () => {
      await logStorageService.flush();

      expect(prisma.systemLog.createMany).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      (prisma.systemLog.createMany as any).mockRejectedValue(new Error('DB error'));

      logStorageService.writeLog({ level: 'INFO', message: 'Test' });

      // Should not throw
      await logStorageService.flush();
    });
  });

  describe('queryLogs', () => {
    it('should return paginated logs', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          level: 'INFO',
          message: 'Test message 1',
          module: 'test',
          source: 'BACKEND',
          context: {},
          error: null,
          requestId: null,
          userId: null,
          clientIp: null,
          userAgent: null,
          app: 'danci',
          env: 'test',
          timestamp: new Date()
        }
      ];

      (prisma.systemLog.findMany as any).mockResolvedValue(mockLogs);
      (prisma.systemLog.count as any).mockResolvedValue(100);

      const result = await logStorageService.queryLogs({
        page: 1,
        pageSize: 50
      });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(100);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(50);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('should filter by log levels', async () => {
      (prisma.systemLog.findMany as any).mockResolvedValue([]);
      (prisma.systemLog.count as any).mockResolvedValue(0);

      await logStorageService.queryLogs({
        levels: ['ERROR', 'WARN']
      });

      expect(prisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            level: { in: ['ERROR', 'WARN'] }
          })
        })
      );
    });

    it('should filter by module', async () => {
      (prisma.systemLog.findMany as any).mockResolvedValue([]);
      (prisma.systemLog.count as any).mockResolvedValue(0);

      await logStorageService.queryLogs({
        module: 'auth'
      });

      expect(prisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            module: 'auth'
          })
        })
      );
    });

    it('should filter by time range', async () => {
      const startTime = new Date('2024-01-01');
      const endTime = new Date('2024-01-31');

      (prisma.systemLog.findMany as any).mockResolvedValue([]);
      (prisma.systemLog.count as any).mockResolvedValue(0);

      await logStorageService.queryLogs({
        startTime,
        endTime
      });

      expect(prisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: startTime,
              lte: endTime
            }
          })
        })
      );
    });

    it('should search in message', async () => {
      (prisma.systemLog.findMany as any).mockResolvedValue([]);
      (prisma.systemLog.count as any).mockResolvedValue(0);

      await logStorageService.queryLogs({
        search: 'error occurred'
      });

      expect(prisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            message: { contains: 'error occurred', mode: 'insensitive' }
          })
        })
      );
    });

    it('should use default pagination', async () => {
      (prisma.systemLog.findMany as any).mockResolvedValue([]);
      (prisma.systemLog.count as any).mockResolvedValue(0);

      await logStorageService.queryLogs({});

      expect(prisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50
        })
      );
    });
  });

  describe('getLogStats', () => {
    it('should return log statistics', async () => {
      (prisma.systemLog.groupBy as any)
        .mockResolvedValueOnce([{ level: 'INFO', _count: 100 }, { level: 'ERROR', _count: 10 }])
        .mockResolvedValueOnce([{ module: 'auth', _count: 50 }, { module: 'api', _count: 60 }])
        .mockResolvedValueOnce([{ source: 'BACKEND', _count: 110 }]);
      (prisma.systemLog.count as any).mockResolvedValue(110);
      (prisma.$queryRaw as any).mockResolvedValue([
        { hour: '2024-01-15 10:00', count: BigInt(50) },
        { hour: '2024-01-15 11:00', count: BigInt(60) }
      ]);

      const result = await logStorageService.getLogStats();

      expect(result.byLevel).toHaveLength(2);
      expect(result.byModule).toHaveLength(2);
      expect(result.bySource).toHaveLength(1);
      expect(result.byHour).toHaveLength(2);
      expect(result.total).toBe(110);
    });

    it('should filter by time range', async () => {
      (prisma.systemLog.groupBy as any).mockResolvedValue([]);
      (prisma.systemLog.count as any).mockResolvedValue(0);
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const startTime = new Date('2024-01-01');
      const endTime = new Date('2024-01-31');

      await logStorageService.getLogStats({ startTime, endTime });

      expect(prisma.systemLog.groupBy).toHaveBeenCalled();
    });

    it('should filter by source', async () => {
      (prisma.systemLog.groupBy as any).mockResolvedValue([]);
      (prisma.systemLog.count as any).mockResolvedValue(0);
      (prisma.$queryRaw as any).mockResolvedValue([]);

      await logStorageService.getLogStats({ source: 'FRONTEND' });

      expect(prisma.systemLog.groupBy).toHaveBeenCalled();
    });
  });

  describe('getModules', () => {
    it('should return list of unique modules', async () => {
      (prisma.systemLog.findMany as any).mockResolvedValue([
        { module: 'auth' },
        { module: 'api' },
        { module: 'database' }
      ]);

      const result = await logStorageService.getModules();

      expect(result).toEqual(['auth', 'api', 'database']);
    });

    it('should filter out null modules', async () => {
      (prisma.systemLog.findMany as any).mockResolvedValue([
        { module: 'auth' },
        { module: null }
      ]);

      const result = await logStorageService.getModules();

      expect(result).toEqual(['auth']);
    });

    it('should handle database errors', async () => {
      (prisma.systemLog.findMany as any).mockRejectedValue(new Error('DB error'));

      await expect(logStorageService.getModules()).rejects.toThrow();
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete logs older than specified days', async () => {
      (prisma.systemLog.deleteMany as any).mockResolvedValue({ count: 500 });

      const result = await logStorageService.cleanupOldLogs(7);

      expect(result).toBe(500);
      expect(prisma.systemLog.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            timestamp: {
              lt: expect.any(Date)
            }
          }
        })
      );
    });

    it('should use default 7 days', async () => {
      (prisma.systemLog.deleteMany as any).mockResolvedValue({ count: 100 });

      await logStorageService.cleanupOldLogs();

      expect(prisma.systemLog.deleteMany).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      (prisma.systemLog.deleteMany as any).mockRejectedValue(new Error('DB error'));

      await expect(logStorageService.cleanupOldLogs()).rejects.toThrow();
    });
  });

  describe('exports', () => {
    it('should export logStorageService singleton', async () => {
      const module = await import('../../../src/services/log-storage.service');
      expect(module.logStorageService).toBeDefined();
    });
  });
});
