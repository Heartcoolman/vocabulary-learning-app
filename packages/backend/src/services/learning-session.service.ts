/**
 * Learning Session Service
 * 学习会话服务
 *
 * 职责：
 * - 管理学习会话的完整生命周期
 * - 追踪会话进度和统计数据
 * - 集成 EventBus 发布会话事件
 * - 记录心流状态和认知负载
 */

import prisma from '../config/database';
import { getEventBus } from '../core/event-bus';
import { decisionEventsService } from './decision-events.service';
import { logger } from '../logger';
import type { SessionType } from '@prisma/client';

// ==================== 类型定义 ====================

/**
 * 会话配置
 */
export interface SessionConfig {
  sessionType?: SessionType;
  targetMasteryCount?: number;
}

/**
 * 会话进度更新
 */
export interface SessionProgress {
  totalQuestions?: number;
  actualMasteryCount?: number;
  flowPeakScore?: number;
  avgCognitiveLoad?: number;
  contextShifts?: number;
}

/**
 * 会话统计数据
 */
export interface SessionStats {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
  duration: number; // 秒
  totalQuestions: number;
  actualMasteryCount: number;
  targetMasteryCount: number | null;
  sessionType: SessionType;
  flowPeakScore: number | null;
  avgCognitiveLoad: number | null;
  contextShifts: number;
  answerRecordCount?: number;
}

/**
 * 会话详情（含答题记录）
 */
export interface SessionDetail extends SessionStats {
  answerRecords: Array<{
    id: string;
    wordId: string;
    isCorrect: boolean;
    responseTime: number | null;
    dwellTime: number | null;
    timestamp: Date;
  }>;
}

/**
 * 心流检测钩子
 */
export type FlowDetectionHook = (
  sessionId: string,
  userId: string,
  currentMetrics: {
    challengeLevel: number;
    skillLevel: number;
    concentration: number;
  },
) => Promise<number>; // 返回心流分数 0-1

/**
 * 情绪追踪钩子
 */
export type EmotionTrackingHook = (
  sessionId: string,
  userId: string,
  event: {
    type: 'answer' | 'pause' | 'resume' | 'end';
    isCorrect?: boolean;
    responseTime?: number;
  },
) => Promise<void>;

// ==================== 服务类 ====================

export class LearningSessionService {
  private flowDetectionHooks: FlowDetectionHook[] = [];
  private emotionTrackingHooks: EmotionTrackingHook[] = [];

  // ==================== 会话生命周期管理 ====================

  /**
   * 创建学习会话
   */
  async createSession(userId: string, config: SessionConfig = {}): Promise<{ sessionId: string }> {
    const { sessionType = 'NORMAL', targetMasteryCount } = config;

    logger.debug(
      {
        userId,
        sessionType,
        targetMasteryCount,
      },
      '[LearningSession] 创建会话',
    );

    // 创建会话记录
    const session = await prisma.learningSession.create({
      data: {
        userId,
        sessionType,
        targetMasteryCount,
        startedAt: new Date(),
        totalQuestions: 0,
        actualMasteryCount: 0,
        contextShifts: 0,
      },
    });

    logger.info(
      {
        sessionId: session.id,
        userId,
        sessionType,
      },
      '[LearningSession] 会话已创建',
    );

    return { sessionId: session.id };
  }

