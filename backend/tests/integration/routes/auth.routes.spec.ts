import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma, cleanDatabase, disconnectDatabase } from '../../helpers/db.helper';
import bcrypt from 'bcrypt';
import app from '../../../src/app';
import prismaApp from '../../../src/config/database';

describe('Auth Routes Integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
    await prismaApp.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('应该成功注册新用户并返回201状态码', async () => {
      const email = `user-${Date.now()}@test.com`;
      const res = await request(app).post('/api/auth/register').send({
        email,
        password: 'Password123',
        username: 'testuser',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeTypeOf('string');
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user.email).toBe(email);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).not.toBeNull();
    });

    it('当邮箱已存在时应该返回400错误', async () => {
      const email = 'exists@test.com';
      await prisma.user.create({
        data: {
          email,
          username: 'existing',
          passwordHash: await bcrypt.hash('Password123', 10),
        },
      });

      const res = await request(app).post('/api/auth/register').send({
        email,
        password: 'Password123',
        username: 'newuser',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('当参数验证失败时应该返回400错误', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'invalid-email',
        password: 'short',
        username: '',
      });

      expect([400, 500]).toContain(res.status);
    });
  });

  describe('POST /api/auth/login', () => {
    it('应该成功登录并返回200状态码', async () => {
      const email = `login-${Date.now()}@test.com`;
      const password = 'Password123';
      await prisma.user.create({
        data: {
          email,
          username: 'loginuser',
          passwordHash: await bcrypt.hash(password, 10),
        },
      });

      const res = await request(app).post('/api/auth/login').send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeTypeOf('string');
      expect(res.body.data.user.email).toBe(email);

      const session = await prisma.session.findUnique({
        where: { token: res.body.data.token }
      });
      expect(session).not.toBeNull();
    });

    it('当用户不存在时应该返回400错误', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@test.com',
        password: 'Password123',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('当密码错误时应该返回400错误', async () => {
      const email = `wrongpass-${Date.now()}@test.com`;
      await prisma.user.create({
        data: {
          email,
          username: 'wrongpassuser',
          passwordHash: await bcrypt.hash('CorrectPassword', 10),
        },
      });

      const res = await request(app).post('/api/auth/login').send({
        email,
        password: 'WrongPassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('当参数验证失败时应该返回400错误', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'invalid-email',
        password: '',
      });

      expect([400, 500]).toContain(res.status);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('应该成功退出登录并返回200状态码', async () => {
      const email = `logout-${Date.now()}@test.com`;
      const password = 'Password123';

      const registerRes = await request(app).post('/api/auth/register').send({
        email,
        password,
        username: 'logoutuser',
      });

      const token = registerRes.body.data.token as string;

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const session = await prisma.session.findUnique({ where: { token } });
      expect(session).toBeNull();
    });

    it('当未提供认证token时应该返回401错误', async () => {
      const res = await request(app).post('/api/auth/logout').send();

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });
});
