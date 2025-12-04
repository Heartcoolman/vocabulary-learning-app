/**
 * Auth Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock dependencies
const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockSessionCreate = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockSessionDeleteMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
      create: (...args: any[]) => mockUserCreate(...args)
    },
    session: {
      create: (...args: any[]) => mockSessionCreate(...args),
      findUnique: (...args: any[]) => mockSessionFindUnique(...args),
      deleteMany: (...args: any[]) => mockSessionDeleteMany(...args)
    },
    $transaction: (fn: any) => mockTransaction(fn)
  }
}));

vi.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-testing-purposes',
    JWT_EXPIRES_IN: '24h'
  }
}));

describe('AuthService', () => {
  let AuthService: any;
  let authService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup transaction mock to execute the callback with prisma client
    mockTransaction.mockImplementation(async (fn) => {
      const txClient = {
        user: {
          findUnique: mockUserFindUnique,
          create: mockUserCreate
        },
        session: {
          create: mockSessionCreate
        }
      };
      return fn(txClient);
    });

    const module = await import('../../../src/services/auth.service');
    AuthService = module.AuthService;
    authService = new AuthService();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('register', () => {
    const registerData = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser'
    };

    it('should hash password with bcrypt', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: 'user-1',
        email: registerData.email,
        username: registerData.username,
        role: 'USER',
        createdAt: new Date()
      });
      mockSessionCreate.mockResolvedValue({});

      const hashSpy = vi.spyOn(bcrypt, 'hash');

      await authService.register(registerData);

      expect(hashSpy).toHaveBeenCalledWith(registerData.password, 10);
      hashSpy.mockRestore();
    });

    it('should create user in database', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: 'user-1',
        email: registerData.email,
        username: registerData.username,
        role: 'USER',
        createdAt: new Date()
      });
      mockSessionCreate.mockResolvedValue({});

      const result = await authService.register(registerData);

      expect(mockUserCreate).toHaveBeenCalled();
      expect(result.user.email).toBe(registerData.email);
      expect(result.user.username).toBe(registerData.username);
    });

    it('should reject duplicate email', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'existing-user',
        email: registerData.email
      });

      await expect(authService.register(registerData))
        .rejects.toThrow('该邮箱已被注册');
    });

    it('should return user without password', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: 'user-1',
        email: registerData.email,
        username: registerData.username,
        role: 'USER',
        createdAt: new Date()
      });
      mockSessionCreate.mockResolvedValue({});

      const result = await authService.register(registerData);

      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.token).toBeDefined();
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123'
    };

    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: '', // Will be set in test
      role: 'USER',
      createdAt: new Date()
    };

    beforeEach(async () => {
      // Generate real hash for testing
      mockUser.passwordHash = await bcrypt.hash(loginData.password, 10);
    });

    it('should verify password', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);
      mockSessionCreate.mockResolvedValue({});

      const compareSpy = vi.spyOn(bcrypt, 'compare');

      await authService.login(loginData);

      expect(compareSpy).toHaveBeenCalledWith(loginData.password, mockUser.passwordHash);
      compareSpy.mockRestore();
    });

    it('should generate JWT token', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);
      mockSessionCreate.mockResolvedValue({});

      const result = await authService.login(loginData);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      // Verify token is valid JWT
      const decoded = jwt.verify(result.token, 'test-secret-key-for-testing-purposes') as any;
      expect(decoded.userId).toBe(mockUser.id);
    });

    it('should create session', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);
      mockSessionCreate.mockResolvedValue({});

      await authService.login(loginData);

      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            token: expect.any(String),
            expiresAt: expect.any(Date)
          })
        })
      );
    });

    it('should reject invalid credentials', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser);

      await expect(authService.login({
        email: loginData.email,
        password: 'wrongpassword'
      })).rejects.toThrow('密码错误');
    });

    it('should reject non-existent email', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(authService.login(loginData))
        .rejects.toThrow('该邮箱尚未注册');
    });
  });

  describe('logout', () => {
    it('should delete session', async () => {
      mockSessionDeleteMany.mockResolvedValue({ count: 1 });

      await authService.logout('some-token');

      expect(mockSessionDeleteMany).toHaveBeenCalledWith({
        where: { token: expect.any(String) }
      });
    });

    it('should hash token before deletion', async () => {
      mockSessionDeleteMany.mockResolvedValue({ count: 1 });

      const token = 'test-token-123';
      await authService.logout(token);

      // Token should be hashed (SHA-256 produces 64 char hex)
      const callArgs = mockSessionDeleteMany.mock.calls[0][0];
      expect(callArgs.where.token).not.toBe(token);
      expect(callArgs.where.token.length).toBe(64);
    });
  });

  describe('verifyToken', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should verify valid token', async () => {
      const token = jwt.sign(
        { userId: mockUser.id },
        'test-secret-key-for-testing-purposes',
        { expiresIn: '1h' }
      );

      mockSessionFindUnique.mockResolvedValue({
        userId: mockUser.id,
        token: expect.any(String),
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      });
      mockUserFindUnique.mockResolvedValue(mockUser);

      const result = await authService.verifyToken(token);

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('should reject expired token', async () => {
      const token = jwt.sign(
        { userId: mockUser.id },
        'test-secret-key-for-testing-purposes',
        { expiresIn: '-1h' } // Already expired
      );

      await expect(authService.verifyToken(token))
        .rejects.toThrow();
    });

    it('should reject malformed token', async () => {
      await expect(authService.verifyToken('invalid-token'))
        .rejects.toThrow();
    });

    it('should reject token with invalid signature', async () => {
      const token = jwt.sign(
        { userId: mockUser.id },
        'wrong-secret-key',
        { expiresIn: '1h' }
      );

      await expect(authService.verifyToken(token))
        .rejects.toThrow();
    });

    it('should reject token when session not found', async () => {
      const token = jwt.sign(
        { userId: mockUser.id },
        'test-secret-key-for-testing-purposes',
        { expiresIn: '1h' }
      );

      mockSessionFindUnique.mockResolvedValue(null);

      await expect(authService.verifyToken(token))
        .rejects.toThrow('会话不存在');
    });

    it('should reject token when session expired', async () => {
      const token = jwt.sign(
        { userId: mockUser.id },
        'test-secret-key-for-testing-purposes',
        { expiresIn: '1h' }
      );

      mockSessionFindUnique.mockResolvedValue({
        userId: mockUser.id,
        token: expect.any(String),
        expiresAt: new Date(Date.now() - 1000) // Already expired
      });

      await expect(authService.verifyToken(token))
        .rejects.toThrow('会话已过期');
    });
  });

  describe('generateToken', () => {
    it('should generate valid JWT token', () => {
      const userId = 'user-123';
      const token = authService.generateToken(userId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, 'test-secret-key-for-testing-purposes') as any;
      expect(decoded.userId).toBe(userId);
    });
  });
});