  /**
   * 启动会话（发布 SESSION_STARTED 事件）
   */
  async startSession(sessionId: string): Promise<void> {
    logger.debug({ sessionId }, '[LearningSession] 启动会话');

    // 获取会话信息
    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        sessionType: true,
        targetMasteryCount: true,
        startedAt: true,
        endedAt: true,
      },
    });

    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    if (session.endedAt) {
      throw new Error(`会话已结束: ${sessionId}`);
    }

    // 发布 SESSION_STARTED 事件
    try {
      const eventBus = getEventBus(decisionEventsService);
      await eventBus.publish({
        type: 'SESSION_STARTED',
        payload: {
          userId: session.userId,
          sessionId: session.id,
          sessionType: session.sessionType,
          targetMasteryCount: session.targetMasteryCount ?? undefined,
          startedAt: session.startedAt,
        },
      });

      logger.info(
        { sessionId, userId: session.userId },
        '[LearningSession] SESSION_STARTED 事件已发布',
      );
    } catch (error) {
      logger.error({ error, sessionId }, '[LearningSession] 发布 SESSION_STARTED 事件失败');
      // 不抛出异常，允许会话继续
    }
  }

  /**
   * 结束会话（发布 SESSION_ENDED 事件）
   */
  async endSession(sessionId: string): Promise<SessionStats> {
    logger.debug({ sessionId }, '[LearningSession] 结束会话');

    // 更新会话结束时间
    const session = await prisma.learningSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
      include: {
        answerRecords: {
          select: { id: true },
        },
      },
    });

    // 计算统计数据
    const stats = this.calculateSessionStats(session);

    // 发布 SESSION_ENDED 事件
    try {
      const eventBus = getEventBus(decisionEventsService);
      await eventBus.publish({
        type: 'SESSION_ENDED',
        payload: {
          userId: session.userId,
          sessionId: session.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt!,
          totalQuestions: session.totalQuestions ?? 0,
          actualMasteryCount: session.actualMasteryCount ?? 0,
          targetMasteryCount: session.targetMasteryCount ?? undefined,
          flowPeakScore: session.flowPeakScore ?? undefined,
          avgCognitiveLoad: session.avgCognitiveLoad ?? undefined,
        },
      });

      logger.info(
        {
          sessionId,
          userId: session.userId,
          duration: stats.duration,
          totalQuestions: stats.totalQuestions,
        },
        '[LearningSession] 会话已结束',
      );
    } catch (error) {
      logger.error({ error, sessionId }, '[LearningSession] 发布 SESSION_ENDED 事件失败');
    }

    return stats;
  }

  /**
   * 更新会话进度
   */
  async updateProgress(sessionId: string, progress: SessionProgress): Promise<void> {
    logger.debug({ sessionId, progress }, '[LearningSession] 更新进度');

    // 构建更新数据
    const updateData: Record<string, any> = {};

    if (progress.totalQuestions !== undefined) {
      updateData.totalQuestions = progress.totalQuestions;
    }
    if (progress.actualMasteryCount !== undefined) {
      updateData.actualMasteryCount = progress.actualMasteryCount;
    }
    if (progress.flowPeakScore !== undefined) {
      updateData.flowPeakScore = progress.flowPeakScore;
    }
    if (progress.avgCognitiveLoad !== undefined) {
      updateData.avgCognitiveLoad = progress.avgCognitiveLoad;
    }
    if (progress.contextShifts !== undefined) {
      updateData.contextShifts = progress.contextShifts;
    }

    // 更新数据库
    await prisma.learningSession.update({
      where: { id: sessionId },
      data: updateData,
    });

    logger.debug(
      { sessionId, updatedFields: Object.keys(updateData) },
      '[LearningSession] 进度已更新',
    );
  }

  /**
   * 获取会话统计数据
   */
  async getSessionStats(sessionId: string): Promise<SessionStats> {
    logger.debug({ sessionId }, '[LearningSession] 获取会话统计');

    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      include: {
        answerRecords: {
          select: { id: true },
        },
      },
    });

    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    return this.calculateSessionStats(session);
  }

  /**
   * 获取会话详情（含答题记录）
   */
  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    logger.debug({ sessionId }, '[LearningSession] 获取会话详情');

    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      include: {
        answerRecords: {
          select: {
            id: true,
            wordId: true,
            isCorrect: true,
            responseTime: true,
            dwellTime: true,
            timestamp: true,
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const stats = this.calculateSessionStats(session);

    return {
      ...stats,
      answerRecords: session.answerRecords,
    };
  }

  // ==================== 心流和情绪追踪 ====================

  /**
   * 注册心流检测钩子
   */
  registerFlowDetectionHook(hook: FlowDetectionHook): void {
    this.flowDetectionHooks.push(hook);
    logger.debug('[LearningSession] 已注册心流检测钩子');
  }

  /**
   * 注册情绪追踪钩子
   */
  registerEmotionTrackingHook(hook: EmotionTrackingHook): void {
    this.emotionTrackingHooks.push(hook);
    logger.debug('[LearningSession] 已注册情绪追踪钩子');
  }

  /**
   * 触发心流检测
   */
  async detectFlow(
    sessionId: string,
    userId: string,
    metrics: {
      challengeLevel: number;
      skillLevel: number;
      concentration: number;
    },
  ): Promise<number> {
    let maxFlowScore = 0;

    for (const hook of this.flowDetectionHooks) {
      try {
        const flowScore = await hook(sessionId, userId, metrics);
        maxFlowScore = Math.max(maxFlowScore, flowScore);
      } catch (error) {
        logger.error({ error, sessionId }, '[LearningSession] 心流检测钩子执行失败');
      }
    }

    // 更新会话的峰值心流分数
    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      select: { flowPeakScore: true },
    });

    if (session && (session.flowPeakScore === null || maxFlowScore > session.flowPeakScore)) {
      await this.updateProgress(sessionId, { flowPeakScore: maxFlowScore });
    }

    return maxFlowScore;
  }

  /**
   * 触发情绪追踪
   */
  async trackEmotion(
    sessionId: string,
    userId: string,
    event: {
      type: 'answer' | 'pause' | 'resume' | 'end';
      isCorrect?: boolean;
      responseTime?: number;
    },
  ): Promise<void> {
    for (const hook of this.emotionTrackingHooks) {
      try {
        await hook(sessionId, userId, event);
      } catch (error) {
        logger.error({ error, sessionId }, '[LearningSession] 情绪追踪钩子执行失败');
      }
    }
  }

  // ==================== 查询方法 ====================

  /**
   * 获取用户的活跃会话
   */
  async getActiveSession(userId: string): Promise<SessionStats | null> {
    const session = await prisma.learningSession.findFirst({
      where: {
        userId,
        endedAt: null,
      },
      orderBy: { startedAt: 'desc' },
      include: {
        answerRecords: {
          select: { id: true },
        },
      },
    });

    if (!session) {
      return null;
    }

    return this.calculateSessionStats(session);
  }

  /**
   * 获取用户的会话列表
   */
  async getUserSessions(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeActive?: boolean;
    } = {},
  ): Promise<SessionStats[]> {
    const { limit = 20, offset = 0, includeActive = false } = options;

    const sessions = await prisma.learningSession.findMany({
      where: {
        userId,
        endedAt: includeActive ? undefined : { not: null },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        answerRecords: {
          select: { id: true },
        },
      },
    });

    return sessions.map((session) => this.calculateSessionStats(session));
  }

  /**
   * 获取用户会话总数
   */
  async getUserSessionCount(userId: string, includeActive = false): Promise<number> {
    return await prisma.learningSession.count({
      where: {
        userId,
        endedAt: includeActive ? undefined : { not: null },
      },
    });
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 计算会话统计数据
   */
  private calculateSessionStats(session: {
    id: string;
    userId: string;
    startedAt: Date;
    endedAt: Date | null;
    totalQuestions: number | null;
    actualMasteryCount: number | null;
    targetMasteryCount: number | null;
    sessionType: SessionType;
    flowPeakScore: number | null;
    avgCognitiveLoad: number | null;
    contextShifts: number;
    answerRecords: Array<{ id: string }>;
  }): SessionStats {
    const now = new Date();
    const endTime = session.endedAt ?? now;
    const duration = Math.floor((endTime.getTime() - session.startedAt.getTime()) / 1000);

    return {
      id: session.id,
      userId: session.userId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      duration,
      totalQuestions: session.totalQuestions ?? 0,
      actualMasteryCount: session.actualMasteryCount ?? 0,
      targetMasteryCount: session.targetMasteryCount,
      sessionType: session.sessionType,
      flowPeakScore: session.flowPeakScore,
      avgCognitiveLoad: session.avgCognitiveLoad,
      contextShifts: session.contextShifts,
      answerRecordCount: session.answerRecords.length,
    };
  }
}

// ==================== 导出单例 ====================

export const learningSessionService = new LearningSessionService();
export default learningSessionService;
