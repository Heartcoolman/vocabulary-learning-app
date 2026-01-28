/**
 * useExtendedProgress Tests
 *
 * 测试扩展学习进度 Hook 的功能，包括：
 * 1. 数据获取 - 加载扩展进度数据
 * 2. 掌握度分布计算
 * 3. 里程碑生成
 * 4. 学习连续天数计算
 * 5. 月度趋势数据
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useExtendedProgress } from '../useExtendedProgress';
import type { Word, WordLearningState } from '../../types/models';
import { WordState } from '../../types';

// Mock client
vi.mock('../../services/client', () => ({
  wordBookClient: {
    getStudyProgress: vi.fn(),
  },
  learningClient: {
    getRecords: vi.fn(),
  },
}));

// Mock Storage service
vi.mock('../../services/StorageService', () => ({
  default: {
    getWords: vi.fn(),
    getWordLearningStates: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { wordBookClient, learningClient } from '../../services/client';
import StorageService from '../../services/StorageService';

const mockWordBookClient = wordBookClient as unknown as {
  getStudyProgress: ReturnType<typeof vi.fn>;
};

const mockLearningClient = learningClient as unknown as {
  getRecords: ReturnType<typeof vi.fn>;
};

const mockStorageService = StorageService as unknown as {
  getWords: ReturnType<typeof vi.fn>;
  getWordLearningStates: ReturnType<typeof vi.fn>;
};

describe('useExtendedProgress', () => {
  const mockWords: Word[] = [
    {
      id: 'word-1',
      spelling: 'hello',
      phonetic: '/həˈloʊ/',
      meanings: ['你好'],
      examples: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-2',
      spelling: 'world',
      phonetic: '/wɜːrld/',
      meanings: ['世界'],
      examples: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-3',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const mockWordStates: WordLearningState[] = [
    {
      id: 'state-1',
      userId: 'user-123',
      wordId: 'word-1',
      state: WordState.MASTERED,
      masteryLevel: 5,
      easeFactor: 2.5,
      reviewCount: 10,
      lastReviewDate: Date.now() - 86400000,
      nextReviewDate: Date.now() + 86400000 * 7,
      currentInterval: 7,
      consecutiveCorrect: 5,
      consecutiveWrong: 0,
      createdAt: Date.now() - 86400000 * 30,
      updatedAt: Date.now() - 86400000,
    },
    {
      id: 'state-2',
      userId: 'user-123',
      wordId: 'word-2',
      state: WordState.LEARNING,
      masteryLevel: 3,
      easeFactor: 2.3,
      reviewCount: 5,
      lastReviewDate: Date.now() - 86400000 * 2,
      nextReviewDate: Date.now() + 86400000 * 3,
      currentInterval: 3,
      consecutiveCorrect: 3,
      consecutiveWrong: 0,
      createdAt: Date.now() - 86400000 * 15,
      updatedAt: Date.now() - 86400000 * 2,
    },
    {
      id: 'state-3',
      userId: 'user-123',
      wordId: 'word-3',
      state: WordState.NEW,
      masteryLevel: 1,
      easeFactor: 2.5,
      reviewCount: 1,
      lastReviewDate: Date.now() - 86400000,
      nextReviewDate: Date.now() + 86400000,
      currentInterval: 1,
      consecutiveCorrect: 1,
      consecutiveWrong: 0,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    },
  ];

  const mockBasicProgress = {
    todayStudied: 25,
    todayTarget: 50,
    totalStudied: 500,
    correctRate: 0.85,
    weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
  };

  const mockRecords = {
    records: [
      { id: 'r1', wordId: 'word-1', isCorrect: true, timestamp: Date.now() - 1000 },
      { id: 'r2', wordId: 'word-2', isCorrect: true, timestamp: Date.now() - 2000 },
      { id: 'r3', wordId: 'word-3', isCorrect: false, timestamp: Date.now() - 3000 },
      { id: 'r4', wordId: 'word-1', isCorrect: true, timestamp: Date.now() - 86400000 },
      { id: 'r5', wordId: 'word-2', isCorrect: true, timestamp: Date.now() - 86400000 * 2 },
    ],
    total: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWordBookClient.getStudyProgress.mockResolvedValue(mockBasicProgress);
    mockLearningClient.getRecords.mockResolvedValue(mockRecords);
    mockStorageService.getWords.mockResolvedValue(mockWords);
    mockStorageService.getWordLearningStates.mockResolvedValue(mockWordStates);
  });

  // ==================== 用户验证测试 ====================

  describe('用户验证', () => {
    it('should set error when userId is undefined', async () => {
      const { result } = renderHook(() => useExtendedProgress(undefined));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('用户未登录');
      expect(result.current.progress).toBeNull();
    });

    it('should fetch data when userId is provided', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress).not.toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  // ==================== 数据获取测试 ====================

  describe('数据获取', () => {
    it('should fetch basic progress data', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockWordBookClient.getStudyProgress).toHaveBeenCalled();
      expect(result.current.progress?.todayStudied).toBe(25);
      expect(result.current.progress?.todayTarget).toBe(50);
    });

    it('should fetch words and states', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockStorageService.getWords).toHaveBeenCalled();
      expect(mockStorageService.getWordLearningStates).toHaveBeenCalledWith('user-123', [
        'word-1',
        'word-2',
        'word-3',
      ]);
    });

    it('should fetch records for calculations', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockLearningClient.getRecords).toHaveBeenCalledWith({ pageSize: 1000 });
    });
  });

  // ==================== 掌握度分布测试 ====================

  describe('掌握度分布', () => {
    it('should calculate mastery distribution', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const distribution = result.current.progress?.masteryDistribution;
      expect(distribution).toBeDefined();
      expect(distribution?.length).toBe(6); // Levels 0-5
    });

    it('should count words at each mastery level', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const distribution = result.current.progress?.masteryDistribution;

      // Level 1: 1 word (word-3)
      const level1 = distribution?.find((d) => d.level === 1);
      expect(level1?.count).toBe(1);

      // Level 3: 1 word (word-2)
      const level3 = distribution?.find((d) => d.level === 3);
      expect(level3?.count).toBe(1);

      // Level 5: 1 word (word-1)
      const level5 = distribution?.find((d) => d.level === 5);
      expect(level5?.count).toBe(1);
    });

    it('should calculate percentage correctly', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const distribution = result.current.progress?.masteryDistribution;
      const level5 = distribution?.find((d) => d.level === 5);

      // 1 out of 3 words = 33.33%
      expect(level5?.percentage).toBeCloseTo(33.33, 1);
    });
  });

  // ==================== 里程碑测试 ====================

  describe('里程碑', () => {
    it('should generate milestones', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const milestones = result.current.progress?.milestones;
      expect(milestones).toBeDefined();
      expect(milestones?.length).toBeGreaterThan(0);
    });

    it('should include daily target milestone', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const dailyMilestone = result.current.progress?.milestones?.find((m) => m.id === 'daily');
      expect(dailyMilestone).toBeDefined();
      expect(dailyMilestone?.title).toBe('每日目标');
      expect(dailyMilestone?.target).toBe(50);
      expect(dailyMilestone?.current).toBe(25);
    });

    it('should include weekly target milestone', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const weeklyMilestone = result.current.progress?.milestones?.find((m) => m.id === 'weekly');
      expect(weeklyMilestone).toBeDefined();
      expect(weeklyMilestone?.title).toBe('本周目标');
    });

    it('should include learning streak milestone', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const streakMilestone = result.current.progress?.milestones?.find((m) => m.id === 'streak');
      expect(streakMilestone).toBeDefined();
      expect(streakMilestone?.title).toBe('学习连胜');
    });

    it('should include mastery milestone', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const masteryMilestone = result.current.progress?.milestones?.find((m) => m.id === 'mastery');
      expect(masteryMilestone).toBeDefined();
      expect(masteryMilestone?.title).toBe('词汇掌握');
    });
  });

  // ==================== 学习连续天数测试 ====================

  describe('学习连续天数', () => {
    it('should calculate learning streak', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.learningStreak).toBeDefined();
      expect(typeof result.current.progress?.learningStreak).toBe('number');
    });

    it('should handle no learning streak', async () => {
      // Mock records with no recent activity
      mockLearningClient.getRecords.mockResolvedValueOnce({
        records: [
          {
            id: 'r1',
            wordId: 'word-1',
            isCorrect: true,
            timestamp: Date.now() - 86400000 * 10, // 10 days ago
          },
        ],
        total: 1,
      });

      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.learningStreak).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 月度趋势测试 ====================

  describe('月度趋势', () => {
    it('should generate monthly trend data', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.monthlyTrend).toBeDefined();
      expect(result.current.progress?.monthlyTrend?.length).toBe(30);
    });

    it('should have numeric values in monthly trend', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      result.current.progress?.monthlyTrend?.forEach((value) => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ==================== 错误处理测试 ====================

  describe('错误处理', () => {
    it('should handle API error', async () => {
      mockWordBookClient.getStudyProgress.mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('无法加载学习进度，请检查网络连接。');
      expect(result.current.progress).toBeNull();
    });

    it('should clear error on successful refresh', async () => {
      mockWordBookClient.getStudyProgress.mockRejectedValueOnce(new Error('First call failed'));

      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Reset mock for successful fetch
      mockWordBookClient.getStudyProgress.mockResolvedValueOnce(mockBasicProgress);

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
    });
  });

  // ==================== 刷新功能测试 ====================

  describe('刷新功能', () => {
    it('should provide refresh function', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('should refresh data when refresh is called', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refresh();
      });

      // API should be called again
      expect(mockWordBookClient.getStudyProgress).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== 计算测试 ====================

  describe('计算', () => {
    it('should calculate weekly progress', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.weeklyProgress).toBeDefined();
      expect(typeof result.current.progress?.weeklyProgress).toBe('number');
    });

    it('should calculate weekly target', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Weekly target = daily target * 7
      expect(result.current.progress?.weeklyTarget).toBe(50 * 7);
    });

    it('should calculate estimated days to complete', async () => {
      const { result } = renderHook(() => useExtendedProgress('user-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const estimated = result.current.progress?.estimatedDaysToComplete;
      expect(estimated === null || typeof estimated === 'number').toBe(true);
    });
  });
});
