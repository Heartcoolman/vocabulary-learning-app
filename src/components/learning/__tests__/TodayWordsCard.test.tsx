import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TodayWordsCard from '../TodayWordsCard';
import ApiClient from '../../../services/ApiClient';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getTodayWords: vi.fn()
  }
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('TodayWordsCard', () => {
  const mockWords = [
    {
      id: '1',
      spelling: 'hello',
      phonetic: '/həˈləʊ/',
      meanings: ['你好', '打招呼'],
      examples: ['Hello, world!'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: '2',
      spelling: 'world',
      phonetic: '/wɜːld/',
      meanings: ['世界', '地球'],
      examples: ['The world is beautiful.'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];

  const mockOnStartLearning = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该显示 loading 状态', () => {
    vi.mocked(ApiClient.getTodayWords).mockImplementation(
      () => new Promise(() => {}) // 永不 resolve
    );

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('应该成功加载并显示今日推荐单词', async () => {
    vi.mocked(ApiClient.getTodayWords).mockResolvedValue({
      words: mockWords,
      progress: {
        todayStudied: 0,
        todayTarget: 10,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: []
      }
    });

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    await waitFor(() => {
      expect(screen.getByText('今日推荐单词')).toBeInTheDocument();
    });

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('/həˈləʊ/')).toBeInTheDocument();
    expect(screen.getByText('你好')).toBeInTheDocument();

    expect(screen.getByText('world')).toBeInTheDocument();
    expect(screen.getByText('/wɜːld/')).toBeInTheDocument();
    expect(screen.getByText('世界')).toBeInTheDocument();
  });

  it('应该显示正确的优先级指示器', async () => {
    vi.mocked(ApiClient.getTodayWords).mockResolvedValue({
      words: mockWords,
      progress: {
        todayStudied: 0,
        todayTarget: 10,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: []
      }
    });

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    await waitFor(() => {
      expect(screen.getByText('今日推荐单词')).toBeInTheDocument();
    });

    // 前3个应该是高优先级
    const highPriority = screen.getAllByText('高优先级');
    expect(highPriority.length).toBeGreaterThan(0);
  });

  it('点击"开始学习"按钮应该调用 onStartLearning', async () => {
    const user = userEvent.setup();

    vi.mocked(ApiClient.getTodayWords).mockResolvedValue({
      words: mockWords,
      progress: {
        todayStudied: 0,
        todayTarget: 10,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: []
      }
    });

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    await waitFor(() => {
      expect(screen.getByText('今日推荐单词')).toBeInTheDocument();
    });

    const startButton = screen.getByRole('button', { name: /开始学习/i });
    await user.click(startButton);

    expect(mockOnStartLearning).toHaveBeenCalledWith(mockWords);
  });

  it('应该显示错误状态', async () => {
    vi.mocked(ApiClient.getTodayWords).mockRejectedValue(
      new Error('网络错误')
    );

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeInTheDocument();
    });

    expect(screen.getByText(/无法加载今日推荐单词/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/i })).toBeInTheDocument();
  });

  it('点击重试按钮应该重新加载', async () => {
    const user = userEvent.setup();

    vi.mocked(ApiClient.getTodayWords)
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockResolvedValueOnce({
        words: mockWords,
        progress: {
          todayStudied: 0,
          todayTarget: 10,
          totalStudied: 0,
          correctRate: 0,
          weeklyTrend: []
        }
      });

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /重试/i });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('今日推荐单词')).toBeInTheDocument();
    });

    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('应该显示空状态', async () => {
    vi.mocked(ApiClient.getTodayWords).mockResolvedValue({
      words: [],
      progress: {
        todayStudied: 0,
        todayTarget: 10,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: []
      }
    });

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    await waitFor(() => {
      expect(screen.getByText('暂无推荐单词')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/请先添加词书或单词/i)
    ).toBeInTheDocument();
  });

  it('应该正确显示单词数量统计', async () => {
    const manyWords = Array.from({ length: 10 }, (_, i) => ({
      id: `${i + 1}`,
      spelling: `word${i + 1}`,
      phonetic: `/word${i + 1}/`,
      meanings: [`释义${i + 1}`],
      examples: [`例句${i + 1}`],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));

    vi.mocked(ApiClient.getTodayWords).mockResolvedValue({
      words: manyWords,
      progress: {
        todayStudied: 0,
        todayTarget: 10,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: []
      }
    });

    render(<TodayWordsCard onStartLearning={mockOnStartLearning} />);

    await waitFor(() => {
      expect(screen.getByText('今日推荐单词')).toBeInTheDocument();
    });

    // 应该显示高优先级数量 (min(3, 10) = 3)
    expect(screen.getByText(/高优先级:/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();

    // 应该显示总计
    expect(screen.getByText(/总计:/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });
});
