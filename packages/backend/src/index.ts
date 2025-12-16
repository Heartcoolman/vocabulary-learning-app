import http from 'http';
import app from './app';
import { env } from './config/env';
import prisma, {
  initializeDatabaseProxy,
  closeDatabaseProxy,
  isHotStandbyEnabled,
  getDatabaseProxy,
} from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { startDelayedRewardWorker, stopDelayedRewardWorker } from './workers/delayed-reward.worker';
import { startOptimizationWorker } from './workers/optimization.worker';
import { startLLMAdvisorWorker, stopLLMAdvisorWorker } from './workers/llm-advisor.worker';
import {
  startForgettingAlertWorker,
  stopForgettingAlertWorker,
} from './workers/forgetting-alert.worker';
import { startAlertMonitoring, stopAlertMonitoring } from './monitoring/monitoring-service';
import { getSharedDecisionRecorder } from './services/decision-recorder.service';
import { initializeNotificationService } from './services/notification.service';
import { startupLogger } from './logger';
import type { ScheduledTask } from 'node-cron';
import {
  initSentry,
  captureException as sentryCaptureException,
  flush as sentryFlush,
  close as sentryClose,
} from './config/sentry';

// env.PORT 已在 env.ts 中转换为 number 类型
const PORT = env.PORT;

// 保存HTTP服务器实例，用于优雅关闭
let httpServer: http.Server | null = null;

// 保存worker引用，用于优雅关闭
let delayedRewardWorkerTask: ScheduledTask | null = null;
let optimizationWorkerTask: ScheduledTask | null = null;
let llmAdvisorWorkerTask: ScheduledTask | null = null;
let forgettingAlertWorkerTask: ScheduledTask | null = null;

// 关闭超时时间（毫秒）
const SHUTDOWN_TIMEOUT = 30000;

async function startServer() {
  try {
    // 初始化 Sentry 错误追踪（在其他服务之前）
    const sentryInitialized = initSentry();
    if (sentryInitialized) {
      startupLogger.info('Sentry error tracking initialized');
    }

    // 初始化数据库连接（支持热备降级）
    if (isHotStandbyEnabled()) {
      // 热备模式：使用 DatabaseProxy，支持 PostgreSQL 不可用时自动降级到 SQLite
      await initializeDatabaseProxy();
      const proxy = getDatabaseProxy();
      const state = proxy?.getState() || 'NORMAL';
      if (state === 'DEGRADED') {
        startupLogger.warn(
          'Database started in DEGRADED mode (SQLite only) - PostgreSQL unavailable',
        );
      } else {
        startupLogger.info('Database connected in hot-standby mode (PostgreSQL + SQLite)');
      }
    } else {
      // 非热备模式：直接连接 PostgreSQL
      await prisma.$connect();
      startupLogger.info('Database connected successfully');
    }

    // 连接 Redis 缓存（可选，连接失败不影响启动）
    const redisConnected = await connectRedis();
    if (redisConnected) {
      startupLogger.info('Redis cache connected');
    } else {
      startupLogger.info('Redis cache unavailable, using database directly');
    }

    // 初始化通知服务（订阅EventBus事件）
    try {
      initializeNotificationService();
      startupLogger.info('NotificationService initialized and subscribed to events');
    } catch (error) {
      startupLogger.error({ err: error }, 'Failed to initialize NotificationService');
      // 通知服务初始化失败不应阻止服务器启动
    }

    // 仅在主节点或单实例模式下启动cron worker
    // 多实例部署时，设置 WORKER_LEADER=true 仅在一个实例上启用
    const shouldRunWorkers = env.WORKER_LEADER || env.NODE_ENV === 'development';

    if (shouldRunWorkers) {
      // 启动延迟奖励Worker
      delayedRewardWorkerTask = startDelayedRewardWorker();
      startupLogger.info('Delayed reward worker started (leader mode)');

      // 启动优化Worker（每天凌晨3点执行）
      optimizationWorkerTask = startOptimizationWorker();
      if (optimizationWorkerTask) {
        startupLogger.info('Optimization worker started (leader mode)');
      }

      // 启动 LLM 顾问Worker（每周日凌晨4点执行）
      llmAdvisorWorkerTask = startLLMAdvisorWorker();
      if (llmAdvisorWorkerTask) {
        startupLogger.info('LLM advisor worker started (leader mode)');
      }

      // 启动遗忘预警Worker（每小时执行一次）
      if (env.ENABLE_FORGETTING_ALERT_WORKER) {
        forgettingAlertWorkerTask = startForgettingAlertWorker(env.FORGETTING_ALERT_SCHEDULE);
        if (forgettingAlertWorkerTask) {
          startupLogger.info(
            { schedule: env.FORGETTING_ALERT_SCHEDULE },
            'Forgetting alert worker started (leader mode)',
          );
        }
      } else {
        startupLogger.info(
          'Forgetting alert worker disabled (set ENABLE_FORGETTING_ALERT_WORKER=true to enable)',
        );
      }
    } else {
      startupLogger.info('Workers skipped (not leader node, set WORKER_LEADER=true to enable)');
    }

    // 启动服务器
    httpServer = app.listen(PORT, () => {
      startupLogger.info(
        { port: PORT, env: env.NODE_ENV, corsOrigin: env.CORS_ORIGIN },
        'Server running',
      );

      // Optimization #4: 仅在leader实例启动监控，避免多实例重复监控
      if (shouldRunWorkers) {
        // Day 13: 启动Alert监控和Webhook通知系统
        try {
          startAlertMonitoring();
          startupLogger.info(
            'Alert monitoring and webhook notification system started (leader mode)',
          );
        } catch (error) {
          startupLogger.error({ err: error }, 'Failed to start alert monitoring');
          // 告警监控启动失败不应阻止服务器运行
        }
      } else {
        startupLogger.info(
          'Monitoring skipped (not leader node, set WORKER_LEADER=true to enable)',
        );
      }
    });
  } catch (error) {
    startupLogger.error({ err: error }, 'Server startup failed');
    process.exit(1);
  }
}

