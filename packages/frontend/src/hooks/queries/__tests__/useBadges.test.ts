import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useUserBadges,
  useAllBadgesWithStatus,
  useBadgeDetails,
  useBadgeProgress,
  useCheckAndAwardBadges,
} from '../useBadges';
import ApiClient from '../../../services/ApiClient';
import type { Badge, BadgeProgress } from '../../../types/amas-enhanced';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getUserBadges: vi.fn(),
    getAllBadgesWithStatus: vi.fn(),
    getBadgeDetails: vi.fn(),
    getBadgeProgress: vi.fn(),
    checkAndAwardBadges: vi.fn(),
  },
}));

const mockApiClient = ApiClient as {
  getUserBadges: ReturnType<typeof vi.fn>;
  getAllBadgesWithStatus: ReturnType<typeof vi.fn>;
  getBadgeDetails: ReturnType<typeof vi.fn>;
  getBadgeProgress: ReturnType<typeof vi.fn>;
  checkAndAwardBadges: ReturnType<typeof vi.fn>;
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

const mockUserBadgesResponse = {
  badges: [mockBadge],
  count: 1,
};

const mockAllBadgesResponse = {
  badges: [
    { ...mockBadge, unlocked: true },
    {
      id: 'badge-2',
      name: '正确率达标',
      description: '单次学习正确率达到90%',
      category: 'ACCURACY' as const,
      tier: 2,
      iconUrl: '/icons/badge-2.png',
      unlocked: false,
      progress: 75,
    },
  ],
  grouped: {},
  totalCount: 2,
  unlockedCount: 1,
};

const mockBadgeProgress: BadgeProgress = {
  currentValue: 75,
  targetValue: 100,
  percentage: 75,
};

describe('useUserBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch user badges successfully', async () => {
    mockApiClient.getUserBadges.mockResolvedValue(mockUserBadgesResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useUserBadges(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockUserBadgesResponse);
    expect(mockApiClient.getUserBadges).toHaveBeenCalledTimes(1);
  });

  it('should handle API error', async () => {
    const error = new Error('API Error');
    mockApiClient.getUserBadges.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useUserBadges(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should use 5 minute cache', () => {
    const queryClient = createTestQueryClient();
    mockApiClient.getUserBadges.mockResolvedValue(mockUserBadgesResponse);

    const { result } = renderHook(() => useUserBadges(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);
  });
});

describe('useAllBadgesWithStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch all badges with status successfully', async () => {
    mockApiClient.getAllBadgesWithStatus.mockResolvedValue(mockAllBadgesResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAllBadgesWithStatus(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAllBadgesResponse);
    expect(mockApiClient.getAllBadgesWithStatus).toHaveBeenCalledTimes(1);
  });

  it('should handle empty badge list', async () => {
    const emptyResponse = {
      badges: [],
      grouped: {},
      totalCount: 0,
      unlockedCount: 0,
    };
    mockApiClient.getAllBadgesWithStatus.mockResolvedValue(emptyResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAllBadgesWithStatus(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.badges).toHaveLength(0);
  });
});

describe('useBadgeDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch badge details successfully', async () => {
    const badgeDetails = { ...mockBadge, unlocked: true, unlockedAt: mockBadge.unlockedAt };
    mockApiClient.getBadgeDetails.mockResolvedValue(badgeDetails);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useBadgeDetails('badge-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(badgeDetails);
    expect(mockApiClient.getBadgeDetails).toHaveBeenCalledWith('badge-1');
  });

  it('should not fetch when badgeId is empty', () => {
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useBadgeDetails(''), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiClient.getBadgeDetails).not.toHaveBeenCalled();
  });
});

describe('useBadgeProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch badge progress successfully', async () => {
    mockApiClient.getBadgeProgress.mockResolvedValue(mockBadgeProgress);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useBadgeProgress('badge-2'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockBadgeProgress);
    expect(mockApiClient.getBadgeProgress).toHaveBeenCalledWith('badge-2');
  });

  it('should use 1 minute cache for frequent updates', () => {
    const queryClient = createTestQueryClient();
    mockApiClient.getBadgeProgress.mockResolvedValue(mockBadgeProgress);

    const { result } = renderHook(() => useBadgeProgress('badge-2'), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);
  });
});

describe('useCheckAndAwardBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check and award badges successfully', async () => {
    const mockResult = {
      newBadges: [{ badge: mockBadge, reason: 'Test reason' }],
      hasNewBadges: true,
      message: 'Awarded 1 badge',
    };
    mockApiClient.checkAndAwardBadges.mockResolvedValue(mockResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCheckAndAwardBadges(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResult);
    expect(mockApiClient.checkAndAwardBadges).toHaveBeenCalledTimes(1);
  });

  it('should invalidate badge queries on success', async () => {
    const mockResult = {
      newBadges: [],
      hasNewBadges: false,
      message: 'No new badges',
    };
    mockApiClient.checkAndAwardBadges.mockResolvedValue(mockResult);
    mockApiClient.getAllBadgesWithStatus.mockResolvedValue(mockAllBadgesResponse);

    const queryClient = createTestQueryClient();

    // 先获取徽章数据
    const { result: badgesResult } = renderHook(() => useAllBadgesWithStatus(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(badgesResult.current.isSuccess).toBe(true);
    });

    expect(mockApiClient.getAllBadgesWithStatus).toHaveBeenCalledTimes(1);

    // 检查新徽章
    const { result: checkResult } = renderHook(() => useCheckAndAwardBadges(), {
      wrapper: createWrapper(queryClient),
    });

    checkResult.current.mutate();

    await waitFor(() => {
      expect(checkResult.current.isSuccess).toBe(true);
    });

    // 验证徽章查询被重新获取
    await waitFor(() => {
      expect(mockApiClient.getAllBadgesWithStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('should handle check error', async () => {
    const error = new Error('Check failed');
    mockApiClient.checkAndAwardBadges.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCheckAndAwardBadges(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });
});
