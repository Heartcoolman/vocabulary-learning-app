import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { cacheService, CacheTTL, CacheKeys } from './cache.service';
import { stateHistoryService, DateRange } from './state-history.service';
import { serviceLogger } from '../logger';

// ============================================
// 内部类型定义（用于替换 any 类型）
// ============================================

/**
 * 用户状态快照，包含注意力、疲劳度、动机等指标
 */
export interface UserStateSnapshot {
  attention?: number;
  fatigue?: number;
  motivation?: number;
}

/**
 * 决策权重快照（各成员的投票权重）
 */
export type WeightsSnapshot = Record<string, number>;

/**
 * 成员投票结果，包含触发器信息
 */
export interface MemberVotes {
  triggers?: string[];
  [key: string]: unknown;
}

/**
 * 选定的动作（从 AMAS 决策系统）
 * 对应数据库中 decision_records.selectedAction JSON 字段
 */
export interface SelectedAction {
  wordId?: string;
  difficulty?: string;
  scheduledAt?: number;
  [key: string]: unknown;
}

/**
 * 模拟决策结果
 */
interface SimulationResult {
  wouldTrigger: boolean;
  suggestedDifficulty: 'easier' | 'harder' | undefined;
  estimatedAccuracy: number;
}

export interface DifficultyFactors {
  length: number;
  accuracy: number;
  frequency: number;
  forgetting: number;
}

export interface ExplainResult {
  decisionId: string;
  timestamp: string;
  state: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
  };
  difficultyFactors: DifficultyFactors;
  weights?: Record<string, number>;
  triggers?: string[];
  stages?: Array<{ stage: string; durationMs?: number }>;
}

export interface LearningCurvePoint {
  date: string;
  mastery: number;
  attention: number;
  fatigue: number;
  motivation: number;
}

export interface LearningCurveResult {
  points: LearningCurvePoint[];
  trend: 'up' | 'flat' | 'down';
  currentMastery: number;
  averageAttention: number;
}

export interface CounterfactualInput {
  decisionId?: string;
  overrides?: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
    recentAccuracy?: number;
  };
}

export interface CounterfactualResult {
  baseDecisionId: string;
  baseState: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
  };
  counterfactualState: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
  };
  prediction: {
    wouldTriggerAdjustment: boolean;
    suggestedDifficulty?: 'easier' | 'harder';
    estimatedAccuracyChange: number;
  };
  explanation: string;
}

export interface DecisionTimelineItem {
  answerId: string;
  wordId: string;
  timestamp: string;
  decision: {
    decisionId: string;
    confidence: number;
    selectedAction: SelectedAction;
  };
}

export interface DecisionTimelineResponse {
  items: DecisionTimelineItem[];
  nextCursor: string | null;
}

class ExplainabilityService {
  async getLatestDecisionId(userId: string): Promise<string | null> {
    const results = await prisma.$queryRaw<Array<{ decisionId: string }>>(Prisma.sql`
      SELECT dr."decisionId" AS "decisionId"
      FROM decision_records dr
      JOIN answer_records ar ON dr."answerRecordId" = ar.id
      WHERE ar."userId" = ${userId}
      ORDER BY dr.timestamp DESC, dr.id DESC
      LIMIT 1
    `);

    return results[0]?.decisionId ?? null;
  }

