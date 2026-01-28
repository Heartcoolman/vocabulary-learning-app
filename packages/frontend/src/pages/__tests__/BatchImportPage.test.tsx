/**
 * BatchImportPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock React Query hooks
const mockUseBatchImport = vi.fn();
let mockQueryData: unknown[] = [];
let mockQueryLoading = false;
let mockQueryError: Error | null = null;

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => {
    return {
      data: mockQueryData,
      isLoading: mockQueryLoading,
      error: mockQueryError,
    };
  },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@/hooks/mutations/useBatchOperations', () => ({
  useBatchImport: (options: { onSuccess?: () => void; onError?: () => void }) =>
    mockUseBatchImport(options),
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

  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for useQuery (wordbooks)
    mockQueryData = mockWordBooks;
    mockQueryLoading = false;
    mockQueryError = null;

    // Default mock for useBatchImport
    mockUseBatchImport.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
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

      // useQuery returns data, and wordbooks should be displayed
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
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
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Manually select a wordbook to enable the button
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'book-1' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
      });
    });

    it('should proceed to step 2 when next clicked', async () => {
      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Manually select a wordbook to enable the button
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'book-1' } });

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

      // First select a wordbook to enable the "下一步" button
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'book-1' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole('button', { name: '下一步' }));

      await waitFor(() => {
        expect(screen.getByText(/文件格式要求/)).toBeInTheDocument();
      });
    });

    it('should have back button to step 1', async () => {
      render(<BatchImportPage />);

      // First select a wordbook to enable the "下一步" button
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'book-1' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole('button', { name: '下一步' }));

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
      mockQueryData = [];
      mockQueryLoading = false;
      mockQueryError = new Error('Network error');

      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByText(/无法加载词书列表/)).toBeInTheDocument();
      });
    });

    it('should show retry option on error', async () => {
      mockQueryData = [];
      mockQueryLoading = false;
      mockQueryError = new Error('Network error');

      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show message when no wordbooks available', async () => {
      mockQueryData = [];
      mockQueryLoading = false;
      mockQueryError = null;

      render(<BatchImportPage />);

      await waitFor(() => {
        expect(screen.getByText(/暂无可用词书/)).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when loading wordbooks', async () => {
      mockQueryData = [];
      mockQueryLoading = true;
      mockQueryError = null;

      render(<BatchImportPage />);

      // Should show a loading indicator (spinner component)
      await waitFor(() => {
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      });
    });
  });
});
