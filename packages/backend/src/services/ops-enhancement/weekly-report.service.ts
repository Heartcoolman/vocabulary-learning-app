/**
 * Weekly Report Service
 * 周报生成服务
 *
 * 使用 LLM 自动生成系统运行周报
 */

import prisma from '../../config/database';
import { llmConfig } from '../../config/llm.config';
import { LLMProviderService, llmProviderService } from '../llm-provider.service';
import { StatsCollector, statsCollector, WeeklyStats } from '../../amas/services/llm-advisor';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 周报结构
 */
export interface WeeklyReport {
  id: string;
  weekStart: Date;
  weekEnd: Date;
  summary: string;
  healthScore: number;
  keyMetrics: {
    users: {
      total: number;
      active: number;
      new: number;
      churned: number;
      churnRate: number;
    };
    learning: {
      avgAccuracy: number;
      avgSessionDuration: number;
      totalAnswers: number;
      totalWordsLearned: number;
    };
    system: {
      avgResponseTime: number;
      errorRate: number;
      uptime: number;
    };
  };
  highlights: Array<{
    title: string;
    description: string;
    metric?: string;
    change?: string;
  }>;
  concerns: Array<{
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    suggestion?: string;
  }>;
  recommendations: Array<{
    action: string;
    reason: string;
    priority: number;
  }>;
  createdAt: Date;
}

/**
 * 周报生成选项
 */
export interface ReportOptions {
  endDate?: Date;
  includeDetailedMetrics?: boolean;
  createdBy?: string;
}

// ==================== 提示词 ====================

const WEEKLY_REPORT_SYSTEM = `你是一个专业的数据分析师，负责为词汇学习应用生成周度运营报告。

报告要求：
1. 语言简洁专业，避免冗长
2. 数据支撑观点，每个结论都要有数据依据
3. 建议具体可执行，不要泛泛而谈
4. 关注趋势变化，而不仅仅是绝对值

报告风格：
- 执行摘要控制在 100 字以内
- 亮点和关注点各 2-4 条
- 建议按优先级排序，最多 5 条`;

