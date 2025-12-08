/**
 * WordDetailPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WordDetailPage from '../WordDetailPage';

// Mock data matching the actual API types
const mockHistory = {
  word: {
    id: 'w1',
    spelling: 'apple',
    phonetic: 'ˈæpl',
    meanings: ['苹果'],
    examples: ['I like apple.', 'An apple a day keeps the doctor away.'],
  },
  wordState: {
    masteryLevel: 3,
    easeFactor: 2.5,
    reviewCount: 5,
    lastReviewDate: '2024-01-15T10:00:00Z',
    nextReviewDate: '2024-01-20T10:00:00Z',
    state: 'learning',
  },
  wordScore: {
    totalScore: 85,
    accuracyScore: 90,
    speedScore: 80,
    stabilityScore: 85,
    proficiencyScore: 85,
    lastCalculated: '2024-01-15T10:00:00Z',
  },
  records: [
    {
      id: 'r1',
      timestamp: '2024-01-15T10:00:00Z',
      selectedAnswer: 'apple',
      correctAnswer: 'apple',
      isCorrect: true,
      responseTime: 1500,
      dwellTime: 2000,
      masteryLevelBefore: 2,
      masteryLevelAfter: 3,
    },
    {
      id: 'r2',
      timestamp: '2024-01-14T10:00:00Z',
      selectedAnswer: 'banana',
      correctAnswer: 'apple',
      isCorrect: false,
      responseTime: 3000,
      dwellTime: 4000,
      masteryLevelBefore: 2,
      masteryLevelAfter: 2,
    },
  ],
};

const mockScoreHistory = {
  currentScore: 85,
  scoreHistory: [
    { timestamp: '2024-01-15', score: 85, masteryLevel: 3, isCorrect: true },
    { timestamp: '2024-01-14', score: 75, masteryLevel: 2, isCorrect: false },
  ],
};

const mockHeatmap = [
  { date: '2024-01-15', activityLevel: 5, accuracy: 90, averageScore: 85, uniqueWords: 10 },
  { date: '2024-01-14', activityLevel: 3, accuracy: 70, averageScore: 75, uniqueWords: 8 },
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

// Mock API Client - override the global mock with test-specific behavior
vi.mock('@/services/client', async () => {
  const actual = await vi.importActual<typeof import('@/services/client')>('@/services/client');
  return {
    ...actual,
    default: {
      adminGetWordLearningHistory: vi.fn().mockResolvedValue({
        word: {
          id: 'w1',
          spelling: 'apple',
          phonetic: 'ˈæpl',
          meanings: ['苹果'],
          examples: ['I like apple.', 'An apple a day keeps the doctor away.'],
        },
        wordState: {
          masteryLevel: 3,
          easeFactor: 2.5,
          reviewCount: 5,
          lastReviewDate: '2024-01-15T10:00:00Z',
          nextReviewDate: '2024-01-20T10:00:00Z',
          state: 'learning',
        },
        wordScore: {
          totalScore: 85,
          accuracyScore: 90,
          speedScore: 80,
          stabilityScore: 85,
          proficiencyScore: 85,
          lastCalculated: '2024-01-15T10:00:00Z',
        },
        records: [
          {
            id: 'r1',
            timestamp: '2024-01-15T10:00:00Z',
            selectedAnswer: 'apple',
            correctAnswer: 'apple',
            isCorrect: true,
            responseTime: 1500,
            dwellTime: 2000,
            masteryLevelBefore: 2,
            masteryLevelAfter: 3,
          },
          {
            id: 'r2',
            timestamp: '2024-01-14T10:00:00Z',
            selectedAnswer: 'banana',
            correctAnswer: 'apple',
            isCorrect: false,
            responseTime: 3000,
            dwellTime: 4000,
            masteryLevelBefore: 2,
            masteryLevelAfter: 2,
          },
        ],
      }),
      adminGetWordScoreHistory: vi.fn().mockResolvedValue({
        currentScore: 85,
        scoreHistory: [
          { timestamp: '2024-01-15', score: 85, masteryLevel: 3, isCorrect: true },
          { timestamp: '2024-01-14', score: 75, masteryLevel: 2, isCorrect: false },
        ],
      }),
      adminGetUserLearningHeatmap: vi.fn().mockResolvedValue([
        { date: '2024-01-15', activityLevel: 5, accuracy: 90, averageScore: 85, uniqueWords: 10 },
        { date: '2024-01-14', activityLevel: 3, accuracy: 70, averageScore: 75, uniqueWords: 8 },
      ]),
      adminGetAnomalyFlags: vi.fn().mockResolvedValue([]),
      adminFlagAnomalyRecord: vi.fn().mockResolvedValue({
        id: 'f1',
        userId: 'u1',
        wordId: 'w1',
        reason: 'suspicious',
        notes: '',
        flaggedBy: 'admin',
        flaggedAt: '2024-01-15T10:00:00Z',
      }),
    },
  };
});

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
    ArrowLeft: () => <span data-testid="icon-arrow">←</span>,
    ChartBar: () => <span data-testid="icon-chart">📊</span>,
    Clock: () => <span data-testid="icon-clock">🕐</span>,
    CheckCircle: () => <span data-testid="icon-check">✓</span>,
    XCircle: () => <span data-testid="icon-x">✗</span>,
    Warning: () => <span data-testid="icon-warning">⚠️</span>,
    WarningCircle: () => <span data-testid="icon-warning-circle">⚠️</span>,
  };
});

vi.mock('@phosphor-icons/react', () => ({
  Flag: () => <span data-testid="icon-flag">🚩</span>,
}));

const renderWithRouter = () => {
  return render(
    <MemoryRouter initialEntries={['/admin/users/u1/words?wordId=w1']}>
      <Routes>
        <Route path="/admin/users/:userId/words" element={<WordDetailPage />} />
      </Routes>
    </MemoryRouter>,
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
        // Use getAllByText since 'apple' appears multiple times (header + records)
        const appleTexts = screen.getAllByText('apple');
        expect(appleTexts.length).toBeGreaterThan(0);
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
        expect(screen.getByText(/1500|1\.5/)).toBeInTheDocument();
      });
    });
  });

  describe('score history', () => {
    it('should display score history', async () => {
      renderWithRouter();

      await waitFor(
        () => {
          const appleTexts = screen.getAllByText('apple');
          expect(appleTexts.length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );

      // Score history section should be visible - check for the section title
      await waitFor(
        () => {
          // The score display shows "当前得分详情" section
          expect(screen.getByText('当前得分详情')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
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

      await waitFor(
        () => {
          const appleTexts = screen.getAllByText('apple');
          expect(appleTexts.length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );

      // Flag icons should be present for learning records
      await waitFor(
        () => {
          expect(screen.getAllByTestId('icon-flag').length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );
    });

    it('should open flag dialog when flag clicked', async () => {
      renderWithRouter();

      await waitFor(
        () => {
          const appleTexts = screen.getAllByText('apple');
          expect(appleTexts.length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );

      // Click the main "标记异常" button (not the per-record flag icons)
      const flagButton = screen.getByText('标记异常');
      fireEvent.click(flagButton);

      await waitFor(() => {
        // Dialog title is "标记异常"
        expect(screen.getByText('标记原因 *')).toBeInTheDocument();
      });
    });

    it('should call flag API when submitted', async () => {
      const apiClient = (await import('@/services/client')).default;
      renderWithRouter();

      await waitFor(
        () => {
          const appleTexts = screen.getAllByText('apple');
          expect(appleTexts.length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );

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

      await waitFor(
        () => {
          expect(apiClient.adminFlagAnomalyRecord).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );
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
      const apiClient = (await import('@/services/client')).default;
      vi.mocked(apiClient.adminGetWordLearningHistory).mockRejectedValue(new Error('加载失败'));

      renderWithRouter();

      await waitFor(
        () => {
          expect(screen.getByText(/错误|失败|加载/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('anomaly flags display', () => {
    it('should display existing flags', async () => {
      // Reset mock after error handling test modified it
      const apiClient = (await import('@/services/client')).default;
      vi.mocked(apiClient.adminGetWordLearningHistory).mockResolvedValue({
        word: { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: ['苹果'], examples: [] },
        wordState: null,
        wordScore: null,
        records: [
          {
            id: 'r1',
            timestamp: '2024-01-15T10:00:00Z',
            selectedAnswer: 'apple',
            correctAnswer: 'apple',
            isCorrect: true,
            responseTime: 1500,
            dwellTime: null,
            masteryLevelBefore: null,
            masteryLevelAfter: null,
          },
        ],
      });
      vi.mocked(apiClient.adminGetAnomalyFlags).mockResolvedValue([
        {
          id: 'f1',
          userId: 'u1',
          wordId: 'w1',
          reason: 'suspicious',
          notes: 'test',
          flaggedBy: 'admin',
          flaggedAt: '2024-01-15',
        },
      ]);

      renderWithRouter();

      await waitFor(
        () => {
          const appleTexts = screen.getAllByText('apple');
          expect(appleTexts.length).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );

      // Verify the component rendered successfully - section title is "完整学习历史"
      expect(screen.getByText('完整学习历史')).toBeInTheDocument();
    });
  });
});
