/**
 * FileUpload Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUpload from '../FileUpload';

// Mock Icon components
vi.mock('../Icon', () => ({
  UploadSimple: ({ className }: { className?: string }) => (
    <span data-testid="upload-icon" className={className}>Upload</span>
  ),
  X: ({ className }: { className?: string }) => (
    <span data-testid="x-icon" className={className}>X</span>
  ),
  FileText: ({ className }: { className?: string }) => (
    <span data-testid="file-icon" className={className}>File</span>
  ),
  WarningCircle: ({ className }: { className?: string }) => (
    <span data-testid="warning-icon" className={className}>Warning</span>
  ),
}));

// Helper to create mock files
function createMockFile(
  name: string,
  size: number,
  type: string
): File {
  const content = new Array(size).fill('a').join('');
  return new File([content], name, { type });
}

// Helper to create mock DataTransfer
function createMockDataTransfer(files: File[]) {
  return {
    files,
    items: files.map(file => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: ['Files'],
  };
}

describe('FileUpload', () => {
  const mockOnFileSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render upload area', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument();
      expect(screen.getByText('点击上传或拖拽文件到此处')).toBeInTheDocument();
    });

    it('should show accepted file types', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv,.json" />);

      expect(screen.getByText(/支持.*\.csv.*\.json/)).toBeInTheDocument();
    });

    it('should show custom accepted file types', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".xlsx,.pdf" />);

      expect(screen.getByText(/支持.*\.xlsx.*\.pdf/)).toBeInTheDocument();
    });

    it('should show max file size', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} maxSizeMB={10} />);

      expect(screen.getByText(/最大 10MB/)).toBeInTheDocument();
    });

    it('should show upload icon', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      expect(screen.getByTestId('upload-icon')).toBeInTheDocument();
    });

    it('should be keyboard accessible', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadButton = screen.getByRole('button', { name: 'Upload file' });
      expect(uploadButton).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('file selection via click', () => {
    it('should open file dialog on click', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadButton = screen.getByRole('button', { name: 'Upload file' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      await userEvent.click(uploadButton);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should handle valid file selection', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
    });

    it('should show selected file info', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test-file.csv', 2048, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('test-file.csv')).toBeInTheDocument();
    });

    it('should show file size after selection', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 2048, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      // 2048 bytes = 2 KB
      expect(screen.getByText('2 KB')).toBeInTheDocument();
    });

    it('should show remove button after file selection', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByRole('button', { name: 'Remove file' })).toBeInTheDocument();
    });
  });

  describe('file removal', () => {
    it('should remove selected file', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });
      expect(screen.getByText('test.csv')).toBeInTheDocument();

      const removeButton = screen.getByRole('button', { name: 'Remove file' });
      await userEvent.click(removeButton);

      expect(mockOnFileSelect).toHaveBeenLastCalledWith(null);
      expect(screen.queryByText('test.csv')).not.toBeInTheDocument();
    });

    it('should show upload area after file removal', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      const removeButton = screen.getByRole('button', { name: 'Remove file' });
      await userEvent.click(removeButton);

      expect(screen.getByText('点击上传或拖拽文件到此处')).toBeInTheDocument();
    });
  });

  describe('file type validation', () => {
    it('should accept valid CSV files', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv,.json" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('data.csv', 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should accept valid JSON files', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv,.json" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('data.json', 1024, 'application/json');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
    });

    it('should reject invalid file types', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv,.json" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('image.png', 1024, 'image/png');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('不支持的文件格式');
    });

    it('should reject files without extension', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('noextension', 1024, 'application/octet-stream');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('文件缺少扩展名');
    });

    it('should show warning icon for validation errors', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('wrong.txt', 1024, 'text/plain');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByTestId('warning-icon')).toBeInTheDocument();
    });
  });

  describe('file size validation', () => {
    it('should accept files within size limit', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} maxSizeMB={5} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      // 1MB file
      const file = createMockFile('small.csv', 1024 * 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
    });

    it('should reject files exceeding size limit', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} maxSizeMB={1} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      // 2MB file
      const file = createMockFile('large.csv', 2 * 1024 * 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('文件大小超过限制');
      expect(screen.getByRole('alert')).toHaveTextContent('最大 1MB');
    });

    it('should accept files exactly at size limit', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} maxSizeMB={1} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Exactly 1MB
      const file = createMockFile('exact.csv', 1024 * 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
    });
  });

  describe('drag and drop', () => {
    it('should handle drag enter', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });

      fireEvent.dragEnter(uploadArea, {
        dataTransfer: { files: [] },
      });

      // Should show "release to upload" text
      expect(screen.getByText('松开以上传')).toBeInTheDocument();
    });

    it('should handle drag leave', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });

      fireEvent.dragEnter(uploadArea, { dataTransfer: { files: [] } });
      expect(screen.getByText('松开以上传')).toBeInTheDocument();

      fireEvent.dragLeave(uploadArea, { dataTransfer: { files: [] } });
      expect(screen.getByText('点击上传或拖拽文件到此处')).toBeInTheDocument();
    });

    it('should handle valid file drop', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const file = createMockFile('dropped.csv', 1024, 'text/csv');
      const dataTransfer = createMockDataTransfer([file]);

      fireEvent.drop(uploadArea, { dataTransfer });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
      expect(screen.getByText('dropped.csv')).toBeInTheDocument();
    });

    it('should reject invalid file on drop', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const file = createMockFile('invalid.txt', 1024, 'text/plain');
      const dataTransfer = createMockDataTransfer([file]);

      fireEvent.drop(uploadArea, { dataTransfer });

      expect(mockOnFileSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('不支持的文件格式');
    });

    it('should only accept first file when multiple files dropped', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const file1 = createMockFile('first.csv', 1024, 'text/csv');
      const file2 = createMockFile('second.csv', 1024, 'text/csv');
      const dataTransfer = createMockDataTransfer([file1, file2]);

      fireEvent.drop(uploadArea, { dataTransfer });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file1);
      expect(mockOnFileSelect).toHaveBeenCalledTimes(1);
    });

    it('should show visual feedback during drag over', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });

      fireEvent.dragOver(uploadArea, { dataTransfer: { files: [] } });

      // Check for drag state visual changes (class changes)
      expect(uploadArea).toHaveClass('border-blue-500');
    });
  });

  describe('disabled state', () => {
    it('should not allow file selection when disabled', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      expect(uploadArea).toHaveAttribute('aria-disabled', 'true');
    });

    it('should have negative tabIndex when disabled', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      expect(uploadArea).toHaveAttribute('tabIndex', '-1');
    });

    it('should not respond to drag events when disabled', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });

      fireEvent.dragEnter(uploadArea, { dataTransfer: { files: [] } });

      // Should not show drag state
      expect(screen.getByText('点击上传或拖拽文件到此处')).toBeInTheDocument();
    });

    it('should not respond to drop when disabled', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const file = createMockFile('test.csv', 1024, 'text/csv');
      const dataTransfer = createMockDataTransfer([file]);

      fireEvent.drop(uploadArea, { dataTransfer });

      expect(mockOnFileSelect).not.toHaveBeenCalled();
    });

    it('should disable file input when disabled', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} disabled />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeDisabled();
    });
  });

  describe('keyboard interaction', () => {
    it('should trigger file dialog on Enter key', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      fireEvent.keyDown(uploadArea, { key: 'Enter' });

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should trigger file dialog on Space key', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      fireEvent.keyDown(uploadArea, { key: ' ' });

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should not trigger on other keys', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const uploadArea = screen.getByRole('button', { name: 'Upload file' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      fireEvent.keyDown(uploadArea, { key: 'Tab' });

      expect(clickSpy).not.toHaveBeenCalled();
    });
  });

  describe('file size formatting', () => {
    it('should format bytes correctly', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('tiny.csv', 500, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('500 B')).toBeInTheDocument();
    });

    it('should format KB correctly', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('small.csv', 1536, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('1.5 KB')).toBeInTheDocument();
    });

    it('should format MB correctly', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('medium.csv', 1.5 * 1024 * 1024, 'text/csv');

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('1.5 MB')).toBeInTheDocument();
    });
  });

  describe('error clearing', () => {
    it('should clear error when valid file is selected', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      // First, select invalid file
      const invalidFile = createMockFile('wrong.txt', 1024, 'text/plain');
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Then, select valid file
      const validFile = createMockFile('correct.csv', 1024, 'text/csv');
      fireEvent.change(fileInput, { target: { files: [validFile] } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should clear error when file is removed', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      // Select invalid file
      const invalidFile = createMockFile('wrong.txt', 1024, 'text/plain');
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Select valid file to clear error and get remove button
      const validFile = createMockFile('correct.csv', 1024, 'text/csv');
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      const removeButton = screen.getByRole('button', { name: 'Remove file' });
      await userEvent.click(removeButton);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper aria-label on upload area', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument();
    });

    it('should have proper aria-label on remove button', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.csv', 1024, 'text/csv');
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByRole('button', { name: 'Remove file' })).toBeInTheDocument();
    });

    it('should have hidden file input with aria-hidden', () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} />);

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('aria-hidden', 'true');
    });

    it('should use aria-live for error messages', async () => {
      render(<FileUpload onFileSelect={mockOnFileSelect} accept=".csv" />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('wrong.txt', 1024, 'text/plain');
      fireEvent.change(fileInput, { target: { files: [file] } });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
    });
  });
});
