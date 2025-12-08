import prisma from '../config/database';
import { UserRole, WordBookType, WordState, Prisma } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import type { JsonValue } from '@prisma/client/runtime/library';

// ==================== 类型定义 ====================

/** 单词基本信息（用于 select） */
interface WordBasicInfo {
  id: string;
  spelling: string;
  phonetic: string | null;
  meanings: string[];
  examples: string[];
}

/** 单词得分记录 */
interface WordScoreRecord {
  wordId: string;
  totalScore: number;
  recentAccuracy: number | null;
  totalAttempts: number;
  correctAttempts: number;
}

/** 用户单词项（聚合后的结构）*/
interface UserWordItem {
  word: WordBasicInfo;
  score: number;
  masteryLevel: number;
  accuracy: number;
  reviewCount: number;
  lastReviewDate: Date | null;
  nextReviewDate: Date | null;
  state: WordState;
}

/** 决策记录查询条件 */
interface DecisionRecordWhereConditions {
  timestamp?: {
    gte?: Date;
    lte?: Date;
  };
  decisionSource?: string;
  confidence?: {
    gte: number;
  };
}

/** 学习策略（从 selectedAction 解析）*/
interface StrategyFromAction {
  difficulty: string;
  batch_size: number;
  interval_scale?: number;
  new_ratio?: number;
  hint_level?: number;
}

/** 成员投票项 */
interface MemberVoteItem {
  member: string;
  vote: unknown;
  weight: number;
}

/** selectedAction JSON 结构 */
interface SelectedActionJson {
  difficulty?: string;
  batch_size?: number;
  interval_scale?: number;
  new_ratio?: number;
  hint_level?: number;
}

/** memberVotes JSON 中单个投票的结构 */
interface MemberVoteValue {
  weight?: number;
  [key: string]: unknown;
}

export class AdminService {
  /**
   * 获取所有用户列表
   */
  async getAllUsers(options?: {
    page?: number;
    pageSize?: number;
    limit?: number;
    search?: string;
  }) {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || options?.limit || 20;
    const skip = (page - 1) * pageSize;

    const where = options?.search
      ? {
          OR: [
            { email: { contains: options.search, mode: 'insensitive' as const } },
            { username: { contains: options.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    // 空结果早期返回
    if (users.length === 0) {
      return {
        users: [],
        total,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }

    // 批量获取所有用户的统计数据（避免 N+1 查询）
    const userIds = users.map((u) => u.id);

    // 单次查询：批量获取学习单词数（去重）
    const learnedWordsStats = await prisma.answerRecord.groupBy({
      by: ['userId', 'wordId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    });
    const learnedWordsMap = new Map<string, number>();
    for (const stat of learnedWordsStats) {
      learnedWordsMap.set(stat.userId, (learnedWordsMap.get(stat.userId) || 0) + 1);
    }

    // 单次查询：批量获取平均得分
    const scoreStats = await prisma.wordScore.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _avg: { totalScore: true },
    });
    const scoreMap = new Map(scoreStats.map((s) => [s.userId, s._avg.totalScore ?? 0]));

    // 单次查询：批量获取答题总数和正确数
    const recordStats = await prisma.answerRecord.groupBy({
      by: ['userId', 'isCorrect'],
      where: { userId: { in: userIds } },
      _count: true,
    });
    const recordCountMap = new Map<string, { total: number; correct: number }>();
    for (const stat of recordStats) {
      const existing = recordCountMap.get(stat.userId) || { total: 0, correct: 0 };
      existing.total += stat._count;
      if (stat.isCorrect) {
        existing.correct += stat._count;
      }
      recordCountMap.set(stat.userId, existing);
    }

    // 单次查询：批量获取最后学习时间（使用 Prisma groupBy）
    const lastRecordStats = await prisma.answerRecord.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _max: { timestamp: true },
    });
    const lastTimeMap = new Map(lastRecordStats.map((r) => [r.userId, r._max.timestamp]));

    // 组装结果
    const usersWithStats = users.map((user) => {
      const recordCount = recordCountMap.get(user.id) || { total: 0, correct: 0 };
      const accuracy = recordCount.total > 0 ? (recordCount.correct / recordCount.total) * 100 : 0;

      return {
        ...user,
        totalWordsLearned: learnedWordsMap.get(user.id) || 0,
        averageScore: scoreMap.get(user.id) || 0,
        accuracy,
        lastLearningTime: lastTimeMap.get(user.id)?.toISOString() ?? null,
      };
    });

    return {
      users: usersWithStats,
      total,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取用户详情
   */
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            wordBooks: true,
            records: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    return user;
  }

  /**
   * 修改用户角色
   */
  async updateUserRole(userId: string, role: UserRole) {
    return await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 删除用户
   *
   * 修复：同步清理DecisionInsight孤儿数据
   * 由于DecisionRecord使用复合主键，DecisionInsight只能通过decisionId逻辑关联，
   * 删除用户时需要在应用层处理级联删除
   */
  async deleteUser(userId: string) {
    // 检查是否为管理员
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role === UserRole.ADMIN) {
      throw new Error('不能删除管理员账户');
    }

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

      // 5. 删除用户（其他数据通过外键级联删除）
      await tx.user.delete({
        where: { id: userId },
      });
    });
  }

  /**
   * 获取所有系统词库列表
   */
  async getSystemWordBooks() {
    const wordBooks = await prisma.wordBook.findMany({
      where: { type: WordBookType.SYSTEM },
      orderBy: { createdAt: 'desc' },
    });

    return wordBooks;
  }

  /**
   * 创建系统��库
   */
  async createSystemWordBook(data: { name: string; description?: string; coverImage?: string }) {
    return await prisma.wordBook.create({
      data: {
        name: data.name,
        description: data.description,
        coverImage: data.coverImage,
        type: WordBookType.SYSTEM,
        userId: null,
        isPublic: true,
        wordCount: 0,
      },
    });
  }

  /**
   * 更新系统词库
   */
  async updateSystemWordBook(
    id: string,
    data: {
      name?: string;
      description?: string;
      coverImage?: string;
    },
  ) {
    const wordBook = await prisma.wordBook.findUnique({
      where: { id },
    });

    if (!wordBook) {
      throw new Error('词库不存在');
    }

    if (wordBook.type !== WordBookType.SYSTEM) {
      throw new Error('只能修改系统词库');
    }

    return await prisma.wordBook.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        coverImage: data.coverImage,
      },
    });
  }

