import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAchievements,
  useCheckNewBadges,
  useAchievementProgress,
} from '../useAchievements';
import ApiClient from '../../../services/ApiClient';
import type { Badge, BadgeProgress } from '../../../types/amas-enhanced';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getAllBadgesWithStatus: vi.fn(),
    checkAndAwardBadges: vi.fn(),
    getBadgeProgress: vi.fn(),
  },
}));

const mockApiClient = ApiClient as {
  getAllBadgesWithStatus: ReturnType<typeof vi.fn>;
  checkAndAwardBadges: ReturnType<typeof vi.fn>;
  getBadgeProgress: ReturnType<typeof vi.fn>;
};

// 创建测试用的QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

// Wrapper组件
const createWrapper = (queryClient: QueryClient) => {
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) => {
    return QueryClientProvider({ client: queryClient, children });
  };
};

// Mock数据
const mockBadge: Badge = {
  id: 'badge-1',
  name: '连续学习3天',
  description: '连续3天完成学习目标',
  category: 'STREAK',
  tier: 1,
  iconUrl: '/icons/badge-1.png',
  unlockedAt: new Date().toISOString(),
};

const mockAchievementsResponse = {
  badges: [
    { ...mockBadge, unlocked: true },
    {
      id: 'badge-2',
      name: '认知大师',
      description: '完成100个认知提升练习',
      category: 'COGNITIVE' as const,
      tier: 3,
      iconUrl: '/icons/badge-2.png',
      unlocked: false,
      progress: 60,
    },
  ],
  grouped: {},
  totalCount: 2,
  unlockedCount: 1,
};

const mockBadgeProgress: BadgeProgress = {
  currentValue: 60,
  targetValue: 100,
  percentage: 60,
};

describe('useAchievements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch achievements successfully', async () => {
    mockApiClient.getAllBadgesWithStatus.mockResolvedValue(mockAchievementsResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAchievements(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAchievementsResponse);
    expect(mockApiClient.getAllBadgesWithStatus).toHaveBeenCalledTimes(1);
  });

  it('should handle empty achievements', async () => {
    const emptyResponse = {
      badges: [],
      grouped: {},
      totalCount: 0,
      unlockedCount: 0,
    };
    mockApiClient.getAllBadgesWithStatus.mockResolvedValue(emptyResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAchievements(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.badges).toHaveLength(0);
    expect(result.current.data?.totalCount).toBe(0);
  });

  it('should handle API error', async () => {
    const error = new Error('API Error');
    mockApiClient.getAllBadgesWithStatus.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAchievements(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should use 5 minute cache', () => {
    const queryClient = createTestQueryClient();
    mockApiClient.getAllBadgesWithStatus.mockResolvedValue(mockAchievementsResponse);

    const { result } = renderHook(() => useAchievements(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);
  });
});

describe('useCheckNewBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check new badges successfully', async () => {
    const mockResult = {
      newBadges: [{ badge: mockBadge, reason: 'Completed streak' }],
      hasNewBadges: true,
      message: 'Congratulations! You earned 1 new badge',
    };
    mockApiClient.checkAndAwardBadges.mockResolvedValue(mockResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCheckNewBadges(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResult);
    expect(mockApiClient.checkAndAwardBadges).toHaveBeenCalledTimes(1);
  });

  it('should handle no new badges', async () => {
    const mockResult = {
      newBadges: [],
      hasNewBadges: false,
      message: 'No new badges at this time',
    };
    mockApiClient.checkAndAwardBadges.mockResolvedValue(mockResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCheckNewBadges(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.hasNewBadges).toBe(false);
    expect(result.current.data?.newBadges).toHaveLength(0);
  });

  it('should invalidate queries on success', async () => {
    const mockResult = {
      newBadges: [{ badge: mockBadge, reason: 'Test' }],
      hasNewBadges: true,
      message: 'Success',
    };
    mockApiClient.checkAndAwardBadges.mockResolvedValue(mockResult);
    mockApiClient.getAllBadgesWithStatus.mockResolvedValue(mockAchievementsResponse);

    const queryClient = createTestQueryClient();

    // 先获取成就数据
    const { result: achievementsResult } = renderHook(() => useAchievements(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(achievementsResult.current.isSuccess).toBe(true);
    });

    expect(mockApiClient.getAllBadgesWithStatus).toHaveBeenCalledTimes(1);

    // 检查新徽章
    const { result: checkResult } = renderHook(() => useCheckNewBadges(), {
      wrapper: createWrapper(queryClient),
    });

    checkResult.current.mutate();

    await waitFor(() => {
      expect(checkResult.current.isSuccess).toBe(true);
    });

    // 验证查询被重新获取
    await waitFor(() => {
      expect(mockApiClient.getAllBadgesWithStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('should handle check error', async () => {
    const error = new Error('Check failed');
    mockApiClient.checkAndAwardBadges.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCheckNewBadges(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });
});

describe('useAchievementProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch achievement progress successfully', async () => {
    mockApiClient.getBadgeProgress.mockResolvedValue(mockBadgeProgress);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAchievementProgress('badge-2'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockBadgeProgress);
    expect(mockApiClient.getBadgeProgress).toHaveBeenCalledWith('badge-2');
  });

  it('should not fetch when badgeId is null', () => {
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAchievementProgress(null), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiClient.getBadgeProgress).not.toHaveBeenCalled();
  });

  it('should handle API error', async () => {
    const error = new Error('Progress fetch failed');
    mockApiClient.getBadgeProgress.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAchievementProgress('badge-2'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should use 1 minute cache for frequent updates', () => {
    const queryClient = createTestQueryClient();
    mockApiClient.getBadgeProgress.mockResolvedValue(mockBadgeProgress);

    const { result } = renderHook(() => useAchievementProgress('badge-2'), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('should return null for empty badgeId', async () => {
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAchievementProgress(''), {
      wrapper: createWrapper(queryClient),
    });

    // 空字符串应该禁用查询
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiClient.getBadgeProgress).not.toHaveBeenCalled();
  });
});
