/**
 * useAdminStatistics Hook 测试
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdminStatistics, calculateSystemHealth } from '../useAdminStatistics';
import { apiClient } from '../../../services/client';

// Mock API Client
vi.mock('../../../services/client', () => {
  const client = {
    adminGetStatistics: vi.fn(),
  };
  return {
    apiClient: client,
    default: client,
  };
});

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

// Wrapper 组件
function createWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
  return Wrapper;
}

describe('useAdminStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功获取统计数据', async () => {
    const mockStats = {
      totalUsers: 100,
      activeUsers: 80,
      totalWordBooks: 10,
      systemWordBooks: 5,
      userWordBooks: 5,
      totalWords: 1000,
      totalRecords: 5000,
    };

    vi.mocked(apiClient.adminGetStatistics).mockResolvedValueOnce(mockStats);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useAdminStatistics(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockStats);
    expect(apiClient.adminGetStatistics).toHaveBeenCalledTimes(1);
  });

  it('应该处理错误情况', async () => {
    const error = new Error('获取统计数据失败');
    vi.mocked(apiClient.adminGetStatistics).mockRejectedValueOnce(error);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useAdminStatistics(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('当 enabled 为 false 时不应该发起请求', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useAdminStatistics(false), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(apiClient.adminGetStatistics).not.toHaveBeenCalled();
  });
});

describe('calculateSystemHealth', () => {
  it('应该计算优秀的系统健康度', () => {
    const stats = {
      totalUsers: 100,
      activeUsers: 90, // 90% 活跃率
      totalWordBooks: 10,
      systemWordBooks: 5,
      userWordBooks: 5,
      totalWords: 1000, // 每本书100个单词
      totalRecords: 5000, // 每用户50条记录
    };

    const health = calculateSystemHealth(stats);

    expect(health.status).toBe('excellent');
    expect(health.score).toBeGreaterThanOrEqual(90);
    expect(health.issues.length).toBe(0);
  });

  it('应该检测到系统词库不足问题', () => {
    const stats = {
      totalUsers: 100,
      activeUsers: 80,
      totalWordBooks: 5,
      systemWordBooks: 2, // 少于3个系统词库
      userWordBooks: 3,
      totalWords: 1000,
      totalRecords: 5000,
    };

    const health = calculateSystemHealth(stats);

    expect(health.issues).toContain('系统词库数量较少（< 3个）');
    expect(health.score).toBeLessThan(100);
  });

  it('应该检测到单词数量不足问题', () => {
    const stats = {
      totalUsers: 100,
      activeUsers: 80,
      totalWordBooks: 10,
      systemWordBooks: 5,
      userWordBooks: 5,
      totalWords: 400, // 平均每本书40个单词（低于50）
      totalRecords: 5000,
    };

    const health = calculateSystemHealth(stats);

    expect(health.issues).toContain('平均词库单词数较少（< 50个）');
    expect(health.metrics.avgWordsPerBook).toBe(40);
  });

  it('应该检测到学习活跃度低问题', () => {
    const stats = {
      totalUsers: 100,
      activeUsers: 80,
      totalWordBooks: 10,
      systemWordBooks: 5,
      userWordBooks: 5,
      totalWords: 1000,
      totalRecords: 500, // 平均每用户5条记录（低于10）
    };

    const health = calculateSystemHealth(stats);

    expect(health.issues).toContain('用户学习活跃度低（平均 < 10条记录）');
    expect(health.metrics.avgRecordsPerUser).toBe(5);
  });

  it('应该处理无用户的情况', () => {
    const stats = {
      totalUsers: 0,
      activeUsers: 0,
      totalWordBooks: 5,
      systemWordBooks: 5,
      userWordBooks: 0,
      totalWords: 500,
      totalRecords: 0,
    };

    const health = calculateSystemHealth(stats);

    expect(health.status).toBe('warning');
    expect(health.issues).toContain('系统尚无用户');
    expect(health.score).toBe(60);
  });

  it('应该返回正确的健康度等级', () => {
    // 优秀（90+）
    expect(
      calculateSystemHealth({
        totalUsers: 100,
        activeUsers: 90,
        totalWordBooks: 10,
        systemWordBooks: 5,
        userWordBooks: 5,
        totalWords: 1000,
        totalRecords: 5000,
      }).status,
    ).toBe('excellent');

    // 良好（75-89）
    expect(
      calculateSystemHealth({
        totalUsers: 100,
        activeUsers: 80,
        totalWordBooks: 10,
        systemWordBooks: 2, // 触发-15分扣分
        userWordBooks: 8,
        totalWords: 1000,
        totalRecords: 5000,
      }).status,
    ).toBe('good');

    // 警告（60-74）
    expect(
      calculateSystemHealth({
        totalUsers: 100,
        activeUsers: 80,
        totalWordBooks: 5,
        systemWordBooks: 2, // 触发-15分扣分
        userWordBooks: 3,
        totalWords: 200, // 触发-15分扣分（平均40）
        totalRecords: 5000,
      }).status,
    ).toBe('warning');

    // 异常（< 60）
    expect(
      calculateSystemHealth({
        totalUsers: 0,
        activeUsers: 0,
        totalWordBooks: 5,
        systemWordBooks: 2, // -15分
        userWordBooks: 3,
        totalWords: 200, // -15分（平均40）
        totalRecords: 0, // -10分 + 无用户 -30分
      }).status,
    ).toBe('error');
  });
});