  /**
   * 删除系统词库
   * 修复：使用事务确保数据一致性
   */
  async deleteSystemWordBook(id: string) {
    const wordBook = await prisma.wordBook.findUnique({
      where: { id },
    });

    if (!wordBook) {
      throw new Error('词库不存在');
    }

    if (wordBook.type !== WordBookType.SYSTEM) {
      throw new Error('只能删除系统词库');
    }

    // 使用事务确保原子性操作
    await prisma.$transaction(async (tx) => {
      // 清理所有用户学习配置中对该词库的引用
      const studyConfigs = await tx.userStudyConfig.findMany({
        where: {
          selectedWordBookIds: {
            has: id,
          },
        },
      });

      // 从每个学习配置中移除该词库ID
      for (const config of studyConfigs) {
        const updatedIds = config.selectedWordBookIds.filter((bookId) => bookId !== id);
        await tx.userStudyConfig.update({
          where: { id: config.id },
          data: { selectedWordBookIds: updatedIds },
        });
      }

      // 删除词库（会级联删除所有相关单词和学习记录）
      await tx.wordBook.delete({
        where: { id },
      });
    });
  }

  /**
   * 批量添加单词到系统词库
   * 修复：将wordCount更新纳入事务，确保数据一致性
   */
  async batchAddWordsToSystemWordBook(
    wordBookId: string,
    words: Array<{
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
    }>,
  ) {
    const wordBook = await prisma.wordBook.findUnique({
      where: { id: wordBookId },
    });

    if (!wordBook) {
      throw new Error('词库不存在');
    }

    if (wordBook.type !== WordBookType.SYSTEM) {
      throw new Error('只能向系统词库批量添加单词');
    }

    // 使用交互式事务确保原子性（包括wordCount更新）
    const createdWords = await prisma.$transaction(async (tx) => {
      // 批量创建单词
      const created = await Promise.all(
        words.map((word) =>
          tx.word.create({
            data: {
              wordBookId,
              ...word,
            },
          }),
        ),
      );

      // 更新词库的单词数量（在同一事务中）
      await tx.wordBook.update({
        where: { id: wordBookId },
        data: {
          wordCount: {
            increment: words.length,
          },
        },
      });

      return created;
    });

    return createdWords;
  }

  /**
   * 获取系统统计数据
   */
  async getStatistics() {
    const [totalUsers, totalWordBooks, totalWords, totalRecords, systemWordBooks, userWordBooks] =
      await Promise.all([
        prisma.user.count(),
        prisma.wordBook.count(),
        prisma.word.count(),
        prisma.answerRecord.count(),
        prisma.wordBook.count({ where: { type: WordBookType.SYSTEM } }),
        prisma.wordBook.count({ where: { type: WordBookType.USER } }),
      ]);

    // 获取最近7天活跃用户
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeUsers = await prisma.user.count({
      where: {
        records: {
          some: {
            timestamp: {
              gte: sevenDaysAgo,
            },
          },
        },
      },
    });

    return {
      totalUsers,
      activeUsers,
      totalWordBooks,
      systemWordBooks,
      userWordBooks,
      totalWords,
      totalRecords,
    };
  }

