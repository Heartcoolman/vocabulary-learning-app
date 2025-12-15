/**
 * useSubmitAnswer Hook 测试
 *
 * 测试场景：
 * 1. 正常提交答题
 * 2. 乐观更新
 * 3. 错误回滚
 * 4. 重试机制
 * 5. AMAS结果更新
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSubmitAnswer, extractAmasState, shouldTakeBreak } from '../useSubmitAnswer';
import * as masteryModule from '../../mastery';
import type { AmasProcessResult } from '../../../types/amas';

// Mock mastery module
vi.mock('../../mastery', () => ({
  processLearningEvent: vi.fn(),
}));

describe('useSubmitAnswer', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    // 创建新的 QueryClient
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // 创建 wrapper
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // 清理 mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('正常提交场景', () => {
    it('应该成功提交答题并返回AMAS结果', async () => {
      // Mock 成功的响应
      const mockAmasResult: AmasProcessResult = {
        sessionId: 'session-123',
        strategy: {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1,
        },
        state: {
          attention: 0.8,
          fatigue: 0.3,
          motivation: 0.7,
          memory: 0.8,
          speed: 0.7,
          stability: 0.8,
          confidence: 0.85,
          timestamp: Date.now(),
        },
        explanation: '学习状态良好',
        shouldBreak: false,
      };

      vi.mocked(masteryModule.processLearningEvent).mockResolvedValue(mockAmasResult);

      // Render hook
      const onSuccess = vi.fn();
      const onAmasResult = vi.fn();

      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            onSuccess,
            onAmasResult,
          }),
        { wrapper },
      );

      // 提交答题
      await act(async () => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      // 等待 mutation 完成
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证
      expect(masteryModule.processLearningEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        }),
      );
      expect(onSuccess).toHaveBeenCalledWith(
        mockAmasResult,
        expect.objectContaining({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        }),
        expect.any(Object),
      );
      expect(onAmasResult).toHaveBeenCalledWith(mockAmasResult);
      expect(result.current.data).toEqual(mockAmasResult);
    });

    it('应该在请求中包含所有必需的字段', async () => {
      const mockAmasResult: AmasProcessResult = {
        sessionId: 'session-123',
        strategy: {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1,
        },
        state: {
          attention: 0.8,
          fatigue: 0.3,
          motivation: 0.7,
          memory: 0.8,
          speed: 0.7,
          stability: 0.8,
        },
        explanation: '学习状态良好',
      };

      vi.mocked(masteryModule.processLearningEvent).mockResolvedValue(mockAmasResult);

      const { result } = renderHook(() => useSubmitAnswer(), { wrapper });

      await act(async () => {
        result.current.mutate({
          wordId: 'word-456',
          isCorrect: false,
          responseTime: 5000,
          sessionId: 'session-456',
          pausedTimeMs: 1000,
          latestAmasState: {
            fatigue: 0.5,
            attention: 0.7,
            motivation: 0.6,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证调用包含所有字段
      expect(masteryModule.processLearningEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          wordId: 'word-456',
          isCorrect: false,
          responseTime: 5000,
          sessionId: 'session-456',
          pausedTimeMs: 1000,
          dwellTime: 5000,
          pauseCount: 0,
          switchCount: 0,
          retryCount: 0,
          focusLossDuration: 0,
          interactionDensity: 1,
          timestamp: expect.any(Number),
        }),
      );
    });
  });

  describe('乐观更新场景', () => {
    it('应该在发送请求前执行乐观更新', async () => {
      const mockAmasResult: AmasProcessResult = {
        sessionId: 'session-123',
        strategy: {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1,
        },
        state: {
          attention: 0.8,
          fatigue: 0.3,
          motivation: 0.7,
          memory: 0.8,
          speed: 0.7,
          stability: 0.8,
        },
        explanation: '学习状态良好',
      };

      // Mock 延迟响应
      vi.mocked(masteryModule.processLearningEvent).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockAmasResult), 1000);
          }),
      );

      const onOptimisticUpdate = vi.fn();
      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            onOptimisticUpdate,
            enableOptimisticUpdate: true,
          }),
        { wrapper },
      );

      // 提交答题
      act(() => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      await waitFor(() => {
        expect(onOptimisticUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            wordId: 'word-123',
            shouldContinue: false,
            isMastered: true,
            correctCount: 1,
            incorrectCount: 0,
          }),
        );
      });

      // 等待 mutation 完成
      await waitFor(
        () => {
          expect(result.current.isSuccess).toBe(true);
        },
        { timeout: 2000 },
      );
    });

    it('禁用乐观更新时不应触发回调', async () => {
      const mockAmasResult: AmasProcessResult = {
        sessionId: 'session-123',
        strategy: {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1,
        },
        state: {
          attention: 0.8,
          fatigue: 0.3,
          motivation: 0.7,
          memory: 0.8,
          speed: 0.7,
          stability: 0.8,
        },
        explanation: '学习状态良好',
      };

      vi.mocked(masteryModule.processLearningEvent).mockResolvedValue(mockAmasResult);

      const onOptimisticUpdate = vi.fn();
      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            onOptimisticUpdate,
            enableOptimisticUpdate: false,
          }),
        { wrapper },
      );

      await act(async () => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证乐观更新未被调用
      expect(onOptimisticUpdate).not.toHaveBeenCalled();
    });
  });

  describe('错误处理和回滚场景', () => {
    it('应该在请求失败时触发错误回调', async () => {
      const mockError = new Error('网络错误');
      vi.mocked(masteryModule.processLearningEvent).mockRejectedValue(mockError);

      const onError = vi.fn();
      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            onError,
            retryCount: 0, // 禁用重试
          }),
        { wrapper },
      );

      await act(async () => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(onError).toHaveBeenCalledWith(mockError);
      expect(result.current.error).toEqual(mockError);
    });

    it('应该在错误时回滚乐观更新', async () => {
      const mockError = new Error('服务器错误');
      vi.mocked(masteryModule.processLearningEvent).mockRejectedValue(mockError);

      // 预设一个 AMAS 结果
      const previousAmasResult: AmasProcessResult = {
        sessionId: 'session-123',
        strategy: {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1,
        },
        state: {
          attention: 0.7,
          fatigue: 0.4,
          motivation: 0.6,
          memory: 0.7,
          speed: 0.6,
          stability: 0.7,
        },
        explanation: '之前的状态',
      };

      queryClient.setQueryData(['amas', 'session-123'], previousAmasResult);

      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            enableOptimisticUpdate: true,
            retryCount: 0,
          }),
        { wrapper },
      );

      await act(async () => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // 验证状态已回滚
      const cachedData = queryClient.getQueryData(['amas', 'session-123']);
      expect(cachedData).toEqual(previousAmasResult);
    });
  });

  describe('重试机制场景', () => {
    it('应该在失败时自动重试', async () => {
      let attemptCount = 0;
      const mockAmasResult: AmasProcessResult = {
        sessionId: 'session-123',
        strategy: {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 10,
          hint_level: 1,
        },
        state: {
          attention: 0.8,
          fatigue: 0.3,
          motivation: 0.7,
          memory: 0.8,
          speed: 0.7,
          stability: 0.8,
        },
        explanation: '学习状态良好',
      };

      vi.mocked(masteryModule.processLearningEvent).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error('临时错误'));
        }
        return Promise.resolve(mockAmasResult);
      });

      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            retryCount: 3,
            retryDelay: 100,
          }),
        { wrapper },
      );

      await act(async () => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      // 等待重试完成
      await waitFor(
        () => {
          expect(result.current.isSuccess).toBe(true);
        },
        { timeout: 3000 },
      );

      // 验证重试次数
      expect(attemptCount).toBe(2);
      expect(result.current.data).toEqual(mockAmasResult);
    });

    it('应该在超过最大重试次数后失败', async () => {
      const mockError = new Error('持续失败');
      vi.mocked(masteryModule.processLearningEvent).mockRejectedValue(mockError);

      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            retryCount: 2,
            retryDelay: 100,
          }),
        { wrapper },
      );

      await act(async () => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      // 等待所有重试完成
      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 3000 },
      );

      // 验证最终失败
      expect(result.current.error).toEqual(mockError);
      // 应该尝试了 3 次（初始 + 2 次重试）
      expect(masteryModule.processLearningEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('辅助函数测试', () => {
    describe('extractAmasState', () => {
      it('应该正确提取AMAS状态', () => {
        const result: AmasProcessResult = {
          sessionId: 'session-123',
          strategy: {
            interval_scale: 1.0,
            new_ratio: 0.3,
            difficulty: 'mid',
            batch_size: 10,
            hint_level: 1,
          },
          state: {
            attention: 0.8,
            fatigue: 0.3,
            motivation: 0.7,
            memory: 0.8,
            speed: 0.7,
            stability: 0.8,
          },
          explanation: '学习状态良好',
        };

        const extracted = extractAmasState(result);

        expect(extracted).toEqual({
          fatigue: 0.3,
          attention: 0.8,
          motivation: 0.7,
        });
      });

      it('应该在结果为null时返回undefined', () => {
        const extracted = extractAmasState(null);
        expect(extracted).toBeUndefined();
      });
    });

    describe('shouldTakeBreak', () => {
      it('应该在显式建议休息时返回true', () => {
        const result: AmasProcessResult = {
          sessionId: 'session-123',
          strategy: {
            interval_scale: 1.0,
            new_ratio: 0.3,
            difficulty: 'mid',
            batch_size: 10,
            hint_level: 1,
          },
          state: {
            attention: 0.8,
            fatigue: 0.3,
            motivation: 0.7,
            memory: 0.8,
            speed: 0.7,
            stability: 0.8,
          },
          explanation: '建议休息',
          shouldBreak: true,
        };

        expect(shouldTakeBreak(result)).toBe(true);
      });

      it('应该在高疲劳度时返回true', () => {
        const result: AmasProcessResult = {
          sessionId: 'session-123',
          strategy: {
            interval_scale: 1.0,
            new_ratio: 0.3,
            difficulty: 'mid',
            batch_size: 10,
            hint_level: 1,
          },
          state: {
            attention: 0.8,
            fatigue: 0.9, // 高疲劳度
            motivation: 0.7,
            memory: 0.8,
            speed: 0.7,
            stability: 0.8,
          },
          explanation: '疲劳',
        };

        expect(shouldTakeBreak(result)).toBe(true);
      });

      it('应该在低注意力时返回true', () => {
        const result: AmasProcessResult = {
          sessionId: 'session-123',
          strategy: {
            interval_scale: 1.0,
            new_ratio: 0.3,
            difficulty: 'mid',
            batch_size: 10,
            hint_level: 1,
          },
          state: {
            attention: 0.2, // 低注意力
            fatigue: 0.3,
            motivation: 0.7,
            memory: 0.8,
            speed: 0.7,
            stability: 0.8,
          },
          explanation: '注意力低',
        };

        expect(shouldTakeBreak(result)).toBe(true);
      });

      it('应该在状态良好时返回false', () => {
        const result: AmasProcessResult = {
          sessionId: 'session-123',
          strategy: {
            interval_scale: 1.0,
            new_ratio: 0.3,
            difficulty: 'mid',
            batch_size: 10,
            hint_level: 1,
          },
          state: {
            attention: 0.8,
            fatigue: 0.3,
            motivation: 0.7,
            memory: 0.8,
            speed: 0.7,
            stability: 0.8,
          },
          explanation: '状态良好',
        };

        expect(shouldTakeBreak(result)).toBe(false);
      });

      it('应该在结果为null时返回false', () => {
        expect(shouldTakeBreak(null)).toBe(false);
      });
    });
  });
});
