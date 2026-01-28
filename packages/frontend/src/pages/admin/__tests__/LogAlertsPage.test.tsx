/**
 * LogAlertsPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRequestAdmin } = vi.hoisted(() => ({
  mockRequestAdmin: vi.fn(),
}));

vi.mock('../../../services/client', () => ({
  adminClient: {
    requestAdmin: mockRequestAdmin,
  },
}));

import type { ReactNode } from 'react';

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    createPortal: (node: ReactNode) => node,
  };
});

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(() => 'mock-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock Toast module
const mockToast = {
  showToast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

interface ModalProps {
  isOpen?: boolean;
  children?: ReactNode;
}

interface ConfirmModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
}

interface AlertModalProps {
  isOpen?: boolean;
  children?: ReactNode;
}

// Mock ui components (re-exports from Toast)
vi.mock('../../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/ui')>();
  return {
    ...actual,
    useToast: () => mockToast,
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Modal: ({ isOpen, children }: ModalProps) => (isOpen ? <div>{children}</div> : null),
    ConfirmModal: ({ isOpen, onClose, onConfirm, title, message }: ConfirmModalProps) =>
      isOpen ? (
        <div data-testid="confirm-modal">
          <h2>{title}</h2>
          <p>{message}</p>
          <button onClick={onConfirm}>Confirm</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      ) : null,
    AlertModal: ({ isOpen, children }: AlertModalProps) => (isOpen ? <div>{children}</div> : null),
  };
});

import LogAlertsPage from '../LogAlertsPage';

// Mock Icon components
vi.mock('../../../components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/Icon')>();
  return {
    ...actual,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-spinner" className={className}>
        Loading
      </span>
    ),
    Warning: () => <span data-testid="warning-icon">Warning</span>,
    Bell: () => <span data-testid="bell-icon">Bell</span>,
    CheckCircle: () => <span data-testid="check-icon">Check</span>,
    XCircle: () => <span data-testid="x-icon">X</span>,
    WarningCircle: () => <span data-testid="warning-circle-icon">WarningCircle</span>,
    Plus: () => <span data-testid="plus-icon">Plus</span>,
    Trash: () => <span data-testid="trash-icon">Trash</span>,
    Pencil: () => <span data-testid="pencil-icon">Pencil</span>,
    X: () => <span data-testid="x-close-icon">X</span>,
  };
});

// Mock logger
vi.mock('../../../utils/logger', () => ({
  adminLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock data matching LogAlertRule interface
const mockRules = [
  {
    id: 'rule-1',
    name: 'Error Alert',
    description: 'Alert for errors',
    enabled: true,
    levels: ['ERROR', 'FATAL'] as const,
    module: 'backend',
    messagePattern: '.*error.*',
    threshold: 5,
    windowMinutes: 5,
    webhookUrl: 'https://hooks.example.com/alert',
    cooldownMinutes: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rule-2',
    name: 'Warning Alert',
    description: 'Alert for warnings',
    enabled: false,
    levels: ['WARN'] as const,
    module: '',
    messagePattern: '',
    threshold: 10,
    windowMinutes: 10,
    webhookUrl: 'https://hooks.example.com/warn',
    cooldownMinutes: 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <LogAlertsPage />
    </MemoryRouter>,
  );
};

describe('LogAlertsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestAdmin.mockImplementation((url: string) => {
      if (url.startsWith('/api/admin/logs/log-alerts')) {
        return Promise.resolve(mockRules);
      }
      return Promise.resolve([]);
    });
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('日志告警规则')).toBeInTheDocument();
      });
    });

    it('should render page description', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('配置和管理日志监控告警规则')).toBeInTheDocument();
      });
    });

    it('should render bell icon', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('bell-icon').length).toBeGreaterThan(0);
      });
    });
  });

  describe('alerts list', () => {
    it('should display alert names', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Error Alert')).toBeInTheDocument();
        expect(screen.getByText('Warning Alert')).toBeInTheDocument();
      });
    });

    it('should display alert log levels', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('ERROR')).toBeInTheDocument();
        expect(screen.getByText('WARN')).toBeInTheDocument();
      });
    });

    it('should display enabled/disabled status buttons', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('已启用')).toBeInTheDocument();
        expect(screen.getByText('已禁用')).toBeInTheDocument();
      });
    });

    it('should display alert descriptions', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Alert for errors')).toBeInTheDocument();
        expect(screen.getByText('Alert for warnings')).toBeInTheDocument();
      });
    });

    it('should display threshold info', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Multiple rules, so use getAllByText
        expect(screen.getAllByText('触发阈值').length).toBeGreaterThan(0);
      });
    });
  });

  describe('create alert', () => {
    it('should have create rule button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('创建规则')).toBeInTheDocument();
      });
    });

    it('should open create modal on button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const createButton = screen.getByText('创建规则');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(screen.getByText('创建告警规则')).toBeInTheDocument();
      });
    });

    it('should have form fields in create modal', async () => {
      renderWithRouter();

      await waitFor(() => {
        const createButton = screen.getByText('创建规则');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        // Check for form field labels - modal shows specific text
        expect(screen.getByText('创建告警规则')).toBeInTheDocument();
        // Check for form inputs by placeholder
        expect(screen.getByPlaceholderText('例如：高频错误日志告警')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('简要描述此规则的用途')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('https://example.com/webhook')).toBeInTheDocument();
      });
    });

    it('should submit create form', async () => {
      mockRequestAdmin.mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          return Promise.resolve({ ...mockRules[0], id: 'new-rule' });
        }
        if (url.startsWith('/api/admin/logs/log-alerts')) {
          return Promise.resolve(mockRules);
        }
        return Promise.resolve([]);
      });

      renderWithRouter();

      await waitFor(() => {
        const createButton = screen.getByText('创建规则');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        // Fill in form - find input by placeholder
        const nameInput = screen.getByPlaceholderText('例如：高频错误日志告警');
        fireEvent.change(nameInput, { target: { value: 'New Alert' } });

        // Fill webhook URL
        const webhookInput = screen.getByPlaceholderText('https://example.com/webhook');
        fireEvent.change(webhookInput, { target: { value: 'https://hooks.example.com/new' } });

        const submitButton = screen.getByText('保存');
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockRequestAdmin).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/logs/log-alerts'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });
  });

  describe('edit alert', () => {
    it('should have edit button for each alert', async () => {
      renderWithRouter();

      await waitFor(() => {
        const editButtons = screen.getAllByTestId('pencil-icon');
        expect(editButtons.length).toBeGreaterThan(0);
      });
    });

    it('should open edit modal on button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const editButtons = screen.getAllByTitle('编辑规则');
        fireEvent.click(editButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('编辑告警规则')).toBeInTheDocument();
      });
    });
  });

  describe('delete alert', () => {
    it('should have delete button for each alert', async () => {
      renderWithRouter();

      await waitFor(() => {
        const deleteButtons = screen.getAllByTestId('trash-icon');
        expect(deleteButtons.length).toBeGreaterThan(0);
      });
    });

    it('should show confirmation dialog before delete', async () => {
      renderWithRouter();

      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('删除规则');
        fireEvent.click(deleteButtons[0]);
      });

      await waitFor(() => {
        // Use getByRole to find heading specifically, and check for the confirmation message
        expect(screen.getByRole('heading', { name: '确认删除' })).toBeInTheDocument();
        expect(screen.getByText(/确定要删除这个告警规则吗/)).toBeInTheDocument();
      });
    });

    it('should delete alert on confirmation', async () => {
      mockRequestAdmin.mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'DELETE') {
          return Promise.resolve(undefined);
        }
        if (url.startsWith('/api/admin/logs/log-alerts')) {
          return Promise.resolve(mockRules);
        }
        return Promise.resolve([]);
      });

      renderWithRouter();

      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('删除规则');
        fireEvent.click(deleteButtons[0]);
      });

      await waitFor(() => {
        // Find the button with "确认删除" text (not the heading)
        const confirmButtons = screen.getAllByText('确认删除');
        // The button is the one with role button
        const confirmButton = confirmButtons.find((el) => el.tagName === 'BUTTON');
        if (confirmButton) {
          fireEvent.click(confirmButton);
        }
      });

      await waitFor(() => {
        expect(mockRequestAdmin).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/logs/log-alerts/rule-1'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    it('should cancel delete when cancel button clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('删除规则');
        fireEvent.click(deleteButtons[0]);
      });

      await waitFor(() => {
        // Check for delete confirmation message
        expect(screen.getByText('确定要删除这个告警规则吗？此操作不可撤销。')).toBeInTheDocument();
      });

      // Find the cancel button in the delete confirmation dialog
      const cancelButtons = screen.getAllByText('取消');
      // The last "取消" button should be in the delete confirmation dialog
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);

      await waitFor(() => {
        expect(
          screen.queryByText('确定要删除这个告警规则吗？此操作不可撤销。'),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('toggle alert', () => {
    it('should toggle alert status on button click', async () => {
      mockRequestAdmin.mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'PUT' && url.includes('/rule-1')) {
          return Promise.resolve({ ...mockRules[0], enabled: false });
        }
        if (url.startsWith('/api/admin/logs/log-alerts')) {
          return Promise.resolve(mockRules);
        }
        return Promise.resolve([]);
      });

      renderWithRouter();

      await waitFor(() => {
        const toggleButton = screen.getByText('已启用');
        fireEvent.click(toggleButton);
      });

      await waitFor(() => {
        expect(mockRequestAdmin).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/logs/log-alerts/rule-1'),
          expect.objectContaining({ method: 'PUT' }),
        );
      });
    });
  });

  describe('error handling', () => {
    it('should show error toast when fetch fails', async () => {
      mockRequestAdmin.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('加载告警规则失败'));
      });
    });

    it('should show error toast when create fails', async () => {
      mockRequestAdmin.mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          return Promise.reject(new Error('Create failed'));
        }
        if (url.startsWith('/api/admin/logs/log-alerts')) {
          return Promise.resolve(mockRules);
        }
        return Promise.resolve([]);
      });

      renderWithRouter();

      // Wait for initial data to load
      await waitFor(() => {
        expect(screen.getByText('创建规则')).toBeInTheDocument();
      });

      // Click create button
      const createButton = screen.getByText('创建规则');
      fireEvent.click(createButton);

      // Wait for modal to open
      await waitFor(() => {
        expect(screen.getByText('创建告警规则')).toBeInTheDocument();
      });

      // Fill in form
      const nameInput = screen.getByPlaceholderText('例如：高频错误日志告警');
      fireEvent.change(nameInput, { target: { value: 'New Alert' } });

      const webhookInput = screen.getByPlaceholderText('https://example.com/webhook');
      fireEvent.change(webhookInput, { target: { value: 'https://hooks.example.com/new' } });

      // Submit form
      const submitButton = screen.getByText('保存');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('创建失败'));
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no alerts', async () => {
      mockRequestAdmin.mockImplementation((url: string) => {
        if (url.startsWith('/api/admin/logs/log-alerts')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('暂无告警规则')).toBeInTheDocument();
      });
    });

    it('should show empty state guidance text', async () => {
      mockRequestAdmin.mockImplementation((url: string) => {
        if (url.startsWith('/api/admin/logs/log-alerts')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/点击上方"创建规则"按钮添加第一个告警规则/)).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('should show loading spinner while fetching', async () => {
      // Make fetch take a long time
      mockRequestAdmin.mockImplementation(() => new Promise(() => {}));

      renderWithRouter();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('加载告警规则中...')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('should show error when name is empty', async () => {
      renderWithRouter();

      await waitFor(() => {
        const createButton = screen.getByText('创建规则');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        // Don't fill name, just click save
        const submitButton = screen.getByText('保存');
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('请输入规则名称');
      });
    });

    it('should show error when webhook URL is empty', async () => {
      renderWithRouter();

      await waitFor(() => {
        const createButton = screen.getByText('创建规则');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        // Fill name but not webhook
        const nameInput = screen.getByPlaceholderText('例如：高频错误日志告警');
        fireEvent.change(nameInput, { target: { value: 'Test Alert' } });

        const submitButton = screen.getByText('保存');
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('请输入 Webhook URL');
      });
    });
  });
});
