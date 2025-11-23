import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { UpdatePasswordDto, UserStatistics } from '../types';

const SALT_ROUNDS = 10;

export class UserService {
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
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
}

export default new UserService();
