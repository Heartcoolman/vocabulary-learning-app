/**
 * AMAS Optimization Worker
 * 优化Worker
 *
 * 功能:
 * - 定时执行贝叶斯超参数优化周期
 * - 基于近期学习效果自动调优参数
 */

import cron, { ScheduledTask } from 'node-cron';
import { optimizationService } from '../services/optimization.service';
import { isBayesianOptimizerEnabled } from '../amas/config/feature-flags';
import { workerLogger } from '../logger';

/** 优化周期运行状态 */
let isRunning = false;

/**
 * 执行优化周期
 */
async function runOptimizationCycle(): Promise<void> {
  if (!isBayesianOptimizerEnabled()) {
    return;
  }

  if (isRunning) {
    workerLogger.info('优化周期正在运行中，跳过本次执行');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    workerLogger.info('开始执行优化周期');

    const result = await optimizationService.runOptimizationCycle();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.evaluated) {
      workerLogger.info(
        {
          duration,
          suggested: result.suggested,
          evaluated: true
        },
        '优化周期完成'
      );

      // 输出当前最优参数
      const best = optimizationService.getBestParams();
      if (best) {
        workerLogger.info(
          {
            params: best.params,
            value: best.value
          },
          '当前最优参数'
        );
      }
    } else {
      workerLogger.info(
        {
          duration,
          suggested: result.suggested,
          evaluated: false,
          reason: '数据不足'
        },
        '优化周期完成'
      );
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    workerLogger.error({ err: error, duration }, '优化周期失败');
  } finally {
    isRunning = false;
  }
}

/**
 * 启动优化Worker
 * 默认每天凌晨3点执行一次优化周期
 *
 * @param schedule cron表达式，默认 '0 3 * * *' (每天凌晨3点)
 * @returns cron任务实例
 */
export function startOptimizationWorker(
  schedule = '0 3 * * *'
): ScheduledTask | null {
  if (!isBayesianOptimizerEnabled()) {
    workerLogger.info('贝叶斯优化器未启用，跳过Worker启动');
    return null;
  }

  workerLogger.info({ schedule }, '启动优化Worker');

  const task = cron.schedule(schedule, () => {
    runOptimizationCycle().catch(err => {
      workerLogger.error({ err }, '未捕获的错误');
    });
  });

  workerLogger.info('优化Worker已启动');

  return task;
}

/**
 * 手动触发优化周期（用于测试或管理员操作）
 */
export async function triggerOptimizationCycle(): Promise<{
  suggested: Record<string, number> | null;
  evaluated: boolean;
}> {
  return runOptimizationCycle().then(() => {
    const history = optimizationService.getOptimizationHistory();
    const lastObs = history.observations[history.observations.length - 1];

    return {
      suggested: lastObs?.params ?? null,
      evaluated: history.evaluationCount > 0
    };
  });
}

/**
 * 获取Worker状态
 */
export function getWorkerStatus(): {
  enabled: boolean;
  isRunning: boolean;
  optimizerDiagnostics: ReturnType<typeof optimizationService.getDiagnostics>;
} {
  return {
    enabled: isBayesianOptimizerEnabled(),
    isRunning,
    optimizerDiagnostics: optimizationService.getDiagnostics()
  };
}
