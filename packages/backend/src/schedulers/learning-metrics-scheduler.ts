/**
 * 学习体验指标定时更新调度器
 *
 * 负责定期从数据库查询数据并更新学习体验指标
 * 默认每小时更新一次，可通过环境变量配置
 */

import { learningMetricsService } from '../monitoring/learning-metrics';
import { logger } from '../logger';

// 更新间隔（毫秒），默认1小时
const UPDATE_INTERVAL_MS = parseInt(process.env.LEARNING_METRICS_UPDATE_INTERVAL || '3600000', 10);

// 是否启用自动更新
const AUTO_UPDATE_ENABLED = process.env.LEARNING_METRICS_AUTO_UPDATE !== 'false';

let updateTimer: NodeJS.Timeout | null = null;
let isUpdating = false;

/**
 * 执行一次指标更新
 */
export async function updateMetricsOnce(): Promise<void> {
  if (isUpdating) {
    logger.warn('[LearningMetricsScheduler] Update already in progress, skipping');
    return;
  }

  isUpdating = true;
  const startTime = Date.now();

  try {
    logger.info('[LearningMetricsScheduler] Starting metrics update');
    await learningMetricsService.updateMetrics();
    const duration = Date.now() - startTime;
    logger.info(
      { durationMs: duration },
      '[LearningMetricsScheduler] Metrics update completed successfully',
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      { err: error, durationMs: duration },
      '[LearningMetricsScheduler] Metrics update failed',
    );
  } finally {
    isUpdating = false;
  }
}

/**
 * 启动定时更新调度器
 */
export function startScheduler(): void {
  if (!AUTO_UPDATE_ENABLED) {
    logger.info('[LearningMetricsScheduler] Auto update is disabled');
    return;
  }

  if (updateTimer) {
    logger.warn('[LearningMetricsScheduler] Scheduler already running');
    return;
  }

  logger.info(
    { intervalMs: UPDATE_INTERVAL_MS, intervalMinutes: UPDATE_INTERVAL_MS / 60000 },
    '[LearningMetricsScheduler] Starting scheduler',
  );

  // 立即执行一次更新
  updateMetricsOnce();

  // 设置定时器
  updateTimer = setInterval(() => {
    updateMetricsOnce();
  }, UPDATE_INTERVAL_MS);

  // 防止定时器阻止进程退出
  if (updateTimer.unref) {
    updateTimer.unref();
  }
}

/**
 * 停止定时更新调度器
 */
export function stopScheduler(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
    logger.info('[LearningMetricsScheduler] Scheduler stopped');
  }
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus(): {
  enabled: boolean;
  running: boolean;
  updating: boolean;
  intervalMs: number;
} {
  return {
    enabled: AUTO_UPDATE_ENABLED,
    running: updateTimer !== null,
    updating: isUpdating,
    intervalMs: UPDATE_INTERVAL_MS,
  };
}
