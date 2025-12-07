import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import StudySettingsPage from '../StudySettingsPage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock API Client
const mockWordBooks = [
  {
    id: 'book-1',
    name: 'CET-4 词汇',
    description: '大学英语四级核心词汇',
    wordCount: 4500,
    type: 'SYSTEM',
  },
  {
    id: 'book-2',
    name: 'CET-6 词汇',
    description: '大学英语六级核心词汇',
    wordCount: 5500,
    type: 'SYSTEM',
  },
];

const mockStudyConfig = {
  selectedWordBookIds: ['book-1'],
  dailyWordCount: 20,
  studyMode: 'sequential',
};

vi.mock('../../services/ApiClient', () => ({
  default: {
    getAllAvailableWordBooks: vi.fn(),
    getStudyConfig: vi.fn(),
    updateStudyConfig: vi.fn(),
  },
}));

// Mock useToast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../components/ui', async () => {
  const actual = await vi.importActual('../../components/ui');
  return {
    ...actual,
    useToast: () => mockToast,
  };
});

// Mock logger
vi.mock('../../utils/logger', () => ({
  uiLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import apiClient from '../../services/ApiClient';

describe('StudySettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getAllAvailableWordBooks as any).mockResolvedValue(mockWordBooks);
    (apiClient.getStudyConfig as any).mockResolvedValue(mockStudyConfig);
    (apiClient.updateStudyConfig as any).mockResolvedValue(mockStudyConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <StudySettingsPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习设置')).toBeInTheDocument();
      });
    });

    it('should render word book selection section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('选择学习词书')).toBeInTheDocument();
      });
    });

    it('should render daily learning count section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('每日学习量')).toBeInTheDocument();
      });
    });

    it('should render word books list', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
        expect(screen.getByText('CET-6 词汇')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      renderComponent();
      expect(screen.getByText('正在加载...')).toBeInTheDocument();
    });
  });

  describe('Word Book Selection', () => {
    it('should display selected word book as checked', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      // First book should be checked (based on mockStudyConfig)
      expect(checkboxes[0]).toBeChecked();
    });

    it('should allow selecting/deselecting word books', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      // Click to deselect first book
      fireEvent.click(checkboxes[0]);

      expect(checkboxes[0]).not.toBeChecked();
    });

    it('should display word book descriptions', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('大学英语四级核心词汇')).toBeInTheDocument();
        expect(screen.getByText('大学英语六级核心词汇')).toBeInTheDocument();
      });
    });

    it('should display word counts', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('4500 个单词')).toBeInTheDocument();
        expect(screen.getByText('5500 个单词')).toBeInTheDocument();
      });
    });
  });

  describe('Daily Count Slider', () => {
    it('should display current daily count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('20')).toBeInTheDocument();
      });
    });

    it('should display estimated learning time', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/预计学习时长/)).toBeInTheDocument();
      });
    });
  });

  describe('Save Settings', () => {
    it('should save settings when clicking save button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习设置')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('保存设置');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(apiClient.updateStudyConfig).toHaveBeenCalled();
        expect(mockToast.success).toHaveBeenCalledWith('学习设置已保存');
      });
    });

    it('should navigate to home after saving', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习设置')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('保存设置');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should disable save button when no book is selected', async () => {
      (apiClient.getStudyConfig as any).mockResolvedValue({
        selectedWordBookIds: [],
        dailyWordCount: 20,
        studyMode: 'sequential',
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习设置')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('保存设置');
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Navigation', () => {
    it('should navigate back when clicking cancel button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习设置')).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('取消');
      fireEvent.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      (apiClient.getAllAvailableWordBooks as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      });
    });

    it('should show empty state when no word books available', async () => {
      (apiClient.getAllAvailableWordBooks as any).mockResolvedValue([]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('暂无可用词书，请先创建或添加词书')).toBeInTheDocument();
      });
    });
  });

  describe('Selection Statistics', () => {
    it('should display selected book count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('已选择词书')).toBeInTheDocument();
      });
    });

    it('should display total word count of selected books', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('总单词数')).toBeInTheDocument();
      });
    });

    it('should display estimated learning days', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('预计学习天数')).toBeInTheDocument();
      });
    });
  });
});
