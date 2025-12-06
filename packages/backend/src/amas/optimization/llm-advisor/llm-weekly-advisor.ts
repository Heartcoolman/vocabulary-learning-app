/**
 * LLM Weekly Advisor
 * LLM 周度顾问核心服务
 *
 * 每周分析系统数据，生成配置调整建议
 */

import prisma from '../../../config/database';
import { llmConfig } from '../../../config/llm.config';
import { LLMProviderService, llmProviderService } from '../../../services/llm-provider.service';
import { StatsCollector, statsCollector, WeeklyStats } from './stats-collector';
import { SuggestionParser, suggestionParser, LLMSuggestion, SuggestionItem } from './suggestion-parser';
import { SYSTEM_PROMPT, buildWeeklyAnalysisPrompt } from './prompts';
import { amasLogger } from '../../../logger';
import { amasConfigService } from '../../../services/amas-config.service';

// ==================== 类型定义 ====================

/**
 * 建议状态
 */
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'partial';

/**
 * 持久化的建议记录
 */
export interface StoredSuggestion {
  id: string;
  weekStart: Date;
  weekEnd: Date;
  statsSnapshot: WeeklyStats;
  rawResponse: string;
  parsedSuggestion: LLMSuggestion;
  status: SuggestionStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  appliedItems: string[] | null;
  createdAt: Date;
}

/**
 * 分析结果
 */
export interface AnalysisResult {
  id: string;
  stats: WeeklyStats;
  suggestion: LLMSuggestion;
  rawResponse: string;
  createdAt: Date;
}

/**
 * 审批请求
 */
export interface ApprovalRequest {
  suggestionId: string;
  approvedBy: string;
  selectedItems: string[];
  notes?: string;
}

// ==================== 服务类 ====================

/**
 * LLM 周度顾问服务
 */
export class LLMWeeklyAdvisor {
  constructor(
    private collector: StatsCollector = statsCollector,
    private llmProvider: LLMProviderService = llmProviderService,
    private parser: SuggestionParser = suggestionParser
  ) {}

  /**
   * 检查服务是否可用
   */
  isEnabled(): boolean {
    return llmConfig.enabled;
  }

  /**
   * 运行周度分析
   */
  async runWeeklyAnalysis(): Promise<AnalysisResult> {
    if (!this.isEnabled()) {
      throw new Error('LLM 顾问未启用，请设置 LLM_ADVISOR_ENABLED=true');
    }

    amasLogger.info('[LLMWeeklyAdvisor] 开始周度分析');
    const startTime = Date.now();

    try {
      // 1. 收集统计数据
      const stats = await this.collector.collectWeeklyStats();

      // 2. 构建提示词
      const userPrompt = buildWeeklyAnalysisPrompt(stats);

      // 3. 调用 LLM
      amasLogger.info('[LLMWeeklyAdvisor] 调用 LLM 分析');
      const rawResponse = await this.llmProvider.completeWithSystem(
        SYSTEM_PROMPT,
        userPrompt,
        { temperature: 0.3 }
      );

      // 4. 解析响应
      const suggestion = this.parser.parse(rawResponse);

      // 5. 验证建议
      const validation = this.parser.validate(suggestion);
      if (!validation.valid) {
        amasLogger.warn({
          errors: validation.errors
        }, '[LLMWeeklyAdvisor] 建议验证失败');
      }

      // 6. 持久化到数据库
      const stored = await this.storeSuggestion(stats, rawResponse, suggestion);

      const duration = Date.now() - startTime;
      amasLogger.info({
        id: stored.id,
        duration,
        suggestionsCount: suggestion.suggestions.length,
        confidence: suggestion.confidence
      }, '[LLMWeeklyAdvisor] 周度分析完成');

      return {
        id: stored.id,
        stats,
        suggestion,
        rawResponse,
        createdAt: stored.createdAt
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      amasLogger.error({
        error: (error as Error).message,
        duration
      }, '[LLMWeeklyAdvisor] 周度分析失败');
      throw error;
    }
  }

  /**
   * 存储建议到数据库
   */
  private async storeSuggestion(
    stats: WeeklyStats,
    rawResponse: string,
    suggestion: LLMSuggestion
  ): Promise<StoredSuggestion> {
    const record = await prisma.lLMAdvisorSuggestion.create({
      data: {
        weekStart: stats.period.start,
        weekEnd: stats.period.end,
        statsSnapshot: stats as object,
        rawResponse,
        parsedSuggestion: suggestion as object,
        status: 'pending'
      }
    });

    return {
      id: record.id,
      weekStart: record.weekStart,
      weekEnd: record.weekEnd,
      statsSnapshot: record.statsSnapshot as unknown as WeeklyStats,
      rawResponse: record.rawResponse,
      parsedSuggestion: record.parsedSuggestion as unknown as LLMSuggestion,
      status: record.status as SuggestionStatus,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt,
      reviewNotes: record.reviewNotes,
      appliedItems: record.appliedItems as string[] | null,
      createdAt: record.createdAt
    };
  }

  /**
   * 获取建议列表
   */
  async getSuggestions(options?: {
    status?: SuggestionStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: StoredSuggestion[]; total: number }> {
    const where = options?.status ? { status: options.status } : {};

    const [items, total] = await Promise.all([
      prisma.lLMAdvisorSuggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0
      }),
      prisma.lLMAdvisorSuggestion.count({ where })
    ]);

    return {
      items: items.map(this.mapToStoredSuggestion),
      total
    };
  }

