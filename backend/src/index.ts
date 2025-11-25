import app from './app';
import { env } from './config/env';
import prisma from './config/database';
import {
  startDelayedRewardWorker,
  stopDelayedRewardWorker
} from './workers/delayed-reward.worker';
import type { ScheduledTask } from 'node-cron';

const PORT = parseInt(env.PORT, 10);

// 保存worker引用，用于优雅关闭
let delayedRewardWorkerTask: ScheduledTask | null = null;

async function startServer() {
  try {
    // 测试数据库连接
    await prisma.$connect();
    console.log('Database connected successfully');

    // 启动延迟奖励Worker
    delayedRewardWorkerTask = startDelayedRewardWorker();
    console.log('Delayed reward worker started');

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`CORS origin: ${env.CORS_ORIGIN}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

// 优雅关闭处理函数
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  // 停止延迟奖励Worker
  if (delayedRewardWorkerTask) {
    stopDelayedRewardWorker(delayedRewardWorkerTask);
    console.log('Delayed reward worker stopped');
  }

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