  async getDecisionExplanation(userId: string, decisionId?: string): Promise<ExplainResult | null> {
    const targetId = decisionId ?? (await this.getLatestDecisionId(userId));
    if (!targetId) return null;

    // 1) 优先从decision_insights读取（cache-first）
    const insightKey = CacheKeys.DECISION_INSIGHT(targetId);
    const cachedInsight = cacheService.get<{
      stateSnapshot: UserStateSnapshot;
      difficultyFactors: DifficultyFactors;
      triggers: string[];
    }>(insightKey);

    if (cachedInsight) {
      return {
        decisionId: targetId,
        timestamp: new Date().toISOString(),
        state: cachedInsight.stateSnapshot || {},
        difficultyFactors: cachedInsight.difficultyFactors,
        triggers: cachedInsight.triggers || [],
        stages: [],
      };
    }

    // 2) 查询数据库decision_insights表（带错误处理）
    let dbInsight;
    try {
      dbInsight = await prisma.decisionInsight.findUnique({
        where: { decisionId: targetId },
        select: {
          stateSnapshot: true,
          difficultyFactors: true,
          triggers: true,
          createdAt: true,
        },
      });
    } catch (dbError) {
      serviceLogger.warn(
        {
          decisionId: targetId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        },
        'DB query failed, falling back to computation',
      );
      dbInsight = null;
    }

    if (dbInsight && dbInsight.stateSnapshot) {
      // 运行时类型验证
      const isValidObject = (val: unknown): val is Record<string, unknown> => {
        return typeof val === 'object' && val !== null && !Array.isArray(val);
      };

      if (!isValidObject(dbInsight.stateSnapshot)) {
        serviceLogger.error(
          {
            decisionId: targetId,
            type: typeof dbInsight.stateSnapshot,
          },
          'Invalid stateSnapshot type, falling back',
        );
      } else {
        // 将数据库 JSON 字段转换为强类型
        const stateSnapshot = dbInsight.stateSnapshot as unknown as UserStateSnapshot;
        const difficultyFactors = (isValidObject(dbInsight.difficultyFactors)
          ? dbInsight.difficultyFactors
          : {
              length: 0.5,
              accuracy: 0.5,
              frequency: 0.5,
              forgetting: 0.5,
            }) as unknown as DifficultyFactors;

        const insightData = {
          stateSnapshot,
          difficultyFactors,
          triggers: dbInsight.triggers,
        };
        cacheService.set(insightKey, insightData, CacheTTL.AMAS_STATE);

        return {
          decisionId: targetId,
          timestamp: dbInsight.createdAt.toISOString(),
          state: stateSnapshot || {},
          difficultyFactors,
          triggers: insightData.triggers || [],
          stages: [],
        };
      }
    }

    // 3) Fallback: 使用原有计算逻辑
    const cacheKey = `explain:${userId}:${targetId}`;
    const cached = cacheService.get<ExplainResult>(cacheKey);
    if (cached) return cached;

    const decision = await this.findDecisionForUser(targetId, userId);
    if (!decision) return null;

    const { record, answer } = decision;

    const [state, factors] = await Promise.all([
      this.getUserState(userId, record.timestamp),
      this.computeDifficultyFactors(userId, answer.wordId, record.timestamp),
    ]);

    const result: ExplainResult = {
      decisionId: targetId,
      timestamp: record.timestamp.toISOString(),
      state: state ?? {},
      difficultyFactors: factors,
      weights: (record.weightsSnapshot as Record<string, number>) ?? undefined,
      triggers: this.extractTriggers(record.memberVotes),
      stages: [],
    };

    cacheService.set(cacheKey, result, CacheTTL.AMAS_STATE);
    return result;
  }

  private async findDecisionForUser(decisionId: string, userId: string) {
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        decisionId: string;
        answerRecordId: string;
        timestamp: Date;
        weightsSnapshot: WeightsSnapshot | null;
        memberVotes: MemberVotes | null;
        selectedAction: SelectedAction;
        confidence: number;
        wordId: string;
      }>
    >(Prisma.sql`
      SELECT dr.id,
             dr."decisionId" AS "decisionId",
             dr."answerRecordId" AS "answerRecordId",
             dr.timestamp,
             dr."weightsSnapshot" AS "weightsSnapshot",
             dr."memberVotes" AS "memberVotes",
             dr."selectedAction" AS "selectedAction",
             dr.confidence,
             ar."wordId" AS "wordId"
      FROM decision_records dr
      JOIN answer_records ar ON dr."answerRecordId" = ar.id
      WHERE dr."decisionId" = ${decisionId} AND ar."userId" = ${userId}
      ORDER BY dr.timestamp DESC, dr.id DESC
      LIMIT 1
    `);

    if (!results.length) return null;