// 优雅关闭处理函数
async function gracefulShutdown(signal: string, exitCode: number = 0) {
  startupLogger.info({ signal, exitCode }, 'Received signal, shutting down gracefully');

  // 设置关闭超时保护
  const shutdownTimeout = setTimeout(() => {
    startupLogger.error({ timeout: SHUTDOWN_TIMEOUT }, 'Graceful shutdown timed out, forcing exit');
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT);

  // 确保超时计时器不阻止进程退出
  shutdownTimeout.unref();

  try {
    // 第一步：关闭HTTP服务器，停止接受新连接
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        startupLogger.info('Closing HTTP server, waiting for active connections...');

        // server.close() 会停止接受新连接，并等待现有连接完成
        httpServer!.close((err) => {
          if (err) {
            startupLogger.error({ err }, 'Error closing HTTP server');
            reject(err);
          } else {
            startupLogger.info('HTTP server closed successfully');
            resolve();
          }
        });

        // 设置Keep-alive连接的超时，加速关闭
        httpServer!.closeIdleConnections();
      });
    }

    // 第二步：Flush决策记录器队列，避免丢失尾部轨迹
    try {
      const decisionRecorder = getSharedDecisionRecorder(prisma);
      await decisionRecorder.cleanup();
      startupLogger.info('Decision recorder flushed');
    } catch (error) {
      startupLogger.warn({ err: error }, 'Failed to flush decision recorder');
    }

    // 第三步：停止所有Worker
    // 停止延迟奖励Worker
    if (delayedRewardWorkerTask) {
      stopDelayedRewardWorker(delayedRewardWorkerTask);
      startupLogger.info('Delayed reward worker stopped');
    }

    // 停止优化Worker
    if (optimizationWorkerTask) {
      optimizationWorkerTask.stop();
      startupLogger.info('Optimization worker stopped');
    }

    // 停止 LLM 顾问Worker
    if (llmAdvisorWorkerTask) {
      stopLLMAdvisorWorker();
      startupLogger.info('LLM advisor worker stopped');
    }

    // 停止遗忘预警Worker
    if (forgettingAlertWorkerTask) {
      stopForgettingAlertWorker();
      startupLogger.info('Forgetting alert worker stopped');
    }

    // 停止Alert监控服务
    try {
      stopAlertMonitoring();
      startupLogger.info('Alert monitoring stopped');
    } catch (error) {
      startupLogger.warn({ err: error }, 'Failed to stop alert monitoring');
    }

    // 停止HTTP指标采集并flush队列
    try {
      if (env.NODE_ENV !== 'test') {
        const { stopMetricsCollection } = require('./middleware/metrics.middleware');
        await stopMetricsCollection();
        startupLogger.info('Metrics collection stopped');
      }
    } catch (error) {
      startupLogger.warn({ err: error }, 'Failed to stop metrics collection');
    }

    // Flush Sentry 事件队列
    try {
      await sentryFlush(2000);
      startupLogger.info('Sentry events flushed');
    } catch (error) {
      startupLogger.warn({ err: error }, 'Failed to flush Sentry events');
    }

    // 第四步：断开 Redis 连接
    await disconnectRedis();
    startupLogger.info('Redis disconnected');

    // 第五步：断开数据库连接
    if (isHotStandbyEnabled()) {
      await closeDatabaseProxy();
      startupLogger.info('Database proxy disconnected');
    } else {
      await prisma.$disconnect();
      startupLogger.info('Database disconnected');
    }

    // 关闭 Sentry 客户端
    try {
      await sentryClose(2000);
      startupLogger.info('Sentry client closed');
    } catch (error) {
      startupLogger.warn({ err: error }, 'Failed to close Sentry client');
    }

    // 清除超时计时器
    clearTimeout(shutdownTimeout);

    startupLogger.info('Graceful shutdown completed');
    process.exit(exitCode);
  } catch (error) {
    startupLogger.error({ err: error }, 'Error during graceful shutdown');
    clearTimeout(shutdownTimeout);
    process.exit(exitCode || 1);
  }
}

// 注册信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 修复问题#16: 全局未处理Promise拒绝处理
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  startupLogger.error({ reason, promise }, 'Unhandled Promise Rejection');
  // 上报到 Sentry
  sentryCaptureException(reason instanceof Error ? reason : new Error(String(reason)), {
    type: 'unhandledRejection',
  });
});

// 全局未捕获异常处理
process.on('uncaughtException', (error: Error) => {
  startupLogger.error({ err: error }, 'Uncaught Exception');
  // 上报到 Sentry
  sentryCaptureException(error, { type: 'uncaughtException' });
  // 未捕获异常通常意味着应用状态不可预测，应该重启
  // 但先尝试优雅关闭
  gracefulShutdown('uncaughtException', 1).catch(() => {
    process.exit(1);
  });
});

startServer();
