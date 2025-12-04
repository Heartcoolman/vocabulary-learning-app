/**
 * BatchImportPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockNavigate, mockApiClient } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockApiClient: {
    adminGetSystemWordBooks: vi.fn(),
    batchImportWords: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/services/ApiClient', () => ({
  default: mockApiClient,
}));

vi.mock('@/components', () => ({
  FileUpload: ({ onFileSelect }: { onFileSelect: (file: File | null) => void }) => (
    <button onClick={() => onFileSelect(new File(['test'], 'test.csv', { type: 'text/csv' }))}>
      Mock File Upload
    </button>
  ),
}));

vi.mock('@/utils/importParsers', () => ({
  parseImportFile: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { spelling: 'apple', phonetic: 'æpl', meanings: ['苹果'], examples: ['An apple a day'] },
      { spelling: 'banana', phonetic: 'bəˈnænə', meanings: ['香蕉'], examples: ['Yellow banana'] },
    ],
    errors: [],
  }),
}));

import BatchImportPage from '../BatchImportPage';

describe('BatchImportPage', () => {
  const mockWordBooks = [
    { id: 'book-1', name: 'Test WordBook 1', wordCount: 100 },
    { id: 'book-2', name: 'Test WordBook 2', wordCount: 50 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.adminGetSystemWordBooks.mockResolvedValue(mockWordBooks);
  });

  describe('rendering', () => {
    it('should render page header', async () => {
      render(<BatchImportPage />);

      expect(screen.getByText('批量导入单词')).toBeInTheDocument();
    });

    it('should render step indicator', async () => {
      render(<BatchImportPage />);

      expect(screen.getByText('选择词书')).toBeInTheDocument();
    });

    it('should load wordbooks on mount', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        expect(mockApiClient.adminGetSystemWordBooks).toHaveBeenCalled();
      });
    });
  });

  describe('step 1 - select wordbook', () => {
    it('should display wordbook selector', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByText('选择目标词书')).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/目标词书/)).toBeInTheDocument();
    });

    it('should show wordbooks in dropdown', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toContainHTML('Test WordBook 1');
    });

    it('should enable next button when wordbook selected', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
      });
    });

    it('should proceed to step 2 when next clicked', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole('button', { name: '下一步' }));

      await waitFor(() => {
        expect(screen.getByText('上传数据文件')).toBeInTheDocument();
      });
    });
  });

  describe('step 2 - upload file', () => {
    it('should display file format requirements', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/文件格式要求/)).toBeInTheDocument();
      });
    });

    it('should have back button to step 1', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '上一步' })).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('should navigate back when back button clicked', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByLabelText('Go back')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Go back'));
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe('error handling', () => {
    it('should display error when wordbooks fail to load', async () => {
      mockApiClient.adminGetSystemWordBooks.mockRejectedValue(new Error('Network error'));

      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByText(/无法加载词书列表/)).toBeInTheDocument();
      });
    });

    it('should show retry option on error', async () => {
      mockApiClient.adminGetSystemWordBooks.mockRejectedValue(new Error('Network error'));

      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show message when no wordbooks available', async () => {
      mockApiClient.adminGetSystemWordBooks.mockResolvedValue([]);

      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByText(/暂无可用词书/)).toBeInTheDocument();
      });
    });
  });
});
