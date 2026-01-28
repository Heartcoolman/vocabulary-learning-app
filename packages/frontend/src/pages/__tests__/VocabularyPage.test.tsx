import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import VocabularyPage from '../VocabularyPage';
import type { WordBook } from '../../types/models';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock logger - 需要导出所有 logger 实例
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  learningLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  uiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  storageLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  amasLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  adminLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  trackingLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock 数据
const mockSystemBooks: WordBook[] = [
  {
    id: 'system-book-1',
    name: 'CET-4 词汇',
    description: '大学英语四级核心词汇',
    wordCount: 4500,
    type: 'SYSTEM',
    isPublic: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'system-book-2',
    name: 'CET-6 词汇',
    description: '大学英语六级核心词汇',
    wordCount: 5500,
    type: 'SYSTEM',
    isPublic: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockUserBooks: WordBook[] = [
  {
    id: 'user-book-1',
    name: '我的生词本',
    description: '平时积累的生词',
    wordCount: 150,
    type: 'USER',
    isPublic: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockSearchResults = [
  {
    id: 'word-1',
    spelling: 'apple',
    phonetic: '/ˈæp.əl/',
    meanings: ['n. 苹果', 'n. 苹果树'],
    examples: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    wordBook: { id: 'system-book-1', name: 'CET-4 词汇', type: 'SYSTEM' },
  },
];

// Mock useToast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

interface ModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  title?: string;
  children?: React.ReactNode;
}

interface ConfirmModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

vi.mock('../../components/ui', async () => {
  const actual = await vi.importActual('../../components/ui');
  return {
    ...actual,
    useToast: () => mockToast,
    Modal: ({ isOpen, onClose, title, children }: ModalProps) =>
      isOpen ? (
        <div data-testid="modal">
          <h2>{title}</h2>
          {children}
          <button onClick={onClose} data-testid="close-modal">
            关闭
          </button>
        </div>
      ) : null,
    ConfirmModal: ({
      isOpen,
      onClose,
      onConfirm,
      title,
      message,
      confirmText,
      cancelText,
      isLoading,
    }: ConfirmModalProps) =>
      isOpen ? (
        <div data-testid="confirm-modal">
          <h2>{title}</h2>
          <p>{message}</p>
          <button onClick={onConfirm} disabled={isLoading}>
            {confirmText}
          </button>
          <button onClick={onClose}>{cancelText}</button>
        </div>
      ) : null,
  };
});

// Mock React Query hooks
const mockUseSystemWordBooks = vi.fn();
const mockUseUserWordBooks = vi.fn();
const mockUseSearchWords = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockUseCreateWordBook = vi.fn();
const mockUseDeleteWordBook = vi.fn();

vi.mock('../../hooks/queries/useWordBooks', () => ({
  useSystemWordBooks: () => mockUseSystemWordBooks(),
  useUserWordBooks: () => mockUseUserWordBooks(),
  useSearchWords: (query: string) => mockUseSearchWords(query),
  useWordBookUpdates: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../hooks/mutations/useWordBookMutations', () => ({
  useCreateWordBook: () => mockUseCreateWordBook(),
  useDeleteWordBook: () => mockUseDeleteWordBook(),
  useSyncWordBook: () => ({ mutate: vi.fn(), isPending: false }),
}));

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

describe('VocabularyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSystemWordBooks.mockReturnValue({
      data: mockSystemBooks,
      isLoading: false,
      error: null,
    });
    mockUseUserWordBooks.mockReturnValue({
      data: mockUserBooks,
      isLoading: false,
      error: null,
    });
    mockUseSearchWords.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
    });
    mockCreateMutateAsync.mockResolvedValue({ id: 'new-book' });
    mockDeleteMutateAsync.mockResolvedValue(undefined);
    mockUseCreateWordBook.mockReturnValue({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    });
    mockUseDeleteWordBook.mockReturnValue({
      mutateAsync: mockDeleteMutateAsync,
      isPending: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VocabularyPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('词库管理')).toBeInTheDocument();
      });
    });

    it('should render tab buttons', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /系统词库.*2/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /我的词库.*1/ })).toBeInTheDocument();
      });
    });

    it('should render system word books by default', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
        expect(screen.getByText('CET-6 词汇')).toBeInTheDocument();
      });
    });

    it('should render search input', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      mockUseSystemWordBooks.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
      });
      mockUseUserWordBooks.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
      });
      renderComponent();
      expect(screen.getByText('正在加载...')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch to user books tab when clicked', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('我的生词本')).toBeInTheDocument();
        expect(screen.getByText('+ 新建词书')).toBeInTheDocument();
      });
    });

    it('should not show create button in system tab', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
      });

      expect(screen.queryByText('+ 新建词书')).not.toBeInTheDocument();
    });

    it('should show system badge on system books', async () => {
      renderComponent();

      await waitFor(() => {
        // System badge appears on cards, not just the tab
        const badges = screen.getAllByText('系统词库');
        expect(badges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Word Book Cards', () => {
    it('should display word book information', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
        expect(screen.getByText('大学英语四级核心词汇')).toBeInTheDocument();
        expect(screen.getByText('4500 个单词')).toBeInTheDocument();
      });
    });

    it('should navigate to word book detail when clicking view button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
      });

      const viewButtons = screen.getAllByText('查看详情');
      fireEvent.click(viewButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/wordbooks/system-book-1');
    });

    it('should show delete button only for user books', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
      });

      // System books should not have delete button
      expect(screen.queryByText('删除')).not.toBeInTheDocument();

      // Switch to user books
      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('删除')).toBeInTheDocument();
      });
    });
  });

  describe('Create Word Book', () => {
    it('should open create dialog when clicking create button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('+ 新建词书')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ 新建词书'));

      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
        expect(screen.getByText('创建新词书')).toBeInTheDocument();
      });
    });

    it('should show warning when creating book without name', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('+ 新建词书')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ 新建词书'));

      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      // Click create without entering name
      fireEvent.click(screen.getByRole('button', { name: '创建' }));

      await waitFor(() => {
        expect(mockToast.warning).toHaveBeenCalledWith('请输入词书名称');
      });
    });

    it('should create word book successfully', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('+ 新建词书')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ 新建词书'));

      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      // Enter book name
      const nameInput = screen.getByPlaceholderText('例如：考研核心词汇');
      await userEvent.type(nameInput, '新建测试词书');

      // Click create
      fireEvent.click(screen.getByRole('button', { name: '创建' }));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith({
          name: '新建测试词书',
          description: '',
        });
        expect(mockToast.success).toHaveBeenCalledWith('词书创建成功');
      });
    });
  });

  describe('Delete Word Book', () => {
    it('should show delete confirmation dialog', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('我的生词本')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('删除'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
        expect(screen.getByText('删除词书')).toBeInTheDocument();
        expect(screen.getByText(/确定要删除词书"我的生词本"吗/)).toBeInTheDocument();
      });
    });

    it('should delete word book when confirmed', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('删除')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('删除'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      });

      // Find the confirm button within the modal and click it
      const confirmModal = screen.getByTestId('confirm-modal');
      const confirmButton = confirmModal.querySelector('button:not([disabled])');
      fireEvent.click(confirmButton!);

      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith('user-book-1');
        expect(mockToast.success).toHaveBeenCalledWith('词书已删除');
      });
    });
  });

  describe('Search', () => {
    it('should have a search input', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      expect(searchInput).toBeInTheDocument();
    });

    it('should trigger search when typing', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      fireEvent.change(searchInput, { target: { value: 'apple' } });

      // The hook should be called with the search query
      await waitFor(
        () => {
          expect(mockUseSearchWords).toHaveBeenCalled();
        },
        { timeout: 1000 },
      );
    });

    it('should display search results', async () => {
      // Mock search results
      mockUseSearchWords.mockReturnValue({
        data: mockSearchResults,
        isLoading: false,
        isFetching: false,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      fireEvent.change(searchInput, { target: { value: 'apple' } });

      await waitFor(
        () => {
          expect(screen.getByText('apple')).toBeInTheDocument();
          expect(screen.getByText('/ˈæp.əl/')).toBeInTheDocument();
        },
        { timeout: 1000 },
      );
    });

    it('should clear search input', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      fireEvent.change(searchInput, { target: { value: 'apple' } });

      expect(searchInput).toHaveValue('apple');

      fireEvent.change(searchInput, { target: { value: '' } });
      expect(searchInput).toHaveValue('');
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no user books', async () => {
      mockUseUserWordBooks.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('还没有创建任何词书')).toBeInTheDocument();
        expect(screen.getByText('创建第一个词书')).toBeInTheDocument();
      });
    });

    it('should show empty state when no system books', async () => {
      mockUseSystemWordBooks.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('暂无系统词库')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      mockUseSystemWordBooks.mockReturnValue({
        data: mockSystemBooks, // Still provide data so page renders
        isLoading: false,
        error: new Error('加载失败'),
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      });
    });

    it('should show toast when creating book fails', async () => {
      mockCreateMutateAsync.mockRejectedValue(new Error('创建失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /我的词库/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /我的词库/ }));

      await waitFor(() => {
        expect(screen.getByText('+ 新建词书')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ 新建词书'));

      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('例如：考研核心词汇');
      await userEvent.type(nameInput, '测试词书');

      fireEvent.click(screen.getByRole('button', { name: '创建' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('创建失败');
      });
    });
  });
});