    const record = results[0];
    return {
      record: {
        id: record.id,
        decisionId: record.decisionId,
        answerRecordId: record.answerRecordId,
        timestamp: record.timestamp,
        weightsSnapshot: record.weightsSnapshot,
        memberVotes: record.memberVotes,
        selectedAction: record.selectedAction,
        confidence: record.confidence,
      },
      answer: {
        id: record.answerRecordId,
        userId: userId,
        wordId: record.wordId,
      },
    };
  }

  private async getUserState(userId: string, timestamp: Date) {
    const history = await prisma.userStateHistory.findFirst({
      where: { userId, date: { lte: timestamp } },
      orderBy: { date: 'desc' },
      select: { attention: true, fatigue: true, motivation: true },
    });

    return history
      ? {
          attention: Number(history.attention),
          fatigue: Number(history.fatigue),
          motivation: Number(history.motivation),
        }
      : null;
  }

  private extractTriggers(memberVotes: MemberVotes | null): string[] | undefined {
    if (!memberVotes || typeof memberVotes !== 'object') return undefined;
    return memberVotes.triggers;
  }

  private async computeDifficultyFactors(
    userId: string,
    wordId?: string,
    decisionTimestamp?: Date,
  ): Promise<DifficultyFactors> {
    if (!wordId) {
      return { length: 0.5, accuracy: 0.5, frequency: 0.5, forgetting: 0.5 };
    }

    const [word, stats, learning, freq] = await Promise.all([
      prisma.word.findUnique({ where: { id: wordId }, select: { spelling: true } }),
      prisma.answerRecord.groupBy({
        by: ['isCorrect'],
        where: { userId, wordId },
        _count: true,
      }),
      prisma.wordLearningState.findFirst({
        where: { userId, wordId },
        select: { nextReviewDate: true },
      }),
      prisma.word_frequency.findUnique({
        where: { word_id: wordId },
        select: { frequency_score: true },
      }),
    ]);

    const correct =
      stats.find((s: { isCorrect: boolean; _count: number }) => s.isCorrect)?._count ?? 0;
    const total = stats.reduce((acc: number, s: { _count: number }) => acc + (s._count ?? 0), 0);
    const accuracy = total > 0 ? correct / total : 0.5;

    const length = word?.spelling ? Math.min(1, Math.max(0, (word.spelling.length - 3) / 12)) : 0.5;

    const frequency = freq?.frequency_score
      ? Math.max(0, Math.min(1, 1 - Number(freq.frequency_score)))
      : 0.5;

    const anchorTime = decisionTimestamp ? decisionTimestamp.getTime() : Date.now();
    const forgetting = learning?.nextReviewDate
      ? Math.min(
          1,
          Math.max(0, (anchorTime - new Date(learning.nextReviewDate).getTime()) / (7 * 86400000)),
        )
      : 0.5;

    return { length, accuracy, frequency, forgetting };
  }

  async getLearningCurve(userId: string, days: number = 30): Promise<LearningCurveResult> {
    // 使用 DateRange 类型支持任意天数范围
    const endDate = new Date();
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    const dateRange: DateRange = { start: startDate, end: endDate };
    const history = await stateHistoryService.getStateHistory(userId, dateRange);

    const points: LearningCurvePoint[] = history.map((h) => {
      let dateStr: string;
      if (h.date instanceof Date) {
        dateStr = h.date.toISOString();
      } else if (typeof h.date === 'string') {
        dateStr = h.date;
      } else {
        dateStr = new Date().toISOString();
      }

      return {
        date: dateStr,
        mastery: h.memory * 100,
        attention: h.attention,
        fatigue: h.fatigue,
        motivation: h.motivation,
      };
    });

    const trend = this.computeTrend(points.map((p) => p.mastery));
    const currentMastery = points.length > 0 ? points[points.length - 1].mastery : 0;
    const averageAttention =
      points.length > 0 ? points.reduce((sum, p) => sum + p.attention, 0) / points.length : 0;

    return { points, trend, currentMastery, averageAttention };
  }

  private computeTrend(values: number[]): 'up' | 'flat' | 'down' {
    if (values.length < 2) return 'flat';
    const delta = values[values.length - 1] - values[0];
    if (delta > 5) return 'up';
    if (delta < -5) return 'down';
    return 'flat';
  }

  private parseCursor(cursor?: string): { id: string; timestamp: Date } | null {
    if (!cursor) return null;
    const [id, ts] = cursor.split('|');
    if (!id || !ts) return null;
    const timestamp = new Date(ts);
    if (Number.isNaN(timestamp.getTime())) return null;
    return { id, timestamp };
  }

  private formatCursor(record: { id: string; timestamp: Date }) {
    return `${record.id}|${record.timestamp.toISOString()}`;
  }

  async getDecisionTimeline(
    userId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<DecisionTimelineResponse> {
    const parsedCursor = this.parseCursor(cursor);

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        decisionId: string;
        answerRecordId: string | null;
        timestamp: Date;
        selectedAction: SelectedAction;
        confidence: number;
        wordId: string | null;
      }>
    >(Prisma.sql`
      SELECT dr.id,
             dr."decisionId" AS "decisionId",
             dr."answerRecordId" AS "answerRecordId",
             dr.timestamp,
             dr."selectedAction" AS "selectedAction",
             dr.confidence,
             ar."wordId" AS "wordId"
      FROM decision_records dr
      JOIN answer_records ar ON dr."answerRecordId" = ar.id
      WHERE ar."userId" = ${userId}
      ${parsedCursor ? Prisma.sql`AND (dr.timestamp, dr.id) < (${parsedCursor.timestamp}, ${parsedCursor.id})` : Prisma.sql``}
      ORDER BY dr.timestamp DESC, dr.id DESC
      LIMIT ${limit + 1}
    `);

    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit).map((d) => ({
      answerId: d.answerRecordId ?? d.id,
      wordId: d.wordId ?? '',
      timestamp: d.timestamp.toISOString(),
      decision: {
        decisionId: d.decisionId,
        confidence: d.confidence,
        selectedAction: d.selectedAction,
      },
    }));

    const nextCursor = hasNext ? this.formatCursor(rows[limit]) : null;

    return { items, nextCursor };
  }

  async runCounterfactual(
    userId: string,
    input: CounterfactualInput,
  ): Promise<CounterfactualResult | null> {
    const baseId = input.decisionId ?? (await this.getLatestDecisionId(userId));
    if (!baseId) return null;

    const decision = await this.findDecisionForUser(baseId, userId);
    if (!decision) return null;

    const { record } = decision;

    const baseState = await this.getUserState(userId, record.timestamp);
    if (!baseState) return null;

    const counterfactualState = {
      attention: input.overrides?.attention ?? baseState.attention,
      fatigue: input.overrides?.fatigue ?? baseState.fatigue,
      motivation: input.overrides?.motivation ?? baseState.motivation,
    };

    const recentAccuracy = input.overrides?.recentAccuracy ?? 0.7;

    const basePrediction = this.simulateDecision(baseState, recentAccuracy);
    const cfPrediction = this.simulateDecision(counterfactualState, recentAccuracy);

    const prediction = {
      wouldTriggerAdjustment: cfPrediction.wouldTrigger,
      suggestedDifficulty: cfPrediction.suggestedDifficulty,
      estimatedAccuracyChange: cfPrediction.estimatedAccuracy - basePrediction.estimatedAccuracy,
    };

    const explanation = this.generateCounterfactualExplanation(
      baseState,
      counterfactualState,
      basePrediction,
      cfPrediction,
    );

    return {
      baseDecisionId: baseId,
      baseState,
      counterfactualState,
      prediction,
      explanation,
    };
  }

  private simulateDecision(
    state: { attention?: number; fatigue?: number; motivation?: number },
    recentAccuracy: number,
  ) {
    const fatigue = state.fatigue ?? 0;
    const attention = state.attention ?? 0.7;

    const wouldTrigger = fatigue > 0.8 || recentAccuracy < 0.3;
    const suggestedDifficulty =
      fatigue > 0.8 || recentAccuracy < 0.3
        ? 'easier'
        : recentAccuracy > 0.9 && attention > 0.8
          ? 'harder'
          : undefined;

    const estimatedAccuracy = recentAccuracy * (1 - fatigue * 0.3) * (0.7 + attention * 0.3);

    return {
      wouldTrigger,
      suggestedDifficulty: suggestedDifficulty as 'easier' | 'harder' | undefined,
      estimatedAccuracy: Math.max(0, Math.min(1, estimatedAccuracy)),
    };
  }

  private generateCounterfactualExplanation(
    baseState: UserStateSnapshot,
    cfState: UserStateSnapshot,
    basePred: SimulationResult,
    cfPred: SimulationResult,
  ): string {
    const parts: string[] = [];

    const baseFatigue = baseState.fatigue ?? 0;
    const cfFatigue = cfState.fatigue ?? 0;
    const baseAttention = baseState.attention ?? 0;
    const cfAttention = cfState.attention ?? 0;
    const baseMotivation = baseState.motivation ?? 0;
    const cfMotivation = cfState.motivation ?? 0;

    if (cfFatigue !== baseFatigue) {
      const change = cfFatigue > baseFatigue ? '增加' : '减少';
      parts.push(`疲劳度${change}${Math.abs((cfFatigue - baseFatigue) * 100).toFixed(0)}%`);
    }

    if (cfAttention !== baseAttention) {
      const change = cfAttention > baseAttention ? '增加' : '减少';
      parts.push(`注意力${change}${Math.abs((cfAttention - baseAttention) * 100).toFixed(0)}%`);
    }

    if (cfMotivation !== baseMotivation) {
      const change = cfMotivation > baseMotivation ? '增加' : '减少';
      parts.push(`动机${change}${Math.abs((cfMotivation - baseMotivation) * 100).toFixed(0)}%`);
    }

    let explanation = `假设${parts.join('、')}，`;

    if (cfPred.wouldTrigger && !basePred.wouldTrigger) {
      explanation += `系统会触发难度调整（${cfPred.suggestedDifficulty === 'easier' ? '降低' : '提高'}难度）`;
    } else if (!cfPred.wouldTrigger && basePred.wouldTrigger) {
      explanation += '系统不会触发难度调整';
    } else {
      explanation += '触发行为不变';
    }

    const accChange = (cfPred.estimatedAccuracy - basePred.estimatedAccuracy) * 100;
    if (Math.abs(accChange) > 1) {
      explanation += `，预计准确率${accChange > 0 ? '提升' : '下降'}${Math.abs(accChange).toFixed(1)}%`;
    }

    return explanation;
  }
}

export const explainabilityService = new ExplainabilityService();
export default explainabilityService;