function buildWeeklyReportPrompt(stats: WeeklyStats): string {
  return `## 本周系统运行数据

### 统计周期
${formatDate(stats.period.start)} 至 ${formatDate(stats.period.end)}

### 用户指标
- 总用户数: ${stats.users.total}
- 本周活跃用户: ${stats.users.activeThisWeek}
- 本周新增用户: ${stats.users.newThisWeek}
- 本周流失用户: ${stats.users.churned}
- 流失率: ${(stats.alerts.churnRate * 100).toFixed(1)}%

### 学习效果
- 平均正确率: ${(stats.learning.avgAccuracy * 100).toFixed(1)}%
- 平均会话时长: ${stats.learning.avgSessionDuration.toFixed(1)} 分钟
- 本周答题总数: ${stats.learning.totalAnswers}
- 本周学习单词数: ${stats.learning.totalWordsLearned}
- 平均响应时间: ${stats.learning.avgResponseTime.toFixed(0)} ms

### 用户状态分布
疲劳度:
- 低疲劳: ${(stats.stateDistribution.fatigue.low * 100).toFixed(1)}%
- 中疲劳: ${(stats.stateDistribution.fatigue.mid * 100).toFixed(1)}%
- 高疲劳: ${(stats.stateDistribution.fatigue.high * 100).toFixed(1)}%

动机水平:
- 低动机: ${(stats.stateDistribution.motivation.low * 100).toFixed(1)}%
- 中动机: ${(stats.stateDistribution.motivation.mid * 100).toFixed(1)}%
- 高动机: ${(stats.stateDistribution.motivation.high * 100).toFixed(1)}%

### 告警指标
- 低正确率用户占比: ${(stats.alerts.lowAccuracyUserRatio * 100).toFixed(1)}%
- 高疲劳用户占比: ${(stats.alerts.highFatigueUserRatio * 100).toFixed(1)}%
- 低动机用户占比: ${(stats.alerts.lowMotivationUserRatio * 100).toFixed(1)}%

${
  stats.trends
    ? `### 7日趋势
${formatTrends(stats.trends)}`
    : ''
}

---

请生成本周运营报告。

严格按照以下 JSON 格式输出（不要添加任何其他内容）：

\`\`\`json
{
  "summary": "执行摘要（100字以内，概述本周整体情况）",
  "healthScore": 0-100的健康度评分,
  "highlights": [
    {
      "title": "亮点标题",
      "description": "详细描述",
      "metric": "相关指标",
      "change": "变化情况（如 +15%）"
    }
  ],
  "concerns": [
    {
      "title": "关注点标题",
      "description": "问题描述",
      "severity": "low/medium/high",
      "suggestion": "改进建议"
    }
  ],
  "recommendations": [
    {
      "action": "建议动作",
      "reason": "原因说明",
      "priority": 1-5的优先级
    }
  ]
}
\`\`\``;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatTrends(trends: WeeklyStats['trends']): string {
  if (!trends) return '';

  const lines: string[] = [];

  if (trends.accuracyTrend.length > 0) {
    const first = trends.accuracyTrend[0]?.value ?? 0;
    const last = trends.accuracyTrend[trends.accuracyTrend.length - 1]?.value ?? 0;
    const change = ((last - first) * 100).toFixed(1);
    lines.push(`正确率趋势: ${Number(change) >= 0 ? '+' : ''}${change}%`);
  }

  if (trends.activeUsersTrend.length > 0) {
    const first = trends.activeUsersTrend[0]?.value ?? 0;
    const last = trends.activeUsersTrend[trends.activeUsersTrend.length - 1]?.value ?? 0;
    const change = first > 0 ? (((last - first) / first) * 100).toFixed(1) : '0';
    lines.push(`活跃用户趋势: ${Number(change) >= 0 ? '+' : ''}${change}%`);
  }

  if (trends.answerCountTrend.length > 0) {
    const total = trends.answerCountTrend.reduce(
      (sum: number, t: { date: string; value: number }) => sum + t.value,
      0,
    );
    const avg = Math.round(total / trends.answerCountTrend.length);
    lines.push(`日均答题量: ${avg}`);
  }

  return lines.join('\n');
}

// ==================== 服务类 ====================

/**
 * 周报生成服务
 */
export class WeeklyReportService {
  private llmProvider: LLMProviderService;
  private statsCollector: StatsCollector;

  constructor(
    llmProvider: LLMProviderService = llmProviderService,
    collector: StatsCollector = statsCollector,
  ) {
    this.llmProvider = llmProvider;
    this.statsCollector = collector;
  }

  /**
   * 检查服务是否可用
   */
  isEnabled(): boolean {
    return llmConfig.enabled && this.llmProvider.isAvailable();
  }

  /**
   * 生成周报
   */
  async generateReport(options: ReportOptions = {}): Promise<WeeklyReport> {
    if (!this.isEnabled()) {
      throw new Error('LLM 服务未启用，无法生成周报');
    }

    const endDate = options.endDate ?? new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    amasLogger.info(
      {
        weekStart: startDate,
        weekEnd: endDate,
      },
      '[WeeklyReportService] 开始生成周报',
    );

    // 检查是否已存在该周的报告
    const existing = await prisma.systemWeeklyReport.findFirst({
      where: {
        weekStart: { gte: new Date(startDate.toDateString()) },
        weekEnd: { lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000) },
      },
    });

    if (existing) {
      amasLogger.info(
        {
          existingId: existing.id,
        },
        '[WeeklyReportService] 本周报告已存在',
      );

      return this.mapToWeeklyReport(existing);
    }

    // 收集统计数据
    const stats = await this.statsCollector.collectWeeklyStats(endDate, true);

    // 生成报告
    const prompt = buildWeeklyReportPrompt(stats);
    const response = await this.llmProvider.completeWithSystem(WEEKLY_REPORT_SYSTEM, prompt, {
      temperature: 0.4,
      maxTokens: 2000,
    });

    // 解析 JSON 响应
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      throw new Error('无法解析 LLM 响应');
    }

    const parsed = JSON.parse(jsonMatch[1]);

    // 构建完整报告
    const keyMetrics = {
      users: {
        total: stats.users.total,
        active: stats.users.activeThisWeek,
        new: stats.users.newThisWeek,
        churned: stats.users.churned,
        churnRate: stats.alerts.churnRate,
      },
      learning: {
        avgAccuracy: stats.learning.avgAccuracy,
        avgSessionDuration: stats.learning.avgSessionDuration,
        totalAnswers: stats.learning.totalAnswers,
        totalWordsLearned: stats.learning.totalWordsLearned,
      },
      system: {
        avgResponseTime: stats.learning.avgResponseTime,
        errorRate: 0, // 需要从其他来源获取
        uptime: 99.9, // 需要从其他来源获取
      },
    };

    // 保存报告
    const report = await prisma.systemWeeklyReport.create({
      data: {
        weekStart: stats.period.start,
        weekEnd: stats.period.end,
        summary: parsed.summary,
        healthScore: parsed.healthScore,
        keyMetrics: keyMetrics,
        highlights: parsed.highlights,
        concerns: parsed.concerns,
        recommendations: parsed.recommendations,
        userMetrics: stats.users,
        learningMetrics: stats.learning,
        systemMetrics: stats.stateDistribution,
        rawLLMResponse: response,
      },
    });

    amasLogger.info(
      {
        reportId: report.id,
        healthScore: parsed.healthScore,
        highlightsCount: parsed.highlights?.length || 0,
        concernsCount: parsed.concerns?.length || 0,
      },
      '[WeeklyReportService] 周报生成完成',
    );

    return this.mapToWeeklyReport(report);
  }

  /**
   * 获取周报列表
   */
  async getReports(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ items: WeeklyReport[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.systemWeeklyReport.findMany({
        orderBy: { weekStart: 'desc' },
        take: options?.limit ?? 10,
        skip: options?.offset ?? 0,
      }),
      prisma.systemWeeklyReport.count(),
    ]);

    return {
      items: items.map(this.mapToWeeklyReport),
      total,
    };
  }

  /**
   * 获取单个周报
   */
  async getReport(id: string): Promise<WeeklyReport | null> {
    const report = await prisma.systemWeeklyReport.findUnique({
      where: { id },
    });

    return report ? this.mapToWeeklyReport(report) : null;
  }

  /**
   * 获取最新周报
   */
  async getLatestReport(): Promise<WeeklyReport | null> {
    const report = await prisma.systemWeeklyReport.findFirst({
      orderBy: { weekStart: 'desc' },
    });

    return report ? this.mapToWeeklyReport(report) : null;
  }

  /**
   * 映射数据库记录到周报类型
   */
  private mapToWeeklyReport(record: {
    id: string;
    weekStart: Date;
    weekEnd: Date;
    summary: string;
    healthScore: number;
    keyMetrics: unknown;
    highlights: unknown;
    concerns: unknown;
    recommendations: unknown;
    createdAt: Date;
  }): WeeklyReport {
    return {
      id: record.id,
      weekStart: record.weekStart,
      weekEnd: record.weekEnd,
      summary: record.summary,
      healthScore: record.healthScore,
      keyMetrics: record.keyMetrics as WeeklyReport['keyMetrics'],
      highlights: record.highlights as WeeklyReport['highlights'],
      concerns: record.concerns as WeeklyReport['concerns'],
      recommendations: record.recommendations as WeeklyReport['recommendations'],
      createdAt: record.createdAt,
    };
  }

  /**
   * 获取健康度趋势
   */
  async getHealthTrend(weeks: number = 8): Promise<
    Array<{
      weekStart: Date;
      healthScore: number;
    }>
  > {
    const reports = await prisma.systemWeeklyReport.findMany({
      orderBy: { weekStart: 'desc' },
      take: weeks,
      select: {
        weekStart: true,
        healthScore: true,
      },
    });

    return reports.reverse();
  }
}

// ==================== 默认实例 ====================

export const weeklyReportService = new WeeklyReportService();
