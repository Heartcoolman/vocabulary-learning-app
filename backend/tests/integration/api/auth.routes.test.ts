/**
 * Auth Routes Integration Tests
 *
 * Tests for authentication API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock auth service
const mockAuthService = {
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  verifyToken: vi.fn(),
  refreshToken: vi.fn()
};

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
        .send({ email: 'test@example.com', password: 'pass123' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user', email: 'invalid-email', password: 'pass123' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user', email: 'test@example.com', password: '123' });

      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate username', async () => {
      mockAuthService.register.mockRejectedValue({
        code: 'P2002',
        message: 'Username already exists'
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(res.status).toBe(409);
    });

    it('should return 409 for duplicate email', async () => {
      mockAuthService.register.mockRejectedValue({
        code: 'P2002',
        message: 'Email already exists'
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(res.status).toBe(409);
    });
  });

  // ==================== POST /api/auth/login ====================

  describe('POST /api/auth/login', () => {
    const validLogin = {
      username: 'testuser',
      password: 'correctpassword'
    };

    it('should login with valid credentials', async () => {
      mockAuthService.login.mockResolvedValue({
        user: { id: 'user-id', username: 'testuser' },
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
      mockAuthService.login.mockRejectedValue({
        status: 401,
        message: 'Invalid credentials'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('should return 401 for non-existent user', async () => {
      mockAuthService.login.mockRejectedValue({
        status: 401,
        message: 'User not found'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'password' });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser' });

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

    it('should invalidate the token on logout', async () => {
      mockAuthService.logout.mockResolvedValue({
        success: true,
        tokenInvalidated: true
      });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(mockAuthService.logout).toHaveBeenCalledWith('valid-token');
    });
  });

  // ==================== GET /api/auth/verify ====================

  describe('GET /api/auth/verify', () => {
    it('should verify valid token', async () => {
      mockAuthService.verifyToken.mockResolvedValue({
        valid: true,
        user: { id: 'user-id', username: 'testuser' }
      });

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
    });

    it('should return 401 for expired token', async () => {
      mockAuthService.verifyToken.mockRejectedValue({
        status: 401,
        message: 'Token expired'
      });

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/auth/refresh ====================

  describe('POST /api/auth/refresh', () => {
    it('should refresh token', async () => {
      mockAuthService.refreshToken.mockResolvedValue({
        token: 'new-jwt-token',
        expiresIn: 3600
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBe('new-jwt-token');
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });
});
