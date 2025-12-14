/**
 * 日志存储服务
 *
 * 功能：
 * - 批量写入日志到数据库
 * - 分页查询日志
 * - 统计日志（按级别、模块、来源、小时趋势）
 * - 清理过期日志
 * - 获取所有模块列表
 */

import prisma from '../config/database';
import { LogLevel, LogSource, Prisma } from '@prisma/client';

// 避免循环依赖：不直接导入 serviceLogger，使用简单的控制台日志
const simpleLogger = {
  error: (obj: unknown, msg: string) => {
    console.error(`[LogStorageService] ${msg}`, obj);
  },
  info: (obj: unknown, msg: string) => {
    console.info(`[LogStorageService] ${msg}`, obj);
  },
  warn: (obj: unknown, msg: string) => {
    console.warn(`[LogStorageService] ${msg}`, obj);
  },
};

// ==================== 类型定义 ====================

/**
 * 日志条目
 */
interface LogEntry {
  level: LogLevel;
  message: string;
  module?: string;
  source?: LogSource;
  context?: Record<string, unknown>;
  error?: { message: string; stack?: string; name: string; code?: string };
  requestId?: string;
  userId?: string;
  clientIp?: string;
  userAgent?: string;
  app?: string;
  env?: string;
  timestamp?: Date;
}

/**
 * 日志查询参数
 */
