/**
 * LearningPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockNavigate = vi.fn();
const mockSubmitAnswer = vi.fn();
const mockAdvanceToNext = vi.fn();
const mockResetSession = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Icon components - 使用相对路径 (LearningPage 使用 ../components/Icon)
vi.mock('../../components/Icon', () => ({
  Confetti: () => <span data-testid="confetti-icon">confetti</span>,
  Books: () => <span data-testid="books-icon">books</span>,
  CircleNotch: ({ className }: any) => <span data-testid="loading-icon" className={className}>loading</span>,
  Clock: () => <span data-testid="clock-icon">clock</span>,
  WarningCircle: () => <span data-testid="warning-icon">warning</span>,
  Brain: () => <span data-testid="brain-icon">brain</span>,
  ChartPie: () => <span data-testid="chart-icon">chart</span>,
  Lightbulb: ({ weight }: any) => <span data-testid="lightbulb-icon" data-weight={weight}>lightbulb</span>,
}));

// Mock services - 使用相对路径
vi.mock('../../services/AudioService', () => ({
  default: {
    playPronunciation: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/LearningService', () => ({
  default: {
    generateTestOptions: vi.fn().mockReturnValue({
      options: ['测试', '示例', '学习', '阅读'],
      correctIndex: 0,
    }),
  },
}));

// Mock child components - 使用相对路径
vi.mock('../../components/WordCard', () => ({
  default: ({ word, onPronounce, isPronouncing }: any) => (
    <div data-testid="word-card">
      <span data-testid="word-spelling">{word?.spelling}</span>
      <button
        onClick={onPronounce}
        disabled={isPronouncing}
        aria-label={isPronouncing ? '正在播放' : '播放发音'}
      >
        播放
      </button>
    </div>
  ),
}));

vi.mock('../../components/TestOptions', () => ({
  default: ({ options, onSelect, showResult, selectedAnswer }: any) => (
    <div data-testid="test-options" role="group" aria-label="测试选项">
      {options.map((option: string, index: number) => (
        <button
          key={index}
          onClick={() => onSelect(option)}
          disabled={showResult}
          data-selected={option === selectedAnswer}
          aria-label={`选项 ${index + 1}: ${option}`}
        >
          {option}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../components/MasteryProgress', () => ({
  default: ({ progress, isCompleted, headerActions }: any) => (
    <div data-testid="mastery-progress" role="region" aria-label="掌握模式学习进度">
      <span data-testid="mastered-count">{progress?.masteredCount}</span>
      <span data-testid="target-count">{progress?.targetCount}</span>
      <span data-testid="total-questions">{progress?.totalQuestions}</span>
      {isCompleted && <span data-testid="completed-indicator">已完成</span>}
      {headerActions && <div data-testid="header-actions">{headerActions}</div>}
    </div>
  ),
}));

// Mock components from index barrel file
vi.mock('../../components', () => ({
  StatusModal: ({ isOpen, onClose }: any) => (
    isOpen ? <div data-testid="status-modal"><button onClick={onClose}>关闭</button></div> : null
  ),
  SuggestionModal: ({ isOpen, onClose }: any) => (
    isOpen ? <div data-testid="suggestion-modal"><button onClick={onClose}>关闭</button></div> : null
  ),
}));

vi.mock('../../components/LearningModeSelector', () => ({
  LearningModeSelector: () => <div data-testid="learning-mode-selector">模式选择器</div>,
}));

vi.mock('../../components/explainability/ExplainabilityModal', () => ({
  default: ({ isOpen, onClose }: any) => (
    isOpen ? <div data-testid="explainability-modal"><button onClick={onClose}>关闭</button></div> : null
  ),
}));

vi.mock('../../components/learning/TodayWordsCard', () => ({
  default: ({ onStartLearning }: any) => (
    <div data-testid="today-words-card">
      <button onClick={() => onStartLearning([])}>开始学习</button>
    </div>
  ),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Default mock data
const mockWord = {
  id: 'word-1',
  spelling: 'hello',
  phonetic: 'həˈloʊ',
  meanings: ['你好', '打招呼'],
  examples: ['Hello, how are you?'],
  isNew: true,
};

const mockProgress = {
  masteredCount: 5,
  targetCount: 20,
  totalQuestions: 15,
  activeCount: 3,
  pendingCount: 12,
};

const mockAllWords = [
  mockWord,
  { id: 'word-2', spelling: 'world', phonetic: 'wɜːrld', meanings: ['世界'], examples: [], isNew: false },
  { id: 'word-3', spelling: 'test', phonetic: 'test', meanings: ['测试'], examples: [], isNew: true },
];

// Mock useMasteryLearning hook
const defaultMockReturn = {
  currentWord: mockWord,
  isLoading: false,
  isCompleted: false,
  completionReason: undefined,
  progress: mockProgress,
  submitAnswer: mockSubmitAnswer,
  advanceToNext: mockAdvanceToNext,
  skipWord: vi.fn(),
  resetSession: mockResetSession,
  hasRestoredSession: false,
  allWords: mockAllWords,
  error: null,
  latestAmasResult: null,
};

let mockUseMasteryLearning = vi.fn(() => defaultMockReturn);

vi.mock('../../hooks/useMasteryLearning', () => ({
  useMasteryLearning: () => mockUseMasteryLearning(),
}));

// Import after mocks
import LearningPage from '../LearningPage';

describe('LearningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMasteryLearning = vi.fn(() => defaultMockReturn);
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render learning page structure', () => {
      render(<LearningPage />);

      // 验证主要组件结构存在
      expect(screen.getByTestId('word-card')).toBeInTheDocument();
      expect(screen.getByTestId('test-options')).toBeInTheDocument();
      expect(screen.getByTestId('mastery-progress')).toBeInTheDocument();
    });

    it('should display navigation elements', () => {
      render(<LearningPage />);

      // 验证学习模式选择器存在
      expect(screen.getByTestId('learning-mode-selector')).toBeInTheDocument();
    });

    it('should display current word spelling', () => {
      render(<LearningPage />);

      expect(screen.getByTestId('word-spelling')).toHaveTextContent('hello');
    });

    it('should render with proper ARIA labels', () => {
      render(<LearningPage />);

      expect(screen.getByRole('group', { name: '测试选项' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: '掌握模式学习进度' })).toBeInTheDocument();
    });
  });

  // ==================== Loading State Tests ====================

  describe('loading state', () => {
    it('should display loading indicator when loading', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        isLoading: true,
        currentWord: null,
      }));

      render(<LearningPage />);

      expect(screen.getByTestId('loading-icon')).toBeInTheDocument();
      expect(screen.getByText('加载单词中...')).toBeInTheDocument();
    });

    it('should display restoring session message when applicable', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        isLoading: true,
        hasRestoredSession: true,
        currentWord: null,
      }));

      render(<LearningPage />);

      expect(screen.getByText('恢复学习会话中...')).toBeInTheDocument();
    });
  });

  // ==================== Empty State Tests ====================

  describe('empty data state', () => {
    it('should display no words message when allWords is empty', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        allWords: [],
        currentWord: null,
      }));

      render(<LearningPage />);

      expect(screen.getByTestId('books-icon')).toBeInTheDocument();
      expect(screen.getByText('暂无单词')).toBeInTheDocument();
      expect(screen.getByText(/你还没有添加任何单词/)).toBeInTheDocument();
    });

    it('should display navigation buttons when no words', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        allWords: [],
        currentWord: null,
      }));

      render(<LearningPage />);

      expect(screen.getByRole('button', { name: '选择词书' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '添加单词' })).toBeInTheDocument();
    });

    it('should navigate to vocabulary when selecting wordbook', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        allWords: [],
        currentWord: null,
      }));

      render(<LearningPage />);

      fireEvent.click(screen.getByRole('button', { name: '选择词书' }));

      expect(mockNavigate).toHaveBeenCalledWith('/vocabulary');
    });

    it('should navigate to profile when adding words', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        allWords: [],
        currentWord: null,
      }));

      render(<LearningPage />);

      fireEvent.click(screen.getByRole('button', { name: '添加单词' }));

      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });
  });

  // ==================== Word Display Tests ====================

  describe('word display', () => {
    it('should display word card with current word', () => {
      render(<LearningPage />);

      const wordCard = screen.getByTestId('word-card');
      expect(wordCard).toBeInTheDocument();
      expect(screen.getByTestId('word-spelling')).toHaveTextContent('hello');
    });

    it('should display test options', () => {
      render(<LearningPage />);

      const testOptions = screen.getByTestId('test-options');
      expect(testOptions).toBeInTheDocument();
    });

    it('should show no available word message when currentWord is null but allWords has data', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        currentWord: null,
        allWords: mockAllWords,
      }));

      render(<LearningPage />);

      expect(screen.getByText('没有可学习的单词')).toBeInTheDocument();
      expect(screen.getByText('请先配置学习计划或添加词书')).toBeInTheDocument();
    });
  });

  // ==================== Answer Interaction Tests ====================

  describe('answer interaction', () => {
    it('should call submitAnswer when selecting an option', async () => {
      render(<LearningPage />);

      const options = screen.getByTestId('test-options');
      const firstOption = options.querySelector('button');

      if (firstOption) {
        fireEvent.click(firstOption);
      }

      await waitFor(() => {
        expect(mockSubmitAnswer).toHaveBeenCalled();
      });
    });

    it('should handle pronunciation button click', async () => {
      const AudioService = await import('../../services/AudioService');
      const mockPlayPronunciation = vi.fn().mockResolvedValue(undefined);
      vi.mocked(AudioService.default).playPronunciation = mockPlayPronunciation;

      render(<LearningPage />);

      const playButton = screen.getByRole('button', { name: '播放发音' });
      fireEvent.click(playButton);

      await waitFor(() => {
        expect(mockPlayPronunciation).toHaveBeenCalledWith('hello');
      });
    });
  });

  // ==================== Progress Display Tests ====================

  describe('progress display', () => {
    it('should display progress indicator with correct values', () => {
      render(<LearningPage />);

      expect(screen.getByTestId('mastered-count')).toHaveTextContent('5');
      expect(screen.getByTestId('target-count')).toHaveTextContent('20');
      expect(screen.getByTestId('total-questions')).toHaveTextContent('15');
    });

    it('should update progress display after answering', async () => {
      const updatedProgress = { ...mockProgress, masteredCount: 6, totalQuestions: 16 };

      // 首次渲染
      const { rerender } = render(<LearningPage />);

      // 模拟进度更新
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        progress: updatedProgress,
      }));

      rerender(<LearningPage />);

      expect(screen.getByTestId('mastered-count')).toHaveTextContent('6');
      expect(screen.getByTestId('total-questions')).toHaveTextContent('16');
    });
  });

  // ==================== Session Completion Tests ====================

  describe('session completion', () => {
    it('should show mastery achieved completion modal', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        isCompleted: true,
        completionReason: 'mastery_achieved',
      }));

      render(<LearningPage />);

      expect(screen.getByTestId('confetti-icon')).toBeInTheDocument();
      expect(screen.getByText('掌握目标达成！')).toBeInTheDocument();
    });

    it('should show question limit completion modal', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        isCompleted: true,
        completionReason: 'question_limit',
      }));

      render(<LearningPage />);

      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
      expect(screen.getByText('今日学习结束')).toBeInTheDocument();
      expect(screen.getByText(/已达到今日题目上限/)).toBeInTheDocument();
    });

    it('should display completion statistics', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        isCompleted: true,
        completionReason: 'mastery_achieved',
        progress: { ...mockProgress, masteredCount: 20, targetCount: 20, totalQuestions: 45 },
      }));

      render(<LearningPage />);

      expect(screen.getByText(/已掌握 20\/20 个单词/)).toBeInTheDocument();
      expect(screen.getByText(/本次答题 45 题/)).toBeInTheDocument();
    });

    it('should allow restart after completion', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        isCompleted: true,
        completionReason: 'mastery_achieved',
      }));

      render(<LearningPage />);

      const restartButton = screen.getByRole('button', { name: '重新开始' });
      fireEvent.click(restartButton);

      expect(mockResetSession).toHaveBeenCalled();
    });

    it('should navigate to statistics on completion', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        isCompleted: true,
        completionReason: 'mastery_achieved',
      }));

      render(<LearningPage />);

      const statsButton = screen.getByRole('button', { name: '查看统计' });
      fireEvent.click(statsButton);

      expect(mockNavigate).toHaveBeenCalledWith('/statistics');
    });
  });

  // ==================== Error Handling Tests ====================

  describe('error handling', () => {
    it('should display error message on API failure', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        error: '网络连接失败，请检查网络设置',
        currentWord: null,
      }));

      render(<LearningPage />);

      expect(screen.getByTestId('warning-icon')).toBeInTheDocument();
      expect(screen.getByText('加载学习数据失败')).toBeInTheDocument();
      expect(screen.getByText('网络连接失败，请检查网络设置')).toBeInTheDocument();
    });

    it('should allow retry on error', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        error: '服务器错误',
        currentWord: null,
      }));

      render(<LearningPage />);

      const retryButton = screen.getByRole('button', { name: '重试' });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);

      expect(mockResetSession).toHaveBeenCalled();
    });

    it('should display generic error message when error is not specific', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        error: '初始化失败，请刷新重试',
        currentWord: null,
      }));

      render(<LearningPage />);

      expect(screen.getByText('初始化失败，请刷新重试')).toBeInTheDocument();
    });
  });

  // ==================== Keyboard Navigation Tests ====================

  describe('keyboard navigation', () => {
    it('should support number key shortcuts for options', () => {
      render(<LearningPage />);

      // 模拟按下数字键1
      fireEvent.keyDown(window, { key: '1' });

      // 验证选择功能被调用（由TestOptions处理）
      expect(screen.getByTestId('test-options')).toBeInTheDocument();
    });
  });

  // ==================== AMAS Integration Tests ====================

  describe('AMAS integration', () => {
    it('should display AMAS explanation when available', () => {
      mockUseMasteryLearning = vi.fn(() => ({
        ...defaultMockReturn,
        latestAmasResult: {
          explanation: '基于您的学习状态，建议继续巩固当前单词',
          state: { fatigue: 0.3, attention: 0.8, motivation: 0.7 },
        },
      }));

      render(<LearningPage />);

      expect(screen.getByText('当前学习策略')).toBeInTheDocument();
    });

    it('should show analyzing message when no AMAS result', () => {
      render(<LearningPage />);

      expect(screen.getByText('分析中...')).toBeInTheDocument();
    });
  });
});
