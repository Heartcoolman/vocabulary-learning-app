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
import { HabitRecognizer, HabitProfile } from '../amas/models/cognitive';
import { ChronotypeDetector, ChronotypeProfile } from '../amas/models/cognitive';
import { LearningStyleProfiler, LearningStyleProfile } from '../amas/models/cognitive';
import { getEventBus, type ProfileUpdatedPayload } from '../core/event-bus';
import decisionEventsService from './decision-events.service';

const logger = serviceLogger.child({ module: 'user-profile-service' });

// ==================== 错误类型定义 ====================

export const MIN_PROFILING_RECORDS = 20;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h cache

/**
 * 数据不足错误
 */
export class InsufficientDataError extends Error {
  code = 'INSUFFICIENT_DATA';
  required: number;
  actual: number;
  constructor(required: number, actual: number) {
    super(`Insufficient data to build profile (need ${required}, have ${actual})`);
    this.required = required;
    this.actual = actual;
  }
}

/**
 * 分析错误
 */
export class AnalysisError extends Error {
  code = 'ANALYSIS_FAILED';
}

// ==================== 习惯识别器管理 ====================

// 用户习惯识别器实例缓存 (内存中保持状态累积)
const userRecognizers = new Map<string, HabitRecognizer>();

/**
 * 获取用户专属的习惯识别器实例
 */
function getRecognizer(userId: string): HabitRecognizer {
  let recognizer = userRecognizers.get(userId);
  if (!recognizer) {
    recognizer = new HabitRecognizer();
    userRecognizers.set(userId, recognizer);
  }
  return recognizer;
}

// ==================== 认知画像分析器 ====================

type CacheEntry<T> = { value: T; expiresAt: number };

// 延迟实例化：只在首次使用时创建实例，便于测试 mock
let chronotypeDetector: ChronotypeDetector | null = null;
let learningStyleProfiler: LearningStyleProfiler | null = null;

const getChronotypeDetector = (): ChronotypeDetector => {
  if (!chronotypeDetector) {
    chronotypeDetector = new ChronotypeDetector();
  }
  return chronotypeDetector;
};

const getLearningStyleProfiler = (): LearningStyleProfiler => {
  if (!learningStyleProfiler) {
    learningStyleProfiler = new LearningStyleProfiler();
  }
  return learningStyleProfiler;
};

const chronotypeCache = new Map<string, CacheEntry<ChronotypeProfile>>();
const learningStyleCache = new Map<string, CacheEntry<LearningStyleProfile>>();

const fromCache = <T>(cache: Map<string, CacheEntry<T>>, userId: string) => {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.value;
};

const saveCache = <T>(cache: Map<string, CacheEntry<T>>, userId: string, value: T) => {
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

const ensureSufficientData = (sampleCount?: number) => {
  if (typeof sampleCount === 'number' && sampleCount < MIN_PROFILING_RECORDS) {
    throw new InsufficientDataError(MIN_PROFILING_RECORDS, sampleCount);
  }
};

const getChronotypeProfile = async (userId: string): Promise<ChronotypeProfile> => {
  const cached = fromCache(chronotypeCache, userId);
  if (cached) return cached;
  let result: ChronotypeProfile;
  try {
    result = await getChronotypeDetector().analyzeChronotype(userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chronotype analysis failed';
    throw new AnalysisError(message);
  }
  if (!result) throw new AnalysisError('Chronotype analysis returned empty result');
  ensureSufficientData(result.sampleCount);
  return saveCache(chronotypeCache, userId, result);
};

const getLearningStyleProfile = async (userId: string): Promise<LearningStyleProfile> => {
  const cached = fromCache(learningStyleCache, userId);
  if (cached) return cached;
  let result: LearningStyleProfile;
  try {
    result = await getLearningStyleProfiler().detectLearningStyle(userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Learning style analysis failed';
    throw new AnalysisError(message);
  }
  if (!result) throw new AnalysisError('Learning style analysis returned empty result');
  ensureSufficientData(result.sampleCount);
  return saveCache(learningStyleCache, userId, result);
};

const invalidateCognitiveCacheForUser = (userId: string) => {
  chronotypeCache.delete(userId);
  learningStyleCache.delete(userId);
};

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
          habitProfile = getRecognizer(userId).getHabitProfile();
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
        // 直接更新数据库
        const updateData: any = {};
        if (params.timePref) {
          updateData.timePref = {
            preferredTimes: params.timePref,
          };
        }
        if (params.rhythmPref) {
          updateData.rhythmPref = params.rhythmPref;
        }

        await prisma.habitProfile.upsert({
          where: { userId },
          update: {
            ...updateData,
            updatedAt: new Date(),
          },
          create: {
            userId,
            timePref: updateData.timePref || {},
            rhythmPref: updateData.rhythmPref || {},
          },
        });
      }

      // 持久化内存中的习惯画像
      await this.persistHabitProfile(userId);

      // 获取最新的习惯画像
      const habitProfile = getRecognizer(userId).getHabitProfile();

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
      })) ?? [];

    if (!sessions.length) {
      return;
    }

    // 计算首选时间段（小时）和平均时长
    const hourCounts = new Map<number, number>();
    const durations: number[] = [];

    for (const session of sessions) {
      const start = session.startedAt || new Date();
      const duration = session.endedAt
        ? new Date(session.endedAt).getTime() - new Date(start).getTime()
        : 0;

      const hour = new Date(start).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      if (duration && Number.isFinite(duration)) {
        durations.push(duration);
      }
    }

    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([hour]) => hour)
      .slice(0, 3);

    const avgSessionDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const payload = {
      preferredTimes: sortedHours,
      avgSessionDuration,
      consistency: Math.min(1, sessions.length / 30),
    };

    await prisma.habitProfile.upsert({
      where: { userId },
      update: {
        timePref: payload,
        updatedAt: new Date(),
      },
      create: {
        userId,
        timePref: payload,
        rhythmPref: {},
      },
    });
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