  /**
   * 获取单个建议详情
   */
  async getSuggestion(id: string): Promise<StoredSuggestion | null> {
    const record = await prisma.lLMAdvisorSuggestion.findUnique({
      where: { id }
    });

    return record ? this.mapToStoredSuggestion(record) : null;
  }

  /**
   * 审批建议
   */
  async approveSuggestion(request: ApprovalRequest): Promise<StoredSuggestion> {
    const { suggestionId, approvedBy, selectedItems, notes } = request;

    // 获取建议
    const suggestion = await this.getSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`建议不存在: ${suggestionId}`);
    }

    if (suggestion.status !== 'pending') {
      throw new Error(`建议状态不允许审批: ${suggestion.status}`);
    }

    // 验证选择的项目
    const validItems = suggestion.parsedSuggestion.suggestions.map(s => s.id);
    const invalidItems = selectedItems.filter(id => !validItems.includes(id));
    if (invalidItems.length > 0) {
      throw new Error(`无效的建议项: ${invalidItems.join(', ')}`);
    }

    // 应用选中的建议
    if (selectedItems.length > 0) {
      await this.applySelectedItems(suggestion, selectedItems);
    }

    // 更新状态
    const status: SuggestionStatus = selectedItems.length === 0
      ? 'rejected'
      : selectedItems.length === validItems.length
        ? 'approved'
        : 'partial';

    const updated = await prisma.lLMAdvisorSuggestion.update({
      where: { id: suggestionId },
      data: {
        status,
        reviewedBy: approvedBy,
        reviewedAt: new Date(),
        reviewNotes: notes,
        appliedItems: selectedItems
      }
    });

    amasLogger.info({
      id: suggestionId,
      status,
      appliedCount: selectedItems.length,
      reviewedBy: approvedBy
    }, '[LLMWeeklyAdvisor] 建议已审批');

    return this.mapToStoredSuggestion(updated);
  }

  /**
   * 拒绝建议
   */
  async rejectSuggestion(
    suggestionId: string,
    rejectedBy: string,
    notes?: string
  ): Promise<StoredSuggestion> {
    const suggestion = await this.getSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`建议不存在: ${suggestionId}`);
    }

    if (suggestion.status !== 'pending') {
      throw new Error(`建议状态不允许拒绝: ${suggestion.status}`);
    }

    const updated = await prisma.lLMAdvisorSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'rejected',
        reviewedBy: rejectedBy,
        reviewedAt: new Date(),
        reviewNotes: notes,
        appliedItems: []
      }
    });

    amasLogger.info({
      id: suggestionId,
      rejectedBy
    }, '[LLMWeeklyAdvisor] 建议已拒绝');

    return this.mapToStoredSuggestion(updated);
  }

  /**
   * 应用选中的建议项
   */
  private async applySelectedItems(
    suggestion: StoredSuggestion,
    selectedItems: string[]
  ): Promise<void> {
    const itemsToApply = suggestion.parsedSuggestion.suggestions
      .filter(s => selectedItems.includes(s.id));

    const appliedItems: string[] = [];
    const failedItems: { id: string; error: string }[] = [];

    for (const item of itemsToApply) {
      try {
        await this.applySuggestionItem(item, suggestion.id);
        appliedItems.push(item.id);
      } catch (error) {
        failedItems.push({
          id: item.id,
          error: (error as Error).message
        });
        amasLogger.error({
          itemId: item.id,
          suggestionId: suggestion.id,
          error: (error as Error).message
        }, '[LLMWeeklyAdvisor] 应用建议项失败，继续处理其他项');
      }
    }

    if (failedItems.length > 0) {
      amasLogger.warn({
        suggestionId: suggestion.id,
        appliedCount: appliedItems.length,
        failedCount: failedItems.length,
        failedItems
      }, '[LLMWeeklyAdvisor] 部分建议项应用失败');
    }

    if (appliedItems.length > 0) {
      amasLogger.info({
        suggestionId: suggestion.id,
        appliedCount: appliedItems.length,
        appliedItems
      }, '[LLMWeeklyAdvisor] 建议项应用完成');
    }
  }

  /**
   * 应用单个建议项
   *
   * 根据建议类型调用相应的配置服务更新配置：
   * - param_bound: 更新用户超参数边界
   * - threshold: 更新调整阈值
   * - reward_weight: 更新奖励函数权重
   * - safety_threshold: 更新安全阈值
   *
   * @param item 建议项
   * @param suggestionId 建议记录ID（可选，用于关联追溯）
   */
  private async applySuggestionItem(
    item: SuggestionItem,
    suggestionId?: string
  ): Promise<void> {
    amasLogger.info({
      type: item.type,
      target: item.target,
      currentValue: item.currentValue,
      suggestedValue: item.suggestedValue
    }, '[LLMWeeklyAdvisor] 应用建议项');

    const changedBy = 'llm-advisor';
    const changeReason = item.reason;

    try {
      switch (item.type) {
        case 'param_bound':
          await this.applyParamBoundChange(item, changedBy, changeReason, suggestionId);
          break;

        case 'threshold':
          await amasConfigService.updateThreshold(
            item.target,
            item.suggestedValue,
            changedBy,
            changeReason,
            suggestionId
          );
          amasLogger.info({
            target: item.target,
            previousValue: item.currentValue,
            newValue: item.suggestedValue
          }, '[LLMWeeklyAdvisor] 已应用调整阈值变更');
          break;

        case 'reward_weight':
          await amasConfigService.updateRewardWeight(
            item.target,
            item.suggestedValue,
            changedBy,
            changeReason,
            suggestionId
          );
          amasLogger.info({
            target: item.target,
            previousValue: item.currentValue,
            newValue: item.suggestedValue
          }, '[LLMWeeklyAdvisor] 已应用奖励权重变更');
          break;

        case 'safety_threshold':
          await amasConfigService.updateSafetyThreshold(
            item.target,
            item.suggestedValue,
            changedBy,
            changeReason,
            suggestionId
          );
          amasLogger.info({
            target: item.target,
            previousValue: item.currentValue,
            newValue: item.suggestedValue
          }, '[LLMWeeklyAdvisor] 已应用安全阈值变更');
          break;

        default:
          amasLogger.warn({
            type: item.type,
            target: item.target
          }, '[LLMWeeklyAdvisor] 未知的建议类型，跳过应用');
      }
    } catch (error) {
      amasLogger.error({
        type: item.type,
        target: item.target,
        error: (error as Error).message
      }, '[LLMWeeklyAdvisor] 应用建议项失败');
      throw error;
    }
  }

  /**
   * 应用参数边界变更
   *
   * 参数边界的 target 格式可能是：
   * - "alpha" (需要确定是 min 还是 max)
   * - "alpha.min" 或 "alpha.max" (明确指定边界)
   */
  private async applyParamBoundChange(
    item: SuggestionItem,
    changedBy: string,
    changeReason: string,
    suggestionId?: string
  ): Promise<void> {
    let paramName: string;
    let boundType: 'min' | 'max';

    // 解析 target 格式
    if (item.target.includes('.')) {
      const parts = item.target.split('.');
      paramName = parts[0];
      boundType = parts[1] as 'min' | 'max';
    } else {
      // 如果没有指定边界类型，根据当前值和建议值判断
      paramName = item.target;
      const config = await amasConfigService.getParamBounds();
      const currentBounds = config[paramName as keyof typeof config];

      if (!currentBounds) {
        throw new Error(`无效的参数名称: ${paramName}`);
      }

      // 通过比较确定是调整 min 还是 max
      if (Math.abs(item.currentValue - currentBounds.min) < 0.001) {
        boundType = 'min';
      } else if (Math.abs(item.currentValue - currentBounds.max) < 0.001) {
        boundType = 'max';
      } else {
        // 如果无法确定，根据建议值与当前边界的关系判断
        boundType = item.suggestedValue < (currentBounds.min + currentBounds.max) / 2 ? 'min' : 'max';
        amasLogger.warn({
          target: item.target,
          currentValue: item.currentValue,
          suggestedValue: item.suggestedValue,
          inferredBoundType: boundType
        }, '[LLMWeeklyAdvisor] 无法精确确定边界类型，已推断');
      }
    }

    await amasConfigService.updateParamBound(
      paramName,
      boundType,
      item.suggestedValue,
      changedBy,
      changeReason,
      suggestionId
    );

    amasLogger.info({
      paramName,
      boundType,
      previousValue: item.currentValue,
      newValue: item.suggestedValue
    }, '[LLMWeeklyAdvisor] 已应用参数边界变更');
  }

  /**
   * 获取待审批建议数量
   */
  async getPendingCount(): Promise<number> {
    return prisma.lLMAdvisorSuggestion.count({
      where: { status: 'pending' }
    });
  }

  /**
   * 获取最近的建议
   */
  async getLatestSuggestion(): Promise<StoredSuggestion | null> {
    const record = await prisma.lLMAdvisorSuggestion.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    return record ? this.mapToStoredSuggestion(record) : null;
  }

  /**
   * 映射数据库记录到类型
   */
  private mapToStoredSuggestion(record: {
    id: string;
    weekStart: Date;
    weekEnd: Date;
    statsSnapshot: unknown;
    rawResponse: string;
    parsedSuggestion: unknown;
    status: string;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    appliedItems: unknown;
    createdAt: Date;
  }): StoredSuggestion {
    return {
      id: record.id,
      weekStart: record.weekStart,
      weekEnd: record.weekEnd,
      statsSnapshot: record.statsSnapshot as unknown as WeeklyStats,
      rawResponse: record.rawResponse,
      parsedSuggestion: record.parsedSuggestion as unknown as LLMSuggestion,
      status: record.status as SuggestionStatus,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt,
      reviewNotes: record.reviewNotes,
      appliedItems: record.appliedItems as string[] | null,
      createdAt: record.createdAt
    };
  }
}

// ==================== 默认实例 ====================

export const llmWeeklyAdvisor = new LLMWeeklyAdvisor();
