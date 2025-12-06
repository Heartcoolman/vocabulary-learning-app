import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { UpdatePasswordDto, UserStatistics } from '../types';

const SALT_ROUNDS = 10;

export class UserService {
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
  }

  async getUserStatistics(userId: string): Promise<UserStatistics> {
    // 获取用户可访问的所有词书（系统词库 + 用户自己的词库）
    const userWordBooks = await prisma.wordBook.findMany({
      where: {
        OR: [
          { type: 'SYSTEM' },
          { type: 'USER', userId: userId },
        ],
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
   * 兼容 *.spec.ts：更新用户基本信息
   */
  async updateUser(userId: string, data: Partial<{ username: string; email: string }>) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * 兼容 *.spec.ts：用户数据统计（简版）
   */
  async getUserStats(userId: string) {
    const repo: any = (prisma as any).learningRecord ?? (prisma as any).answerRecord ?? prisma.answerRecord;
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
   */
  async updateRewardProfile(userId: string, profileId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { rewardProfile: profileId } as any,
    });
  }

  /**
   * 兼容 *.spec.ts：删除用户（及相关数据的简单事务）
   *
   * 修复：同步清理DecisionInsight孤儿数据
   * 由于DecisionRecord使用复合主键，DecisionInsight只能通过decisionId逻辑关联，
   * 删除用户时需要在应用层处理级联删除
   */
  async deleteUser(userId: string) {
    await prisma.$transaction(async (tx) => {
      // 1. 获取用户的answerRecordIds
      const answerRecords = await tx.answerRecord.findMany({
        where: { userId },
        select: { id: true }
      });
      const answerRecordIds = answerRecords.map(r => r.id);

      // 2. 获取关联的DecisionRecord的decisionIds
      const decisionRecords = await tx.decisionRecord.findMany({
        where: { answerRecordId: { in: answerRecordIds } },
        select: { decisionId: true }
      });
      const decisionIds = decisionRecords.map(d => d.decisionId);

      // 3. 清理DecisionInsight孤儿数据（通过decisionId关联）
      if (decisionIds.length > 0) {
        await tx.decisionInsight.deleteMany({
          where: { decisionId: { in: decisionIds } }
        });
      }

      // 4. 清理DecisionRecord（PipelineStage会通过外键级联删除）
      if (answerRecordIds.length > 0) {
        await tx.decisionRecord.deleteMany({
          where: { answerRecordId: { in: answerRecordIds } }
        });
      }

      // 5. 删除其他用户数据
      await tx.answerRecord.deleteMany({ where: { userId } });
      await tx.wordLearningState.deleteMany({ where: { userId } });
      await tx.wordScore.deleteMany({ where: { userId } });
      await tx.learningSession.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  }
}

export default new UserService();
