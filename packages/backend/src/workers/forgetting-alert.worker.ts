/**
 * AMAS 遗忘预警 Worker - T5.2
 * Forgetting Alert Worker
 *
 * 功能:
 * - 定时扫描用户的单词学习状态
 * - 识别高风险遗忘单词（基于遗忘曲线和个性化半衰期）
 * - 创建预警记录到 ForgettingAlert 表
 * - 通知用户及时复习
 */

import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient, AlertStatus } from '@prisma/client';
import { workerLogger } from '../logger/index';
import { estimateRetention } from '../amas/models/forgetting-curve';
import { getEventBus } from '../core/event-bus';
import { decisionEventsService } from '../services/decision-events.service';

// ==================== 配置常量 ====================

/** 风险阈值：保持率低于此值视为高风险 */
const RISK_THRESHOLD = 0.3;

/** 预警范围：提前多少天预警（天） */
const ALERT_WINDOW_DAYS = 1;

/** 批量处理大小 */
const BATCH_SIZE = 100;

/** Worker 运行状态 */
let isRunning = false;

/** 定时任务实例 */
let scheduledTask: ScheduledTask | null = null;

// ==================== Prisma 客户端 ====================

const prisma = new PrismaClient();

// ==================== 预警结果统计 ====================

interface AlertStats {
  /** 扫描的用户数 */
  usersScanned: number;
  /** 扫描的单词数 */
  wordsScanned: number;
  /** 创建的预警数 */
  alertsCreated: number;
  /** 更新的预警数 */
  alertsUpdated: number;
  /** 跳过的单词数（无需预警） */
  wordsSkipped: number;
  /** 处理耗时（秒） */
  duration: number;
}

// ==================== 核心逻辑 ====================

/**
 * 扫描高风险遗忘单词并创建预警
 */