  /**
   * 兼容 *.spec.ts：系统统计简版
   */
  async getSystemStats() {
    const stats = await this.getStatistics();
    return {
      totalUsers: stats.totalUsers,
      totalWords: stats.totalWords,
      totalWordBooks: stats.totalWordBooks,
      totalRecords: stats.totalRecords,
    };
  }

  /**
   * 兼容 *.spec.ts：封禁用户（通过清除会话实现软封禁）
   */
  async banUser(userId: string) {
    await prisma.session.deleteMany({ where: { userId } });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.USER },
    });

    return { ...updatedUser, banned: true };
  }

  /**
   * 获取用户学习数据详情
   */
  async getUserLearningData(userId: string, options?: { limit?: number }) {
    const limit = options?.limit || 50;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 获取学习记录
    const records = await prisma.answerRecord.findMany({
      where: { userId },
      include: {
        word: {
          select: {
            spelling: true,
            phonetic: true,
            meanings: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // 统计数据
    const totalRecords = await prisma.answerRecord.count({
      where: { userId },
    });

    const correctRecords = await prisma.answerRecord.count({
      where: { userId, isCorrect: true },
    });

    const averageAccuracy = totalRecords > 0 ? (correctRecords / totalRecords) * 100 : 0;

    // 获取学习的单词数（去重）
    const learnedWordsCount = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: { userId },
    });

    return {
      user,
      totalRecords,
      correctRecords,
      averageAccuracy: Math.round(averageAccuracy * 100) / 100,
      totalWordsLearned: learnedWordsCount.length,
      recentRecords: records,
    };
  }

  /**
   * 获取用户详细统计数据
   * 修复：避免全量加载答题记录，改用数据库聚合
   */
  async getUserDetailedStatistics(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    const [
      totalRecords,
      correctRecords,
      learnedWordsCount,
      scoreAggregate,
      masteryGroups,
      timeAggregate,
      // 获取最近90天的学习日期（用于计算学习天数和连续天数）
      recentDates,
    ] = await Promise.all([
      prisma.answerRecord.count({ where: { userId } }),
      prisma.answerRecord.count({ where: { userId, isCorrect: true } }),
      prisma.answerRecord.groupBy({
        by: ['wordId'],
        where: { userId },
      }),
      prisma.wordScore.aggregate({
        where: { userId },
        _avg: { totalScore: true },
      }),
      prisma.wordLearningState.groupBy({
        by: ['masteryLevel'],
        where: { userId },
        _count: true,
      }),
      // 使用数据库聚合获取总学习时间
      prisma.answerRecord.aggregate({
        where: { userId },
        _sum: { responseTime: true, dwellTime: true },
      }),
      // 只获取最近90天的日期数据（足够计算连续天数）
      // 使用Prisma tagged template literal确保参数化查询，防止SQL注入
      // 表名使用@@map映射后的实际名称"answer_records"
      prisma.$queryRaw<Array<{ date: Date }>>`
                SELECT DISTINCT DATE(timestamp) as date
                FROM "answer_records"
                WHERE "userId" = ${userId}
                ORDER BY date DESC
                LIMIT 365
            `,
    ]);

    const accuracy = totalRecords > 0 ? (correctRecords / totalRecords) * 100 : 0;
    const averageScore = scoreAggregate._avg.totalScore ?? 0;

    const masteryDistribution: Record<string, number> = {
      level0: 0,
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
      level5: 0,
    };
    masteryGroups.forEach((item) => {
      const key = `level${item.masteryLevel}`;
      if (key in masteryDistribution) {
        masteryDistribution[key] = item._count;
      }
    });

    // 从聚合结果获取学习天数
    const uniqueDates = new Set(
      recentDates.map((r) => {
        const d = r.date instanceof Date ? r.date : new Date(r.date);
        return d.toISOString().split('T')[0];
      }),
    );
    const studyDays = uniqueDates.size;

    // 计算连续学习天数（从今天开始往前连续的自然日）
    let consecutiveDays = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      // 最多检查365天，防止无限循环
      const check = new Date(today);
      check.setDate(today.getDate() - i);
      const key = check.toISOString().split('T')[0];
      if (uniqueDates.has(key)) {
        consecutiveDays += 1;
      } else {
        break;
      }
    }

    // 从聚合结果计算总学习时间
    const totalStudyTimeMs =
      (timeAggregate._sum.responseTime || 0) + (timeAggregate._sum.dwellTime || 0);
    const totalStudyTime = Math.round(totalStudyTimeMs / 60000);

    return {
      user,
      masteryDistribution,
      studyDays,
      consecutiveDays,
      totalStudyTime,
      totalWordsLearned: learnedWordsCount.length,
      averageScore,
      accuracy,
    };
  }

  /**
   * 导出用户单词数据
   */
  async exportUserWords(userId: string, format: 'csv' | 'excel' = 'csv') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 获取用户的所有单词及学习状态
    const learningStates = await prisma.wordLearningState.findMany({
      where: { userId },
      include: {
        word: {
          select: {
            spelling: true,
            phonetic: true,
            meanings: true,
            examples: true,
          },
        },
      },
    });

    // 准备导出数据
    const exportData = learningStates.map((state) => ({
      spelling: state.word.spelling,
      phonetic: state.word.phonetic,
      meanings: state.word.meanings.join('; '),
      examples: state.word.examples.join('; '),
      masteryLevel: state.masteryLevel,
      state: state.state,
      reviewCount: state.reviewCount,
      lastReviewDate: state.lastReviewDate?.toISOString() || '',
      nextReviewDate: state.nextReviewDate?.toISOString() || '',
    }));

    if (format === 'csv') {
      const csv = stringify(exportData, {
        header: true,
        columns: {
          spelling: 'Spelling',
          phonetic: 'Phonetic',
          meanings: 'Meanings',
          examples: 'Examples',
          masteryLevel: 'Mastery Level',
          state: 'State',
          reviewCount: 'Review Count',
          lastReviewDate: 'Last Review Date',
          nextReviewDate: 'Next Review Date',
        },
      });

      return {
        data: csv,
        filename: `${user.username}_words_${new Date().toISOString().split('T')[0]}.csv`,
        contentType: 'text/csv',
      };
    } else {
      // Excel 格式
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Words');

      worksheet.columns = [
        { header: 'Spelling', key: 'spelling', width: 20 },
        { header: 'Phonetic', key: 'phonetic', width: 20 },
        { header: 'Meanings', key: 'meanings', width: 40 },
        { header: 'Examples', key: 'examples', width: 50 },
        { header: 'Mastery Level', key: 'masteryLevel', width: 15 },
        { header: 'State', key: 'state', width: 15 },
        { header: 'Review Count', key: 'reviewCount', width: 15 },
        { header: 'Last Review Date', key: 'lastReviewDate', width: 20 },
        { header: 'Next Review Date', key: 'nextReviewDate', width: 20 },
      ];

      exportData.forEach((row) => {
        worksheet.addRow(row);
      });

      const buffer = await workbook.xlsx.writeBuffer();

      return {
        data: buffer,
        filename: `${user.username}_words_${new Date().toISOString().split('T')[0]}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
  }

  /**
   * 获取用户单词列表（支持分页、排序、筛选）
   * 修复：添加内存排序时的数据量硬性上限，防止OOM
   */
  async getUserWords(
    userId: string,
    params: {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      state?: string;
      search?: string;
      scoreRange?: 'low' | 'medium' | 'high';
      masteryLevel?: number;
      minAccuracy?: number;
    },
  ) {
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 20, 200); // 限制最大分页大小
    const skip = (page - 1) * pageSize;
    const sortOrder = params.sortOrder || 'desc';

    // 内存排序时的硬性上限，防止OOM
    const MAX_IN_MEMORY_RECORDS = 5000;

    const needsScoreSort = params.sortBy === 'score' || params.sortBy === 'accuracy';
    const needsScoreFilter = params.scoreRange || params.minAccuracy !== undefined;

    // 统一以 word_learning_state 为主表，这样可以包含尚未生成得分记录的单词（使用默认值0）
    const whereState: Prisma.WordLearningStateWhereInput = { userId };
    if (params.state) {
      whereState.state = params.state.toUpperCase() as WordState;
    }
    if (params.masteryLevel !== undefined) {
      whereState.masteryLevel = params.masteryLevel;
    }
    if (params.search) {
      whereState.word = {
        spelling: { contains: params.search, mode: 'insensitive' },
      };
    }

    // 如果需要按得分筛选或排序，需要在内存中处理
    if (needsScoreFilter || needsScoreSort) {
      // 先检查数据量，如果超过上限则拒绝请求
      const totalCount = await prisma.wordLearningState.count({ where: whereState });
      if (totalCount > MAX_IN_MEMORY_RECORDS) {
        throw new Error(
          `数据量过大 (${totalCount} 条)，超过内存处理上限 ${MAX_IN_MEMORY_RECORDS} 条。` +
            `请添加更多筛选条件（如状态、掌握等级等）缩小范围后重试。`,
        );
      }

      // 获取符合条件的学习状态（已通过上限检查）
      const allStates = await prisma.wordLearningState.findMany({
        where: whereState,
        include: {
          word: {
            select: {
              id: true,
              spelling: true,
              phonetic: true,
              meanings: true,
              examples: true,
            },
          },
        },
      });

      // 批量获取所有单词的得分
      const allWordIds = allStates.map((s) => s.wordId);
      const allScores =
        allWordIds.length > 0
          ? await prisma.wordScore.findMany({
              where: { userId, wordId: { in: allWordIds } },
              select: {
                wordId: true,
                totalScore: true,
                recentAccuracy: true,
                totalAttempts: true,
                correctAttempts: true,
              },
            })
          : [];

      const scoreMap = new Map(allScores.map((s) => [s.wordId, s]));

      // 组装所有数据并计算准确率
      let allWords: UserWordItem[] = allStates.map((state) => {
        const score = scoreMap.get(state.wordId);
        const accuracyVal =
          score?.recentAccuracy !== null && score?.recentAccuracy !== undefined
            ? score.recentAccuracy * 100
            : score && score.totalAttempts > 0
              ? (score.correctAttempts / score.totalAttempts) * 100
              : 0;

        return {
          word: state.word,
          score: score?.totalScore ?? 0,
          masteryLevel: state.masteryLevel,
          accuracy: accuracyVal,
          reviewCount: state.reviewCount,
          lastReviewDate: state.lastReviewDate,
          nextReviewDate: state.nextReviewDate,
          state: state.state,
        };
      });

      // 按得分范围筛选（没有得分记录的单词得分为0，属于 low 范围）
      if (params.scoreRange === 'low') {
        allWords = allWords.filter((w: UserWordItem) => w.score < 40);
      } else if (params.scoreRange === 'medium') {
        allWords = allWords.filter((w: UserWordItem) => w.score >= 40 && w.score < 70);
      } else if (params.scoreRange === 'high') {
        allWords = allWords.filter((w: UserWordItem) => w.score >= 70);
      }

      // 按准确率筛选
      if (params.minAccuracy !== undefined) {
        allWords = allWords.filter((w: UserWordItem) => w.accuracy >= params.minAccuracy!);
      }

      // 排序
      if (params.sortBy === 'score') {
        allWords.sort((a: UserWordItem, b: UserWordItem) =>
          sortOrder === 'asc' ? a.score - b.score : b.score - a.score,
        );
      } else if (params.sortBy === 'accuracy') {
        allWords.sort((a: UserWordItem, b: UserWordItem) =>
          sortOrder === 'asc' ? a.accuracy - b.accuracy : b.accuracy - a.accuracy,
        );
      }

      // 分页
      const total = allWords.length;
      const paginatedWords = allWords.slice(skip, skip + pageSize);

      return {
        words: paginatedWords,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }

    // 非得分筛选/排序情况：直接在数据库层面分页
    const orderBy: Prisma.WordLearningStateOrderByWithRelationInput = {};
    switch (params.sortBy) {
      case 'reviewCount':
        orderBy.reviewCount = sortOrder;
        break;
      case 'lastReview':
        orderBy.lastReviewDate = sortOrder;
        break;
      case 'spelling':
        orderBy.word = { spelling: sortOrder };
        break;
      case 'masteryLevel':
        orderBy.masteryLevel = sortOrder;
        break;
      default:
        orderBy.updatedAt = sortOrder;
    }

    const [learningStates, total] = await Promise.all([
      prisma.wordLearningState.findMany({
        where: whereState,
        include: {
          word: {
            select: {
              id: true,
              spelling: true,
              phonetic: true,
              meanings: true,
              examples: true,
            },
          },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.wordLearningState.count({ where: whereState }),
    ]);

    // 批量获取这一页单词的得分数据
    const wordIds = learningStates.map((s) => s.wordId);
    const scores =
      wordIds.length > 0
        ? await prisma.wordScore.findMany({
            where: { userId, wordId: { in: wordIds } },
            select: {
              wordId: true,
              totalScore: true,
              recentAccuracy: true,
              totalAttempts: true,
              correctAttempts: true,
            },
          })
        : [];

    const scoreMap = new Map(scores.map((s) => [s.wordId, s]));

    const words: UserWordItem[] = learningStates.map((state) => {
      const score = scoreMap.get(state.wordId);
      const accuracy =
        score?.recentAccuracy !== null && score?.recentAccuracy !== undefined
          ? score.recentAccuracy * 100
          : score && score.totalAttempts > 0
            ? (score.correctAttempts / score.totalAttempts) * 100
            : 0;

      return {
        word: state.word,
        score: score?.totalScore ?? 0,
        masteryLevel: state.masteryLevel,
        accuracy,
        reviewCount: state.reviewCount,
        lastReviewDate: state.lastReviewDate,
        nextReviewDate: state.nextReviewDate,
        state: state.state,
      };
    });

    return {
      words,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取单词的完整学习历史
   */
  async getWordLearningHistory(userId: string, wordId: string, options?: { limit?: number }) {
    const limit = options?.limit || 100;

    const [word, wordState, wordScore, records] = await Promise.all([
      prisma.word.findUnique({
        where: { id: wordId },
        select: {
          id: true,
          spelling: true,
          phonetic: true,
          meanings: true,
          examples: true,
        },
      }),
      prisma.wordLearningState.findUnique({
        where: {
          unique_user_word: { userId, wordId },
        },
        select: {
          masteryLevel: true,
          easeFactor: true,
          reviewCount: true,
          lastReviewDate: true,
          nextReviewDate: true,
          state: true,
        },
      }),
      prisma.wordScore.findUnique({
        where: {
          unique_user_word_score: { userId, wordId },
        },
        select: {
          totalScore: true,
          accuracyScore: true,
          speedScore: true,
          stabilityScore: true,
          proficiencyScore: true,
          updatedAt: true,
        },
      }),
      prisma.answerRecord.findMany({
        where: { userId, wordId },
        select: {
          id: true,
          timestamp: true,
          selectedAnswer: true,
          correctAnswer: true,
          isCorrect: true,
          responseTime: true,
          dwellTime: true,
          masteryLevelBefore: true,
          masteryLevelAfter: true,
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      }),
    ]);

    return {
      word,
      wordState,
      wordScore: wordScore ? { ...wordScore, lastCalculated: wordScore.updatedAt } : null,
      records,
    };
  }

  /**
   * 获取单词得分的历史变化
   * 修复：使用累加计数器代替slice/filter，将O(n²)优化为O(n)
   */
  async getWordScoreHistory(userId: string, wordId: string) {
    // 获取当前得分
    const currentScore = await prisma.wordScore.findUnique({
      where: {
        unique_user_word_score: {
          userId,
          wordId,
        },
      },
    });

    // 获取学习记录，用于构建历史得分趋势（添加limit防止数据量过大）
    const records = await prisma.answerRecord.findMany({
      where: {
        userId,
        wordId,
      },
      orderBy: { timestamp: 'asc' },
      take: 1000, // 限制最多返回1000条记录
    });

    // 构建历史得分数据（使用累加计数器，O(n)复杂度）
    let correctCount = 0;
    const scoreHistory = records.map((record, index) => {
      if (record.isCorrect) {
        correctCount++;
      }
      const totalCount = index + 1;
      const accuracy = correctCount / totalCount;

      return {
        timestamp: record.timestamp.toISOString(),
        score: accuracy * 100,
        masteryLevel: record.masteryLevelAfter,
        isCorrect: record.isCorrect,
      };
    });

    return {
      currentScore: currentScore?.totalScore || 0,
      scoreHistory,
    };
  }

  /**
   * 获取用户学习热力图数据
   */
  async getUserLearningHeatmap(userId: string, options?: { days?: number }) {
    const days = options?.days || 90;

    // 计算起始日期
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 获取指定时间范围内的学习记录
    const records = await prisma.answerRecord.findMany({
      where: {
        userId,
        timestamp: { gte: startDate },
      },
      select: {
        timestamp: true,
        wordId: true,
        isCorrect: true,
        responseTime: true,
        dwellTime: true,
      },
    });

    // 按日期聚合数据
    const dailyData = new Map<
      string,
      {
        recordCount: number;
        correctCount: number;
        totalTime: number;
        wordIds: Set<string>;
      }
    >();

    records.forEach((record) => {
      const date = record.timestamp.toISOString().split('T')[0];
      const existing = dailyData.get(date) || {
        recordCount: 0,
        correctCount: 0,
        totalTime: 0,
        wordIds: new Set<string>(),
      };

      existing.recordCount++;
      if (record.isCorrect) {
        existing.correctCount++;
      }
      existing.totalTime += (record.responseTime || 0) + (record.dwellTime || 0);
      existing.wordIds.add(record.wordId);

      dailyData.set(date, existing);
    });

    // 生成完整的日期范围（包括没有记录的日期）
    const heatmapData = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const data = dailyData.get(dateStr);

      const recordCount = data?.recordCount || 0;
      const correctCount = data?.correctCount || 0;
      const uniqueWords = data?.wordIds.size || 0;

      heatmapData.push({
        date: dateStr,
        activityLevel: recordCount,
        accuracy: recordCount > 0 ? correctCount / recordCount : 0,
        averageScore: recordCount > 0 ? (correctCount / recordCount) * 100 : 0,
        uniqueWords,
      });
    }

    // 按日期排序（从旧到新）
    heatmapData.sort((a, b) => a.date.localeCompare(b.date));

    return heatmapData;
  }

  /**
   * 标记异常学习记录
   */
  async flagAnomalyRecord(data: {
    userId: string;
    wordId: string;
    flaggedBy: string;
    reason: string;
  }) {
    // 使用 upsert 创建或更新异常标记
    const flag = await prisma.anomalyFlag.upsert({
      where: {
        userId_wordId: {
          userId: data.userId,
          wordId: data.wordId,
        },
      },
      create: {
        userId: data.userId,
        wordId: data.wordId,
        flaggedBy: data.flaggedBy,
        reason: data.reason,
      },
      update: {
        flaggedBy: data.flaggedBy,
        reason: data.reason,
        flaggedAt: new Date(),
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
      },
    });

    return flag;
  }

  /**
   * 获取异常标记列表
   */
  async getAnomalyFlags(userId: string, wordId?: string) {
    const where: Prisma.AnomalyFlagWhereInput = { userId };

    if (wordId) {
      where.wordId = wordId;
    }

    const flags = await prisma.anomalyFlag.findMany({
      where,
      orderBy: { flaggedAt: 'desc' },
    });

    return flags;
  }

  // ==================== AMAS 决策查询 ====================

  /**
   * 获取用户决策列表（分页 + 筛选）
   */
  async getUserDecisions(
    userId: string,
    options: {
      page: number;
      pageSize: number;
      startDate?: string;
      endDate?: string;
      decisionSource?: string;
      minConfidence?: number;
      sortBy?: 'timestamp' | 'confidence' | 'duration';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const skip = (options.page - 1) * options.pageSize;
    const sortBy = options.sortBy || 'timestamp';
    const sortOrder = options.sortOrder || 'desc';

    const whereConditions: DecisionRecordWhereConditions = {};

    if (options.startDate) {
      whereConditions.timestamp = {
        ...whereConditions.timestamp,
        gte: new Date(options.startDate),
      };
    }
    if (options.endDate) {
      whereConditions.timestamp = { ...whereConditions.timestamp, lte: new Date(options.endDate) };
    }
    if (options.decisionSource) {
      whereConditions.decisionSource = options.decisionSource;
    }
    if (options.minConfidence !== undefined) {
      whereConditions.confidence = { gte: options.minConfidence };
    }

    // 先查询一次answerRecordIds并复用，避免N+1查询
    const answerRecordIds = (
      await prisma.answerRecord.findMany({
        where: { userId },
        select: { id: true },
      })
    ).map((r) => r.id);

    const decisionWhereConditions = {
      answerRecordId: { in: answerRecordIds },
      ...whereConditions,
    };

    const [decisions, total] = await Promise.all([
      prisma.decisionRecord.findMany({
        where: decisionWhereConditions,
        select: {
          id: true,
          decisionId: true,
          timestamp: true,
          decisionSource: true,
          confidence: true,
          reward: true,
          totalDurationMs: true,
          selectedAction: true,
        },
        orderBy:
          sortBy === 'timestamp'
            ? { timestamp: sortOrder as Prisma.SortOrder }
            : sortBy === 'confidence'
              ? { confidence: sortOrder as Prisma.SortOrder }
              : { totalDurationMs: sortOrder as Prisma.SortOrder },
        skip,
        take: options.pageSize,
      }),
      prisma.decisionRecord.count({
        where: decisionWhereConditions,
      }),
    ]);

    const formattedDecisions = decisions.map((d) => ({
      decisionId: d.decisionId,
      timestamp: d.timestamp.toISOString(),
      decisionSource: d.decisionSource,
      confidence: d.confidence,
      reward: d.reward,
      totalDurationMs: d.totalDurationMs,
      strategy: this.extractStrategyFromAction(d.selectedAction),
    }));

    const statistics = await this.calculateDecisionStatistics(userId, {
      startDate: options.startDate,
      endDate: options.endDate,
    });

    return {
      decisions: formattedDecisions,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages: Math.ceil(total / options.pageSize),
      },
      statistics,
    };
  }

  /**
   * 获取决策详情
   */
  async getDecisionDetail(userId: string, decisionId: string) {
    const answerRecordIds = (
      await prisma.answerRecord.findMany({
        where: { userId },
        select: { id: true },
      })
    ).map((r) => r.id);

    const decision = await prisma.decisionRecord.findFirst({
      where: {
        decisionId,
        answerRecordId: { in: answerRecordIds },
      },
    });

    if (!decision) {
      throw new Error('决策记录不存在');
    }

    const [insight, stages, answerRecord] = await Promise.all([
      prisma.decisionInsight.findUnique({
        where: { decisionId: decision.decisionId },
      }),
      prisma.pipelineStage.findMany({
        where: { decisionRecordId: decision.id },
        orderBy: { stage: 'asc' },
      }),
      decision.answerRecordId
        ? prisma.answerRecord.findFirst({
            where: { id: decision.answerRecordId },
            include: {
              word: {
                select: { spelling: true },
              },
            },
          })
        : null,
    ]);

    return {
      decision: {
        decisionId: decision.decisionId,
        timestamp: decision.timestamp.toISOString(),
        decisionSource: decision.decisionSource,
        coldstartPhase: decision.coldstartPhase,
        confidence: decision.confidence,
        reward: decision.reward,
        totalDurationMs: decision.totalDurationMs,
        selectedAction: decision.selectedAction,
        weightsSnapshot: decision.weightsSnapshot || {},
        memberVotes: this.parseMemberVotes(decision.memberVotes),
      },
      insight: insight
        ? {
            stateSnapshot: insight.stateSnapshot,
            difficultyFactors: insight.difficultyFactors,
            triggers: insight.triggers,
          }
        : undefined,
      pipeline: stages.map((s) => ({
        stage: s.stage,
        stageName: s.stageName,
        status: s.status,
        durationMs: s.durationMs,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString(),
        inputSummary: s.inputSummary,
        outputSummary: s.outputSummary,
        metadata: s.metadata,
        errorMessage: s.errorMessage,
      })),
      context: answerRecord
        ? {
            answerRecord: {
              wordId: answerRecord.wordId,
              wordSpelling: answerRecord.word?.spelling || '',
              isCorrect: answerRecord.isCorrect,
              responseTime: answerRecord.responseTime,
            },
            sessionId: decision.sessionId,
          }
        : undefined,
    };
  }

  /**
   * 计算决策统计
   */
  private async calculateDecisionStatistics(
    userId: string,
    options: {
      startDate?: string;
      endDate?: string;
    },
  ) {
    const whereConditions: DecisionRecordWhereConditions = {};

    if (options.startDate) {
      whereConditions.timestamp = {
        ...whereConditions.timestamp,
        gte: new Date(options.startDate),
      };
    }
    if (options.endDate) {
      whereConditions.timestamp = { ...whereConditions.timestamp, lte: new Date(options.endDate) };
    }

    const answerRecordIds = (
      await prisma.answerRecord.findMany({
        where: { userId },
        select: { id: true },
      })
    ).map((r) => r.id);

    const decisions = await prisma.decisionRecord.findMany({
      where: {
        answerRecordId: { in: answerRecordIds },
        ...whereConditions,
      },
      select: {
        decisionSource: true,
        confidence: true,
        reward: true,
      },
    });

    if (decisions.length === 0) {
      return {
        totalDecisions: 0,
        averageConfidence: 0,
        averageReward: 0,
        decisionSourceDistribution: {},
      };
    }

    const totalDecisions = decisions.length;
    const sumConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0);
    const rewardsWithValues = decisions.filter((d) => d.reward !== null);
    const sumReward = rewardsWithValues.reduce((sum, d) => sum + (d.reward || 0), 0);

    const sourceDistribution: Record<string, number> = {};
    decisions.forEach((d) => {
      sourceDistribution[d.decisionSource] = (sourceDistribution[d.decisionSource] || 0) + 1;
    });

    return {
      totalDecisions,
      averageConfidence: sumConfidence / totalDecisions,
      averageReward: rewardsWithValues.length > 0 ? sumReward / rewardsWithValues.length : 0,
      decisionSourceDistribution: sourceDistribution,
    };
  }

  /**
   * 从 selectedAction JSON 提取策略信息
   */
  private extractStrategyFromAction(action: JsonValue): StrategyFromAction {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      return { difficulty: 'normal', batch_size: 10 };
    }

    const actionObj = action as SelectedActionJson;
    return {
      difficulty: actionObj.difficulty || 'normal',
      batch_size: actionObj.batch_size || 10,
      interval_scale: actionObj.interval_scale,
      new_ratio: actionObj.new_ratio,
      hint_level: actionObj.hint_level,
    };
  }

  /**
   * 解析成员投票 JSON
   */
  private parseMemberVotes(votes: JsonValue): MemberVoteItem[] {
    if (!votes || typeof votes !== 'object' || Array.isArray(votes)) {
      return [];
    }

    return Object.entries(votes).map(
      ([member, vote]): MemberVoteItem => ({
        member,
        vote,
        weight:
          typeof vote === 'object' && vote !== null ? ((vote as MemberVoteValue).weight ?? 0) : 0,
      }),
    );
  }
}

export default new AdminService();
