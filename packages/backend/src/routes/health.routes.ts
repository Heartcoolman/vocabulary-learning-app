/**
 * 健康检查路由
 *
 * 提供 Kubernetes 风格的健康检查端点:
 * - /health/live - 存活检查 (Liveness Probe)
 * - /health/ready - 就绪检查 (Readiness Probe)
 * - /health/metrics - 指标暴露
 *
 * 用于容器编排和负载均衡健康检测
 */

import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { routeLogger } from '../logger';
import { amasMetrics } from '../monitoring/amas-metrics';
import { alertMonitoringService } from '../monitoring/monitoring-service';
import * as os from 'os';

const router = Router();

// ============================================
// 类型定义
// ============================================

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version?: string;
}

interface LivenessResponse extends HealthStatus {
  checks: {
    process: boolean;
    memory: boolean;
  };
}

interface ReadinessResponse extends HealthStatus {
  checks: {
    database: 'connected' | 'disconnected' | 'timeout';
    memory: boolean;
    diskSpace?: boolean;
  };
  details?: {
    databaseLatency?: number;
    memoryUsage?: number;
    memoryLimit?: number;
  };
}

interface MetricsResponse {
  timestamp: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    uptime: number;
    loadAverage: number[];
    cpuCount: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    cpuUsage: NodeJS.CpuUsage;
  };
  http: {
    totalRequests: number;
    errorRequests5xx: number;
    requestDuration: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      count: number;
    };
  };
  database: {
    slowQueryTotal: number;
  };
  alerts: {
    activeCount: number;
    active: Array<{ ruleName: string; severity: string; triggeredAt: string }>;
  };
}

// ============================================
// 辅助函数
// ============================================

/**
 * 获取进程启动时间
 */
const processStartTime = Date.now();

/**
 * 检查内存使用是否在安全范围内
 * 默认阈值: 堆内存使用不超过 90%
 */
function checkMemoryHealth(threshold = 0.9): boolean {
  const memoryUsage = process.memoryUsage();
  // 假设 V8 堆大小限制约 1.4GB (可通过 --max-old-space-size 调整)
  const heapSizeLimit = 1.4 * 1024 * 1024 * 1024;
  return memoryUsage.heapUsed / heapSizeLimit < threshold;
}

/**
 * 检查数据库连接
 * @param timeoutMs 超时时间（毫秒）
 */
