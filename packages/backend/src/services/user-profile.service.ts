/**
 * 用户画像服务
 *
 * 职责：统一管理用户画像数据，整合多个分散的服务
 * - 基础用户信息管理（来自 user.service.ts）
 * - 学习习惯画像（来自 habit-profile.service.ts）
 * - 认知画像（来自 cognitive-profiling.service.ts）
 * - 学习档案（UserLearningProfile）
 *
 * 事件发布：
 * - USER_STATE_UPDATED: 用户画像更新事件（通过事件总线）
 */

import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { serviceLogger } from '../logger';
import { Prisma } from '@prisma/client';
import {
  HabitRecognizer,
  HabitProfile,
  type ChronotypeProfile,
  type LearningStyleProfile,
} from '../amas/models/cognitive';
import { getEventBus, type ProfileUpdatedPayload } from '../core/event-bus';
import decisionEventsService from './decision-events.service';
import { amasService } from './amas.service';
import {
  getChronotypeProfile,
  getLearningStyleProfile,
  invalidateCognitiveCacheForUser,
  InsufficientDataError,
} from './cognitive-profiling.service';

export {
  MIN_PROFILING_RECORDS,
  CACHE_TTL_MS,
  InsufficientDataError,
  AnalysisError,
} from './cognitive-profiling.service';

const logger = serviceLogger.child({ module: 'user-profile-service' });

// ==================== 习惯识别器管理 ====================

// 用户习惯识别器实例缓存 (内存中保持状态累积)
// 注意：这是进程内缓存，需做回收以避免长期运行导致内存增长
type RecognizerCacheEntry = {
  recognizer: HabitRecognizer;
  lastAccessAt: number;
};

const userRecognizers = new Map<string, RecognizerCacheEntry>();
const RECOGNIZER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h 未访问则回收
const RECOGNIZER_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1h 清理一次
const RECOGNIZER_CACHE_MAX_SIZE = 5000;

function cleanupRecognizerCache(): void {
  const now = Date.now();
  for (const [userId, entry] of userRecognizers.entries()) {
    if (now - entry.lastAccessAt > RECOGNIZER_CACHE_TTL_MS) {
      userRecognizers.delete(userId);
    }
  }

  if (userRecognizers.size <= RECOGNIZER_CACHE_MAX_SIZE) {
    return;
  }

  // 超过上限时，按最久未访问淘汰（简单实现，避免引入复杂 LRU 结构）
  const entries = Array.from(userRecognizers.entries()).sort(
    (a, b) => a[1].lastAccessAt - b[1].lastAccessAt,
  );
  const overflow = userRecognizers.size - RECOGNIZER_CACHE_MAX_SIZE;
  for (let i = 0; i < overflow; i++) {
    userRecognizers.delete(entries[i][0]);
  }
}

const recognizerCleanupTimer = setInterval(
  () => cleanupRecognizerCache(),
  RECOGNIZER_CACHE_CLEANUP_INTERVAL_MS,
);
recognizerCleanupTimer.unref();

/**
 * 获取用户专属的习惯识别器实例
 */
function getRecognizer(userId: string): HabitRecognizer {
  const now = Date.now();
  const existing = userRecognizers.get(userId);
  if (existing) {
    existing.lastAccessAt = now;
    return existing.recognizer;
  }

  const recognizer = new HabitRecognizer();
  userRecognizers.set(userId, { recognizer, lastAccessAt: now });
  if (userRecognizers.size > RECOGNIZER_CACHE_MAX_SIZE) {
    cleanupRecognizerCache();
  }
  return recognizer;
}

function setRecognizer(userId: string, recognizer: HabitRecognizer): void {
  userRecognizers.set(userId, { recognizer, lastAccessAt: Date.now() });
  if (userRecognizers.size > RECOGNIZER_CACHE_MAX_SIZE) {
    cleanupRecognizerCache();
  }
}

