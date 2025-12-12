/**
 * Alert Analysis Service
 * 告警分析服务
 *
 * 使用 LLM 分析告警事件，找出根因并生成修复建议
 */

import prisma from '../../config/database';
import { llmConfig } from '../../config/llm.config';
import { LLMProviderService, llmProviderService } from '../llm-provider.service';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 告警严重程度
 */
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * 分析状态
 */
export type AnalysisStatus = 'open' | 'investigating' | 'resolved' | 'ignored';

/**
 * 告警信息
 */
export interface AlertInfo {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  metrics: Record<string, number>;
  triggeredAt: Date;
  context?: Record<string, unknown>;
}

/**
 * 根因分析结果
 */
export interface RootCauseAnalysis {
  id: string;
  alertRuleId: string;
  severity: AlertSeverity;
  rootCause: string;
  suggestedFixes: Array<{
    action: string;
    description: string;
    priority: number;
    effort: 'low' | 'medium' | 'high';
  }>;
  relatedMetrics: Array<{
    name: string;
    value: number;
    threshold: number;
    deviation: string;
  }>;
  confidence: number;
  status: AnalysisStatus;
  createdAt: Date;
}

/**
 * 分析选项
 */
export interface AnalysisOptions {
  includeHistoricalContext?: boolean;
  maxRelatedAlerts?: number;
}

// ==================== 提示词 ====================

const ALERT_ANALYSIS_SYSTEM = `你是一个资深的系统运维专家，专门负责分析自适应学习系统的告警事件。

你的任务是：
1. 分析告警的根本原因
2. 提供具体可执行的修复建议
3. 评估问题的影响范围

背景知识：
- 这是一个词汇学习应用
- 关键指标包括：用户留存、正确率、疲劳度、动机水平
- 系统使用 AMAS（自适应多维度用户感知学习系统）算法

分析要求：
- 根因分析要具体，不要泛泛而谈
- 修复建议要可执行，包含具体步骤
- 考虑问题的紧急程度和影响范围`;

function buildAlertAnalysisPrompt(alert: AlertInfo, historicalAlerts?: AlertInfo[]): string {
  let prompt = `## 当前告警信息

- 告警规则: ${alert.ruleName} (ID: ${alert.ruleId})
- 严重程度: ${alert.severity}
- 告警消息: ${alert.message}
- 触发时间: ${alert.triggeredAt.toISOString()}

### 相关指标
${Object.entries(alert.metrics)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
`;

  if (alert.context) {
    prompt += `
### 上下文信息
${JSON.stringify(alert.context, null, 2)}
`;
  }

  if (historicalAlerts && historicalAlerts.length > 0) {
    prompt += `
## 历史相关告警（最近 ${historicalAlerts.length} 条）
${historicalAlerts
  .map(
    (a, i) => `
${i + 1}. [${a.triggeredAt.toISOString()}] ${a.ruleName}: ${a.message}
`,
  )
  .join('')}
`;
  }

  prompt += `
---

请分析此告警并提供根因分析和修复建议。

严格按照以下 JSON 格式输出（不要添加任何其他内容）：

\`\`\`json
{
  "rootCause": "根本原因分析（2-3句话描述）",
  "suggestedFixes": [
    {
      "action": "修复动作名称",
      "description": "具体操作步骤说明",
      "priority": 1-5的优先级（1最高）,
      "effort": "low/medium/high 实施难度"
    }
  ],
  "relatedMetrics": [
    {
      "name": "指标名称",
      "value": 当前值,
      "threshold": 阈值,
      "deviation": "偏离描述"
    }
  ],
  "confidence": 0.0到1.0的置信度,
  "impact": "影响范围评估",
  "urgency": "紧急程度说明"
}
\`\`\``;

  return prompt;
}

// ==================== 服务类 ====================

/**
 * 告警分析服务
 */
export class AlertAnalysisService {
  private llmProvider: LLMProviderService;

  constructor(llmProvider: LLMProviderService = llmProviderService) {
    this.llmProvider = llmProvider;
  }

  /**
   * 检查服务是否可用
   */
  isEnabled(): boolean {
    return llmConfig.enabled && this.llmProvider.isAvailable();
  }

  /**
   * 分析告警
   */
  async analyzeAlert(alert: AlertInfo, options: AnalysisOptions = {}): Promise<RootCauseAnalysis> {
    if (!this.isEnabled()) {
      throw new Error('LLM 服务未启用，无法进行告警分析');
    }

    const { includeHistoricalContext = true, maxRelatedAlerts = 5 } = options;

    amasLogger.info(
      {
        alertId: alert.id,
        ruleId: alert.ruleId,
        severity: alert.severity,
      },
      '[AlertAnalysisService] 开始分析告警',
    );

    // 获取历史相关告警
    let historicalAlerts: AlertInfo[] | undefined;
    if (includeHistoricalContext) {
      historicalAlerts = await this.getRelatedAlerts(alert.ruleId, maxRelatedAlerts);
    }

    const prompt = buildAlertAnalysisPrompt(alert, historicalAlerts);

    const response = await this.llmProvider.completeWithSystem(ALERT_ANALYSIS_SYSTEM, prompt, {
      temperature: 0.3,
      maxTokens: 1500,
    });

    // 解析 JSON 响应
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      throw new Error('无法解析 LLM 响应');
    }

