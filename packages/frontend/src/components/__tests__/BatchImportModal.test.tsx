/**
 * BatchImportModal Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BatchImportModal from '../BatchImportModal';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    X: () => <span data-testid="x-icon">X</span>,
    Warning: () => <span data-testid="warning-icon">Warning</span>,
    CheckCircle: () => <span data-testid="check-icon">Check</span>,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-icon" className={className}>
        Loading
      </span>
    ),
    FileText: () => <span data-testid="file-icon">File</span>,
  };
});

// Mock animations
vi.mock('../../utils/animations', () => ({
  fadeInVariants: {},
  scaleInVariants: {},
}));

// Mock FileUpload component
vi.mock('../FileUpload', () => ({
  default: ({ onFileSelect }: any) => (
    <div data-testid="file-upload">
      <button onClick={() => onFileSelect(new File(['test'], 'test.csv', { type: 'text/csv' }))}>
        Select File
      </button>
    </div>
  ),
}));

// Mock importParsers
vi.mock('../../utils/importParsers', () => ({
  parseImportFile: vi.fn(),
  WordImportData: {},
}));

// Mock client module
vi.mock('../../services/client', () => ({
  wordClient: {
    batchImportWords: vi.fn(),
  },
  adminClient: {
    batchAddWordsToSystemWordBook: vi.fn(),
  },
}));

// Get parseImportFile mock
import { parseImportFile } from '../../utils/importParsers';
import { wordClient, adminClient } from '../../services/client';
const mockParseImportFile = vi.mocked(parseImportFile);

describe('BatchImportModal', () => {
  const mockOnClose = vi.fn();
  const mockOnImportSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    mockParseImportFile.mockResolvedValue({
      success: true,
      data: [
        { spelling: 'test', phonetic: '/test/', meanings: ['测试'], examples: ['Test example'] },
      ],
      errors: [],
    });
    vi.mocked(wordClient.batchImportWords).mockResolvedValue({ imported: 1, failed: 0 });
  });

  // ==================== Visibility Tests ====================

  describe('visibility', () => {
    it('should return null when isOpen is false', () => {
      const { container } = render(
        <BatchImportModal
          isOpen={false}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );
      expect(screen.getByText('批量导入单词')).toBeInTheDocument();
    });
  });

  // ==================== Upload Step Tests ====================

  describe('upload step', () => {
    it('should display file format requirements', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      expect(screen.getByText('文件格式要求')).toBeInTheDocument();
      expect(screen.getByText(/支持 CSV 或 JSON 格式/)).toBeInTheDocument();
    });

    it('should display FileUpload component', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      expect(screen.getByTestId('file-upload')).toBeInTheDocument();
    });

    it('should have cancel button in upload step', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      expect(screen.getByText('取消')).toBeInTheDocument();
    });

    it('should call onClose when cancel is clicked', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const cancelButton = screen.getByText('取消');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  // ==================== Preview Step Tests ====================

  describe('preview step', () => {
    it('should show preview after file selection', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('解析结果预览')).toBeInTheDocument();
      });
    });

    it('should display word count', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText(/共 1 个单词/)).toBeInTheDocument();
      });
    });

    it('should display preview table', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('拼写')).toBeInTheDocument();
        expect(screen.getByText('音标')).toBeInTheDocument();
        expect(screen.getByText('释义预览')).toBeInTheDocument();
      });
    });

    it('should display word data in table', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('test')).toBeInTheDocument();
        expect(screen.getByText('/test/')).toBeInTheDocument();
        expect(screen.getByText('测试')).toBeInTheDocument();
      });
    });

    it('should have re-upload link', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('重新上传')).toBeInTheDocument();
      });
    });

    it('should have confirm import button', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });
    });
  });

  // ==================== Error Display Tests ====================

  describe('error display', () => {
    it('should display errors when file has issues', async () => {
      mockParseImportFile.mockResolvedValue({
        success: false,
        data: [],
        errors: ['Missing spelling field', 'Invalid format'],
      });

      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText(/发现 2 个错误/)).toBeInTheDocument();
        expect(screen.getByText('Missing spelling field')).toBeInTheDocument();
        expect(screen.getByText('Invalid format')).toBeInTheDocument();
      });
    });

    it('should disable confirm button when errors exist', async () => {
      mockParseImportFile.mockResolvedValue({
        success: false,
        data: [],
        errors: ['Error'],
      });

      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        const confirmButton = screen.getByText('确认导入');
        expect(confirmButton).toBeDisabled();
      });
    });
  });

  // ==================== Import Process Tests ====================

  describe('import process', () => {
    it('should show importing state', async () => {
      vi.mocked(wordClient.batchImportWords).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ imported: 1, failed: 0 }), 100)),
      );

      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        const confirmButton = screen.getByText('确认导入');
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(screen.getByText('正在导入...')).toBeInTheDocument();
      });
    });

    it('should call batchImportWords API', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        const confirmButton = screen.getByText('确认导入');
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(vi.mocked(wordClient.batchImportWords)).toHaveBeenCalledWith(
          'test-book',
          expect.any(Array),
        );
      });
    });

    it('should call batchAddWordsToSystemWordBook in admin mode', async () => {
      vi.mocked(adminClient.batchAddWordsToSystemWordBook).mockResolvedValue([
        {
          id: '1',
          spelling: 'test',
          meanings: ['测试'],
          examples: ['Test example'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
          isAdminMode={true}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      await waitFor(() => {
        const confirmButton = screen.getByText('确认导入');
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(vi.mocked(adminClient.batchAddWordsToSystemWordBook)).toHaveBeenCalledWith(
          'test-book',
          expect.any(Array),
        );
      });
    });
  });

  // ==================== Result Step Tests ====================

  describe('result step', () => {
    it('should show success result', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      // Wait for preview step to load
      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('确认导入');
      fireEvent.click(confirmButton);

      // Wait for result step with longer timeout
      await waitFor(
        () => {
          expect(screen.getByText('导入成功')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should show partial success result', async () => {
      vi.mocked(wordClient.batchImportWords).mockResolvedValue({ imported: 5, failed: 2 });

      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      // Wait for preview step to load
      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('确认导入');
      fireEvent.click(confirmButton);

      // Wait for result step with longer timeout
      await waitFor(
        () => {
          expect(screen.getByText('部分导入完成')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should show error result when import fails', async () => {
      vi.mocked(wordClient.batchImportWords).mockRejectedValue(new Error('Import failed'));

      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      // Wait for preview step to load
      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('确认导入');
      fireEvent.click(confirmButton);

      // Wait for result step with longer timeout
      await waitFor(
        () => {
          expect(screen.getByText('导入失败')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should call onImportSuccess with count', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      // Wait for preview step to load
      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('确认导入');
      fireEvent.click(confirmButton);

      // Wait for callback with longer timeout
      await waitFor(
        () => {
          expect(mockOnImportSuccess).toHaveBeenCalledWith(1);
        },
        { timeout: 3000 },
      );
    });

    it('should have finish button in result step', async () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      // Wait for preview step to load
      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('确认导入');
      fireEvent.click(confirmButton);

      // Wait for result step with longer timeout
      await waitFor(
        () => {
          expect(screen.getByText('完成')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have dialog role', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have aria-modal attribute', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('should have close button aria-label', () => {
      render(
        <BatchImportModal
          isOpen={true}
          onClose={mockOnClose}
          wordBookId="test-book"
          onImportSuccess={mockOnImportSuccess}
        />,
      );

      expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });
  });
});
