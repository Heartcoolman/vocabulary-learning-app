import React, { useState, useRef, DragEvent, ChangeEvent, KeyboardEvent } from 'react';
import { UploadSimple, X, FileText, WarningCircle } from './Icon';

export interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  accept = '.csv,.json',
  maxSizeMB = 5,
  disabled = false,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    dragCounterRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const validateFile = (selectedFile: File): boolean => {
    setError(null);

    const nameParts = selectedFile.name.split('.');
    if (nameParts.length === 1) {
      setError('文件缺少扩展名，请选择有效的文件');
      return false;
    }

    const fileExtension = `.${nameParts.pop()!.toLowerCase()}`;
    const normalizedAccept = accept.split(',').map((item) => {
      const trimmed = item.trim();
      if (trimmed.startsWith('.')) {
        return trimmed.toLowerCase();
      }
      const mimeToExt: Record<string, string> = {
        'text/csv': '.csv',
        'application/json': '.json',
      };
      return mimeToExt[trimmed] || trimmed;
    });

    if (!normalizedAccept.includes(fileExtension)) {
      setError(
        `不支持的文件格式。仅支持: ${normalizedAccept.filter((e) => e.startsWith('.')).join(', ')}`,
      );
      return false;
    }

    if (selectedFile.size > maxSizeMB * 1024 * 1024) {
      setError(`文件大小超过限制 (最大 ${maxSizeMB}MB)`);
      return false;
    }

    return true;
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        onFileSelect(droppedFile);
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
        onFileSelect(selectedFile);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setFile(null);
    setError(null);
    onFileSelect(null);
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
        aria-hidden="true"
      />

      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Upload file"
          aria-disabled={disabled}
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center outline-none transition-all duration-200 ease-in-out ${
            disabled
              ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
              : isDragging
                ? 'scale-[1.01] border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          } ${error ? 'border-red-300 bg-red-50' : ''} `}
        >
          <div className={`mb-4 rounded-full p-3 ${isDragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <UploadSimple
              className={`h-6 w-6 ${isDragging ? 'text-blue-600' : 'text-gray-500'}`}
              weight="bold"
              aria-hidden="true"
            />
          </div>

          <p className="mb-1 text-sm font-medium text-gray-900">
            {isDragging ? '松开以上传' : '点击上传或拖拽文件到此处'}
          </p>

          <p className="text-xs text-gray-500">
            支持 {accept.replace(/,/g, ', ')} (最大 {maxSizeMB}MB)
          </p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 relative flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm duration-300">
          <div className="rounded-lg bg-blue-50 p-3">
            <FileText className="h-6 w-6 text-blue-600" weight="duotone" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>

          <button
            type="button"
            onClick={handleRemoveFile}
            disabled={disabled}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label="Remove file"
            title="删除文件"
          >
            <X className="h-5 w-5" weight="bold" />
          </button>
        </div>
      )}

      {error && (
        <div
          className="animate-in slide-in-from-top-1 mt-3 flex items-center gap-2 text-sm text-red-600"
          role="alert"
          aria-live="polite"
        >
          <WarningCircle className="h-4 w-4 shrink-0" weight="bold" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
