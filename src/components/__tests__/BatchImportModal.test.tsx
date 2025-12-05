/**
 * BatchImportModal Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BatchImportModal from '../BatchImportModal';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock Icon components
vi.mock('../Icon', () => ({
  X: ({ size }: { size?: number }) => <span data-testid="x-icon">X</span>,
  Warning: ({ size, weight }: { size?: number; weight?: string }) => (
    <span data-testid="warning-icon">Warning</span>
  ),
  CheckCircle: ({ size, weight }: { size?: number; weight?: string }) => (
    <span data-testid="check-icon">Check</span>
  ),
  CircleNotch: ({ size, weight, className }: { size?: number; weight?: string; className?: string }) => (
    <span data-testid="loading-icon" className={className}>Loading</span>
  ),
  FileText: ({ size }: { size?: number }) => <span data-testid="file-icon">File</span>,
}));

// Mock animations
vi.mock('../../utils/animations', () => ({
  fadeInVariants: {},
  scaleInVariants: {},
}));

// Mock FileUpload component
const mockFileUploadOnFileSelect = vi.fn();
vi.mock('../FileUpload', () => ({
  default: ({ onFileSelect, accept, maxSizeMB }: any) => {
    mockFileUploadOnFileSelect.mockImplementation(onFileSelect);
    return (
      <div data-testid="file-upload">
        <button
          data-testid="mock-file-select"
          onClick={() => onFileSelect(new File(['test'], 'test.csv', { type: 'text/csv' }))}
        >
          Select File
        </button>
        <span>accept: {accept}</span>
        <span>maxSize: {maxSizeMB}MB</span>
      </div>
    );
  },
}));

// Mock import parsers
const mockParseImportFile = vi.fn();
vi.mock('../../utils/importParsers', () => ({
  parseImportFile: (...args: any[]) => mockParseImportFile(...args),
}));

// Mock API client
const mockBatchImportWords = vi.fn();
const mockAdminBatchAddWords = vi.fn();
vi.mock('../../services/ApiClient', () => ({
  default: {
    batchImportWords: (...args: any[]) => mockBatchImportWords(...args),
    adminBatchAddWordsToSystemWordBook: (...args: any[]) => mockAdminBatchAddWords(...args),
  },
}));

// Sample parsed data
const mockParsedData = [
  { spelling: 'hello', phonetic: '/heˈloʊ/', meanings: ['你好'], examples: ['Hello, world!'] },
  { spelling: 'world', phonetic: '/wɜːrld/', meanings: ['世界'], examples: ['The world is beautiful.'] },
  { spelling: 'test', phonetic: '/test/', meanings: ['测试'], examples: ['This is a test.'] },
];

describe('BatchImportModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    wordBookId: 'book-123',
    onImportSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseImportFile.mockResolvedValue({ data: mockParsedData, errors: [] });
    mockBatchImportWords.mockResolvedValue({ imported: 3, failed: 0 });
    mockAdminBatchAddWords.mockResolvedValue(mockParsedData);
  });

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<BatchImportModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render modal when isOpen is true', () => {
      render(<BatchImportModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('批量导入单词')).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(<BatchImportModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
    });

    it('should show file format instructions', () => {
      render(<BatchImportModal {...defaultProps} />);

      expect(screen.getByText('文件格式要求')).toBeInTheDocument();
      expect(screen.getByText(/支持 CSV 或 JSON 格式/)).toBeInTheDocument();
      expect(screen.getByText(/必须包含字段/)).toBeInTheDocument();
    });

    it('should render FileUpload component', () => {
      render(<BatchImportModal {...defaultProps} />);

      expect(screen.getByTestId('file-upload')).toBeInTheDocument();
    });

    it('should render cancel button in upload step', () => {
      render(<BatchImportModal {...defaultProps} />);

      expect(screen.getByText('取消')).toBeInTheDocument();
    });
  });

  describe('close functionality', () => {
    it('should call onClose when close button is clicked', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const closeButton = screen.getByRole('button', { name: 'Close modal' });
      await userEvent.click(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should call onClose when cancel button is clicked', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const cancelButton = screen.getByText('取消');
      await userEvent.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should reset state when modal is closed', async () => {
      render(<BatchImportModal {...defaultProps} />);

      // Select a file to change state
      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('解析结果预览')).toBeInTheDocument();
      });

      // Close modal
      const cancelButton = screen.getByText('取消');
      await userEvent.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('file handling', () => {
    it('should parse file when selected', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(mockParseImportFile).toHaveBeenCalled();
      });
    });

    it('should show preview step after successful file parse', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('解析结果预览')).toBeInTheDocument();
        expect(screen.getByText(/共 3 个单词/)).toBeInTheDocument();
      });
    });

    it('should show parsed word count', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText(/共 3 个单词/)).toBeInTheDocument();
      });
    });

    it('should display word preview table', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('hello')).toBeInTheDocument();
        expect(screen.getByText('/heˈloʊ/')).toBeInTheDocument();
        expect(screen.getByText('你好')).toBeInTheDocument();
      });
    });

    it('should show re-upload button in preview', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('重新上传')).toBeInTheDocument();
      });
    });

    it('should go back to upload step when re-upload is clicked', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('重新上传')).toBeInTheDocument();
      });

      const reuploadButton = screen.getByText('重新上传');
      await userEvent.click(reuploadButton);

      expect(screen.getByText('文件格式要求')).toBeInTheDocument();
    });
  });

  describe('validation errors', () => {
    it('should display parse errors', async () => {
      mockParseImportFile.mockResolvedValue({
        data: [],
        errors: ['第2行: 缺少拼写字段', '第5行: 释义格式错误'],
      });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText(/发现 2 个错误/)).toBeInTheDocument();
        expect(screen.getByText('第2行: 缺少拼写字段')).toBeInTheDocument();
        expect(screen.getByText('第5行: 释义格式错误')).toBeInTheDocument();
      });
    });

    it('should show instruction to fix errors', async () => {
      mockParseImportFile.mockResolvedValue({
        data: [],
        errors: ['Error 1'],
      });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('请修改文件后重新上传。')).toBeInTheDocument();
      });
    });

    it('should disable import button when there are errors', async () => {
      mockParseImportFile.mockResolvedValue({
        data: mockParsedData,
        errors: ['Some error'],
      });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        const importButton = screen.getByText('确认导入');
        expect(importButton).toBeDisabled();
      });
    });

    it('should disable import button when no data parsed', async () => {
      mockParseImportFile.mockResolvedValue({
        data: [],
        errors: [],
      });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        const importButton = screen.getByText('确认导入');
        expect(importButton).toBeDisabled();
      });
    });

    it('should handle file parse failure', async () => {
      mockParseImportFile.mockRejectedValue(new Error('Invalid file format'));

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid file format')).toBeInTheDocument();
      });
    });
  });

  describe('import process', () => {
    it('should show importing state when import starts', async () => {
      mockBatchImportWords.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('正在导入...')).toBeInTheDocument();
        expect(screen.getByText(/正在处理 3 个单词/)).toBeInTheDocument();
      });
    });

    it('should show loading spinner during import', async () => {
      mockBatchImportWords.mockImplementation(() => new Promise(() => {}));

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByTestId('loading-icon')).toBeInTheDocument();
      });
    });

    it('should call batchImportWords API', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(mockBatchImportWords).toHaveBeenCalledWith('book-123', mockParsedData);
      });
    });

    it('should use admin API when isAdminMode is true', async () => {
      render(<BatchImportModal {...defaultProps} isAdminMode={true} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(mockAdminBatchAddWords).toHaveBeenCalledWith('book-123', mockParsedData);
      });
    });
  });

  describe('import success', () => {
    it('should show success result', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('导入成功')).toBeInTheDocument();
        expect(screen.getByTestId('check-icon')).toBeInTheDocument();
      });
    });

    it('should show imported count', async () => {
      mockBatchImportWords.mockResolvedValue({ imported: 5, failed: 0 });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('成功导入:')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('should call onImportSuccess callback', async () => {
      mockBatchImportWords.mockResolvedValue({ imported: 3, failed: 0 });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(defaultProps.onImportSuccess).toHaveBeenCalledWith(3);
      });
    });

    it('should show finish button after success', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('完成')).toBeInTheDocument();
      });
    });

    it('should close modal when finish button is clicked', async () => {
      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('完成')).toBeInTheDocument();
      });

      const finishButton = screen.getByText('完成');
      await userEvent.click(finishButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('partial import success', () => {
    it('should show partial success result', async () => {
      mockBatchImportWords.mockResolvedValue({
        imported: 2,
        failed: 1,
        errors: ['单词 "test" 已存在'],
      });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('部分导入完成')).toBeInTheDocument();
        expect(screen.getByTestId('warning-icon')).toBeInTheDocument();
      });
    });

    it('should show both imported and failed counts', async () => {
      mockBatchImportWords.mockResolvedValue({
        imported: 2,
        failed: 1,
        errors: ['单词 "test" 已存在'],
      });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('成功导入:')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('导入失败:')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });

    it('should show failure details', async () => {
      mockBatchImportWords.mockResolvedValue({
        imported: 2,
        failed: 1,
        errors: ['单词 "test" 已存在'],
      });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('失败详情:')).toBeInTheDocument();
        expect(screen.getByText('单词 "test" 已存在')).toBeInTheDocument();
      });
    });
  });

  describe('import failure', () => {
    it('should show error state on API failure', async () => {
      mockBatchImportWords.mockRejectedValue(new Error('Network error'));

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('导入失败')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show X icon on failure', async () => {
      mockBatchImportWords.mockRejectedValue(new Error('Server error'));

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('导入失败')).toBeInTheDocument();
        // The X icon in result section (not close button)
        const icons = screen.getAllByTestId('x-icon');
        expect(icons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('cancel during import', () => {
    it('should disable close button during import', async () => {
      mockBatchImportWords.mockImplementation(() => new Promise(() => {}));

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('正在导入...')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: 'Close modal' });
      expect(closeButton).toBeDisabled();
    });

    it('should show loading state with word count during import', async () => {
      mockBatchImportWords.mockImplementation(() => new Promise(() => {}));

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('确认导入')).toBeInTheDocument();
      });

      const importButton = screen.getByText('确认导入');
      await userEvent.click(importButton);

      await waitFor(() => {
        expect(screen.getByText('正在导入...')).toBeInTheDocument();
        expect(screen.getByText(/正在处理 3 个单词/)).toBeInTheDocument();
      });
    });
  });

  describe('preview table', () => {
    it('should show maximum 5 items in preview', async () => {
      const manyWords = Array.from({ length: 10 }, (_, i) => ({
        spelling: `word${i}`,
        phonetic: `/word${i}/`,
        meanings: [`meaning${i}`],
        examples: [`example${i}`],
      }));
      mockParseImportFile.mockResolvedValue({ data: manyWords, errors: [] });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('word0')).toBeInTheDocument();
        expect(screen.getByText('word4')).toBeInTheDocument();
        // word5 and beyond should not be in preview table
        expect(screen.queryByText('word5')).not.toBeInTheDocument();
      });
    });

    it('should show remaining count when more than 5 items', async () => {
      const manyWords = Array.from({ length: 10 }, (_, i) => ({
        spelling: `word${i}`,
        phonetic: `/word${i}/`,
        meanings: [`meaning${i}`],
        examples: [`example${i}`],
      }));
      mockParseImportFile.mockResolvedValue({ data: manyWords, errors: [] });

      render(<BatchImportModal {...defaultProps} />);

      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText(/还有 5 条数据未显示/)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper role and aria-modal', () => {
      render(<BatchImportModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should have proper aria-label on close button', () => {
      render(<BatchImportModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
    });
  });

  describe('file selection reset', () => {
    it('should handle null file selection (file removed)', async () => {
      render(<BatchImportModal {...defaultProps} />);

      // First select a file
      const selectButton = screen.getByTestId('mock-file-select');
      await userEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('解析结果预览')).toBeInTheDocument();
      });

      // Simulate file removal by calling onFileSelect with null
      act(() => {
        mockFileUploadOnFileSelect(null);
      });

      // Should go back to upload step
      await waitFor(() => {
        expect(screen.getByText('文件格式要求')).toBeInTheDocument();
      });
    });
  });
});
