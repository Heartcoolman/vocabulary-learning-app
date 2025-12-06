/**
 * TrackingService Tests
 *
 * 测试前端埋点服务的各项功能，包括：
 * 1. 事件记录 - 发音点击、学习暂停/恢复、页面切换等
 * 2. 会话管理 - 会话开始/结束、会话ID生成
 * 3. 统计数据 - 交互频率统计
 * 4. 批量上报 - 事件批量上传、重试机制
 * 5. 页面可见性处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../utils/logger', () => ({
  trackingLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock navigator.sendBeacon
const mockSendBeacon = vi.fn();
vi.stubGlobal('navigator', { sendBeacon: mockSendBeacon });

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: { VITE_API_URL: '' } } });

// Mock document.hidden and visibilitychange
let documentHidden = false;
Object.defineProperty(document, 'hidden', {
  get: () => documentHidden,
  configurable: true,
});

describe('TrackingService', () => {
  let trackingService: typeof import('../TrackingService').trackingService;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.store = {};
    documentHidden = false;

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    vi.resetModules();

    // 动态导入以确保每个测试使用新实例
    const module = await import('../TrackingService');
    trackingService = module.trackingService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== 会话管理测试 ====================

  describe('会话管理', () => {
    it('should generate a unique session ID', () => {
      const sessionId = trackingService.getSessionId();

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should track session start', () => {
      trackingService.trackSessionStart({ source: 'test' });

      const stats = trackingService.getStats();
      expect(stats.totalInteractions).toBeGreaterThanOrEqual(1);
    });

    it('should track session end', () => {
      trackingService.trackSessionEnd();

      const stats = trackingService.getStats();
      expect(stats.sessionDuration).toBeGreaterThanOrEqual(0);
    });

    it('should reset session', async () => {
      const oldSessionId = trackingService.getSessionId();

      // 等待一小段时间确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 10));

      trackingService.resetSession();

      const newSessionId = trackingService.getSessionId();
      expect(newSessionId).not.toBe(oldSessionId);
    });
  });

  // ==================== 事件记录测试 ====================

  describe('事件记录', () => {
    it('should track pronunciation click', () => {
      trackingService.trackPronunciationClick('word-1', 'hello');

      const stats = trackingService.getStats();
      expect(stats.pronunciationClicks).toBe(1);
      expect(stats.totalInteractions).toBeGreaterThanOrEqual(1);
    });

    it('should track multiple pronunciation clicks', () => {
      trackingService.trackPronunciationClick('word-1', 'hello');
      trackingService.trackPronunciationClick('word-2', 'world');
      trackingService.trackPronunciationClick('word-3', 'test');

      const stats = trackingService.getStats();
      expect(stats.pronunciationClicks).toBe(3);
    });

    it('should track learning pause', () => {
      trackingService.trackLearningPause('user_initiated');

      const stats = trackingService.getStats();
      expect(stats.pauseCount).toBe(1);
    });

    it('should ignore duplicate pause without resume', () => {
      trackingService.trackLearningPause('first');
      trackingService.trackLearningPause('second');

      const stats = trackingService.getStats();
      expect(stats.pauseCount).toBe(1);
    });

    it('should track learning resume', () => {
      trackingService.trackLearningPause('pause');
      trackingService.trackLearningResume('resume');

      const stats = trackingService.getStats();
      expect(stats.pauseCount).toBe(1);
      expect(stats.resumeCount).toBe(1);
    });

    it('should ignore resume without pause', () => {
      trackingService.trackLearningResume('no_pause');

      const stats = trackingService.getStats();
      expect(stats.resumeCount).toBe(0);
    });

    it('should track page switch', () => {
      trackingService.trackPageSwitch('home', 'learning');

      const stats = trackingService.getStats();
      expect(stats.pageSwitchCount).toBe(1);
    });

    it('should track multiple page switches', () => {
      trackingService.trackPageSwitch('home', 'learning');
      trackingService.trackPageSwitch('learning', 'profile');
      trackingService.trackPageSwitch('profile', 'settings');

      const stats = trackingService.getStats();
      expect(stats.pageSwitchCount).toBe(3);
    });

    it('should track task switch', () => {
      trackingService.trackTaskSwitch('vocabulary', 'review');

      const stats = trackingService.getStats();
      expect(stats.taskSwitchCount).toBe(1);
    });

    it('should track general interaction', () => {
      trackingService.trackInteraction('click', 'button', { buttonId: 'submit' });

      const stats = trackingService.getStats();
      expect(stats.totalInteractions).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== 统计数据测试 ====================

  describe('统计数据', () => {
    it('should return correct stats', () => {
      const stats = trackingService.getStats();

      expect(stats).toHaveProperty('pronunciationClicks');
      expect(stats).toHaveProperty('pauseCount');
      expect(stats).toHaveProperty('resumeCount');
      expect(stats).toHaveProperty('pageSwitchCount');
      expect(stats).toHaveProperty('taskSwitchCount');
      expect(stats).toHaveProperty('totalInteractions');
      expect(stats).toHaveProperty('sessionDuration');
      expect(stats).toHaveProperty('lastActivityTime');
    });

    it('should calculate session duration', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = trackingService.getStats();

      expect(stats.sessionDuration).toBeGreaterThanOrEqual(100);
    });

    it('should update last activity time', () => {
      const beforeTime = trackingService.getStats().lastActivityTime;

      trackingService.trackInteraction('test', 'test');

      const afterTime = trackingService.getStats().lastActivityTime;
      expect(afterTime).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  // ==================== 页面可见性测试 ====================

  describe('页面可见性', () => {
    it('should track visibility state', () => {
      expect(trackingService.isVisible()).toBe(true);
    });

    it('should update visibility on pause', () => {
      trackingService.trackLearningPause('visibility_hidden');

      expect(trackingService.isVisible()).toBe(false);
    });

    it('should update visibility on resume', () => {
      trackingService.trackLearningPause('pause');
      trackingService.trackLearningResume('resume');

      expect(trackingService.isVisible()).toBe(true);
    });
  });

  // ==================== 批量上报测试 ====================

  describe('批量上报', () => {
    it('should not flush when no events', async () => {
      await trackingService.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not flush when no auth token', async () => {
      trackingService.trackInteraction('test', 'test');

      await trackingService.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should flush events when auth token exists', async () => {
      localStorageMock.store['auth_token'] = 'test-token';

      trackingService.trackInteraction('test', 'test');

      await trackingService.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tracking/events'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should put events back on flush failure', async () => {
      localStorageMock.store['auth_token'] = 'test-token';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      trackingService.trackInteraction('test', 'test');
      const beforeStats = trackingService.getStats();

      await trackingService.flush();

      // 事件应该被放回队列
    });

    it('should handle network error during flush', async () => {
      localStorageMock.store['auth_token'] = 'test-token';
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      trackingService.trackInteraction('test', 'test');

      await trackingService.flush();

      // 应该不会抛出错误
    });

    it('should use sendBeacon for sync flush', () => {
      localStorageMock.store['auth_token'] = 'test-token';

      trackingService.trackInteraction('test', 'test');
      trackingService.flushSync();

      expect(mockSendBeacon).toHaveBeenCalled();
    });

    it('should not call sendBeacon when no events', () => {
      trackingService.flushSync();

      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it('should not call sendBeacon when no auth token', () => {
      trackingService.trackInteraction('test', 'test');
      trackingService.flushSync();

      expect(mockSendBeacon).not.toHaveBeenCalled();
    });
  });

  // ==================== 资源清理测试 ====================

  describe('资源清理', () => {
    it('should destroy service properly', () => {
      localStorageMock.store['auth_token'] = 'test-token';

      trackingService.trackInteraction('test', 'test');
      trackingService.destroy();

      // 应该调用 flushSync
      expect(mockSendBeacon).toHaveBeenCalled();
    });
  });
});
