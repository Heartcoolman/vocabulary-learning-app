import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import LearningProfilePage from '../LearningProfilePage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock data matching actual component expectations
const mockChronotypeData = {
  category: 'morning' as const,
  peakHours: [9, 10, 11],
  confidence: 0.75,
  learningHistory: [
    { hour: 9, performance: 0.85, sampleCount: 10 },
    { hour: 10, performance: 0.82, sampleCount: 8 },
    { hour: 14, performance: 0.68, sampleCount: 5 },
  ],
};

const mockLearningStyleData = {
  style: 'visual' as const,
  confidence: 0.8,
  scores: {
    visual: 0.75,
    auditory: 0.45,
    kinesthetic: 0.35,
  },
};

vi.mock('../../services/client', () => ({
  default: {
    getChronotypeProfile: vi.fn(),
    getLearningStyleProfile: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import apiClient from '../../services/client';

describe('LearningProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getChronotypeProfile as any).mockResolvedValue(mockChronotypeData);
    (apiClient.getLearningStyleProfile as any).mockResolvedValue(mockLearningStyleData);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <LearningProfilePage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习档案分析')).toBeInTheDocument();
      });
    });

    it('should render chronotype section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('生物钟分析')).toBeInTheDocument();
      });
    });

    it('should render learning style section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习风格分析')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      renderComponent();
      expect(screen.getByText('正在加载学习档案...')).toBeInTheDocument();
    });
  });

  describe('Chronotype Display', () => {
    it('should display chronotype category', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('晨间型')).toBeInTheDocument();
      });
    });

    it('should display confidence percentage', async () => {
      renderComponent();

      await waitFor(() => {
        // There can be multiple 75% elements (for chronotype and learning style confidence)
        expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
      });
    });

    it('should display peak hours section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('黄金学习时段')).toBeInTheDocument();
      });
    });
  });

  describe('Learning Style Display', () => {
    it('should display learning style', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('视觉学习者')).toBeInTheDocument();
      });
    });

    it('should display learning style scores', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('视觉学习')).toBeInTheDocument();
        expect(screen.getByText('听觉学习')).toBeInTheDocument();
        expect(screen.getByText('动觉学习')).toBeInTheDocument();
      });
    });
  });

  describe('Recommendations', () => {
    it('should display personalized learning suggestions', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('个性化学习建议')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      (apiClient.getChronotypeProfile as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      (apiClient.getChronotypeProfile as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重新加载')).toBeInTheDocument();
      });
    });

    it('should retry loading when clicking retry button', async () => {
      (apiClient.getChronotypeProfile as any)
        .mockRejectedValueOnce(new Error('加载失败'))
        .mockResolvedValueOnce(mockChronotypeData);
      (apiClient.getLearningStyleProfile as any).mockResolvedValue(mockLearningStyleData);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重新加载')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重新加载'));

      await waitFor(() => {
        expect(screen.getByText('学习档案分析')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show data insufficient message when no peak hours', async () => {
      (apiClient.getChronotypeProfile as any).mockResolvedValue({
        ...mockChronotypeData,
        peakHours: [],
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('数据不足')).toBeInTheDocument();
      });
    });
  });
});
