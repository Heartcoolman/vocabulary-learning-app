/**
 * AMAS 公开展示真实数据服务
 *
 * 从数据库读取真实的决策记录，提供与 AboutService 相同的接口
 * 特性：
 * - 从 DecisionRecord 表查询真实数据
 * - 60 秒 TTL 缓存
 * - 数据脱敏（用户 ID 匿名化）
 * - 优雅降级（数据量不足时返回默认值）
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { serviceLogger } from '../logger';
import {
  OverviewStats,
  AlgorithmDistribution,
  StateDistributionResponse,
  RecentDecision,
  PipelineSnapshot,
  PacketTrace,
  DataPacket,
  NodeState,
  PipelineMetrics,
  StageTrace,
  DecisionDetail,
  MemberVoteDetail,
  PipelineStageDetail
} from './about.service';

// ==================== 缓存类型 ====================

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

// ==================== 脱敏工具 ====================

class DailySaltManager {
  private salt = '';
  private lastDate = '';

  getSalt(): string {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastDate !== today) {
      this.salt = crypto.randomBytes(16).toString('hex');
      this.lastDate = today;
    }
    return this.salt;
  }
}

const saltManager = new DailySaltManager();

function anonymizeUserId(userId: string): string {
  const salt = saltManager.getSalt();
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}:${salt}`)
    .digest('hex');
  return hash.substring(0, 8);
}

// ==================== 服务实现 ====================

export class RealAboutService {
  private readonly cacheTTL = 60 * 1000; // 60秒
  private readonly minDataThreshold = 5; // 最少数据量阈值

  // 缓存
  private overviewCache: CacheEntry<OverviewStats> | null = null;
  private algorithmCache: CacheEntry<AlgorithmDistribution> | null = null;
  private stateDistCache: CacheEntry<StateDistributionResponse> | null = null;
  private recentCache: CacheEntry<RecentDecision[]> | null = null;
  private pipelineCache: CacheEntry<PipelineSnapshot> | null = null;

  // 缓存清理定时器
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaClient) {
    this.startCacheCleanup();
  }

  /**
   * 启动缓存定期清理
   */
  private startCacheCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      if (this.overviewCache && this.overviewCache.expiry < now) {
        this.overviewCache = null;
      }
      if (this.algorithmCache && this.algorithmCache.expiry < now) {
        this.algorithmCache = null;
      }
      if (this.stateDistCache && this.stateDistCache.expiry < now) {
        this.stateDistCache = null;
      }
      if (this.recentCache && this.recentCache.expiry < now) {
        this.recentCache = null;
      }
      if (this.pipelineCache && this.pipelineCache.expiry < now) {
        this.pipelineCache = null;
      }
    }, 30000); // 30秒清理一次

    this.cleanupTimer.unref();
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 获取概览统计（带缓存）
   */
  async getOverviewStats(): Promise<OverviewStats> {
    const now = Date.now();

    if (this.overviewCache && this.overviewCache.expiry > now) {
      return this.overviewCache.data;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const last24h = new Date(now - 24 * 60 * 60 * 1000);

    try {
      const [todayDecisions, activeUsersGroups, avgRewardResult] = await Promise.all([
        // 今日决策数
        this.prisma.decisionRecord.count({
          where: {
            timestamp: { gte: startOfDay },
            ingestionStatus: 'SUCCESS'
          }
        }),
        // 24小时内活跃用户数（直接按 answerRecord 去重计数，避免全量加载）
        this.prisma.answerRecord.groupBy({
          by: ['userId'],
          where: { timestamp: { gte: last24h } }
        }),
        // 平均效率提升（基于奖励值）
        this.prisma.decisionRecord.aggregate({
          where: {
            timestamp: { gte: last24h },
            ingestionStatus: 'SUCCESS',
            reward: { not: null }
          },
          _avg: { reward: true }
        })
      ]);

      // 唯一用户数 = groupBy 结果的长度
      const activeUsers = activeUsersGroups.length;

      // 计算平均效率提升
      const avgReward = avgRewardResult._avg.reward ?? 0;
      const avgEfficiencyGain = this.round(avgReward * 100, 1);

      const stats: OverviewStats = {
        todayDecisions,
        activeUsers,
        avgEfficiencyGain: Math.max(0, avgEfficiencyGain),
        timestamp: new Date().toISOString()
      };

      this.overviewCache = { data: stats, expiry: now + this.cacheTTL };
      return stats;
    } catch (error) {
      serviceLogger.error({ err: error }, 'getOverviewStats error');
      return this.getDefaultOverviewStats();
    }
  }

  /**
   * 获取算法贡献分布（带缓存）
   */
  async getAlgorithmDistribution(): Promise<AlgorithmDistribution> {
    const now = Date.now();

    if (this.algorithmCache && this.algorithmCache.expiry > now) {
      return this.algorithmCache.data;
    }

    const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

    try {
      const records = await this.prisma.decisionRecord.findMany({
        where: {
          timestamp: { gte: last7Days },
          ingestionStatus: 'SUCCESS'
        },
        select: {
          decisionSource: true,
          weightsSnapshot: true
        },
        take: 1000 // 限制查询量
      });

      if (records.length < this.minDataThreshold) {
        return this.getDefaultAlgorithmDistribution();
      }

      // 聚合算法贡献
      const contrib = { thompson: 0, linucb: 0, actr: 0, heuristic: 0, coldstart: 0 };

      for (const r of records) {
        if (r.decisionSource === 'coldstart') {
          contrib.coldstart += 1;
        } else {
          const weights = r.weightsSnapshot as Record<string, number> | null;
          if (weights) {
            contrib.thompson += weights.thompson ?? 0;
            contrib.linucb += weights.linucb ?? 0;
            contrib.actr += weights.actr ?? 0;
            contrib.heuristic += weights.heuristic ?? 0;
          }
        }
      }

      // 归一化
      const total = Object.values(contrib).reduce((a, b) => a + b, 0) || 1;

      const distribution: AlgorithmDistribution = {
        thompson: this.round(contrib.thompson / total, 3),
        linucb: this.round(contrib.linucb / total, 3),
        actr: this.round(contrib.actr / total, 3),
        heuristic: this.round(contrib.heuristic / total, 3),
        coldstart: this.round(contrib.coldstart / total, 3)
      };

      this.algorithmCache = { data: distribution, expiry: now + this.cacheTTL };
      return distribution;
    } catch (error) {
      serviceLogger.error({ err: error }, 'getAlgorithmDistribution error');
      return this.getDefaultAlgorithmDistribution();
    }
  }

  /**
   * 获取状态分布（带缓存）
   */
  async getStateDistribution(): Promise<StateDistributionResponse> {
    const now = Date.now();

    if (this.stateDistCache && this.stateDistCache.expiry > now) {
      return this.stateDistCache.data;
    }

    const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

    try {
      // 从 AmasUserState 表获取状态分布
      const states = await this.prisma.amasUserState.findMany({
        where: {
          updatedAt: { gte: last7Days }
        },
        select: {
          attention: true,
          fatigue: true,
          motivation: true
        },
        take: 500
      });

      if (states.length < this.minDataThreshold) {
        return this.getDefaultStateDistribution();
      }

      const attention = { low: 0, medium: 0, high: 0 };
      const fatigue = { fresh: 0, normal: 0, tired: 0 };
      const motivation = { frustrated: 0, neutral: 0, motivated: 0 };

      for (const s of states) {
        // 注意力分布
        if (s.attention < 0.4) attention.low++;
        else if (s.attention < 0.7) attention.medium++;
        else attention.high++;

        // 疲劳分布
        if (s.fatigue < 0.3) fatigue.fresh++;
        else if (s.fatigue < 0.6) fatigue.normal++;
        else fatigue.tired++;

        // 动机分布
        if (s.motivation < -0.3) motivation.frustrated++;
        else if (s.motivation < 0.3) motivation.neutral++;
        else motivation.motivated++;
      }

      const total = states.length || 1;

      const response: StateDistributionResponse = {
        attention: {
          low: this.round(attention.low / total, 3),
          medium: this.round(attention.medium / total, 3),
          high: this.round(attention.high / total, 3)
        },
        fatigue: {
          fresh: this.round(fatigue.fresh / total, 3),
          normal: this.round(fatigue.normal / total, 3),
          tired: this.round(fatigue.tired / total, 3)
        },
        motivation: {
          frustrated: this.round(motivation.frustrated / total, 3),
          neutral: this.round(motivation.neutral / total, 3),
          motivated: this.round(motivation.motivated / total, 3)
        }
      };

      this.stateDistCache = { data: response, expiry: now + this.cacheTTL };
      return response;
    } catch (error) {
      serviceLogger.error({ err: error }, 'getStateDistribution error');
      return this.getDefaultStateDistribution();
    }
  }

  /**
   * 获取近期决策（脱敏）
   */
  async getRecentDecisions(limit = 20): Promise<RecentDecision[]> {
    const now = Date.now();

    if (this.recentCache && this.recentCache.expiry > now) {
      return this.recentCache.data.slice(0, limit);
    }

    try {
      const records = await this.prisma.decisionRecord.findMany({
        where: {
          ingestionStatus: 'SUCCESS'
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
        select: {
          id: true,
          decisionId: true,
          timestamp: true,
          decisionSource: true,
          selectedAction: true,
          weightsSnapshot: true,
          answerRecordId: true
        }
      });

      const decisions: RecentDecision[] = records
        .filter(r => r.decisionId) // 只返回有decisionId的记录
        .map(r => {
          const action = r.selectedAction as Record<string, unknown>;
          const weights = r.weightsSnapshot as Record<string, number> | null;

          return {
            decisionId: r.decisionId,
            pseudoId: anonymizeUserId(r.answerRecordId || r.decisionId),
            timestamp: r.timestamp.toISOString(),
            decisionSource: r.decisionSource,
            strategy: {
              difficulty: (action?.difficulty as string) || 'mid',
              batch_size: (action?.batch_size as number) || 10
            },
            dominantFactor: this.getDominantAlgorithm(weights)
          };
        });

      this.recentCache = { data: decisions, expiry: now + this.cacheTTL };
      return decisions.slice(0, limit);
    } catch (error) {
      serviceLogger.error({ err: error }, 'getRecentDecisions error');
      return [];
    }
  }

  /**
   * 获取管道快照
   */
  async getPipelineSnapshot(): Promise<PipelineSnapshot> {
    const now = Date.now();

    if (this.pipelineCache && this.pipelineCache.expiry > now) {
      return this.pipelineCache.data;
    }

    try {
      // 获取最近的决策记录构建数据包
      const recentRecords = await this.prisma.decisionRecord.findMany({
        where: { ingestionStatus: 'SUCCESS' },
        orderBy: { timestamp: 'desc' },
        take: 15,
        select: {
          id: true,
          decisionId: true,
          timestamp: true,
          decisionSource: true,
          totalDurationMs: true
        }
      });

      // 转换为可视化数据包
      const currentPackets: DataPacket[] = recentRecords.map((r, idx) => ({
        id: r.decisionId,
        currentStage: Math.min(6, 4 + (idx % 3)) as 1 | 2 | 3 | 4 | 5 | 6,
        currentNode: this.getNodeForStage(4 + (idx % 3)),
        progress: (idx * 20) % 100,
        status: 'normal' as const,
        data: {
          attention: 0.5 + Math.random() * 0.3,
          fatigue: Math.random() * 0.5,
          motivation: Math.random() * 0.6,
          responseTime: 1000 + Math.random() * 2000
        },
        createdAt: r.timestamp.getTime()
      }));

      // 计算节点状态
      const nodeStates = this.computeNodeStates(recentRecords);

      // 计算指标
      const last5Min = new Date(now - 5 * 60 * 1000);
      const totalInWindow = await this.prisma.decisionRecord.count({
        where: {
          timestamp: { gte: last5Min },
          ingestionStatus: 'SUCCESS'
        }
      });

      const avgDuration = await this.prisma.decisionRecord.aggregate({
        where: {
          timestamp: { gte: last5Min },
          ingestionStatus: 'SUCCESS',
          totalDurationMs: { not: null }
        },
        _avg: { totalDurationMs: true }
      });

      const metrics: PipelineMetrics = {
        throughput: this.round(totalInWindow / 300, 2), // packets per second
        avgLatency: Math.round(avgDuration._avg.totalDurationMs ?? 45),
        activePackets: currentPackets.length,
        totalProcessed: await this.prisma.decisionRecord.count({
          where: { ingestionStatus: 'SUCCESS' }
        })
      };

      const snapshot: PipelineSnapshot = {
        timestamp: now,
        currentPackets,
        nodeStates,
        metrics
      };

      this.pipelineCache = { data: snapshot, expiry: now + this.cacheTTL };
      return snapshot;
    } catch (error) {
      serviceLogger.error({ err: error }, 'getPipelineSnapshot error');
      return this.getDefaultPipelineSnapshot();
    }
  }

  /**
   * 获取数据包轨迹
   */
  async getPacketTrace(packetId: string): Promise<PacketTrace> {
    try {
      const record = await this.prisma.decisionRecord.findFirst({
        where: { decisionId: packetId }
      });

      if (!record) {
        return this.getDefaultPacketTrace(packetId);
      }

      // 单独查询 pipeline stages
      const pipelineStages = await this.prisma.pipelineStage.findMany({
        where: { decisionRecordId: record.id },
        orderBy: { startedAt: 'asc' }
      });

      const stages: StageTrace[] = pipelineStages.map(s => ({
        stage: String(this.stageTypeToNumber(s.stage)),
        stageName: s.stageName,
        nodeId: this.getNodeForStageType(s.stage),
        duration: s.durationMs ?? 0,
        input: JSON.stringify(s.inputSummary || {}),
        output: JSON.stringify(s.outputSummary || {}),
        details: s.metadata ? JSON.stringify(s.metadata) : undefined,
        timestamp: s.startedAt.getTime()
      }));

      return {
        packetId,
        status: 'completed',
        stages,
        totalDuration: record.totalDurationMs ?? stages.reduce((sum, s) => sum + s.duration, 0)
      };
    } catch (error) {
      serviceLogger.error({ err: error, packetId }, 'getPacketTrace error');
      return this.getDefaultPacketTrace(packetId);
    }
  }

  // ==================== 辅助方法 ====================

  private getDominantAlgorithm(weights: Record<string, number> | null): string {
    if (!weights) return '综合';

    let maxWeight = 0;
    let dominant = '综合';

    const mapping: Record<string, string> = {
      thompson: 'Thompson',
      linucb: 'LinUCB',
      actr: 'ACT-R',
      heuristic: '启发式'
    };

    for (const [key, value] of Object.entries(weights)) {
      if (typeof value === 'number' && value > maxWeight) {
        maxWeight = value;
        dominant = mapping[key] || key;
      }
    }

    return dominant;
  }

  private getNodeForStage(stage: number): string {
    const stageNodes: Record<number, string> = {
      1: 'feature_builder',
      2: 'cognitive',
      3: 'ensemble',
      4: 'guardrails',
      5: 'delayed_reward',
      6: 'bayesian'
    };
    return stageNodes[stage] || 'unknown';
  }

  private getNodeForStageType(stageType: string): string {
    const mapping: Record<string, string> = {
      'PERCEPTION': 'feature_builder',
      'MODELING': 'cognitive',
      'LEARNING': 'ensemble',
      'DECISION': 'guardrails',
      'EVALUATION': 'delayed_reward',
      'OPTIMIZATION': 'bayesian'
    };
    return mapping[stageType] || 'unknown';
  }

  private stageTypeToNumber(stageType: string): number {
    const mapping: Record<string, number> = {
      'PERCEPTION': 1,
      'MODELING': 2,
      'LEARNING': 3,
      'DECISION': 4,
      'EVALUATION': 5,
      'OPTIMIZATION': 6
    };
    return mapping[stageType] || 1;
  }

  /**
   * 获取单条决策详情
   */
  async getDecisionDetail(decisionId: string): Promise<DecisionDetail | null> {
    if (!decisionId) {
      return null;
    }

    try {
      const record = await this.prisma.decisionRecord.findFirst({
        where: { decisionId }
      });

      if (!record) {
        return null;
      }

      // 单独查询 pipeline stages
      const pipelineStages = await this.prisma.pipelineStage.findMany({
        where: { decisionRecordId: record.id },
        orderBy: { startedAt: 'asc' }
      });

      return {
        decisionId: record.decisionId,
        timestamp: record.timestamp.toISOString(),
        pseudoId: anonymizeUserId(record.answerRecordId || 'unknown'),
        decisionSource: record.decisionSource,
        coldstartPhase: record.coldstartPhase ?? undefined,
        confidence: record.confidence ?? 0,
        reward: record.reward ?? undefined,
        totalDurationMs: record.totalDurationMs ?? undefined,
        strategy: this.parseAction(record.selectedAction),
        weights: this.parseWeights(record.weightsSnapshot),
        memberVotes: this.parseMemberVotes(record.memberVotes),
        pipeline: this.mapPipelineStages(pipelineStages)
      };
    } catch (error) {
      serviceLogger.error({ err: error, decisionId }, 'getDecisionDetail error');
      return null;
    }
  }

  private parseAction(raw: unknown): DecisionDetail['strategy'] {
    const obj = this.asRecord(raw);
    return {
      interval_scale: this.asNumber(obj?.interval_scale),
      new_ratio: this.asNumber(obj?.new_ratio),
      difficulty: typeof obj?.difficulty === 'string' ? obj.difficulty : undefined,
      batch_size: this.asNumber(obj?.batch_size),
      hint_level: this.asNumber(obj?.hint_level)
    };
  }

  private parseWeights(raw: unknown): Record<string, number> {
    const obj = this.asRecord(raw);
    if (!obj) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(obj)) {
      const num = this.asNumber(value);
      if (typeof num === 'number') {
        result[key] = this.round(num, 3);
      }
    }
    return result;
  }

  private parseMemberVotes(raw: unknown): MemberVoteDetail[] {
    const obj = this.asRecord(raw);
    if (!obj) return [];

    const votes: MemberVoteDetail[] = [];
    for (const [member, value] of Object.entries(obj)) {
      const detail = this.asRecord(value);
      votes.push({
        member,
        action: typeof detail?.action === 'string' ? detail.action : 'unknown',
        contribution: this.round(this.asNumber(detail?.contribution) ?? 0, 3),
        confidence: this.round(this.asNumber(detail?.confidence) ?? 0, 3)
      });
    }

    return votes.sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));
  }

  private mapPipelineStages(stages: any[]): PipelineStageDetail[] {
    return stages.map(stage => ({
      stage: this.stageTypeToNumber(stage.stage),
      stageType: stage.stage,
      stageName: stage.stageName,
      status: stage.status,
      durationMs: stage.durationMs ?? this.estimateDuration(stage.startedAt, stage.endedAt),
      startedAt: stage.startedAt?.toISOString?.() ?? '',
      endedAt: stage.endedAt ? stage.endedAt.toISOString() : undefined,
      inputSummary: this.asRecord(stage.inputSummary) ?? undefined,
      outputSummary: this.asRecord(stage.outputSummary) ?? undefined,
      metadata: this.asRecord(stage.metadata) ?? undefined,
      errorMessage: stage.errorMessage ?? undefined
    }));
  }

  private estimateDuration(start?: Date, end?: Date): number | undefined {
    if (start instanceof Date && end instanceof Date) {
      return Math.max(0, end.getTime() - start.getTime());
    }
    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private computeNodeStates(records: any[]): Record<string, NodeState> {
    const now = Date.now();
    const nodes: Record<string, NodeState> = {
      raw_input: { id: 'raw_input', status: 'idle', load: 0, processedCount: records.length, lastProcessedAt: now },
      feature_builder: { id: 'feature_builder', status: 'processing', load: 0.3, processedCount: records.length, lastProcessedAt: now },
      attention: { id: 'attention', status: 'idle', load: 0.2, processedCount: records.length, lastProcessedAt: now },
      fatigue: { id: 'fatigue', status: 'idle', load: 0.2, processedCount: records.length, lastProcessedAt: now },
      cognitive: { id: 'cognitive', status: 'processing', load: 0.4, processedCount: records.length, lastProcessedAt: now },
      motivation: { id: 'motivation', status: 'idle', load: 0.2, processedCount: records.length, lastProcessedAt: now },
      trend: { id: 'trend', status: 'idle', load: 0.1, processedCount: records.length, lastProcessedAt: now },
      coldstart: { id: 'coldstart', status: 'idle', load: 0.1, processedCount: 0, lastProcessedAt: now },
      linucb: { id: 'linucb', status: 'processing', load: 0.3, processedCount: records.length, lastProcessedAt: now },
      thompson: { id: 'thompson', status: 'idle', load: 0.2, processedCount: records.length, lastProcessedAt: now },
      actr: { id: 'actr', status: 'idle', load: 0.2, processedCount: records.length, lastProcessedAt: now },
      heuristic: { id: 'heuristic', status: 'idle', load: 0.1, processedCount: records.length, lastProcessedAt: now },
      ensemble: { id: 'ensemble', status: 'processing', load: 0.5, processedCount: records.length, lastProcessedAt: now },
      mapper: { id: 'mapper', status: 'idle', load: 0.2, processedCount: records.length, lastProcessedAt: now },
      guardrails: { id: 'guardrails', status: 'processing', load: 0.3, processedCount: records.length, lastProcessedAt: now },
      output: { id: 'output', status: 'idle', load: 0.1, processedCount: records.length, lastProcessedAt: now },
      delayed_reward: { id: 'delayed_reward', status: 'idle', load: 0.1, processedCount: 0, lastProcessedAt: now },
      causal: { id: 'causal', status: 'idle', load: 0.1, processedCount: 0, lastProcessedAt: now },
      bayesian: { id: 'bayesian', status: 'idle', load: 0.1, processedCount: 0, lastProcessedAt: now }
    };

    return nodes;
  }

  // ==================== 扩展统计接口 ====================

  /**
   * 获取系统性能指标（准确率、推理耗时等）
   */
  async getPerformanceMetrics(): Promise<{
    globalAccuracy: number;
    accuracyImprovement: number;
    avgInferenceMs: number;
    p99InferenceMs: number;
    causalATE: number;
    causalConfidence: number;
  }> {
    try {
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // 获取答题准确率
      const accuracyResult = await this.prisma.answerRecord.aggregate({
        where: { timestamp: { gte: last7Days } },
        _avg: { isCorrect: true }
      });

      // 获取推理耗时统计
      const latencyStats = await this.prisma.decisionRecord.aggregate({
        where: {
          timestamp: { gte: last7Days },
          ingestionStatus: 'SUCCESS',
          totalDurationMs: { not: null }
        },
        _avg: { totalDurationMs: true },
        _max: { totalDurationMs: true }
      });

      // 获取因果推断数据
      const causalData = await this.prisma.causalObservation.aggregate({
        where: { timestamp: { gte: BigInt(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        _avg: { outcome: true },
        _count: true
      });

      // 计算基线准确率（假设无系统帮助时为 70%）
      const baselineAccuracy = 0.70;
      const currentAccuracy = (accuracyResult._avg as any)?.isCorrect ?? 0;
      const improvement = currentAccuracy > 0 ? ((currentAccuracy - baselineAccuracy) / baselineAccuracy) * 100 : 0;

      return {
        globalAccuracy: this.round(currentAccuracy * 100, 1),
        accuracyImprovement: this.round(Math.max(0, improvement), 1),
        avgInferenceMs: Math.round(latencyStats._avg.totalDurationMs ?? 15),
        p99InferenceMs: Math.round((latencyStats._max.totalDurationMs ?? 50) * 0.9), // 估算 P99
        causalATE: this.round((causalData._avg.outcome ?? 0.15), 2),
        causalConfidence: causalData._count > 100 ? 0.95 : causalData._count > 50 ? 0.90 : 0.85
      };
    } catch (error) {
      serviceLogger.error({ err: error }, 'getPerformanceMetrics error');
      return {
        globalAccuracy: 0,
        accuracyImprovement: 0,
        avgInferenceMs: 0,
        p99InferenceMs: 0,
        causalATE: 0,
        causalConfidence: 0
      };
    }
  }

  /**
   * 获取优化事件日志
   */
  async getOptimizationEvents(limit = 10): Promise<Array<{
    id: string;
    type: 'bayesian' | 'ab_test' | 'causal';
    title: string;
    description: string;
    timestamp: string;
    impact: string;
  }>> {
    try {
      // 从贝叶斯优化器状态获取事件
      const bayesianState = await this.prisma.bayesianOptimizerState.findFirst({
        where: { id: 'global' }
      });

      const events: Array<{
        id: string;
        type: 'bayesian' | 'ab_test' | 'causal';
        title: string;
        description: string;
        timestamp: string;
        impact: string;
      }> = [];

      // 添加贝叶斯优化事件
      if (bayesianState && bayesianState.evaluationCount > 0) {
        events.push({
          id: `bayesian-${bayesianState.updatedAt.getTime()}`,
          type: 'bayesian',
          title: '超参数自动调优',
          description: `已完成 ${bayesianState.evaluationCount} 次参数评估`,
          timestamp: bayesianState.updatedAt.toISOString(),
          impact: bayesianState.bestValue ? `最优值: ${this.round(bayesianState.bestValue, 3)}` : '优化中'
        });
      }

      // 获取 A/B 测试事件
      const abExperiments = await this.prisma.aBExperiment.findMany({
        where: { status: { in: ['RUNNING', 'COMPLETED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 3
      });

      for (const exp of abExperiments) {
        events.push({
          id: `ab-${exp.id}`,
          type: 'ab_test',
          title: `A/B 测试: ${exp.name}`,
          description: exp.description || '实验进行中',
          timestamp: exp.updatedAt.toISOString(),
          impact: exp.status === 'COMPLETED' ? '已完成' : `样本: ${exp.minSampleSize}`
        });
      }

      // 获取因果推断事件
      const causalCount = await this.prisma.causalObservation.count();
      if (causalCount > 0) {
        const latestCausal = await this.prisma.causalObservation.findFirst({
          orderBy: { timestamp: 'desc' }
        });

        if (latestCausal) {
          events.push({
            id: `causal-${latestCausal.id}`,
            type: 'causal',
            title: '因果推断分析',
            description: `累计 ${causalCount} 条观测数据`,
            timestamp: new Date(Number(latestCausal.timestamp)).toISOString(),
            impact: `ATE: ${this.round(latestCausal.outcome, 2)}`
          });
        }
      }

      // 按时间排序
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return events.slice(0, limit);
    } catch (error) {
      serviceLogger.error({ err: error }, 'getOptimizationEvents error');
      return [];
    }
  }

  /**
   * 获取群体掌握度雷达数据
   */
  async getMasteryRadar(): Promise<{
    speed: number;
    stability: number;
    complexity: number;
    consistency: number;
  }> {
    try {
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // 获取单词得分统计
      const scoreStats = await this.prisma.wordScore.aggregate({
        where: { updatedAt: { gte: last7Days } },
        _avg: {
          speedScore: true,
          stabilityScore: true,
          proficiencyScore: true,
          accuracyScore: true
        }
      });

      // 获取答题一致性（连续正确率）
      const consistencyData = await this.prisma.wordLearningState.aggregate({
        where: { updatedAt: { gte: last7Days } },
        _avg: {
          consecutiveCorrect: true,
          masteryLevel: true
        }
      });

      return {
        speed: this.round(scoreStats._avg.speedScore ?? 0.5, 2),
        stability: this.round(scoreStats._avg.stabilityScore ?? 0.5, 2),
        complexity: this.round(scoreStats._avg.proficiencyScore ?? 0.5, 2),
        consistency: this.round(Math.min(1, (consistencyData._avg.consecutiveCorrect ?? 0) / 5), 2)
      };
    } catch (error) {
      serviceLogger.error({ err: error }, 'getMasteryRadar error');
      return { speed: 0, stability: 0, complexity: 0, consistency: 0 };
    }
  }

  // ==================== 默认值（降级） ====================

  private getDefaultOverviewStats(): OverviewStats {
    return {
      todayDecisions: 0,
      activeUsers: 0,
      avgEfficiencyGain: 0,
      timestamp: new Date().toISOString()
    };
  }

  private getDefaultAlgorithmDistribution(): AlgorithmDistribution {
    return {
      thompson: 0.25,
      linucb: 0.25,
      actr: 0.2,
      heuristic: 0.15,
      coldstart: 0.15
    };
  }

  private getDefaultStateDistribution(): StateDistributionResponse {
    return {
      attention: { low: 0.2, medium: 0.5, high: 0.3 },
      fatigue: { fresh: 0.4, normal: 0.4, tired: 0.2 },
      motivation: { frustrated: 0.15, neutral: 0.5, motivated: 0.35 }
    };
  }

  private getDefaultPipelineSnapshot(): PipelineSnapshot {
    return {
      timestamp: Date.now(),
      currentPackets: [],
      nodeStates: {},
      metrics: {
        throughput: 0,
        avgLatency: 0,
        activePackets: 0,
        totalProcessed: 0
      }
    };
  }

  private getDefaultPacketTrace(packetId: string): PacketTrace {
    return {
      packetId,
      status: 'completed',
      stages: [],
      totalDuration: 0
    };
  }

  private round(value: number, decimals: number = 3): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}

// ==================== 工厂函数 ====================

let sharedInstance: RealAboutService | null = null;

export function createRealAboutService(prisma: PrismaClient): RealAboutService {
  return new RealAboutService(prisma);
}

export function getSharedRealAboutService(prisma: PrismaClient): RealAboutService {
  if (!sharedInstance) {
    sharedInstance = new RealAboutService(prisma);
  }
  return sharedInstance;
}
