/**
 * Auth Routes Integration Tests
 *
 * Tests for authentication API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Use vi.hoisted to ensure mock is available after hoisting
const { mockAuthService } = vi.hoisted(() => ({
  mockAuthService: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn()
  }
}));

vi.mock('../../../src/services/auth.service', () => ({
  default: mockAuthService,
  authService: mockAuthService
}));

// Mock auth middleware for protected routes
vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
}));

import app from '../../../src/app';

describe('Auth API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== POST /api/auth/register ====================

  describe('POST /api/auth/register', () => {
    const validRegistration = {
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'SecurePass123!'
    };

    it('should register a new user', async () => {
      mockAuthService.register.mockResolvedValue({
        user: { id: 'new-user-id', username: 'newuser', email: 'newuser@example.com' },
        token: 'jwt-token-123'
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('newuser');
      expect(res.body.data.token).toBeDefined();
    });

    it('should return 400 for missing username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'SecurePass123!' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user', email: 'invalid-email', password: 'SecurePass123!' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user', email: 'test@example.com', password: '123' });

      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate username', async () => {
      // Error message must contain "已被注册" or "已存在" for error handler to return 409
      mockAuthService.register.mockRejectedValue(
        new Error('用户名已被注册')
      );

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(res.status).toBe(409);
    });

    it('should return 409 for duplicate email', async () => {
      mockAuthService.register.mockRejectedValue(
        new Error('邮箱已被注册')
      );

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(res.status).toBe(409);
    });
  });

  // ==================== POST /api/auth/login ====================

  describe('POST /api/auth/login', () => {
    // Login uses email, not username
    const validLogin = {
      email: 'testuser@example.com',
      password: 'correctpassword'
    };

    it('should login with valid credentials', async () => {
      mockAuthService.login.mockResolvedValue({
        user: { id: 'user-id', username: 'testuser', email: 'testuser@example.com' },
        token: 'jwt-token-123',
        expiresIn: 3600
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send(validLogin);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should return 401 for invalid password', async () => {
      // Error message must match pattern for 401 response
      mockAuthService.login.mockRejectedValue(
        new Error('邮箱或密码错误')
      );

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'testuser@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('should return 401 for non-existent user', async () => {
      mockAuthService.login.mockRejectedValue(
        new Error('该邮箱尚未注册')
      );

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'testuser@example.com' });

      expect(res.status).toBe(400);
    });

    it('should include token expiry in response', async () => {
      mockAuthService.login.mockResolvedValue({
        user: { id: 'user-id', username: 'testuser' },
        token: 'jwt-token-123',
        expiresIn: 7200
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send(validLogin);

      expect(res.status).toBe(200);
      expect(res.body.data.expiresIn).toBe(7200);
    });
  });

  // ==================== POST /api/auth/logout ====================

  describe('POST /api/auth/logout', () => {
    it('should logout authenticated user', async () => {
      mockAuthService.logout.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(401);
    });

    it('should call logout service with token', async () => {
      mockAuthService.logout.mockResolvedValue({
        success: true
      });

      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(mockAuthService.logout).toHaveBeenCalledWith('valid-token');
    });
  });
});
