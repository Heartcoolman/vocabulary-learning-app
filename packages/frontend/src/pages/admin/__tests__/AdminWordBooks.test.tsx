/**
 * AdminWordBooks Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminWordBooks from '../AdminWordBooks';

const mockWordBooks = [
  { id: 'wb1', name: 'TOEFL词汇', description: 'TOEFL考试核心词汇', wordCount: 500, type: 'SYSTEM' },
  { id: 'wb2', name: 'GRE词汇', description: 'GRE考试必备词汇', wordCount: 800, type: 'SYSTEM' },
];

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
    adminGetSystemWordBooks: vi.fn().mockResolvedValue([
      { id: 'wb1', name: 'TOEFL词汇', description: 'TOEFL考试核心词汇', wordCount: 500, type: 'SYSTEM' },
      { id: 'wb2', name: 'GRE词汇', description: 'GRE考试必备词汇', wordCount: 800, type: 'SYSTEM' },
    ]),
    adminCreateSystemWordBook: vi.fn().mockResolvedValue({ id: 'wb3' }),
    adminDeleteSystemWordBook: vi.fn().mockResolvedValue(undefined),
    updateWordBook: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock useToast hook and Modal components
vi.mock('@/components/ui', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    showToast: vi.fn(),
  }),
  ConfirmModal: ({ isOpen, onConfirm, onCancel, children }: any) =>
    isOpen ? <div data-testid="confirm-modal">{children}<button onClick={onConfirm}>确认</button><button onClick={onCancel}>取消</button></div> : null,
  Modal: ({ isOpen, onClose, children }: any) =>
    isOpen ? <div data-testid="modal">{children}<button onClick={onClose}>关闭</button></div> : null,
}));

vi.mock('@/components/Icon', async () => {
  const actual = await vi.importActual('@/components/Icon');
  return {
    ...actual,
    Books: ({ size }: { size?: number }) => <span data-testid="icon-books">📚</span>,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-spinner" className={className}>Loading</span>
    ),
  };
});

vi.mock('lucide-react', () => ({
  Upload: () => <span data-testid="icon-upload">📤</span>,
  Edit2: () => <span data-testid="icon-edit">✏️</span>,
}));

vi.mock('@/components', () => ({
  BatchImportModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen ? <div data-testid="batch-import-modal">Import Modal<button onClick={onClose}>Close</button></div> : null
  ),
}));

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <AdminWordBooks />
    </MemoryRouter>
  );
};

describe('AdminWordBooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      renderWithRouter();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('系统词库管理')).toBeInTheDocument();
      });
    });

    it('should display wordbook cards', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('TOEFL词汇')).toBeInTheDocument();
        expect(screen.getByText('GRE词汇')).toBeInTheDocument();
      });
    });

    it('should display wordbook descriptions', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('TOEFL考试核心词汇')).toBeInTheDocument();
      });
    });

    it('should display word counts', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('500 个单词')).toBeInTheDocument();
        expect(screen.getByText('800 个单词')).toBeInTheDocument();
      });
    });
  });

  describe('create wordbook', () => {
    it('should show create button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('+ 创建系统词库')).toBeInTheDocument();
      });
    });

    it('should open create dialog on button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('+ 创建系统词库')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ 创建系统词库'));

      // Modal 组件渲染后会显示 data-testid="modal"
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText('例如：TOEFL 核心词汇')).toBeInTheDocument();
    });

    it('should call API when creating wordbook', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('+ 创建系统词库')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ 创建系统词库'));

      const nameInput = screen.getByPlaceholderText('例如：TOEFL 核心词汇');
      await user.type(nameInput, 'New WordBook');

      fireEvent.click(screen.getByRole('button', { name: '创建' }));

      await waitFor(() => {
        expect(apiClient.adminCreateSystemWordBook).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'New WordBook' })
        );
      });
    });

    it('should not call API when name is empty', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('+ 创建系统词库')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ 创建系统词库'));

      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      // 不输入名称直接点击创建
      fireEvent.click(screen.getByRole('button', { name: '创建' }));

      // 组件使用 toast.warning('请输入词库名称') 而非 alert
      // 验证创建按钮点击后不会调用 API（因为名称为空）
      expect(apiClient.adminCreateSystemWordBook).not.toHaveBeenCalled();
    });
  });

  describe('wordbook actions', () => {
    it('should show view details button', async () => {
      renderWithRouter();

      await waitFor(() => {
        const viewButtons = screen.getAllByText('查看详情');
        expect(viewButtons.length).toBe(2);
      });
    });

    it('should navigate to wordbook details on click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByText('查看详情')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText('查看详情')[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/wordbooks/wb1');
    });

    it('should show edit button', async () => {
      renderWithRouter();

      await waitFor(() => {
        const editButtons = screen.getAllByText('编辑');
        expect(editButtons.length).toBe(2);
      });
    });

    it('should open edit dialog on edit click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByText('编辑')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText('编辑')[0]);

      // Modal 组件渲染后会显示 data-testid="modal"
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });
    });

    it('should show import button', async () => {
      renderWithRouter();

      await waitFor(() => {
        const importButtons = screen.getAllByText('导入');
        expect(importButtons.length).toBe(2);
      });
    });

    it('should open import modal on import click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByText('导入')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText('导入')[0]);

      expect(screen.getByTestId('batch-import-modal')).toBeInTheDocument();
    });

    it('should show delete button', async () => {
      renderWithRouter();

      await waitFor(() => {
        const deleteButtons = screen.getAllByText('删除');
        expect(deleteButtons.length).toBe(2);
      });
    });

    it('should call delete API on confirm', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByText('删除')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText('删除')[0]);

      // 现在需要点击确认弹窗的确认按钮
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('确认'));

      await waitFor(() => {
        expect(apiClient.adminDeleteSystemWordBook).toHaveBeenCalledWith('wb1');
      });
    });
  });

  describe('empty state', () => {
    it('should show empty message when no wordbooks', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetSystemWordBooks).mockResolvedValue([]);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('还没有创建系统词库')).toBeInTheDocument();
      });
    });

    it('should show create first wordbook button in empty state', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetSystemWordBooks).mockResolvedValue([]);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('创建第一个系统词库')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error message on API failure', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetSystemWordBooks).mockRejectedValue(new Error('网络错误'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('网络错误')).toBeInTheDocument();
      });
    });
  });
});
