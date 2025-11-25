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

startServer();
