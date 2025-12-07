/**
 * LearningObjectivesPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    getLearningObjectives: vi.fn(),
    switchLearningMode: vi.fn(),
    updateLearningObjectives: vi.fn(),
  },
}));

vi.mock('@/services/ApiClient', () => ({
  default: mockApiClient,
}));

import LearningObjectivesPage from '../LearningObjectivesPage';

describe('LearningObjectivesPage', () => {
  const mockObjectives = {
    userId: 'user-123',
    mode: 'daily' as const,
    primaryObjective: 'accuracy',
    weightShortTerm: 0.4,
    weightLongTerm: 0.4,
    weightEfficiency: 0.2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getLearningObjectives.mockResolvedValue({ data: mockObjectives });
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getByText('学习目标配置')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      mockApiClient.getLearningObjectives.mockImplementation(() => new Promise(() => {}));
      render(<LearningObjectivesPage />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('should display mode options', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getAllByText('考试模式').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('日常模式').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('旅行模式').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('自定义模式').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should display current config section', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getByText('当前配置')).toBeInTheDocument();
      });
    });
  });

  describe('mode switching', () => {
    it('should switch to exam mode', async () => {
      mockApiClient.switchLearningMode.mockResolvedValue({
        data: { ...mockObjectives, mode: 'exam' },
      });

      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getByText('考试模式')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('考试模式'));

      await waitFor(() => {
        expect(mockApiClient.switchLearningMode).toHaveBeenCalledWith('exam', 'manual');
      });
    });

    it('should show success message after mode switch', async () => {
      mockApiClient.switchLearningMode.mockResolvedValue({
        data: { ...mockObjectives, mode: 'exam' },
      });

      render(<LearningObjectivesPage />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('考试模式'));
      });

      await waitFor(() => {
        expect(screen.getByText(/已切换到考试模式/)).toBeInTheDocument();
      });
    });

    it('should disable current mode button', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        const dailyButton = screen.getByRole('button', { name: /日常模式/ });
        expect(dailyButton).toBeDisabled();
      });
    });
  });

  describe('custom mode', () => {
    beforeEach(() => {
      mockApiClient.getLearningObjectives.mockResolvedValue({
        data: { ...mockObjectives, mode: 'custom' },
      });
    });

    it('should show weight sliders in custom mode', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getByText('权重配置')).toBeInTheDocument();
        expect(screen.getAllByText(/短期记忆:/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/长期记忆:/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/学习效率:/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should show save button in custom mode', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存配置' })).toBeInTheDocument();
      });
    });

    it('should save custom config', async () => {
      mockApiClient.updateLearningObjectives.mockResolvedValue({ success: true });

      render(<LearningObjectivesPage />);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
      });

      await waitFor(() => {
        expect(mockApiClient.updateLearningObjectives).toHaveBeenCalled();
      });
    });

    it('should validate weight sum', async () => {
      mockApiClient.getLearningObjectives.mockResolvedValue({
        data: {
          ...mockObjectives,
          mode: 'custom',
          weightShortTerm: 0.5,
          weightLongTerm: 0.5,
          weightEfficiency: 0.5,
        },
      });

      render(<LearningObjectivesPage />);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/权重总和必须为 1.0/)).toBeInTheDocument();
      });
    });

    it('should display weight sum', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getByText(/权重总和:/)).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error when load fails', async () => {
      mockApiClient.getLearningObjectives.mockRejectedValue(new Error('Network error'));

      render(<LearningObjectivesPage />);

      await waitFor(
        () => {
          // Component shows '无法加载配置' on error
          expect(screen.getByText('无法加载配置')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should show error when mode switch fails', async () => {
      mockApiClient.switchLearningMode.mockRejectedValue(new Error('Switch failed'));

      render(<LearningObjectivesPage />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('考试模式'));
      });

      await waitFor(() => {
        expect(screen.getByText('切换模式失败')).toBeInTheDocument();
      });
    });

    it('should use default objectives when 404 returned', async () => {
      mockApiClient.getLearningObjectives.mockRejectedValue({
        response: { status: 404 },
      });

      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getByText('学习模式')).toBeInTheDocument();
      });
    });
  });

  describe('current config display', () => {
    it('should display current mode label', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getAllByText(/日常模式/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should display weight percentages', async () => {
      render(<LearningObjectivesPage />);

      await waitFor(() => {
        expect(screen.getAllByText(/短期记忆/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/长期记忆/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/学习效率/).length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
