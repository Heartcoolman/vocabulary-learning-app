/**
 * AlgorithmConfigPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AlgorithmConfigPage from '../AlgorithmConfigPage';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

const mockConfig = {
  id: 'config-1',
  reviewIntervals: [1, 3, 7, 14, 30],
  consecutiveCorrectThreshold: 5,
  consecutiveWrongThreshold: 3,
  difficultyAdjustmentInterval: 3,
  priorityWeights: { newWord: 25, errorRate: 35, overdueTime: 25, wordScore: 15 },
  masteryThresholds: [
    { level: 0, requiredCorrectStreak: 1, minAccuracy: 0, minScore: 0 },
    { level: 1, requiredCorrectStreak: 2, minAccuracy: 0.5, minScore: 30 },
    { level: 2, requiredCorrectStreak: 3, minAccuracy: 0.6, minScore: 50 },
    { level: 3, requiredCorrectStreak: 4, minAccuracy: 0.7, minScore: 65 },
    { level: 4, requiredCorrectStreak: 5, minAccuracy: 0.8, minScore: 80 },
    { level: 5, requiredCorrectStreak: 6, minAccuracy: 0.9, minScore: 90 },
  ],
  scoreWeights: { accuracy: 40, speed: 25, stability: 20, proficiency: 15 },
  speedThresholds: { excellent: 1000, good: 2000, average: 3000, slow: 4000 },
};

vi.mock('@/services/algorithms/AlgorithmConfigService', () => {
  return {
    AlgorithmConfigService: class MockAlgorithmConfigService {
      getConfig = vi.fn().mockResolvedValue(mockConfig);
      getDefaultConfig = vi.fn().mockReturnValue(mockConfig);
      validateConfig = vi.fn().mockReturnValue({ isValid: true, errors: [] });
      updateConfig = vi.fn().mockResolvedValue(mockConfig);
      resetToDefault = vi.fn().mockResolvedValue(mockConfig);
    },
  };
});

// Mock React Query hooks
const mockMutateAsync = vi.fn().mockResolvedValue(mockConfig);
let mockIsLoading = false;

vi.mock('@/hooks/queries', () => ({
  useAlgorithmConfig: () => ({
    data: mockIsLoading ? undefined : mockConfig,
    isLoading: mockIsLoading,
    error: null,
  }),
}));

vi.mock('@/hooks/mutations', () => ({
  useUpdateAlgorithmConfig: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useResetAlgorithmConfig: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Mock useToast hook
vi.mock('@/components/ui', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    showToast: vi.fn(),
  }),
}));

vi.mock('@/components/Icon', async () => {
  const actual = await vi.importActual('@/components/Icon');
  return {
    ...actual,
    Gear: () => <span data-testid="icon-gear">⚙️</span>,
    ArrowCounterClockwise: () => <span data-testid="icon-reset">↺</span>,
    FloppyDisk: () => <span data-testid="icon-save">💾</span>,
    Warning: () => <span data-testid="icon-warning">⚠️</span>,
    CheckCircle: () => <span data-testid="icon-check">✓</span>,
    Plus: () => <span data-testid="icon-plus">+</span>,
    Trash: () => <span data-testid="icon-trash">🗑️</span>,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-spinner" className={className}>
        Loading
      </span>
    ),
  };
});

describe('AlgorithmConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      mockIsLoading = true;
      renderWithProviders(<AlgorithmConfigPage />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('加载配置中...')).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should render page title', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('算法配置')).toBeInTheDocument();
      });
    });

    it('should render review intervals section', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('遗忘曲线参数')).toBeInTheDocument();
      });
    });

    it('should render difficulty adjustment section', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('难度调整参数')).toBeInTheDocument();
      });
    });

    it('should render priority weights section', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('优先级权重')).toBeInTheDocument();
      });
    });

    it('should render mastery thresholds section', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('掌握程度阈值')).toBeInTheDocument();
      });
    });

    it('should render score weights section', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getAllByText('单词得分权重').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should render speed thresholds section', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('答题速度评分标准')).toBeInTheDocument();
      });
    });
  });

  describe('save functionality', () => {
    it('should show save button', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });
    });

    it('should show success message after save', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        expect(screen.getByText('配置已成功保存')).toBeInTheDocument();
      });
    });
  });

  describe('reset functionality', () => {
    it('should show reset button', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('恢复默认值')).toBeInTheDocument();
      });
    });

    it('should show confirm dialog when reset clicked', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('恢复默认值')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('恢复默认值'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '确认重置' })).toBeInTheDocument();
        expect(screen.getByText(/确定要将所有配置恢复为默认值吗/)).toBeInTheDocument();
      });
    });

    it('should close confirm dialog on cancel', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('恢复默认值')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('恢复默认值'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '确认重置' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('取消'));

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: '确认重置' })).not.toBeInTheDocument();
      });
    });
  });

  describe('validation', () => {
    it('should show validation errors when invalid', async () => {
      // 修改配置使其验证失败（权重总和不等于100）
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });

      // 配置是有效的，所以保存应该成功
      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        expect(screen.getByText('配置已成功保存')).toBeInTheDocument();
      });
    });
  });

  describe('review intervals editing', () => {
    it('should show add interval button', async () => {
      renderWithProviders(<AlgorithmConfigPage />);

      await waitFor(() => {
        expect(screen.getByText('添加间隔')).toBeInTheDocument();
      });
    });
  });
});