    const parsed = JSON.parse(jsonMatch[1]);

    // 保存分析结果
    const analysis = await prisma.alertRootCauseAnalysis.create({
      data: {
        alertRuleId: alert.ruleId,
        severity: alert.severity,
        rootCause: parsed.rootCause,
        suggestedFixes: parsed.suggestedFixes,
        relatedMetrics: parsed.relatedMetrics,
        confidence: parsed.confidence,
        status: 'open',
      },
    });

    amasLogger.info(
      {
        analysisId: analysis.id,
        confidence: parsed.confidence,
        fixCount: parsed.suggestedFixes?.length || 0,
      },
      '[AlertAnalysisService] 告警分析完成',
    );

    return {
      id: analysis.id,
      alertRuleId: analysis.alertRuleId,
      severity: analysis.severity as AlertSeverity,
      rootCause: analysis.rootCause,
      suggestedFixes: analysis.suggestedFixes as RootCauseAnalysis['suggestedFixes'],
      relatedMetrics: analysis.relatedMetrics as RootCauseAnalysis['relatedMetrics'],
      confidence: analysis.confidence,
      status: analysis.status as AnalysisStatus,
      createdAt: analysis.createdAt,
    };
  }

  /**
   * 获取相关历史告警
   */
  private async getRelatedAlerts(ruleId: string, limit: number): Promise<AlertInfo[]> {
    // 这里假设有一个 AlertHistory 表记录告警历史
    // 如果没有，可以返回空数组或从日志中获取
    try {
      // 尝试从现有数据源获取
      // 如果表不存在，返回空数组
      return [];
    } catch {
      return [];
    }
  }

  /**
   * 获取分析历史
   */
  async getAnalyses(options?: {
    status?: AnalysisStatus;
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
  }): Promise<{ items: RootCauseAnalysis[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (options?.status) {
      where.status = options.status;
    }
    if (options?.severity) {
      where.severity = options.severity;
    }

    const [items, total] = await Promise.all([
      prisma.alertRootCauseAnalysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      prisma.alertRootCauseAnalysis.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        alertRuleId: item.alertRuleId,
        severity: item.severity as AlertSeverity,
        rootCause: item.rootCause,
        suggestedFixes: item.suggestedFixes as RootCauseAnalysis['suggestedFixes'],
        relatedMetrics: item.relatedMetrics as RootCauseAnalysis['relatedMetrics'],
        confidence: item.confidence,
        status: item.status as AnalysisStatus,
        createdAt: item.createdAt,
      })),
      total,
    };
  }

  /**
   * 获取单个分析详情
   */
  async getAnalysis(id: string): Promise<RootCauseAnalysis | null> {
    const item = await prisma.alertRootCauseAnalysis.findUnique({
      where: { id },
    });

    if (!item) return null;

    return {
      id: item.id,
      alertRuleId: item.alertRuleId,
      severity: item.severity as AlertSeverity,
      rootCause: item.rootCause,
      suggestedFixes: item.suggestedFixes as RootCauseAnalysis['suggestedFixes'],
      relatedMetrics: item.relatedMetrics as RootCauseAnalysis['relatedMetrics'],
      confidence: item.confidence,
      status: item.status as AnalysisStatus,
      createdAt: item.createdAt,
    };
  }

  /**
   * 更新分析状态
   */
  async updateStatus(
    id: string,
    status: AnalysisStatus,
    resolution?: string,
    resolvedBy?: string,
  ): Promise<void> {
    const data: Record<string, unknown> = { status };

    if (status === 'resolved') {
      data.resolvedAt = new Date();
      data.resolvedBy = resolvedBy;
      data.resolution = resolution;
    }

    await prisma.alertRootCauseAnalysis.update({
      where: { id },
      data,
    });

    amasLogger.info(
      {
        analysisId: id,
        newStatus: status,
        resolvedBy,
      },
      '[AlertAnalysisService] 分析状态已更新',
    );
  }

  /**
   * 获取分析统计
   */
  async getStats(): Promise<{
    totalAnalyses: number;
    openCount: number;
    resolvedCount: number;
    avgConfidence: number;
    bySeverity: Record<AlertSeverity, number>;
  }> {
    const [total, open, resolved, allAnalyses] = await Promise.all([
      prisma.alertRootCauseAnalysis.count(),
      prisma.alertRootCauseAnalysis.count({ where: { status: 'open' } }),
      prisma.alertRootCauseAnalysis.count({ where: { status: 'resolved' } }),
      prisma.alertRootCauseAnalysis.findMany({
        select: { severity: true, confidence: true },
      }),
    ]);

    const bySeverity: Record<AlertSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let totalConfidence = 0;
    for (const a of allAnalyses) {
      bySeverity[a.severity as AlertSeverity]++;
      totalConfidence += a.confidence;
    }

    return {
      totalAnalyses: total,
      openCount: open,
      resolvedCount: resolved,
      avgConfidence: allAnalyses.length > 0 ? totalConfidence / allAnalyses.length : 0,
      bySeverity,
    };
  }
}

// ==================== 默认实例 ====================

export const alertAnalysisService = new AlertAnalysisService();
