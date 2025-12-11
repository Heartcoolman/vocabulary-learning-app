/**
 * LLM Advisor Worker
 * LLM 顾问定时任务
 *
 * 每周执行一次 LLM 分析，生成配置建议
 */

import cron, { ScheduledTask } from 'node-cron';
import { llmWeeklyAdvisor } from '../amas/optimization/llm-advisor';
import { llmConfig, scheduleConfig } from '../config/llm.config';
import { llmProviderService } from '../services/llm-provider.service';
import { workerLogger } from '../logger';

/** Worker 运行状态 */
let isRunning = false;

/** 定时任务实例 */
let scheduledTask: ScheduledTask | null = null;

/**
 * 执行 LLM 分析周期
 */
async function runLLMAnalysisCycle(): Promise<void> {
  // 检查是否启用
  if (!llmConfig.enabled) {
    workerLogger.debug('[LLMAdvisorWorker] LLM 顾问未启用，跳过');
    return;
  }

  // 检查配置是否完整
  if (!llmProviderService.isAvailable()) {
    workerLogger.warn(
      '[LLMAdvisorWorker] LLM 服务配置不完整（API Key 或 Base URL 缺失），跳过本次分析',
    );
    return;
  }

  if (isRunning) {
    workerLogger.info('[LLMAdvisorWorker] 分析正在进行中，跳过本次执行');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    workerLogger.info('[LLMAdvisorWorker] 开始执行周度 LLM 分析');

    const result = await llmWeeklyAdvisor.runWeeklyAnalysis();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    workerLogger.info(
      {
        id: result.id,
        duration,
        suggestionsCount: result.suggestion.suggestions.length,
        confidence: result.suggestion.confidence,
        dataQuality: result.suggestion.dataQuality,
      },
      '[LLMAdvisorWorker] 周度分析完成',
    );

    // 输出分析摘要
    workerLogger.info(
      {
        summary: result.suggestion.analysis.summary,
        keyFindings: result.suggestion.analysis.keyFindings,
        concerns: result.suggestion.analysis.concerns,
      },
      '[LLMAdvisorWorker] 分析摘要',
    );

    // 如果有高优先级建议，记录警告
    const highPrioritySuggestions = result.suggestion.suggestions.filter((s) => s.priority <= 2);
    if (highPrioritySuggestions.length > 0) {
      workerLogger.warn(
        {
          count: highPrioritySuggestions.length,
          suggestions: highPrioritySuggestions.map((s) => ({
            target: s.target,
            type: s.type,
            reason: s.reason,
          })),
        },
        '[LLMAdvisorWorker] 有高优先级建议待审核',
      );
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    workerLogger.error(
      {
        err: error,
        duration,
      },
      '[LLMAdvisorWorker] 周度分析失败',
    );
  } finally {
    isRunning = false;
  }
}

/**
 * 启动 LLM 顾问 Worker
 *
 * @param schedule cron 表达式，默认每周日凌晨 4 点
 * @returns cron 任务实例，如果未启用则返回 null
 */
export function startLLMAdvisorWorker(schedule?: string): ScheduledTask | null {
  if (!llmConfig.enabled) {
    workerLogger.info('[LLMAdvisorWorker] LLM 顾问未启用，跳过 Worker 启动');
    return null;
  }

  if (!scheduleConfig.autoAnalysisEnabled) {
    workerLogger.info('[LLMAdvisorWorker] 自动分析已禁用，跳过 Worker 启动');
    return null;
  }

  const cronSchedule = schedule ?? scheduleConfig.weeklyAnalysisCron;

  workerLogger.info({ schedule: cronSchedule }, '[LLMAdvisorWorker] 启动 LLM 顾问 Worker');

  scheduledTask = cron.schedule(cronSchedule, () => {
    runLLMAnalysisCycle().catch((err) => {
      workerLogger.error({ err }, '[LLMAdvisorWorker] 未捕获的错误');
    });
  });

  workerLogger.info('[LLMAdvisorWorker] Worker 已启动');

  return scheduledTask;
}

/**
 * 停止 LLM 顾问 Worker
 */
export function stopLLMAdvisorWorker(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    workerLogger.info('[LLMAdvisorWorker] Worker 已停止');
  }
  // 重置运行状态，确保重启后任务可以正常执行
  isRunning = false;
}

/**
 * 手动触发 LLM 分析
 *
 * @returns 分析结果 ID
 */
export async function triggerLLMAnalysis(): Promise<string> {
  if (!llmConfig.enabled) {
    throw new Error('LLM 顾问未启用');
  }

  if (!llmProviderService.isAvailable()) {
    throw new Error('LLM 服务配置不完整，请检查 API Key 或 Base URL 设置');
  }

  if (isRunning) {
    throw new Error('分析正在进行中，请稍后再试');
  }

  isRunning = true;
  try {
    const result = await llmWeeklyAdvisor.runWeeklyAnalysis();
    return result.id;
  } finally {
    isRunning = false;
  }
}

/**
 * 获取 Worker 状态
 */
export async function getLLMAdvisorWorkerStatus(): Promise<{
  enabled: boolean;
  autoAnalysisEnabled: boolean;
  isRunning: boolean;
  schedule: string;
  pendingCount: number;
}> {
  const pendingCount = await llmWeeklyAdvisor.getPendingCount();
  return {
    enabled: llmConfig.enabled,
    autoAnalysisEnabled: scheduleConfig.autoAnalysisEnabled,
    isRunning,
    schedule: scheduleConfig.weeklyAnalysisCron,
    pendingCount,
  };
}
