import app from './app';
import { env } from './config/env';
import prisma from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import {
  startDelayedRewardWorker,
  stopDelayedRewardWorker
} from './workers/delayed-reward.worker';
import { startOptimizationWorker } from './workers/optimization.worker';
import { startGlobalMonitoring, stopGlobalMonitoring } from './amas/monitoring/monitoring-service';
import { startAlertMonitoring, stopAlertMonitoring } from './monitoring/monitoring-service';
import { getSharedDecisionRecorder } from './amas/services/decision-recorder.service';
import type { ScheduledTask } from 'node-cron';

const PORT = parseInt(env.PORT, 10);

// 保存worker引用，用于优雅关闭
let delayedRewardWorkerTask: ScheduledTask | null = null;
let optimizationWorkerTask: ScheduledTask | null = null;

async function startServer() {
  try {
    // 测试数据库连接
    await prisma.$connect();
    console.log('Database connected successfully');

    // 连接 Redis 缓存（可选，连接失败不影响启动）
    const redisConnected = await connectRedis();
    if (redisConnected) {
      console.log('Redis cache connected');
    } else {
      console.log('Redis cache unavailable, using database directly');
    }

    // 仅在主节点或单实例模式下启动cron worker
    // 多实例部署时，设置 WORKER_LEADER=true 仅在一个实例上启用
    const shouldRunWorkers = env.WORKER_LEADER || env.NODE_ENV === 'development';
    
    if (shouldRunWorkers) {
      // 启动延迟奖励Worker
      delayedRewardWorkerTask = startDelayedRewardWorker();
      console.log('Delayed reward worker started (leader mode)');

      // 启动优化Worker（每天凌晨3点执行）
      optimizationWorkerTask = startOptimizationWorker();
      if (optimizationWorkerTask) {
        console.log('Optimization worker started (leader mode)');
      }
    } else {
      console.log('Workers skipped (not leader node, set WORKER_LEADER=true to enable)');
    }

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`CORS origin: ${env.CORS_ORIGIN}`);

      // Optimization #4: 仅在leader实例启动监控，避免多实例重复监控
      if (shouldRunWorkers) {
        // Critical Fix #2: 启动AMAS全局监控和告警系统
        try {
          startGlobalMonitoring();
          console.log('AMAS monitoring and alerting system started (leader mode)');
        } catch (error) {
          console.error('Failed to start monitoring system:', error);
          // 监控启动失败不应阻止服务器运行
        }

        // Day 13: 启动Alert监控和Webhook通知系统
        try {
          startAlertMonitoring();
          console.log('Alert monitoring and webhook notification system started (leader mode)');
        } catch (error) {
          console.error('Failed to start alert monitoring:', error);
          // 告警监控启动失败不应阻止服务器运行
        }
      } else {
        console.log('Monitoring skipped (not leader node, set WORKER_LEADER=true to enable)');
      }
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

// 优雅关闭处理函数
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  // Critical Fix #2: Flush决策记录器队列，避免丢失尾部轨迹
  try {
    const decisionRecorder = getSharedDecisionRecorder(prisma);
    await decisionRecorder.cleanup();
    console.log('Decision recorder flushed');
  } catch (error) {
    console.warn('Failed to flush decision recorder:', error);
  }

  // 停止延迟奖励Worker
  if (delayedRewardWorkerTask) {
    stopDelayedRewardWorker(delayedRewardWorkerTask);
    console.log('Delayed reward worker stopped');
  }

  // 停止优化Worker
  if (optimizationWorkerTask) {
    optimizationWorkerTask.stop();
    console.log('Optimization worker stopped');
  }

  // 停止监控服务
  try {
    stopGlobalMonitoring();
    console.log('Monitoring service stopped');
  } catch (error) {
    console.warn('Failed to stop monitoring service:', error);
  }

  // Day 13: 停止Alert监控服务
  try {
    stopAlertMonitoring();
    console.log('Alert monitoring stopped');
  } catch (error) {
    console.warn('Failed to stop alert monitoring:', error);
  }

  // 停止HTTP指标采集并flush队列
  try {
    if (process.env.NODE_ENV !== 'test') {
      const { stopMetricsCollection } = require('./middleware/metrics.middleware');
      await stopMetricsCollection();
      console.log('Metrics collection stopped');
    }
  } catch (error) {
    console.warn('Failed to stop metrics collection:', error);
  }

  // 断开 Redis 连接
  await disconnectRedis();
  console.log('Redis disconnected');

  // 断开数据库连接
  await prisma.$disconnect();
  console.log('Database disconnected');

  process.exit(0);
}

// 注册信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 修复问题#16: 全局未处理Promise拒绝处理
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
  // 生产环境不应因为未处理的Promise拒绝而崩溃
  // 但应该记录错误以便后续分析
  if (env.NODE_ENV === 'production') {
    // TODO: 发送到错误追踪服务（如Sentry）
  }
});

// 全局未捕获异常处理
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // 未捕获异常通常意味着应用状态不可预测，应该重启
  // 但先尝试优雅关闭
  gracefulShutdown('uncaughtException').catch(() => {
    process.exit(1);
  });
});

startServer();
