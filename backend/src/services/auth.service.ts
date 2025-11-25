import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database';
import { env } from '../config/env';
import { RegisterDto, LoginDto } from '../types';

// 从 prisma.$transaction 推断事务客户端类型
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const SALT_ROUNDS = 10;

/**
 * 使用 SHA-256 对 Token 进行哈希
 * 避免数据库中存储明文 Token，降低泄露风险
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 解析 JWT 过期时间字符串（如 '24h', '7d', '30m'）为毫秒数
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`无效的过期时间格式: ${expiresIn}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`不支持的时间单位: ${unit}`);
  }
}

export class AuthService {
  async register(data: RegisterDto) {
    // 使用事务确保用户创建和会话创建的原子性
    return await prisma.$transaction(async (tx: TransactionClient) => {
      // 检查邮箱是否已存在
      const existingUser = await tx.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        throw new Error('该邮箱已被注册');
      }

      // 加密密码
      const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

      // 创建用户
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          username: data.username,
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
        },
      });

      // 生成令牌
      const token = this.generateToken(user.id);

      // 创建会话（在事务中）
      await this.createSession(user.id, token, tx);

      return { user, token };
    });
  }

  async login(data: LoginDto) {
    // 使用事务确保会话创建的原子性
    return await prisma.$transaction(async (tx: TransactionClient) => {
      // 查找用户
      const user = await tx.user.findUnique({
        where: { email: data.email },
      });

      if (!user) {
        throw new Error('邮箱或密码错误');
      }

      // 验证密码
      const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

      if (!isPasswordValid) {
        throw new Error('邮箱或密码错误');
      }

      // 生成令牌
      const token = this.generateToken(user.id);

      // 创建会话（在事务中）
      await this.createSession(user.id, token, tx);

      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
        },
        token,
      };
    });
  }

  async logout(token: string) {
    // 使用哈希后的 Token 查找并删除会话
    const hashedToken = hashToken(token);
    await prisma.session.deleteMany({
      where: { token: hashedToken },
    });
  }

  async verifyToken(token: string) {
    try {
      // 验证JWT（限定算法防止算法混淆攻击）
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
      }) as { userId: string };

      // 检查会话是否存在且未过期，并验证用户归属
      const hashedToken = hashToken(token);
      const session = await prisma.session.findUnique({
        where: { token: hashedToken },
      });

      if (!session || session.expiresAt < new Date() || session.userId !== decoded.userId) {
        throw new Error('会话已过期');
      }

      // 获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      return user;
    } catch (error) {
      throw new Error('无效的认证令牌');
    }
  }

  generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRES_IN,
        algorithm: 'HS256',
      } as jwt.SignOptions
    );
  }

  private async createSession(
    userId: string,
    token: string,
    tx?: TransactionClient
  ) {
    // 使用与 JWT 相同的过期时间配置，确保会话和令牌过期时间一致
    const expiresInMs = parseExpiresIn(env.JWT_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + expiresInMs);

    // 支持事务客户端，确保原子性
    const client = tx ?? prisma;
    await client.session.create({
      data: {
        userId,
        token: hashToken(token), // 存储哈希后的 Token
        expiresAt,
      },
    });
  }
}

export default new AuthService();