async function checkDatabaseConnection(
  timeoutMs = 5000,
): Promise<{ status: 'connected' | 'disconnected' | 'timeout'; latency?: number }> {
  const startTime = Date.now();

  try {
    // 使用 Promise.race 实现超时
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1` as Promise<unknown>,
      new Promise<'timeout'>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ]);

    if (result === 'timeout') {
      return { status: 'timeout' };
    }

    return {
      status: 'connected',
      latency: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'timeout') {
      return { status: 'timeout' };
    }
    routeLogger.error({ err: error }, 'Database health check failed');
    return { status: 'disconnected' };
  }
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

// ============================================
// 路由处理
// ============================================

/**
 * GET /health
 *
 * 兼容性健康检查端点（向后兼容旧实现）
 *
 * 返回：
 * {
 *   database: 'connected' | 'disconnected';
 *   timestamp: string;
 *   status: 'ok' | 'degraded';
 * }
 */
router.get('/', async (req: Request, res: Response) => {
  const checks: { database: string; timestamp: string; status: string } = {
    database: 'unknown',
    timestamp: new Date().toISOString(),
    status: 'ok',
  };

  try {
    const dbCheck = await checkDatabaseConnection(3000);
    if (dbCheck.status === 'connected') {
      checks.database = 'connected';
    } else {
      checks.database = 'disconnected';
      checks.status = 'degraded';
    }
  } catch (error) {
    checks.database = 'disconnected';
    checks.status = 'degraded';
    routeLogger.error({ err: error }, '健康检查：数据库连接失败');
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

/**
 * GET /health/live
 *
 * 存活检查 (Liveness Probe)
 * 检查进程是否正常运行，用于 Kubernetes liveness probe
 *
 * 返回 200: 进程正常
 * 返回 503: 进程异常（应该重启容器）
 */
router.get('/live', (req: Request, res: Response) => {
  try {
    const processHealthy = process.pid > 0;
    const memoryHealthy = checkMemoryHealth();

    const response: LivenessResponse = {
      status: processHealthy && memoryHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - processStartTime) / 1000),
      version: process.env.APP_VERSION || 'unknown',
      checks: {
        process: processHealthy,
        memory: memoryHealthy,
      },
    };

    const statusCode = response.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(response);
  } catch (error) {
    routeLogger.error({ err: error }, 'Liveness check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: 0,
      checks: {
        process: false,
        memory: false,
      },
    });
  }
});

/**
 * GET /health/ready
 *
 * 就绪检查 (Readiness Probe)
 * 检查服务是否准备好接收流量，用于 Kubernetes readiness probe
 *
 * 返回 200: 服务就绪
 * 返回 503: 服务未就绪（应该从负载均衡中移除）
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // 并行检查各项服务
    const [dbCheck] = await Promise.all([checkDatabaseConnection(3000)]);

    const memoryHealthy = checkMemoryHealth();
    const memoryUsage = process.memoryUsage();

    // 确定整体状态
    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    if (dbCheck.status === 'disconnected') {
      status = 'unhealthy';
    } else if (dbCheck.status === 'timeout' || !memoryHealthy) {
      status = 'degraded';
    }

    const response: ReadinessResponse = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - processStartTime) / 1000),
      version: process.env.APP_VERSION || 'unknown',
      checks: {
        database: dbCheck.status,
        memory: memoryHealthy,
      },
      details: {
        databaseLatency: dbCheck.latency,
        memoryUsage: memoryUsage.heapUsed,
        memoryLimit: 1.4 * 1024 * 1024 * 1024,
      },
    };

    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(response);
  } catch (error) {
    routeLogger.error({ err: error }, 'Readiness check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: 0,
      checks: {
        database: 'disconnected',
        memory: false,
      },
    });
  }
});

/**
 * GET /health/metrics
 *
 * 指标暴露端点
 * 暴露系统和应用指标，用于监控系统采集
 *
 * 注意: 生产环境应该添加认证保护
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    // 获取 HTTP 请求统计
    const httpStats = amasMetrics.httpRequestDuration.getStats();

    // 获取活跃告警
    const activeAlerts = alertMonitoringService.getActiveAlerts();

    const response: MetricsResponse = {
      timestamp: new Date().toISOString(),
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        cpuCount: os.cpus().length,
      },
      process: {
        pid: process.pid,
        uptime: Math.floor((Date.now() - processStartTime) / 1000),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      http: {
        totalRequests: amasMetrics.httpRequestTotal.get(),
        errorRequests5xx: amasMetrics.httpRequest5xxTotal.get(),
        requestDuration: {
          avg: httpStats.avg,
          p50: httpStats.p50,
          p95: httpStats.p95,
          p99: httpStats.p99,
          count: httpStats.count,
        },
      },
      database: {
        slowQueryTotal: amasMetrics.dbSlowQueryTotal.get(),
      },
      alerts: {
        activeCount: activeAlerts.length,
        active: activeAlerts.map((alert) => ({
          ruleName: alert.ruleId,
          severity: alert.severity,
          triggeredAt: new Date(alert.occurredAt).toISOString(),
        })),
      },
    };

    res.json(response);
  } catch (error) {
    routeLogger.error({ err: error }, 'Metrics endpoint failed');
    res.status(500).json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/metrics/prometheus
 *
 * Prometheus 格式的指标暴露
 * 用于 Prometheus 监控系统采集
 */
router.get('/metrics/prometheus', async (req: Request, res: Response) => {
  try {
    const memoryUsage = process.memoryUsage();
    const httpStats = amasMetrics.httpRequestDuration.getStats();
    const activeAlerts = alertMonitoringService.getActiveAlerts();

    const lines: string[] = [];

    // 帮助函数：添加指标
    const addMetric = (
      name: string,
      help: string,
      type: string,
      value: number,
      labels?: Record<string, string>,
    ) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      const labelStr = labels
        ? `{${Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',')}}`
        : '';
      lines.push(`${name}${labelStr} ${value}`);
    };

    // 进程指标
    addMetric(
      'process_uptime_seconds',
      'Process uptime in seconds',
      'gauge',
      Math.floor((Date.now() - processStartTime) / 1000),
    );
    addMetric('process_heap_bytes', 'Process heap size in bytes', 'gauge', memoryUsage.heapUsed);
    addMetric('process_rss_bytes', 'Process RSS in bytes', 'gauge', memoryUsage.rss);

    // HTTP 指标
    addMetric(
      'http_requests_total',
      'Total HTTP requests',
      'counter',
      amasMetrics.httpRequestTotal.get(),
    );
    addMetric(
      'http_requests_5xx_total',
      'Total HTTP 5xx errors',
      'counter',
      amasMetrics.httpRequest5xxTotal.get(),
    );
    addMetric('http_request_duration_p50_ms', 'HTTP request duration P50', 'gauge', httpStats.p50);
    addMetric('http_request_duration_p95_ms', 'HTTP request duration P95', 'gauge', httpStats.p95);
    addMetric('http_request_duration_p99_ms', 'HTTP request duration P99', 'gauge', httpStats.p99);

    // 数据库指标
    addMetric(
      'db_slow_queries_total',
      'Total slow database queries',
      'counter',
      amasMetrics.dbSlowQueryTotal.get(),
    );

    // 告警指标
    addMetric('alerts_active_total', 'Number of active alerts', 'gauge', activeAlerts.length);

    // 系统指标
    const loadAvg = os.loadavg();
    addMetric('system_load_1m', 'System load average 1 minute', 'gauge', loadAvg[0]);
    addMetric('system_load_5m', 'System load average 5 minutes', 'gauge', loadAvg[1]);
    addMetric('system_load_15m', 'System load average 15 minutes', 'gauge', loadAvg[2]);

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));
  } catch (error) {
    routeLogger.error({ err: error }, 'Prometheus metrics endpoint failed');
    res.status(500).send('# Error collecting metrics\n');
  }
});

/**
 * GET /health/info
 *
 * 服务信息端点
 * 返回服务的基本信息和环境
 */
router.get('/info', (req: Request, res: Response) => {
  res.json({
    service: 'danci-backend',
    version: process.env.APP_VERSION || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    startTime: new Date(processStartTime).toISOString(),
    uptime: Math.floor((Date.now() - processStartTime) / 1000),
  });
});

export default router;
