/**
 * Behavior Insight Service
 * 用户行为洞察服务
 *
 * 使用 LLM 分析用户群体行为模式，生成运营建议
 */

import prisma from '../../config/database';
import { llmConfig } from '../../config/llm.config';
import { LLMProviderService, llmProviderService } from '../llm-provider.service';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 用户分群类型
 */
export type UserSegment =
  | 'new_users' // 新用户（注册7天内）
  | 'active_learners' // 活跃学习者（每日学习）
  | 'at_risk' // 流失风险用户
  | 'high_performers' // 高绩效用户
  | 'struggling' // 困难用户
  | 'casual' // 休闲用户
  | 'all'; // 全部用户

/**
 * 用户群体数据
 */
export interface SegmentData {
  segment: UserSegment;
  userCount: number;
  metrics: {
    avgAccuracy: number;
    avgSessionDuration: number;
    avgDailyAnswers: number;
    avgRetentionDays: number;
    avgFatigue: number;
    avgMotivation: number;
  };
  behaviors: Array<{
    pattern: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * 行为洞察
 */
export interface BehaviorInsight {
  id: string;
  analysisDate: Date;
  segment: UserSegment;
  userCount: number;
  patterns: Array<{
    name: string;
    description: string;
    prevalence: number;
    impact: 'positive' | 'negative' | 'neutral';
  }>;
  insights: Array<{
    finding: string;
    evidence: string;
    significance: 'high' | 'medium' | 'low';
  }>;
  recommendations: Array<{
    action: string;
    targetUsers: string;
    expectedImpact: string;
    priority: number;
  }>;
  createdAt: Date;
}

/**
 * 分析选项
 */
export interface InsightOptions {
  segment?: UserSegment;
  daysToAnalyze?: number;
  createdBy?: string;
}

// ==================== 提示词 ====================

const BEHAVIOR_INSIGHT_SYSTEM = `你是一个专业的用户行为分析师，专门分析在线学习应用的用户行为数据。

你的任务是：
1. 识别用户群体的行为模式
2. 发现有意义的洞察
3. 提供可执行的运营建议

分析原则：
- 关注行为背后的动机
- 区分相关性和因果性
- 优先关注高影响力的发现

背景知识：
- 这是一个词汇学习应用
- 用户通过答题来学习单词
- 关键指标：正确率、会话时长、学习频率、疲劳度、动机水平`;

function buildInsightPrompt(data: SegmentData): string {
  return `## 用户群体分析数据

### 群体信息
- 群体类型: ${getSegmentName(data.segment)}
- 用户数量: ${data.userCount}

### 核心指标
- 平均正确率: ${(data.metrics.avgAccuracy * 100).toFixed(1)}%
- 平均会话时长: ${data.metrics.avgSessionDuration.toFixed(1)} 分钟
- 日均答题量: ${data.metrics.avgDailyAnswers.toFixed(1)}
- 平均留存天数: ${data.metrics.avgRetentionDays.toFixed(1)} 天
- 平均疲劳度: ${(data.metrics.avgFatigue * 100).toFixed(1)}%
- 平均动机水平: ${(data.metrics.avgMotivation * 100).toFixed(1)}%

### 行为模式分布
${data.behaviors.map((b) => `- ${b.pattern}: ${b.count}人 (${b.percentage.toFixed(1)}%)`).join('\n')}

---

请分析这个用户群体并生成洞察报告。

严格按照以下 JSON 格式输出（不要添加任何其他内容）：

\`\`\`json
{
  "patterns": [
    {
      "name": "模式名称",
      "description": "模式描述",
      "prevalence": 0.0到1.0的普遍程度,
      "impact": "positive/negative/neutral"
    }
  ],
  "insights": [
    {
      "finding": "发现内容",
      "evidence": "数据支撑",
      "significance": "high/medium/low"
    }
  ],
  "recommendations": [
    {
      "action": "建议动作",
      "targetUsers": "目标用户描述",
      "expectedImpact": "预期效果",
      "priority": 1-5的优先级
    }
  ]
}
\`\`\``;
}

function getSegmentName(segment: UserSegment): string {
  const names: Record<UserSegment, string> = {
    new_users: '新用户',
    active_learners: '活跃学习者',
    at_risk: '流失风险用户',
    high_performers: '高绩效用户',
    struggling: '困难用户',
    casual: '休闲用户',
    all: '全部用户',
  };
  return names[segment];
}

// ==================== 服务类 ====================

/**
 * 用户行为洞察服务
 */
export class BehaviorInsightService {
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
   * 生成用户行为洞察
   */
  async generateInsight(options: InsightOptions = {}): Promise<BehaviorInsight> {
    if (!this.isEnabled()) {
      throw new Error('LLM 服务未启用，无法生成洞察');
    }

    const { segment = 'all', daysToAnalyze = 7 } = options;

    const analysisDate = new Date();

    amasLogger.info(
      {
        segment,
        daysToAnalyze,
      },
      '[BehaviorInsightService] 开始生成用户行为洞察',
    );

    // 收集群体数据
    const segmentData = await this.collectSegmentData(segment, daysToAnalyze);

    if (segmentData.userCount === 0) {
      throw new Error('该用户群体没有数据');
    }

    // 生成洞察
    const prompt = buildInsightPrompt(segmentData);
    const response = await this.llmProvider.completeWithSystem(BEHAVIOR_INSIGHT_SYSTEM, prompt, {
      temperature: 0.5,
      maxTokens: 2000,
    });

    // 解析 JSON 响应
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      throw new Error('无法解析 LLM 响应');
    }

    const parsed = JSON.parse(jsonMatch[1]);

    // 保存洞察
    const insight = await prisma.userBehaviorInsight.create({
      data: {
        analysisDate,
        userSegment: segment,
        patterns: parsed.patterns,
        insights: parsed.insights,
        recommendations: parsed.recommendations,
        userCount: segmentData.userCount,
        dataPoints: segmentData.behaviors.reduce((sum, b) => sum + b.count, 0),
      },
    });

    amasLogger.info(
      {
        insightId: insight.id,
        segment,
        userCount: segmentData.userCount,
        patternsCount: parsed.patterns?.length || 0,
      },
      '[BehaviorInsightService] 洞察生成完成',
    );

    return {
      id: insight.id,
      analysisDate: insight.analysisDate,
      segment: insight.userSegment as UserSegment,
      userCount: insight.userCount,
      patterns: insight.patterns as BehaviorInsight['patterns'],
      insights: insight.insights as BehaviorInsight['insights'],
      recommendations: insight.recommendations as BehaviorInsight['recommendations'],
      createdAt: insight.createdAt,
    };
  }

  /**
   * 收集用户群体数据
   */
  private async collectSegmentData(
    segment: UserSegment,
    daysToAnalyze: number,
  ): Promise<SegmentData> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - daysToAnalyze * 24 * 60 * 60 * 1000);

