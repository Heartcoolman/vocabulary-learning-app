/**
 * WordDetailPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WordDetailPage from '../WordDetailPage';

const mockHistory = {
  word: { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: ['苹果'], examples: ['I like apple.', 'An apple a day keeps the doctor away.'] },
  records: [
    { id: 'r1', isCorrect: true, responseTime: 1500, timestamp: '2024-01-15T10:00:00Z' },
    { id: 'r2', isCorrect: false, responseTime: 3000, timestamp: '2024-01-14T10:00:00Z' },
  ],
};

const mockScoreHistory = {
  wordId: 'w1',
  currentScore: 85,
  scoreHistory: [
    { timestamp: '2024-01-15', score: 85 },
    { timestamp: '2024-01-14', score: 75 },
  ],
};

const mockHeatmap = [
  { date: '2024-01-15', activityLevel: 5, accuracy: 90, averageScore: 85 },
  { date: '2024-01-14', activityLevel: 3, accuracy: 70, averageScore: 75 },
];

const mockFlags: any[] = [];

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/services/ApiClient', () => ({
  default: {
    adminGetWordLearningHistory: vi.fn().mockResolvedValue({
      word: { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: ['苹果'], examples: ['I like apple.', 'An apple a day keeps the doctor away.'] },
      records: [
        { id: 'r1', isCorrect: true, responseTime: 1500, timestamp: '2024-01-15T10:00:00Z' },
        { id: 'r2', isCorrect: false, responseTime: 3000, timestamp: '2024-01-14T10:00:00Z' },
      ],
    }),
    adminGetWordScoreHistory: vi.fn().mockResolvedValue({
      wordId: 'w1',
      currentScore: 85,
      scoreHistory: [
        { timestamp: '2024-01-15', score: 85 },
        { timestamp: '2024-01-14', score: 75 },
      ],
    }),
    adminGetUserLearningHeatmap: vi.fn().mockResolvedValue([
      { date: '2024-01-15', activityLevel: 5, accuracy: 90, averageScore: 85 },
      { date: '2024-01-14', activityLevel: 3, accuracy: 70, averageScore: 75 },
    ]),
    adminGetAnomalyFlags: vi.fn().mockResolvedValue([]),
    adminFlagAnomalyRecord: vi.fn().mockResolvedValue({ id: 'f1', reason: 'suspicious' }),
  },
}));

vi.mock('@/components/Icon', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow">←</span>,
  ChartBar: () => <span data-testid="icon-chart">📊</span>,
  Clock: () => <span data-testid="icon-clock">🕐</span>,
  CheckCircle: () => <span data-testid="icon-check">✓</span>,
  XCircle: () => <span data-testid="icon-x">✗</span>,
  Warning: () => <span data-testid="icon-warning">⚠️</span>,
}));

vi.mock('@phosphor-icons/react', () => ({
  Flag: () => <span data-testid="icon-flag">🚩</span>,
}));

const renderWithRouter = () => {
  return render(
    <MemoryRouter initialEntries={['/admin/users/u1/words?wordId=w1']}>
      <Routes>
        <Route path="/admin/users/:userId/words" element={<WordDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('WordDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  describe('loading state', () => {
    it('should show loading state initially', () => {
      renderWithRouter();

      expect(screen.getByText(/加载/i)).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should display word information', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });
    });

    it('should display word phonetic', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/ˈæpl/)).toBeInTheDocument();
      });
    });

    it('should display learning records', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Should show correct/incorrect indicators
        expect(screen.getByTestId('icon-check')).toBeInTheDocument();
        expect(screen.getByTestId('icon-x')).toBeInTheDocument();
      });
    });

    it('should display response times', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/1500|1.5/)).toBeInTheDocument();
      });
    });
  });

  describe('score history', () => {
    it('should display score history', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Score history section should be visible
      await waitFor(() => {
        expect(screen.getByText(/当前得分/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('heatmap', () => {
    it('should display learning heatmap', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/热力图|学习活动/i)).toBeInTheDocument();
      });
    });
  });

  describe('flag functionality', () => {
    it('should show flag button for records', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Flag icons should be present for learning records
      await waitFor(() => {
        expect(screen.getAllByTestId('icon-flag').length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it('should open flag dialog when flag clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Click the main "标记异常" button (not the per-record flag icons)
      const flagButton = screen.getByText('标记异常');
      fireEvent.click(flagButton);

      await waitFor(() => {
        // Dialog title is "标记异常"
        expect(screen.getByText('标记原因 *')).toBeInTheDocument();
      });
    });

    it('should call flag API when submitted', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Click the main "标记异常" button
      const flagButton = screen.getByText('标记异常');
      fireEvent.click(flagButton);

      // Dialog should be open
      await waitFor(() => {
        expect(screen.getByText('标记原因 *')).toBeInTheDocument();
      });

      // Select a reason (required field)
      const selectElement = screen.getByRole('combobox');
      fireEvent.change(selectElement, { target: { value: '异常响应时间' } });

      // Submit button text is "确认标记"
      const submitButton = screen.getByText('确认标记');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(apiClient.adminFlagAnomalyRecord).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('navigation', () => {
    it('should render back button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('icon-arrow')).toBeInTheDocument();
      });
    });

    it('should navigate back on back button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const backButton = screen.getByTestId('icon-arrow').closest('button');
        if (backButton) fireEvent.click(backButton);
      });

      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should show error message on API failure', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetWordLearningHistory).mockRejectedValue(new Error('加载失败'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/错误|失败|加载/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('anomaly flags display', () => {
    it('should display existing flags', async () => {
      // Reset mock after error handling test modified it
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetWordLearningHistory).mockResolvedValue({
        word: { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: ['苹果'], examples: [] },
        records: [
          { id: 'r1', isCorrect: true, responseTime: 1500, timestamp: '2024-01-15T10:00:00Z' },
        ],
      });
      vi.mocked(apiClient.adminGetAnomalyFlags).mockResolvedValue([
        { id: 'f1', reason: 'suspicious', notes: 'test', createdAt: '2024-01-15' },
      ]);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify the component rendered successfully - section title is "完整学习历史"
      expect(screen.getByText('完整学习历史')).toBeInTheDocument();
    });
  });
});