interface LogQuery {
  levels?: LogLevel[];
  module?: string;
  source?: LogSource;
  search?: string;
  userId?: string;
  requestId?: string;
  startTime?: Date;
  endTime?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * 日志查询结果
 */
interface LogQueryResult {
  logs: Array<{
    id: string;
    level: LogLevel;
    message: string;
    module: string | null;
    source: LogSource;
    context: unknown;
    error: unknown;
    requestId: string | null;
    userId: string | null;
    clientIp: string | null;
    userAgent: string | null;
    app: string | null;
    env: string | null;
    timestamp: Date;
  }>;
  total: number;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 日志统计结果
 */
interface LogStats {
  byLevel: Array<{ level: LogLevel; count: number }>;
  byModule: Array<{ module: string | null; count: number }>;
  bySource: Array<{ source: LogSource; count: number }>;
  byHour: Array<{ hour: string; count: number }>;
  total: number;
}

// ==================== 日志存储服务类 ====================

class LogStorageService {
  private buffer: Prisma.SystemLogCreateInput[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL = 2000; // 2 秒

  /**
   * 写入日志（添加到缓冲区，批量刷新）
   */
  writeLog(entry: LogEntry): void {
    try {
      const logData: Prisma.SystemLogCreateInput = {
        level: entry.level,
        message: entry.message,
        module: entry.module,
        source: entry.source ?? LogSource.BACKEND,
        context: entry.context ? (entry.context as Prisma.InputJsonValue) : undefined,
        error: entry.error ? (entry.error as Prisma.InputJsonValue) : undefined,
        requestId: entry.requestId,
        userId: entry.userId,
        clientIp: entry.clientIp,
        userAgent: entry.userAgent,
        app: entry.app ?? 'danci',
        env: entry.env ?? process.env.NODE_ENV ?? 'production',
        timestamp: entry.timestamp ?? new Date(),
      };

      this.buffer.push(logData);

      // 缓冲区达到批量大小时立即刷新
      if (this.buffer.length >= this.BATCH_SIZE) {
        this.flush().catch((err) => {
          simpleLogger.error({ err }, '立即刷新日志缓冲区失败');
        });
      } else {
        // 否则启动定时刷新
        this.startFlushTimer();
      }
    } catch (err) {
      simpleLogger.error({ err, entry }, '写入日志到缓冲区失败');
    }
  }

  /**
   * 启动定时刷新
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flush().catch((err) => {
        simpleLogger.error({ err }, '定时刷新日志缓冲区失败');
      });
    }, this.FLUSH_INTERVAL);

    // 防止定时器阻止进程退出
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * 立即刷新缓冲区
   */
  async flush(): Promise<void> {
    // 清除定时器
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // 取出当前缓冲区内容
    const logsToFlush = this.buffer.splice(0);

    if (logsToFlush.length === 0) {
      return;
    }

    try {
      await prisma.systemLog.createMany({
        data: logsToFlush,
        skipDuplicates: true,
      });

      // 使用简单日志避免循环
      // simpleLogger.debug({ count: logsToFlush.length }, '成功刷新日志到数据库');
    } catch (err) {
      simpleLogger.error({ err, count: logsToFlush.length }, '批量写入日志失败');

      // 写入失败时，将日志放回缓冲区（仅在缓冲区不会溢出时）
      if (this.buffer.length + logsToFlush.length <= this.BATCH_SIZE * 10) {
        this.buffer.unshift(...logsToFlush);
      }
    }
  }

  /**
   * 分页查询日志
   */
  async queryLogs(query: LogQuery): Promise<LogQueryResult> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const skip = (page - 1) * pageSize;

    // 构建查询条件
    const where: Prisma.SystemLogWhereInput = {};

    if (query.levels && query.levels.length > 0) {
      where.level = { in: query.levels };
    }

    if (query.module) {
      where.module = query.module;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.requestId) {
      where.requestId = query.requestId;
    }

    if (query.search) {
      where.message = { contains: query.search, mode: 'insensitive' };
    }

    if (query.startTime || query.endTime) {
      where.timestamp = {};
      if (query.startTime) {
        where.timestamp.gte = query.startTime;
      }
      if (query.endTime) {
        where.timestamp.lte = query.endTime;
      }
    }

    // 执行查询
    try {
      const [logs, total] = await Promise.all([
        prisma.systemLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.systemLog.count({ where }),
      ]);

      return {
        logs,
        total,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (err) {
      simpleLogger.error({ err, query }, '查询日志失败');
      throw err;
    }
  }

  /**
   * 获取日志统计
   */
  async getLogStats(query?: {
    startTime?: Date;
    endTime?: Date;
    source?: LogSource;
  }): Promise<LogStats> {
    try {
      // 构建时间范围条件
      const where: Prisma.SystemLogWhereInput = {};

      if (query?.startTime || query?.endTime) {
        where.timestamp = {};
        if (query.startTime) {
          where.timestamp.gte = query.startTime;
        }
        if (query.endTime) {
          where.timestamp.lte = query.endTime;
        }
      }

      if (query?.source) {
        where.source = query.source;
      }

      // 并行执行所有统计查询
      const [byLevel, byModule, bySource, total] = await Promise.all([
        // 按级别统计
        prisma.systemLog.groupBy({
          by: ['level'],
          where,
          _count: true,
          orderBy: { level: 'asc' },
        }),
        // 按模块统计
        prisma.systemLog.groupBy({
          by: ['module'],
          where,
          _count: true,
        }),
        // 按来源统计
        prisma.systemLog.groupBy({
          by: ['source'],
          where,
          _count: true,
          orderBy: { source: 'asc' },
        }),
        // 总数
        prisma.systemLog.count({ where }),
      ]);

      // 按小时统计（使用原生 SQL）
      let byHourQuery = Prisma.sql`
        SELECT
          TO_CHAR(timestamp, 'YYYY-MM-DD HH24:00') as hour,
          COUNT(*) as count
        FROM system_logs
        WHERE 1=1
      `;

      if (query?.startTime) {
        byHourQuery = Prisma.sql`${byHourQuery} AND timestamp >= ${query.startTime}`;
      }

      if (query?.endTime) {
        byHourQuery = Prisma.sql`${byHourQuery} AND timestamp <= ${query.endTime}`;
      }

      if (query?.source) {
        byHourQuery = Prisma.sql`${byHourQuery} AND source = ${query.source}::log_source`;
      }

      byHourQuery = Prisma.sql`${byHourQuery}
        GROUP BY hour
        ORDER BY hour DESC
        LIMIT 24
      `;

      const byHourRaw = await prisma.$queryRaw<Array<{ hour: string; count: bigint }>>(byHourQuery);

      const byHour = byHourRaw.map((row) => ({
        hour: row.hour,
        count: Number(row.count),
      }));

      return {
        byLevel: byLevel.map((item) => ({
          level: item.level,
          count: item._count,
        })),
        byModule: byModule.map((item) => ({
          module: item.module,
          count: item._count,
        })),
        bySource: bySource.map((item) => ({
          source: item.source,
          count: item._count,
        })),
        byHour,
        total,
      };
    } catch (err) {
      simpleLogger.error({ err, query }, '获取日志统计失败');
      throw err;
    }
  }

  /**
   * 获取所有模块列表
   */
  async getModules(): Promise<string[]> {
    try {
      const result = await prisma.systemLog.findMany({
        where: {
          module: { not: null },
        },
        select: { module: true },
        distinct: ['module'],
        orderBy: { module: 'asc' },
      });

      return result
        .map((item) => item.module)
        .filter((module): module is string => module !== null);
    } catch (err) {
      simpleLogger.error({ err }, '获取模块列表失败');
      throw err;
    }
  }

  /**
   * 清理过期日志（默认清理 7 天前的日志）
   */
  async cleanupOldLogs(daysToKeep: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.systemLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      simpleLogger.info({ count: result.count, daysToKeep, cutoffDate }, '成功清理过期日志');

      return result.count;
    } catch (err) {
      simpleLogger.error({ err, daysToKeep }, '清理过期日志失败');
      throw err;
    }
  }
}

// ==================== 单例导出 ====================

export const logStorageService = new LogStorageService();

// ==================== 进程退出时刷新缓冲区 ====================

// 监听进程退出信号，确保缓冲区内容被写入
process.on('beforeExit', () => {
  logStorageService.flush().catch((err) => {
    console.error('进程退出前刷新日志缓冲区失败:', err);
  });
});

process.on('SIGINT', () => {
  logStorageService.flush().catch((err) => {
    console.error('SIGINT 信号处理时刷新日志缓冲区失败:', err);
  });
});

process.on('SIGTERM', () => {
  logStorageService.flush().catch((err) => {
    console.error('SIGTERM 信号处理时刷新日志缓冲区失败:', err);
  });
});