async function scanAndCreateAlerts(): Promise<AlertStats> {
  const startTime = Date.now();
  const stats: AlertStats = {
    usersScanned: 0,
    wordsScanned: 0,
    alertsCreated: 0,
    alertsUpdated: 0,
    wordsSkipped: 0,
    duration: 0,
  };

  try {
    // 1. 获取所有活跃用户（有学习记录的用户）
    const users = await prisma.user.findMany({
      where: {
        learningStates: {
          some: {
            lastReviewDate: {
              not: null,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    stats.usersScanned = users.length;
    workerLogger.info({ userCount: users.length }, '开始扫描用户的遗忘风险');

    // 2. 逐个用户处理
    for (const user of users) {
      try {
        await processUserAlerts(user.id, stats);
      } catch (error) {
        workerLogger.error({ err: error, userId: user.id }, '处理用户预警失败');
        // 继续处理下一个用户
      }
    }

    stats.duration = (Date.now() - startTime) / 1000;
    return stats;
  } catch (error) {
    stats.duration = (Date.now() - startTime) / 1000;
    throw error;
  }
}

/**
 * 处理单个用户的遗忘预警
 */
async function processUserAlerts(userId: string, stats: AlertStats): Promise<void> {
  // 获取用户的所有学习状态（已经复习过的单词）
  const learningStates = await prisma.wordLearningState.findMany({
    where: {
      userId,
      lastReviewDate: {
        not: null,
      },
      state: {
        in: ['LEARNING', 'REVIEWING', 'MASTERED'], // 排除 NEW 状态
      },
    },
    select: {
      id: true,
      wordId: true,
      halfLife: true,
      lastReviewDate: true,
      nextReviewDate: true,
    },
  });

  stats.wordsScanned += learningStates.length;

  // 批量处理单词
  for (let i = 0; i < learningStates.length; i += BATCH_SIZE) {
    const batch = learningStates.slice(i, i + BATCH_SIZE);
    await processBatch(userId, batch, stats);
  }
}

/**
 * 批量处理单词预警
 */
async function processBatch(
  userId: string,
  batch: Array<{
    id: string;
    wordId: string;
    halfLife: number;
    lastReviewDate: Date | null;
    nextReviewDate: Date | null;
  }>,
  stats: AlertStats,
): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const MS_PER_DAY = 86_400_000;

  // 获取 EventBus 实例
  const eventBus = getEventBus(decisionEventsService);

  for (const state of batch) {
    try {
      // 跳过没有复习记录的单词
      if (!state.lastReviewDate) {
        stats.wordsSkipped++;
        continue;
      }

      const lastReviewMs = state.lastReviewDate.getTime();
      const daysElapsed = (nowMs - lastReviewMs) / MS_PER_DAY;

      // 计算当前保持率
      const currentRetention = estimateRetention(state.halfLife, daysElapsed);

      // 计算预测遗忘时间（保持率降到阈值以下的时间）
      const daysUntilRisk = -state.halfLife * Math.log(RISK_THRESHOLD);
      const predictedForgetAt = new Date(lastReviewMs + daysUntilRisk * MS_PER_DAY);

      // 判断是否需要预警
      const daysToPredictedForget = (predictedForgetAt.getTime() - nowMs) / MS_PER_DAY;

      // 条件1: 当前保持率已经低于阈值，需要立即预警
      // 条件2: 预测遗忘时间在预警窗口内，提前预警
      const needsAlert =
        currentRetention < RISK_THRESHOLD || daysToPredictedForget <= ALERT_WINDOW_DAYS;

      if (!needsAlert) {
        stats.wordsSkipped++;
        continue;
      }

      // 检查是否已经存在预警
      const existingAlert = await prisma.forgettingAlert.findUnique({
        where: {
          userId_wordId: {
            userId,
            wordId: state.wordId,
          },
        },
      });

      let alertId: string;
      let isNewAlert = false;

      if (existingAlert) {
        // 如果预警已被 DISMISSED 或 REVIEWED，不再更新
        if (existingAlert.status !== 'ACTIVE') {
          stats.wordsSkipped++;
          continue;
        }

        // 更新现有预警
        await prisma.forgettingAlert.update({
          where: { id: existingAlert.id },
          data: {
            predictedForgetAt,
            recallProbability: currentRetention,
            updatedAt: now,
          },
        });

        alertId = existingAlert.id;
        stats.alertsUpdated++;
      } else {
        // 创建新预警
        const newAlert = await prisma.forgettingAlert.create({
          data: {
            userId,
            wordId: state.wordId,
            predictedForgetAt,
            recallProbability: currentRetention,
            status: 'ACTIVE',
          },
        });

        alertId = newAlert.id;
        isNewAlert = true;
        stats.alertsCreated++;
      }

      // 只有新创建的预警才发布事件（避免重复推送）
      if (isNewAlert) {
        // 获取单词信息用于构建友好的消息
        const word = await prisma.word.findUnique({
          where: { id: state.wordId },
          select: { spelling: true },
        });

        // 发布 FORGETTING_RISK_HIGH 事件到 EventBus
        await eventBus.publish({
          type: 'FORGETTING_RISK_HIGH',
          payload: {
            userId,
            wordId: state.wordId,
            recallProbability: currentRetention,
            riskLevel: currentRetention < 0.2 ? 'high' : currentRetention < 0.3 ? 'medium' : 'low',
            lastReviewDate: state.lastReviewDate,
            suggestedReviewDate: predictedForgetAt,
            timestamp: now,
          },
        });

        workerLogger.debug(
          {
            userId,
            wordId: state.wordId,
            word: word?.spelling,
            recallProbability: currentRetention,
          },
          '发布遗忘风险事件',
        );
      }
    } catch (error) {
      workerLogger.error({ err: error, wordId: state.wordId }, '处理单词预警失败');
      // 继续处理下一个单词
    }
  }
}

/**
 * 执行预警扫描周期
 */
async function runAlertCycle(): Promise<void> {
  if (isRunning) {
    workerLogger.info('预警扫描正在运行中，跳过本次执行');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    workerLogger.info('开始执行遗忘预警扫描');

    const stats = await scanAndCreateAlerts();

    workerLogger.info(
      {
        usersScanned: stats.usersScanned,
        wordsScanned: stats.wordsScanned,
        alertsCreated: stats.alertsCreated,
        alertsUpdated: stats.alertsUpdated,
        wordsSkipped: stats.wordsSkipped,
        duration: stats.duration.toFixed(2),
      },
      '遗忘预警扫描完成',
    );
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    workerLogger.error({ err: error, duration }, '遗忘预警扫描失败');
  } finally {
    isRunning = false;
  }
}

// ==================== Worker 控制 ====================

/**
 * 启动遗忘预警 Worker
 * 默认每小时执行一次
 *
 * @param schedule cron 表达式，默认 '0 * * * *' (每小时整点)
 * @returns cron 任务实例
 */
export function startForgettingAlertWorker(schedule = '0 * * * *'): ScheduledTask {
  workerLogger.info({ schedule }, '启动遗忘预警 Worker');

  scheduledTask = cron.schedule(schedule, () => {
    runAlertCycle().catch((err) => {
      workerLogger.error({ err }, '未捕获的错误');
    });
  });

  workerLogger.info('遗忘预警 Worker 已启动');

  return scheduledTask;
}

/**
 * 停止遗忘预警 Worker
 */
export function stopForgettingAlertWorker(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    workerLogger.info('遗忘预警 Worker 已停止');
  }
  // 重置运行状态，确保重启后任务可以正常执行
  isRunning = false;
}

/**
 * 手动触发预警扫描（用于测试或管理员操作）
 */
export async function triggerAlertScan(): Promise<AlertStats> {
  if (isRunning) {
    throw new Error('预警扫描正在运行中，请稍后再试');
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    workerLogger.info('手动触发：开始执行遗忘预警扫描');

    const stats = await scanAndCreateAlerts();

    workerLogger.info(
      {
        duration: stats.duration.toFixed(2),
        alertsCreated: stats.alertsCreated,
        alertsUpdated: stats.alertsUpdated,
      },
      '手动触发：遗忘预警扫描完成',
    );

    return stats;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    workerLogger.error({ err: error, duration }, '手动触发：遗忘预警扫描失败');
    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * 获取 Worker 状态
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  isScheduled: boolean;
} {
  return {
    isRunning,
    isScheduled: scheduledTask !== null,
  };
}

/**
 * 清理所有已完成的预警（REVIEWED 或 DISMISSED）
 * 可定期清理以减少数据库体积
 */
export async function cleanupResolvedAlerts(olderThanDays = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.forgettingAlert.deleteMany({
    where: {
      status: {
        in: ['REVIEWED', 'DISMISSED'],
      },
      updatedAt: {
        lt: cutoffDate,
      },
    },
  });

  workerLogger.info({ count: result.count, olderThanDays }, '清理已完成的预警');

  return result.count;
}
