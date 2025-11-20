import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { env } from '../config/env';
import { RegisterDto, LoginDto } from '../types';

const SALT_ROUNDS = 10;

export class AuthService {
  async register(data: RegisterDto) {
    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('该邮箱已被注册');
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        username: data.username,
      },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
      },
    });

    // 生成令牌
    const token = this.generateToken(user.id);

    // 创建会话
    await this.createSession(user.id, token);

    return { user, token };
  }

  async login(data: LoginDto) {
    // 查找用户
    const user = await prisma.user.findUnique({
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

    // 创建会话
    await this.createSession(user.id, token);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  async logout(token: string) {
    // 删除会话
    await prisma.session.deleteMany({
      where: { token },
    });
  }

  async verifyToken(token: string) {
    try {
      // 验证JWT
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };

      // 检查会话是否存在且未过期
      const session = await prisma.session.findUnique({
        where: { token },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new Error('会话已过期');
      }

      // 获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
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
    } catch (error) {
      throw new Error('无效的认证令牌');
    }
  }

  generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    );
  }

  private async createSession(userId: string, token: string) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24小时后过期

    await prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }
}

export default new AuthService();