    // 获取符合条件的用户 ID
    const userIds = await this.getSegmentUserIds(segment, startDate, endDate);

    if (userIds.length === 0) {
      return {
        segment,
        userCount: 0,
        metrics: {
          avgAccuracy: 0,
          avgSessionDuration: 0,
          avgDailyAnswers: 0,
          avgRetentionDays: 0,
          avgFatigue: 0,
          avgMotivation: 0,
        },
        behaviors: [],
      };
    }

    // 收集指标
    const metrics = await this.collectMetrics(userIds, startDate, endDate);

    // 收集行为模式
    const behaviors = await this.collectBehaviors(userIds, startDate, endDate);

    return {
      segment,
      userCount: userIds.length,
      metrics,
      behaviors,
    };
  }

  /**
   * 获取分群用户 ID
   */
  private async getSegmentUserIds(
    segment: UserSegment,
    startDate: Date,
    endDate: Date,
  ): Promise<string[]> {
    switch (segment) {
      case 'new_users': {
        const newUsers = await prisma.user.findMany({
          where: {
            createdAt: { gte: new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        return newUsers.map((u) => u.id);
      }

      case 'active_learners': {
        // 每天都有学习记录的用户
        const activeUsers = await prisma.answerRecord.groupBy({
          by: ['userId'],
          where: {
            timestamp: { gte: startDate, lte: endDate },
          },
          having: {
            userId: { _count: { gte: 7 } }, // 至少有7次答题
          },
        });
        return activeUsers.map((u) => u.userId);
      }

      case 'high_performers': {
        // 正确率 > 80% 的用户
        const allUsers = await prisma.answerRecord.groupBy({
          by: ['userId'],
          where: {
            timestamp: { gte: startDate, lte: endDate },
          },
          _count: { id: true },
        });

        const highPerformers: string[] = [];
        for (const user of allUsers) {
          if (user._count.id >= 10) {
            const correctCount = await prisma.answerRecord.count({
              where: {
                userId: user.userId,
                timestamp: { gte: startDate, lte: endDate },
                isCorrect: true,
              },
            });
            if (correctCount / user._count.id >= 0.8) {
              highPerformers.push(user.userId);
            }
          }
        }
        return highPerformers;
      }

      case 'struggling': {
        // 正确率 < 50% 的用户
        const allUsers = await prisma.answerRecord.groupBy({
          by: ['userId'],
          where: {
            timestamp: { gte: startDate, lte: endDate },
          },
          _count: { id: true },
        });

        const struggling: string[] = [];
        for (const user of allUsers) {
          if (user._count.id >= 10) {
            const correctCount = await prisma.answerRecord.count({
              where: {
                userId: user.userId,
                timestamp: { gte: startDate, lte: endDate },
                isCorrect: true,
              },
            });
            if (correctCount / user._count.id < 0.5) {
              struggling.push(user.userId);
            }
          }
        }
        return struggling;
      }

      case 'at_risk': {
        // 最近 3 天没有活动的用户
        const threeDaysAgo = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000);
        const recentActive = await prisma.answerRecord.groupBy({
          by: ['userId'],
          where: {
            timestamp: { gte: threeDaysAgo },
          },
        });
        const recentActiveIds = new Set(recentActive.map((u) => u.userId));

        const previousActive = await prisma.answerRecord.groupBy({
          by: ['userId'],
          where: {
            timestamp: { gte: startDate, lt: threeDaysAgo },
          },
        });

        return previousActive.filter((u) => !recentActiveIds.has(u.userId)).map((u) => u.userId);
      }

      case 'casual': {
        // 每周只学习 1-2 天的用户
        const users = await prisma.answerRecord.groupBy({
          by: ['userId'],
          where: {
            timestamp: { gte: startDate, lte: endDate },
          },
          _count: { id: true },
        });

        return users.filter((u) => u._count.id >= 1 && u._count.id <= 10).map((u) => u.userId);
      }

      case 'all':
      default: {
        const allUsers = await prisma.answerRecord.groupBy({
          by: ['userId'],
          where: {
            timestamp: { gte: startDate, lte: endDate },
          },
        });
        return allUsers.map((u) => u.userId);
      }
    }
  }

  /**
   * 收集用户群体指标
   */
  private async collectMetrics(
    userIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<SegmentData['metrics']> {
    if (userIds.length === 0) {
      return {
        avgAccuracy: 0,
        avgSessionDuration: 0,
        avgDailyAnswers: 0,
        avgRetentionDays: 0,
        avgFatigue: 0,
        avgMotivation: 0,
      };
    }

    // 答题统计
    const [totalAnswers, correctAnswers] = await Promise.all([
      prisma.answerRecord.count({
        where: {
          userId: { in: userIds },
          timestamp: { gte: startDate, lte: endDate },
        },
      }),
      prisma.answerRecord.count({
        where: {
          userId: { in: userIds },
          timestamp: { gte: startDate, lte: endDate },
          isCorrect: true,
        },
      }),
    ]);

    // 会话统计
    const sessions = await prisma.learningSession.findMany({
      where: {
        userId: { in: userIds },
        startedAt: { gte: startDate, lte: endDate },
        endedAt: { not: null },
      },
      select: { startedAt: true, endedAt: true },
    });

    const avgSessionDuration =
      sessions.length > 0
        ? sessions.reduce((sum, s) => {
            const duration = (s.endedAt!.getTime() - s.startedAt.getTime()) / 60000;
            return sum + Math.min(duration, 120);
          }, 0) / sessions.length
        : 0;

    // 计算日均答题量
    const daysCount = Math.max(
      1,
      (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    const avgDailyAnswers = totalAnswers / userIds.length / daysCount;

    return {
      avgAccuracy: totalAnswers > 0 ? correctAnswers / totalAnswers : 0,
      avgSessionDuration,
      avgDailyAnswers,
      avgRetentionDays: daysCount,
      avgFatigue: 0.3, // 默认值，需要从 UserLearningState 获取
      avgMotivation: 0.5, // 默认值
    };
  }

  /**
   * 收集行为模式
   */
  private async collectBehaviors(
    userIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<SegmentData['behaviors']> {
    const behaviors: SegmentData['behaviors'] = [];
    const totalUsers = userIds.length;

    if (totalUsers === 0) return behaviors;

    // 早起学习者（6-9点学习）
    const morningLearners = await this.countUsersByTimeRange(userIds, startDate, endDate, 6, 9);
    behaviors.push({
      pattern: '早起学习者',
      count: morningLearners,
      percentage: (morningLearners / totalUsers) * 100,
    });

    // 夜间学习者（21-24点学习）
    const nightLearners = await this.countUsersByTimeRange(userIds, startDate, endDate, 21, 24);
    behaviors.push({
      pattern: '夜间学习者',
      count: nightLearners,
      percentage: (nightLearners / totalUsers) * 100,
    });

    // 周末学习者
    const weekendLearners = await this.countWeekendLearners(userIds, startDate, endDate);
    behaviors.push({
      pattern: '周末学习者',
      count: weekendLearners,
      percentage: (weekendLearners / totalUsers) * 100,
    });

    // 连续学习者（连续 5 天以上）
    const streakLearners = await this.countStreakLearners(userIds, startDate, endDate, 5);
    behaviors.push({
      pattern: '连续学习者',
      count: streakLearners,
      percentage: (streakLearners / totalUsers) * 100,
    });

    return behaviors;
  }

  /**
   * 统计特定时间段学习的用户数
   */
  private async countUsersByTimeRange(
    userIds: string[],
    startDate: Date,
    endDate: Date,
    hourStart: number,
    hourEnd: number,
  ): Promise<number> {
    const records = await prisma.answerRecord.findMany({
      where: {
        userId: { in: userIds },
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { userId: true, timestamp: true },
    });

    const usersInRange = new Set<string>();
    for (const record of records) {
      const hour = record.timestamp.getHours();
      if (hour >= hourStart && hour < hourEnd) {
        usersInRange.add(record.userId);
      }
    }

    return usersInRange.size;
  }

  /**
   * 统计周末学习的用户数
   */
  private async countWeekendLearners(
    userIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const records = await prisma.answerRecord.findMany({
      where: {
        userId: { in: userIds },
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { userId: true, timestamp: true },
    });

    const weekendLearners = new Set<string>();
    for (const record of records) {
      const day = record.timestamp.getDay();
      if (day === 0 || day === 6) {
        weekendLearners.add(record.userId);
      }
    }

    return weekendLearners.size;
  }

  /**
   * 统计连续学习的用户数
   */
  private async countStreakLearners(
    userIds: string[],
    startDate: Date,
    endDate: Date,
    minStreak: number,
  ): Promise<number> {
    let streakCount = 0;

    for (const userId of userIds) {
      const records = await prisma.answerRecord.findMany({
        where: {
          userId,
          timestamp: { gte: startDate, lte: endDate },
        },
        select: { timestamp: true },
        orderBy: { timestamp: 'asc' },
      });

      if (records.length === 0) continue;

      // 统计活跃天数
      const activeDays = new Set<string>();
      for (const record of records) {
        activeDays.add(record.timestamp.toISOString().split('T')[0]);
      }

      // 检查是否有连续 minStreak 天
      const sortedDays = Array.from(activeDays).sort();
      let maxStreak = 1;
      let currentStreak = 1;

      for (let i = 1; i < sortedDays.length; i++) {
        const prevDate = new Date(sortedDays[i - 1]);
        const currDate = new Date(sortedDays[i]);
        const dayDiff = (currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000);

        if (dayDiff === 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }

      if (maxStreak >= minStreak) {
        streakCount++;
      }
    }

    return streakCount;
  }

  /**
   * 获取洞察列表
   */
  async getInsights(options?: {
    segment?: UserSegment;
    limit?: number;
    offset?: number;
  }): Promise<{ items: BehaviorInsight[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (options?.segment) {
      where.userSegment = options.segment;
    }

    const [items, total] = await Promise.all([
      prisma.userBehaviorInsight.findMany({
        where,
        orderBy: { analysisDate: 'desc' },
        take: options?.limit ?? 10,
        skip: options?.offset ?? 0,
      }),
      prisma.userBehaviorInsight.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        analysisDate: item.analysisDate,
        segment: item.userSegment as UserSegment,
        userCount: item.userCount,
        patterns: item.patterns as BehaviorInsight['patterns'],
        insights: item.insights as BehaviorInsight['insights'],
        recommendations: item.recommendations as BehaviorInsight['recommendations'],
        createdAt: item.createdAt,
      })),
      total,
    };
  }

  /**
   * 获取单个洞察
   */
  async getInsight(id: string): Promise<BehaviorInsight | null> {
    const item = await prisma.userBehaviorInsight.findUnique({
      where: { id },
    });

    if (!item) return null;

    return {
      id: item.id,
      analysisDate: item.analysisDate,
      segment: item.userSegment as UserSegment,
      userCount: item.userCount,
      patterns: item.patterns as BehaviorInsight['patterns'],
      insights: item.insights as BehaviorInsight['insights'],
      recommendations: item.recommendations as BehaviorInsight['recommendations'],
      createdAt: item.createdAt,
    };
  }
}

// ==================== 默认实例 ====================

export const behaviorInsightService = new BehaviorInsightService();
