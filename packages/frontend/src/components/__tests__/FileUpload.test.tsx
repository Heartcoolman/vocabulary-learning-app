/**
 * FileUpload Component Unit Tests
 *
 * 测试文件上传组件的用户交互和验证逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FileUpload from '../FileUpload';

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    UploadSimple: ({ className }: { className?: string }) => (
      <span data-testid="upload-icon" className={className}>
        Upload
      </span>
    ),
    X: () => <span data-testid="x-icon">X</span>,
    FileText: () => <span data-testid="file-icon">File</span>,
    WarningCircle: () => <span data-testid="warning-icon">Warning</span>,
  };
});

// Helper to create a mock file
const createMockFile = (name: string, size: number, type: string): File => {
  const file = new File(['a'.repeat(size)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

// Helper to create mock DataTransfer
const createMockDataTransfer = (files: File[]) => {
  return {
    files,
    items: files.map((file) => ({
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
    })),
    types: ['Files'],
  };
};

describe('FileUpload', () => {
  const mockOnFileSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render upload area with instructions', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      expect(screen.getByText('点击上传或拖拽文件到此处')).toBeInTheDocument();
    });

    it('should display accepted file types', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv,.json" />);

      expect(screen.getByText(/支持 .csv, .json/)).toBeInTheDocument();
    });

    it('should display max file size', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} maxSizeMB={10} />);

      expect(screen.getByText(/最大 10MB/)).toBeInTheDocument();
    });

    it('should render upload icon', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      expect(screen.getByTestId('upload-icon')).toBeInTheDocument();
    });

    it('should have proper accessibility attributes', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      expect(uploadArea).toBeInTheDocument();
      expect(uploadArea).toHaveAttribute('tabIndex', '0');
    });
  });

  // ==================== File Selection Tests ====================

  describe('file selection via click', () => {
    it('should call onFileSelect when a valid file is selected', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(mockOnFileSelect).toHaveBeenCalledWith(file);
      });
    });

    it('should display selected file info after selection', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText('test.csv')).toBeInTheDocument();
      });
    });
  });

  // ==================== File Validation Tests ====================

  describe('file validation', () => {
    it('should reject file with wrong extension', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv,.json" />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.txt', 1024, 'text/plain');

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/不支持的文件格式/)).toBeInTheDocument();
        expect(mockOnFileSelect).not.toHaveBeenCalled();
      });
    });

    it('should reject file exceeding max size', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} maxSizeMB={1} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 2 * 1024 * 1024, 'text/csv'); // 2MB

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/文件大小超过限制/)).toBeInTheDocument();
      });
    });

    it('should reject file without extension', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('testfile', 1024, 'text/plain');

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText(/文件缺少扩展名/)).toBeInTheDocument();
      });
    });

    it('should display error with alert role', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.txt', 1024, 'text/plain');

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ==================== Drag and Drop Tests ====================

  describe('drag and drop', () => {
    it('should show drag state on dragover', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      fireEvent.dragOver(uploadArea);

      expect(screen.getByText('松开以上传')).toBeInTheDocument();
    });

    it('should handle drag enter and leave', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });

      fireEvent.dragEnter(uploadArea);
      expect(screen.getByText('松开以上传')).toBeInTheDocument();

      fireEvent.dragLeave(uploadArea);
      expect(screen.getByText('点击上传或拖拽文件到此处')).toBeInTheDocument();
    });

    it('should accept valid file on drop', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const file = createMockFile('test.csv', 1024, 'text/csv');

      const dropEvent = new Event('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: createMockDataTransfer([file]),
      });
      Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });

      fireEvent(uploadArea, dropEvent);

      await waitFor(() => {
        expect(mockOnFileSelect).toHaveBeenCalledWith(file);
      });
    });
  });

  // ==================== File Removal Tests ====================

  describe('file removal', () => {
    it('should remove file when remove button is clicked', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      // First select a file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText('test.csv')).toBeInTheDocument();
      });

      // Click remove button
      const removeButton = screen.getByRole('button', { name: 'Remove file' });
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(mockOnFileSelect).toHaveBeenLastCalledWith(null);
        expect(screen.getByText('点击上传或拖拽文件到此处')).toBeInTheDocument();
      });
    });
  });

  // ==================== Disabled State Tests ====================

  describe('disabled state', () => {
    it('should not allow file selection when disabled', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      expect(uploadArea).toHaveAttribute('aria-disabled', 'true');
      expect(uploadArea).toHaveAttribute('tabIndex', '-1');
    });

    it('should not respond to drag events when disabled', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      fireEvent.dragOver(uploadArea);

      expect(screen.queryByText('松开以上传')).not.toBeInTheDocument();
    });

    it('should have disabled styling', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      expect(uploadArea.className).toContain('cursor-not-allowed');
      expect(uploadArea.className).toContain('opacity-60');
    });
  });

  // ==================== Keyboard Navigation Tests ====================

  describe('keyboard navigation', () => {
    it('should trigger file input on Enter key', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      fireEvent.keyDown(uploadArea, { key: 'Enter' });

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should trigger file input on Space key', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      fireEvent.keyDown(uploadArea, { key: ' ' });

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  // ==================== File Size Formatting Tests ====================

  describe('file size formatting', () => {
    it('should display file size in KB for small files', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv'); // 1KB

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText('1 KB')).toBeInTheDocument();
      });
    });

    it('should display file size in MB for larger files', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" maxSizeMB={10} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024 * 1024, 'text/csv'); // 1MB

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(screen.getByText('1 MB')).toBeInTheDocument();
      });
    });
  });
});