function isNumberArray24(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 24 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

function computePreferredSlots(timePref: number[], topK: number = 3): number[] {
  const indexed = timePref.map((v, hour) => ({ hour, v })).sort((a, b) => b.v - a.v);
  return indexed.slice(0, topK).map((x) => x.hour);
}

async function loadPersistedHabitProfile(userId: string): Promise<HabitProfile | null> {
  const record = await prisma.habitProfile.findUnique({
    where: { userId },
    select: { timePref: true, rhythmPref: true, updatedAt: true },
  });

  if (!record) return null;

  const timePref = record.timePref;
  const rhythmPref = record.rhythmPref as
    | { sessionMedianMinutes?: unknown; batchMedian?: unknown }
    | null
    | undefined;

  if (!isNumberArray24(timePref)) {
    return null;
  }

  const sessionMedianMinutes =
    rhythmPref &&
    typeof rhythmPref.sessionMedianMinutes === 'number' &&
    Number.isFinite(rhythmPref.sessionMedianMinutes)
      ? rhythmPref.sessionMedianMinutes
      : 15;
  const batchMedian =
    rhythmPref &&
    typeof rhythmPref.batchMedian === 'number' &&
    Number.isFinite(rhythmPref.batchMedian)
      ? rhythmPref.batchMedian
      : 8;

  return {
    timePref,
    rhythmPref: { sessionMedianMinutes, batchMedian },
    preferredTimeSlots: computePreferredSlots(timePref),
    // samples 无法从持久化记录精确恢复，这里给出“可展示”的最小兼容值
    samples: { timeEvents: 10, sessions: 0, batches: 0 },
  };
}

// ==================== 常量定义 ====================

const SALT_ROUNDS = 10;

// ==================== 类型定义 ====================

/**
 * 更新密码参数
 */
export interface UpdatePasswordDto {
  oldPassword: string;
  newPassword: string;
}

/**
 * 用户统计信息
 */
export interface UserStatistics {
  totalWords: number;
  totalRecords: number;
  correctCount: number;
  accuracy: number;
}

/**
 * 完整用户画像
 */
export interface UserProfile {
  /** 用户基础信息 */
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
    rewardProfile: string;
    createdAt: Date;
    updatedAt: Date;
  };
  /** 学习习惯画像 */
  habitProfile: HabitProfile | null;
  /** 认知画像 */
  cognitiveProfile: {
    chronotype: ChronotypeProfile | null;
    learningStyle: LearningStyleProfile | null;
  };
  /** 学习档案 */
  learningProfile: {
    id: string;
    theta: number;
    thetaVariance: number;
    attention: number;
    fatigue: number;
    motivation: number;
    emotionBaseline: string;
    lastReportedEmotion: string | null;
    flowScore: number;
    flowBaseline: number;
    activePolicyVersion: string;
    forgettingParams: any;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

/**
 * 习惯画像更新参数
 */
export interface UpdateHabitProfileParams {
  /** 时间偏好（24小时直方图） */
  timePref?: number[];
  /** 节奏偏好 */
  rhythmPref?: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
}

/**
 * 学习档案更新参数
 */
export interface UpdateLearningProfileParams {
  theta?: number;
  thetaVariance?: number;
  attention?: number;
  fatigue?: number;
  motivation?: number;
  emotionBaseline?: string;
  lastReportedEmotion?: string | null;
  flowScore?: number;
  flowBaseline?: number;
  activePolicyVersion?: string;
  forgettingParams?: any;
}

// ==================== 服务实现 ====================

class UserProfileService {
  // ==================== 用户基础信息管理（来自 user.service.ts）====================

  /**
   * 根据用户ID获取用户信息
   *
   * @param userId - 用户ID
   * @param options - 选项
   * @returns 用户信息
   */
  async getUserById(userId: string, options?: { throwIfMissing?: boolean }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        rewardProfile: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user && options?.throwIfMissing) {
      throw new Error('用户不存在');
    }

    return user;
  }

  /**
   * 更新用户密码
   *
   * @param userId - 用户ID
   * @param data - 密码更新数据
   */
  async updatePassword(userId: string, data: UpdatePasswordDto) {
    // 获取用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(data.oldPassword, user.passwordHash);

    if (!isOldPasswordValid) {
      throw new Error('旧密码不正确');
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);

    // 更新密码
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // 使所有旧会话失效
    await prisma.session.deleteMany({
      where: { userId },
    });

    logger.info({ userId }, '用户密码已更新');
  }

  /**
   * 获取用户学习统计信息
   *
   * @param userId - 用户ID
   * @returns 用户统计信息
   */
  async getUserStatistics(userId: string): Promise<UserStatistics> {
    // 获取用户可访问的所有词书（系统词库 + 用户自己的词库）
    const userWordBooks = await prisma.wordBook.findMany({
      where: {
        OR: [{ type: 'SYSTEM' }, { type: 'USER', userId: userId }],
      },
      select: { id: true },
    });

    const wordBookIds = userWordBooks.map((wb) => wb.id);

    const [totalWords, totalRecords, correctRecords] = await Promise.all([
      prisma.word.count({
        where: {
          wordBookId: {
            in: wordBookIds,
          },
        },
      }),
      prisma.answerRecord.count({ where: { userId } }),
      prisma.answerRecord.count({ where: { userId, isCorrect: true } }),
    ]);

    const accuracy = totalRecords > 0 ? (correctRecords / totalRecords) * 100 : 0;

    return {
      totalWords,
      totalRecords,
      correctCount: correctRecords,
      accuracy: Math.round(accuracy * 100) / 100,
    };
  }

  /**
   * 更新用户基本信息（兼容测试）
   *
   * @param userId - 用户ID
   * @param data - 更新数据
   * @returns 更新后的用户信息
   */
  async updateUser(userId: string, data: Partial<{ username: string; email: string }>) {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    logger.info({ userId, fields: Object.keys(data) }, '用户信息已更新');

    return user;
  }

  /**
   * 用户数据统计（简版，兼容测试）
   *
   * @param userId - 用户ID
   * @returns 统计数据
   */
  async getUserStats(userId: string) {
    const repo: any =
      (prisma as any).learningRecord ?? (prisma as any).answerRecord ?? prisma.answerRecord;
    const totalRecords = await repo.count({ where: { userId } });
    const aggregate = await repo.aggregate({
      where: { userId },
      _avg: { responseTime: true },
    });

    return {
      totalRecords,
      avgResponseTime: aggregate?._avg?.responseTime ?? null,
    };
  }

  /**
   * 更新用户奖励配置（学习模式）
   *
   * @param userId - 用户ID
   * @param profileId - 奖励配置ID
   * @returns 更新后的用户信息
   */
  async updateRewardProfile(userId: string, profileId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { rewardProfile: profileId } as any,
    });

    // 奖励配置在 AMAS 引擎侧存在内存缓存，需手动失效以确保立即生效
    amasService.invalidateRewardProfileCache(userId);

    logger.info({ userId, profileId }, '用户奖励配置已更新');

    return user;
  }

  /**
   * 删除用户及其相关数据（兼容测试）
   *
   * 注意：会级联删除所有相关数据，包括 DecisionInsight 孤儿数据
   *
   * @param userId - 用户ID
   */
  async deleteUser(userId: string) {
    await prisma.$transaction(async (tx) => {
      // 1. 获取用户的answerRecordIds
      const answerRecords = await tx.answerRecord.findMany({
        where: { userId },
        select: { id: true },
      });
      const answerRecordIds = answerRecords.map((r) => r.id);

      // 2. 获取关联的DecisionRecord的decisionIds
      const decisionRecords = await tx.decisionRecord.findMany({
        where: { answerRecordId: { in: answerRecordIds } },
        select: { decisionId: true },
      });
      const decisionIds = decisionRecords.map((d) => d.decisionId);

      // 3. 清理DecisionInsight孤儿数据（通过decisionId关联）
      if (decisionIds.length > 0) {
        await tx.decisionInsight.deleteMany({
          where: { decisionId: { in: decisionIds } },
        });
      }

      // 4. 清理DecisionRecord（PipelineStage会通过外键级联删除）
      if (answerRecordIds.length > 0) {
        await tx.decisionRecord.deleteMany({
          where: { answerRecordId: { in: answerRecordIds } },
        });
      }

      // 5. 删除其他用户数据
      await tx.answerRecord.deleteMany({ where: { userId } });
      await tx.wordLearningState.deleteMany({ where: { userId } });
      await tx.wordScore.deleteMany({ where: { userId } });
      await tx.learningSession.deleteMany({ where: { userId } });
      await tx.habitProfile.deleteMany({ where: { userId } });
      await tx.userLearningProfile.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    logger.info({ userId }, '用户已删除');
  }

  // ==================== 用户画像管理 ====================

  /**
   * 获取完整用户画像
   *
   * @param userId - 用户ID
   * @param options - 选项
   * @returns 完整用户画像
   */
  async getUserProfile(
    userId: string,
    options?: {
      includeHabit?: boolean;
      includeCognitive?: boolean;
      includeLearning?: boolean;
    },
  ): Promise<UserProfile> {
    const { includeHabit = true, includeCognitive = true, includeLearning = true } = options || {};

    try {
      // 1. 获取用户基础信息
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          rewardProfile: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new Error(`用户不存在: ${userId}`);
      }

      // 2. 获取习惯画像（如果需要）
      let habitProfile: HabitProfile | null = null;
      if (includeHabit) {
        try {
          const realtime = getRecognizer(userId).getHabitProfile();
          if (realtime.samples.timeEvents >= 10) {
            habitProfile = realtime;
          } else {
            habitProfile = (await loadPersistedHabitProfile(userId)) ?? realtime;
          }
        } catch (error) {
          logger.warn({ userId, error }, '获取习惯画像失败');
        }
      }

      // 3. 获取认知画像（如果需要）
      let chronotype: ChronotypeProfile | null = null;
      let learningStyle: LearningStyleProfile | null = null;
      if (includeCognitive) {
        try {
          chronotype = await getChronotypeProfile(userId);
        } catch (error) {
          if (!(error instanceof InsufficientDataError)) {
            logger.warn({ userId, error }, '获取时间节律画像失败');
          }
        }

        try {
          learningStyle = await getLearningStyleProfile(userId);
        } catch (error) {
          if (!(error instanceof InsufficientDataError)) {
            logger.warn({ userId, error }, '获取学习风格画像失败');
          }
        }
      }

      // 4. 获取学习档案（如果需要）
      let learningProfile = null;
      if (includeLearning) {
        learningProfile = await prisma.userLearningProfile.findUnique({
          where: { userId },
        });

        // 如果不存在，创建默认学习档案
        if (!learningProfile) {
          learningProfile = await this.createDefaultLearningProfile(userId);
        }
      }

      return {
        user,
        habitProfile,
        cognitiveProfile: {
          chronotype,
          learningStyle,
        },
        learningProfile,
      };
    } catch (error) {
      logger.error({ userId, error }, '获取用户画像失败');
      throw error;
    }
  }

  /**
   * 更新学习习惯画像
   *
   * @param userId - 用户ID
   * @param params - 更新参数
   * @returns 更新后的习惯画像
   */
  async updateHabitProfile(
    userId: string,
    params?: UpdateHabitProfileParams,
  ): Promise<HabitProfile> {
    try {
      // 如果没有提供参数，从历史记录中更新
      if (!params) {
        await this.updateHabitProfileFromHistory(userId);
      } else {
        // 直接更新数据库（保持 habit_profiles.timePref 为 24 长度数组，避免数据形态漂移）
        if (params.timePref && !isNumberArray24(params.timePref)) {
          throw new Error('timePref 必须为长度为 24 的 number[]');
        }

        const updateData: Prisma.HabitProfileUpdateInput = {
          updatedAt: new Date(),
          ...(params.timePref
            ? { timePref: params.timePref as unknown as Prisma.InputJsonValue }
            : {}),
          ...(params.rhythmPref
            ? { rhythmPref: params.rhythmPref as unknown as Prisma.InputJsonValue }
            : {}),
        };

        const createData: Prisma.HabitProfileCreateInput = {
          user: { connect: { id: userId } },
          timePref: (params.timePref
            ? (params.timePref as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          rhythmPref: (params.rhythmPref
            ? (params.rhythmPref as unknown as Prisma.InputJsonValue)
            : ({} as unknown as Prisma.InputJsonValue)) as unknown as Prisma.InputJsonValue,
        };

        await prisma.habitProfile.upsert({
          where: { userId },
          update: updateData,
          create: createData,
        });

        // 让内存识别器失效，下一次读取会回退到持久化画像
        this.resetUserHabit(userId);
      }

      // 持久化内存中的习惯画像（无 params 情况：已从历史重建内存识别器）
      if (!params) {
        await this.persistHabitProfile(userId);
      }

      // 获取最新的习惯画像
      const habitProfile =
        (await loadPersistedHabitProfile(userId)) ?? getRecognizer(userId).getHabitProfile();

      // 发布画像更新事件
      this.publishProfileUpdatedEvent(userId, 'habit', ['timePref', 'rhythmPref']);

      logger.info({ userId }, '学习习惯画像已更新');

      return habitProfile;
    } catch (error) {
      logger.error({ userId, error }, '更新学习习惯画像失败');
      throw error;
    }
  }

  /**
   * 获取认知画像（包括时间节律和学习风格）
   *
   * @param userId - 用户ID
   * @returns 认知画像
   */
  async getCognitiveProfile(userId: string): Promise<{
    chronotype: ChronotypeProfile | null;
    learningStyle: LearningStyleProfile | null;
  }> {
    let chronotype: ChronotypeProfile | null = null;
    let learningStyle: LearningStyleProfile | null = null;

    try {
      chronotype = await getChronotypeProfile(userId);
    } catch (error) {
      if (error instanceof InsufficientDataError) {
        logger.info(
          { userId, required: error.required, actual: error.actual },
          '时间节律画像数据不足',
        );
      } else {
        logger.warn({ userId, error }, '获取时间节律画像失败');
      }
    }

    try {
      learningStyle = await getLearningStyleProfile(userId);
    } catch (error) {
      if (error instanceof InsufficientDataError) {
        logger.info(
          { userId, required: error.required, actual: error.actual },
          '学习风格画像数据不足',
        );
      } else {
        logger.warn({ userId, error }, '获取学习风格画像失败');
      }
    }

    return {
      chronotype,
      learningStyle,
    };
  }

  /**
   * 使认知画像缓存失效
   *
   * @param userId - 用户ID
   */
  invalidateCognitiveCache(userId: string): void {
    invalidateCognitiveCacheForUser(userId);
    logger.debug({ userId }, '认知画像缓存已失效');
  }

  /**
   * 获取学习档案（UserLearningProfile）
   *
   * @param userId - 用户ID
   * @returns 学习档案
   */
  async getUserLearningProfile(userId: string) {
    let profile = await prisma.userLearningProfile.findUnique({
      where: { userId },
    });

    // 如果不存在，创建默认档案
    if (!profile) {
      profile = await this.createDefaultLearningProfile(userId);
    }

    return profile;
  }

  /**
   * 更新学习档案
   *
   * @param userId - 用户ID
   * @param params - 更新参数
   * @returns 更新后的学习档案
   */
  async updateUserLearningProfile(userId: string, params: UpdateLearningProfileParams) {
    try {
      const profile = await prisma.userLearningProfile.upsert({
        where: { userId },
        update: {
          ...params,
          updatedAt: new Date(),
        },
        create: {
          userId,
          theta: params.theta ?? 0,
          thetaVariance: params.thetaVariance ?? 1,
          attention: params.attention ?? 0.7,
          fatigue: params.fatigue ?? 0,
          motivation: params.motivation ?? 0.5,
          emotionBaseline: params.emotionBaseline ?? 'neutral',
          lastReportedEmotion: params.lastReportedEmotion ?? null,
          flowScore: params.flowScore ?? 0,
          flowBaseline: params.flowBaseline ?? 0.5,
          activePolicyVersion: params.activePolicyVersion ?? 'v1',
          forgettingParams: params.forgettingParams ?? {},
        },
      });

      // 发布画像更新事件
      this.publishProfileUpdatedEvent(userId, 'learning', Object.keys(params));

      logger.info({ userId }, '学习档案已更新');

      return profile;
    } catch (error) {
      logger.error({ userId, error }, '更新学习档案失败');
      throw error;
    }
  }

  /**
   * 记录学习时间事件（用于习惯画像）
   *
   * @param userId - 用户ID
   * @param timestamp - 时间戳（可选，默认为当前时间）
   */
  recordTimeEvent(userId: string, timestamp?: number): void {
    const hour = new Date(timestamp || Date.now()).getHours();
    const recognizer = getRecognizer(userId);
    recognizer.updateTimePref(hour);
  }

  /**
   * 记录会话结束（用于习惯画像）
   *
   * @param userId - 用户ID
   * @param sessionDurationMinutes - 会话时长（分钟）
   * @param wordCount - 学习单词数
   */
  recordSessionEnd(userId: string, sessionDurationMinutes: number, wordCount: number): void {
    const recognizer = getRecognizer(userId);
    recognizer.updateSessionDuration(sessionDurationMinutes);
    recognizer.updateBatchSize(wordCount);
  }

  /**
   * 从历史记录初始化习惯识别器
   *
   * @param userId - 用户ID
   */
  async initializeHabitFromHistory(userId: string): Promise<void> {
    try {
      // 获取用户最近的答题记录（最多1000条）
      const records = await prisma.answerRecord.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 1000,
        select: {
          timestamp: true,
          sessionId: true,
        },
      });

      if (records.length === 0) return;

      const recognizer = getRecognizer(userId);

      // 按时间正序处理
      const sortedRecords = records.reverse();

      // 更新时间偏好
      for (const record of sortedRecords) {
        const hour = new Date(record.timestamp).getHours();
        recognizer.updateTimePref(hour);
      }

      // 计算会话统计
      const sessionGroups = new Map<string, Date[]>();
      for (const record of sortedRecords) {
        if (record.sessionId) {
          if (!sessionGroups.has(record.sessionId)) {
            sessionGroups.set(record.sessionId, []);
          }
          sessionGroups.get(record.sessionId)!.push(record.timestamp);
        }
      }

      // 更新会话时长和批量大小
      for (const [, timestamps] of sessionGroups) {
        if (timestamps.length >= 2) {
          const startTs =
            timestamps[0] instanceof Date
              ? timestamps[0].getTime()
              : new Date(timestamps[0]).getTime();
          const endTs =
            timestamps[timestamps.length - 1] instanceof Date
              ? timestamps[timestamps.length - 1].getTime()
              : new Date(timestamps[timestamps.length - 1]).getTime();
          const durationMinutes = (endTs - startTs) / 60000;
          if (durationMinutes > 0 && durationMinutes < 180) {
            recognizer.updateSessionDuration(durationMinutes);
          }
        }
        recognizer.updateBatchSize(timestamps.length);
      }

      logger.info(
        { userId, recordCount: records.length, sessionCount: sessionGroups.size },
        '从历史记录初始化习惯画像完成',
      );
    } catch (error) {
      logger.error({ userId, error }, '习惯画像初始化失败');
    }
  }

  /**
   * 获取习惯画像
   *
   * @param userId - 用户ID
   * @returns 习惯画像
   */
  getHabitProfile(userId: string): HabitProfile {
    return getRecognizer(userId).getHabitProfile();
  }

  /**
   * 重置用户习惯识别器
   *
   * @param userId - 用户ID
   */
  resetUserHabit(userId: string): void {
    userRecognizers.delete(userId);
  }

  // ==================== 私有方法 ====================

  /**
   * 创建默认学习档案
   *
   * @param userId - 用户ID
   * @returns 创建的学习档案
   */
  private async createDefaultLearningProfile(userId: string) {
    logger.info({ userId }, '创建默认学习档案');

    return prisma.userLearningProfile.create({
      data: {
        userId,
        theta: 0,
        thetaVariance: 1,
        attention: 0.7,
        fatigue: 0,
        motivation: 0.5,
        emotionBaseline: 'neutral',
        lastReportedEmotion: null,
        flowScore: 0,
        flowBaseline: 0.5,
        activePolicyVersion: 'v1',
        forgettingParams: {},
      },
    });
  }

  /**
   * 持久化习惯画像到数据库
   * @param userId - 用户ID
   * @returns 是否成功保存
   */
  async persistHabitProfile(userId: string): Promise<boolean> {
    try {
      const recognizer = getRecognizer(userId);
      const profile = recognizer.getHabitProfile();

      // 只有当样本数足够时才持久化
      if (profile.samples.timeEvents < 10) {
        logger.info(
          { userId, timeEvents: profile.samples.timeEvents },
          '习惯画像样本不足，跳过持久化',
        );
        return false;
      }

      await prisma.habitProfile.upsert({
        where: { userId },
        update: {
          timePref: profile.timePref,
          rhythmPref: profile.rhythmPref,
          updatedAt: new Date(),
        },
        create: {
          userId,
          timePref: profile.timePref,
          rhythmPref: profile.rhythmPref,
        },
      });

      logger.info(
        {
          userId,
          timeEvents: profile.samples.timeEvents,
          preferredSlots: profile.preferredTimeSlots.join(','),
        },
        '习惯画像已持久化',
      );
      return true;
    } catch (error) {
      logger.error({ userId, error }, '习惯画像持久化失败');
      return false;
    }
  }

  /**
   * 基于会话数据更新习惯画像（从历史记录）
   */
  private async updateHabitProfileFromHistory(userId: string) {
    const sessions =
      (await prisma.learningSession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: 200,
        include: {
          _count: { select: { answerRecords: true } },
        },
      })) ?? [];

    if (!sessions.length) {
      return;
    }

    // 从会话数据重建用户习惯识别器（避免写入错误形态的 timePref）
    const recognizer = new HabitRecognizer();
    for (const session of sessions) {
      const hour = session.startedAt.getHours();
      recognizer.updateTimePref(hour);

      if (session.endedAt) {
        const durationMinutes = (session.endedAt.getTime() - session.startedAt.getTime()) / 60000;
        if (durationMinutes > 0 && durationMinutes < 180) {
          recognizer.updateSessionDuration(durationMinutes);
        }
      }

      const batchSize = session._count?.answerRecords ?? 0;
      if (batchSize > 0) {
        recognizer.updateBatchSize(batchSize);
      }
    }

    setRecognizer(userId, recognizer);
  }

  /**
   * 发布画像更新事件
   *
   * @param userId - 用户ID
   * @param profileType - 画像类型
   * @param updatedFields - 更新的字段列表
   */
  private publishProfileUpdatedEvent(
    userId: string,
    profileType: 'habit' | 'cognitive' | 'learning' | 'full',
    updatedFields: string[],
  ): void {
    try {
      const eventBus = getEventBus(decisionEventsService);

      const payload: ProfileUpdatedPayload = {
        userId,
        profileType,
        updatedFields,
        timestamp: new Date(),
      };

      void eventBus.publish({ type: 'PROFILE_UPDATED', payload }).catch((error) => {
        logger.error({ userId, err: error }, '发布画像更新事件失败');
      });

      logger.debug({ userId, profileType, updatedFields }, '画像更新事件已发布');
    } catch (error) {
      logger.error({ userId, error }, '发布画像更新事件失败');
      // 不抛出错误，避免影响主流程
    }
  }
}

// ==================== 导出 ====================

export type { ProfileUpdatedPayload } from '../core/event-bus';

export const userProfileService = new UserProfileService();
export default userProfileService;
