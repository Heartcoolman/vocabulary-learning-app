/**
 * AMAS Delayed Reward Worker
 * 延迟奖励Worker
 *
 * 功能:
 * - 定时轮询到期的延迟奖励任务
 * - 应用奖励到LinUCB模型
 * - 错误处理和重试
 */

import cron, { ScheduledTask } from 'node-cron';
import {
  DelayedRewardService,
  ApplyRewardHandler
} from '../services/delayed-reward.service';
import { RewardQueue } from '@prisma/client';
import { amasService } from '../services/amas.service';
import {
  recordRewardProcessed,
  recordRewardProcessingDuration,
  updateRewardQueueLength
} from '../services/metrics.service';
import { workerLogger } from '../logger';

/**
 * 奖励应用处理器 (业务逻辑)
 * 调用AMAS服务更新LinUCB模型
 * Critical Fix: 传递answerRecordId以支持精确的特征向量匹配
 */
const applyReward: ApplyRewardHandler = async (task: RewardQueue) => {
  const startTime = Date.now();

  try {
    workerLogger.info(
      {
        userId: task.userId,
        reward: task.reward,
        answerRecordId: task.answerRecordId ?? 'n/a',
        sessionId: task.sessionId ?? 'n/a'
      },
      '应用奖励'
    );

    // 调用AMAS服务应用延迟奖励，优先使用answerRecordId
    await amasService.applyDelayedReward(
      task.userId,
      task.reward,
      task.sessionId ?? undefined,
      task.answerRecordId ?? undefined
    );

    // 记录成功指标
    recordRewardProcessed('success');
    const durationSeconds = (Date.now() - startTime) / 1000;
    recordRewardProcessingDuration(durationSeconds);

    workerLogger.info(
      {
        taskId: task.id,
        duration: durationSeconds
      },
      '奖励已应用'
    );
  } catch (err) {
    // 记录失败指标
    recordRewardProcessed('failure');
    const durationSeconds = (Date.now() - startTime) / 1000;
    recordRewardProcessingDuration(durationSeconds);

    workerLogger.error(
      {
        err,
        taskId: task.id
      },
      '应用奖励失败'
    );
    throw err;
  }
};

/**
 * 启动延迟奖励Worker
 * @returns Cron任务实例
 */
export function startDelayedRewardWorker(): ScheduledTask {
  const service = new DelayedRewardService();

  workerLogger.info('延迟奖励Worker启动中...');

  // 每分钟执行一次
  const task = cron.schedule('* * * * *', async () => {
    try {
      await service.processPendingRewards(applyReward);
    } catch (err) {
      // 记录日志,避免中断后续调度
      workerLogger.error({ err }, '处理错误');
    }
  });

  task.start();
  workerLogger.info('延迟奖励Worker已启动 (每分钟执行)');

  return task;
}

/**
 * 停止延迟奖励Worker
 * @param task Cron任务实例
 */
export function stopDelayedRewardWorker(task: ScheduledTask): void {
  task.stop();
  workerLogger.info('延迟奖励Worker已停止');
}
