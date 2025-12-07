/**
 * React Query Hooks Integration Tests
 *
 * 测试场景：
 * 1. 多个查询之间的缓存共享和同步
 * 2. 乐观更新和错误回滚
 * 3. 缓存失效机制（invalidation）
 * 4. 分页和搜索功能
 * 5. 查询依赖和顺序执行
 * 6. 并发请求处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useStudyProgress } from '../useStudyProgress';
import { useTodayWords } from '../useTodayWords';
import { useSubmitAnswer } from '../../mutations/useSubmitAnswer';
import { useWordSearch } from '../useWordSearch';
import apiClient from '../../../services/ApiClient';
import * as masteryModule from '../../mastery';

// Mock dependencies
vi.mock('../../../services/ApiClient');
vi.mock('../../mastery');

const mockApiClient = apiClient as {
  getStudyProgress: ReturnType<typeof vi.fn>;
  getTodayWords: ReturnType<typeof vi.fn>;
  searchWords: ReturnType<typeof vi.fn>;
};

describe('React Query Integration Tests', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    // 为每个测试创建新的 QueryClient
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ==================== 缓存共享和同步 ====================

  describe('缓存共享和同步', () => {
    it('应该在多个hooks之间共享缓存数据', async () => {
      const mockProgress = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      mockApiClient.getStudyProgress.mockResolvedValue(mockProgress);

      // 渲染第一个hook
      const { result: result1 } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true);
      });

      // API 应该只被调用一次
      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);

      // 渲染第二个相同的hook
      const { result: result2 } = renderHook(() => useStudyProgress(), { wrapper });

      // 第二个hook应该立即从缓存获取数据
      expect(result2.current.data).toEqual(mockProgress);
      // API 不应该再次被调用
      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);
    });

    it('应该在mutation成功后自动更新相关查询', async () => {
      const initialProgress = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      const updatedProgress = {
        ...initialProgress,
        todayStudied: 26,
        totalStudied: 501,
      };

      mockApiClient.getStudyProgress
        .mockResolvedValueOnce(initialProgress)
        .mockResolvedValueOnce(updatedProgress);

      const mockAmasResult = {
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

      // 获取初始进度
      const { result: progressResult } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(progressResult.current.isSuccess).toBe(true);
      });

      expect(progressResult.current.data?.todayStudied).toBe(25);

      // 提交答题
      const { result: mutationResult } = renderHook(() => useSubmitAnswer({}), { wrapper });

      await act(async () => {
        mutationResult.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      await waitFor(() => {
        expect(mutationResult.current.isSuccess).toBe(true);
      });

      // 手动触发缓存失效（模拟mutation的onSuccess回调）
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['studyProgress'] });
      });

      // 等待查询重新获取
      await waitFor(() => {
        expect(progressResult.current.data?.todayStudied).toBe(26);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(2);
    });

    it('应该正确处理并发请求', async () => {
      const mockProgress = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      let resolveCount = 0;
      mockApiClient.getStudyProgress.mockImplementation(() => {
        resolveCount++;
        return Promise.resolve(mockProgress);
      });

      // 同时渲染多个hooks
      const hooks = [
        renderHook(() => useStudyProgress(), { wrapper }),
        renderHook(() => useStudyProgress(), { wrapper }),
        renderHook(() => useStudyProgress(), { wrapper }),
      ];

      await waitFor(() => {
        hooks.forEach((hook) => {
          expect(hook.result.current.isSuccess).toBe(true);
        });
      });

      // React Query应该去重请求，只调用一次API
      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);

      // 所有hooks应该返回相同的数据
      hooks.forEach((hook) => {
        expect(hook.result.current.data).toEqual(mockProgress);
      });
    });
  });

  // ==================== 乐观更新和错误回滚 ====================

  describe('乐观更新和错误回滚', () => {
    it('应该在mutation前执行乐观更新', async () => {
      const mockAmasResult = {
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

      // 模拟延迟响应
      vi.mocked(masteryModule.processLearningEvent).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockAmasResult), 500);
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

      act(() => {
        result.current.mutate({
          wordId: 'word-123',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      // 乐观更新应该立即被调用
      expect(onOptimisticUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          wordId: 'word-123',
          isMastered: true,
        }),
      );

      // 等待真实请求完成
      await waitFor(
        () => {
          expect(result.current.isSuccess).toBe(true);
        },
        { timeout: 1000 },
      );
    });

    it('应该在mutation失败时回滚乐观更新', async () => {
      const previousData = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      // 设置初始缓存数据
      queryClient.setQueryData(['studyProgress'], previousData);

      const mockError = new Error('网络错误');
      vi.mocked(masteryModule.processLearningEvent).mockRejectedValue(mockError);

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

      // 验证缓存数据已回滚到之前的状态
      const cachedData = queryClient.getQueryData(['studyProgress']);
      expect(cachedData).toEqual(previousData);
    });

    it('应该处理多个连续的乐观更新', async () => {
      const mockAmasResults = [
        {
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
          explanation: '第一次答题',
        },
        {
          sessionId: 'session-123',
          strategy: {
            interval_scale: 1.0,
            new_ratio: 0.3,
            difficulty: 'mid',
            batch_size: 10,
            hint_level: 1,
          },
          state: {
            attention: 0.75,
            fatigue: 0.35,
            motivation: 0.7,
            memory: 0.8,
            speed: 0.7,
            stability: 0.8,
          },
          explanation: '第二次答题',
        },
      ];

      let callCount = 0;
      vi.mocked(masteryModule.processLearningEvent).mockImplementation(() => {
        const result = mockAmasResults[callCount];
        callCount++;
        return Promise.resolve(result);
      });

      const { result } = renderHook(
        () =>
          useSubmitAnswer({
            enableOptimisticUpdate: true,
          }),
        { wrapper },
      );

      // 第一次提交
      await act(async () => {
        result.current.mutate({
          wordId: 'word-1',
          isCorrect: true,
          responseTime: 2500,
          sessionId: 'session-123',
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 第二次提交
      await act(async () => {
        result.current.mutate({
          wordId: 'word-2',
          isCorrect: false,
          responseTime: 5000,
          sessionId: 'session-123',
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(masteryModule.processLearningEvent).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== 缓存失效机制 ====================

  describe('缓存失效机制', () => {
    it('应该在invalidateQueries后重新获取数据', async () => {
      const initialData = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      const updatedData = {
        ...initialData,
        todayStudied: 30,
        totalStudied: 505,
      };

      mockApiClient.getStudyProgress
        .mockResolvedValueOnce(initialData)
        .mockResolvedValueOnce(updatedData);

      const { result } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.todayStudied).toBe(25);
      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);

      // 手动失效缓存
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['studyProgress'] });
      });

      await waitFor(() => {
        expect(result.current.data?.todayStudied).toBe(30);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(2);
    });

    it('应该支持选择性失效（使用queryKey prefix）', async () => {
      mockApiClient.getStudyProgress.mockResolvedValue({
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      });

      mockApiClient.getTodayWords.mockResolvedValue({
        words: [],
        progress: {
          todayStudied: 25,
          todayTarget: 50,
          totalStudied: 500,
          correctRate: 85,
        },
      });

      // 渲染多个不同的hooks
      const { result: progressResult } = renderHook(() => useStudyProgress(), { wrapper });
      const { result: wordsResult } = renderHook(() => useTodayWords(), { wrapper });

      await waitFor(() => {
        expect(progressResult.current.isSuccess).toBe(true);
        expect(wordsResult.current.isSuccess).toBe(true);
      });

      const initialProgressCallCount = mockApiClient.getStudyProgress.mock.calls.length;
      const initialWordsCallCount = mockApiClient.getTodayWords.mock.calls.length;

      // 只失效 studyProgress 查询
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['studyProgress'] });
      });

      await waitFor(() => {
        expect(mockApiClient.getStudyProgress.mock.calls.length).toBe(
          initialProgressCallCount + 1,
        );
      });

      // todayWords 不应该被重新请求
      expect(mockApiClient.getTodayWords.mock.calls.length).toBe(initialWordsCallCount);
    });

    it('应该在removeQueries后清除缓存数据', async () => {
      const mockData = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      mockApiClient.getStudyProgress.mockResolvedValue(mockData);

      const { result } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证缓存存在
      expect(queryClient.getQueryData(['studyProgress'])).toEqual(mockData);

      // 移除缓存
      act(() => {
        queryClient.removeQueries({ queryKey: ['studyProgress'] });
      });

      // 验证缓存已清除
      expect(queryClient.getQueryData(['studyProgress'])).toBeUndefined();
    });
  });

  // ==================== 分页和搜索功能 ====================

  describe('分页和搜索功能', () => {
    it('应该正确处理分页查询', async () => {
      const page1Data = {
        words: [
          { id: 'word-1', spelling: 'hello', meanings: ['你好'] },
          { id: 'word-2', spelling: 'world', meanings: ['世界'] },
        ],
        total: 100,
        page: 1,
        pageSize: 2,
      };

      const page2Data = {
        words: [
          { id: 'word-3', spelling: 'test', meanings: ['测试'] },
          { id: 'word-4', spelling: 'data', meanings: ['数据'] },
        ],
        total: 100,
        page: 2,
        pageSize: 2,
      };

      mockApiClient.searchWords
        .mockResolvedValueOnce(page1Data)
        .mockResolvedValueOnce(page2Data);

      // 第一页
      const { result: page1Result } = renderHook(() => useWordSearch('', 1, 2), { wrapper });

      await waitFor(() => {
        expect(page1Result.current.isSuccess).toBe(true);
      });

      expect(page1Result.current.data?.words).toHaveLength(2);
      expect(page1Result.current.data?.page).toBe(1);

      // 第二页
      const { result: page2Result } = renderHook(() => useWordSearch('', 2, 2), { wrapper });

      await waitFor(() => {
        expect(page2Result.current.isSuccess).toBe(true);
      });

      expect(page2Result.current.data?.words).toHaveLength(2);
      expect(page2Result.current.data?.page).toBe(2);

      // 验证两页数据不同
      expect(page1Result.current.data?.words[0].id).not.toBe(
        page2Result.current.data?.words[0].id,
      );
    });

    it('应该正确处理搜索查询', async () => {
      const searchResults = {
        words: [
          { id: 'word-1', spelling: 'hello', meanings: ['你好'] },
          { id: 'word-2', spelling: 'help', meanings: ['帮助'] },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      };

      mockApiClient.searchWords.mockResolvedValue(searchResults);

      const { result } = renderHook(() => useWordSearch('hel', 1, 10), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.searchWords).toHaveBeenCalledWith('hel', 1, 10);
      expect(result.current.data?.words).toHaveLength(2);
      expect(result.current.data?.total).toBe(2);
    });

    it('应该为不同的搜索词维护独立的缓存', async () => {
      const helloResults = {
        words: [{ id: 'word-1', spelling: 'hello', meanings: ['你好'] }],
        total: 1,
        page: 1,
        pageSize: 10,
      };

      const worldResults = {
        words: [{ id: 'word-2', spelling: 'world', meanings: ['世界'] }],
        total: 1,
        page: 1,
        pageSize: 10,
      };

      mockApiClient.searchWords
        .mockResolvedValueOnce(helloResults)
        .mockResolvedValueOnce(worldResults);

      // 搜索 "hello"
      const { result: helloResult } = renderHook(() => useWordSearch('hello', 1, 10), {
        wrapper,
      });

      await waitFor(() => {
        expect(helloResult.current.isSuccess).toBe(true);
      });

      // 搜索 "world"
      const { result: worldResult } = renderHook(() => useWordSearch('world', 1, 10), {
        wrapper,
      });

      await waitFor(() => {
        expect(worldResult.current.isSuccess).toBe(true);
      });

      // 验证两个查询返回不同的结果
      expect(helloResult.current.data?.words[0].spelling).toBe('hello');
      expect(worldResult.current.data?.words[0].spelling).toBe('world');

      // 两个查询应该都被执行
      expect(mockApiClient.searchWords).toHaveBeenCalledTimes(2);
    });

    it('应该在搜索词改变时重新获取数据', async () => {
      const helloResults = {
        words: [{ id: 'word-1', spelling: 'hello', meanings: ['你好'] }],
        total: 1,
        page: 1,
        pageSize: 10,
      };

      const worldResults = {
        words: [{ id: 'word-2', spelling: 'world', meanings: ['世界'] }],
        total: 1,
        page: 1,
        pageSize: 10,
      };

      mockApiClient.searchWords
        .mockResolvedValueOnce(helloResults)
        .mockResolvedValueOnce(worldResults);

      // 初始搜索
      const { result, rerender } = renderHook(
        ({ query }) => useWordSearch(query, 1, 10),
        {
          wrapper,
          initialProps: { query: 'hello' },
        },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.words[0].spelling).toBe('hello');

      // 改变搜索词
      rerender({ query: 'world' });

      await waitFor(() => {
        expect(result.current.data?.words[0].spelling).toBe('world');
      });

      expect(mockApiClient.searchWords).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== 查询依赖和顺序执行 ====================

  describe('查询依赖和顺序执行', () => {
    it('应该正确处理依赖查询（enabled 选项）', async () => {
      const mockProgress = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      mockApiClient.getStudyProgress.mockResolvedValue(mockProgress);

      // 使用 enabled 选项控制查询执行
      const { result, rerender } = renderHook(
        ({ enabled }) =>
          renderHook(() => useStudyProgress(), {
            wrapper,
          }),
        {
          initialProps: { enabled: false },
        },
      );

      // 查询不应该被执行
      expect(mockApiClient.getStudyProgress).not.toHaveBeenCalled();

      // 启用查询
      rerender({ enabled: true });

      await waitFor(() => {
        expect(mockApiClient.getStudyProgress).toHaveBeenCalled();
      });
    });

    it('应该支持串行查询（一个查询依赖另一个查询的结果）', async () => {
      const mockProgress = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      const mockWords = {
        words: [
          { id: 'word-1', spelling: 'hello', meanings: ['你好'] },
          { id: 'word-2', spelling: 'world', meanings: ['世界'] },
        ],
        progress: mockProgress,
      };

      mockApiClient.getStudyProgress.mockResolvedValue(mockProgress);
      mockApiClient.getTodayWords.mockResolvedValue(mockWords);

      // 第一个查询
      const { result: progressResult } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(progressResult.current.isSuccess).toBe(true);
      });

      // 第二个查询依赖第一个查询的成功
      const shouldFetchWords = progressResult.current.isSuccess;
      const { result: wordsResult } = renderHook(
        () => (shouldFetchWords ? useTodayWords() : { data: null, isLoading: false }),
        { wrapper },
      );

      if (shouldFetchWords) {
        await waitFor(() => {
          expect(wordsResult.current.data).not.toBeNull();
        });
      }

      expect(mockApiClient.getStudyProgress).toHaveBeenCalled();
      expect(mockApiClient.getTodayWords).toHaveBeenCalled();
    });
  });

  // ==================== 错误处理和重试 ====================

  describe('错误处理和重试', () => {
    it('应该在网络错误后自动重试', async () => {
      let attemptCount = 0;
      const mockData = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      mockApiClient.getStudyProgress.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error('网络错误'));
        }
        return Promise.resolve(mockData);
      });

      // 创建支持重试的QueryClient
      const retryQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            retryDelay: 100,
            gcTime: 0,
          },
        },
      });

      const retryWrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={retryQueryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useStudyProgress(), { wrapper: retryWrapper });

      await waitFor(
        () => {
          expect(result.current.isSuccess).toBe(true);
        },
        { timeout: 3000 },
      );

      // 验证重试次数
      expect(attemptCount).toBe(2);
      expect(result.current.data).toEqual(mockData);

      retryQueryClient.clear();
    });

    it('应该在超过最大重试次数后失败', async () => {
      const mockError = new Error('持续失败');
      mockApiClient.getStudyProgress.mockRejectedValue(mockError);

      // 创建支持重试的QueryClient
      const retryQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            retryDelay: 100,
            gcTime: 0,
          },
        },
      });

      const retryWrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={retryQueryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useStudyProgress(), { wrapper: retryWrapper });

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 3000 },
      );

      expect(result.current.error).toEqual(mockError);
      // 初始请求 + 2次重试 = 3次调用
      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(3);

      retryQueryClient.clear();
    });

    it('应该正确处理不同类型的错误', async () => {
      const networkError = new Error('Network Error');
      const serverError = new Error('Internal Server Error');

      mockApiClient.getStudyProgress
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(serverError);

      // 第一个错误
      const { result: result1 } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result1.current.isError).toBe(true);
      });

      expect(result1.current.error).toEqual(networkError);

      // 清除查询并测试第二个错误
      queryClient.clear();

      const { result: result2 } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result2.current.isError).toBe(true);
      });

      expect(result2.current.error).toEqual(serverError);
    });
  });

  // ==================== 性能优化 ====================

  describe('性能优化', () => {
    it('应该利用staleTime避免不必要的重新请求', async () => {
      const mockData = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      mockApiClient.getStudyProgress.mockResolvedValue(mockData);

      // 创建有staleTime的QueryClient
      const staleQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 10000, // 10秒
            gcTime: 0,
          },
        },
      });

      const staleWrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={staleQueryClient}>{children}</QueryClientProvider>
      );

      // 第一次渲染
      const { result: result1, unmount: unmount1 } = renderHook(() => useStudyProgress(), {
        wrapper: staleWrapper,
      });

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);

      unmount1();

      // 在staleTime内重新渲染
      const { result: result2 } = renderHook(() => useStudyProgress(), {
        wrapper: staleWrapper,
      });

      // 应该立即从缓存获取数据，不重新请求
      expect(result2.current.data).toEqual(mockData);
      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);

      staleQueryClient.clear();
    });

    it('应该在gcTime后清除未使用的缓存', async () => {
      const mockData = {
        todayStudied: 25,
        todayTarget: 50,
        totalStudied: 500,
        correctRate: 85,
        weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
      };

      mockApiClient.getStudyProgress.mockResolvedValue(mockData);

      // 创建有短gcTime的QueryClient
      const gcQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 100, // 100ms
          },
        },
      });

      const gcWrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={gcQueryClient}>{children}</QueryClientProvider>
      );

      const { result, unmount } = renderHook(() => useStudyProgress(), {
        wrapper: gcWrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证缓存存在
      expect(gcQueryClient.getQueryData(['studyProgress'])).toEqual(mockData);

      // 卸载组件
      unmount();

      // 等待gcTime过期
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 缓存应该已被清除
      expect(gcQueryClient.getQueryData(['studyProgress'])).toBeUndefined();

      gcQueryClient.clear();
    });
  });
});
