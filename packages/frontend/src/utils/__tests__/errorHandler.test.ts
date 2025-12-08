/**
 * ErrorHandler 单元测试
 * 测试错误处理工具的功能
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorHandler, AppError, ErrorType, handleError } from '../errorHandler';

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handle', () => {
    it('should return userMessage for AppError', () => {
      const error = new AppError(ErrorType.VALIDATION, 'Internal error', '请输入有效的邮箱');

      const result = ErrorHandler.handle(error);

      expect(result).toBe('请输入有效的邮箱');
    });

    it('should detect storage errors from message', () => {
      const error = new Error('数据库连接失败');

      const result = ErrorHandler.handle(error);

      expect(result).toBe('保存失败，请稍后重试');
    });

    it('should detect storage errors with "存储" keyword', () => {
      const error = new Error('本地存储已满');

      const result = ErrorHandler.handle(error);

      expect(result).toBe('保存失败，请稍后重试');
    });

    it('should detect audio errors from message', () => {
      const error = new Error('音频文件加载失败');

      const result = ErrorHandler.handle(error);

      expect(result).toBe('发音不可用');
    });

    it('should detect audio errors with "发音" keyword', () => {
      const error = new Error('发音功能暂时不可用');

      const result = ErrorHandler.handle(error);

      expect(result).toBe('发音不可用');
    });

    it('should detect empty vocabulary errors', () => {
      const error = new Error('词库为空');

      const result = ErrorHandler.handle(error);

      expect(result).toBe('词库为空，请先添加单词');
    });

    it('should return original message for other Error instances', () => {
      const error = new Error('自定义错误消息');

      const result = ErrorHandler.handle(error);

      expect(result).toBe('自定义错误消息');
    });

    it('should return default message for non-Error objects', () => {
      const result = ErrorHandler.handle('string error');

      expect(result).toBe('发生未知错误，请稍后重试');
    });

    it('should return default message for null', () => {
      const result = ErrorHandler.handle(null);

      expect(result).toBe('发生未知错误，请稍后重试');
    });

    it('should return default message for undefined', () => {
      const result = ErrorHandler.handle(undefined);

      expect(result).toBe('发生未知错误，请稍后重试');
    });

    it('should return default message for number', () => {
      const result = ErrorHandler.handle(404);

      expect(result).toBe('发生未知错误，请稍后重试');
    });
  });

  describe('validationError', () => {
    it('should create validation error', () => {
      const error = ErrorHandler.validationError('Invalid email format', '邮箱格式不正确');

      expect(error).toBeInstanceOf(AppError);
      expect(error.type).toBe(ErrorType.VALIDATION);
      expect(error.message).toBe('Invalid email format');
      expect(error.userMessage).toBe('邮箱格式不正确');
    });
  });

  describe('storageError', () => {
    it('should create storage error', () => {
      const error = ErrorHandler.storageError('IndexedDB quota exceeded');

      expect(error).toBeInstanceOf(AppError);
      expect(error.type).toBe(ErrorType.STORAGE);
      expect(error.message).toBe('IndexedDB quota exceeded');
      expect(error.userMessage).toBe('保存失败，请稍后重试');
    });
  });

  describe('audioError', () => {
    it('should create audio error', () => {
      const error = ErrorHandler.audioError('Audio context not supported');

      expect(error).toBeInstanceOf(AppError);
      expect(error.type).toBe(ErrorType.AUDIO);
      expect(error.message).toBe('Audio context not supported');
      expect(error.userMessage).toBe('发音不可用');
    });
  });

  describe('emptyVocabularyError', () => {
    it('should create empty vocabulary error', () => {
      const error = ErrorHandler.emptyVocabularyError();

      expect(error).toBeInstanceOf(AppError);
      expect(error.type).toBe(ErrorType.EMPTY_VOCABULARY);
      expect(error.message).toBe('Vocabulary is empty');
      expect(error.userMessage).toBe('词库为空，请先添加单词');
    });
  });

  describe('sessionError', () => {
    it('should create session error', () => {
      const error = ErrorHandler.sessionError('Session expired');

      expect(error).toBeInstanceOf(AppError);
      expect(error.type).toBe(ErrorType.SESSION);
      expect(error.message).toBe('Session expired');
      expect(error.userMessage).toBe('会话已重置');
    });
  });
});

describe('AppError', () => {
  it('should create AppError with correct properties', () => {
    const error = new AppError(ErrorType.UNKNOWN, 'Test error', 'User message');

    expect(error.name).toBe('AppError');
    expect(error.type).toBe(ErrorType.UNKNOWN);
    expect(error.message).toBe('Test error');
    expect(error.userMessage).toBe('User message');
  });

  it('should be instance of Error', () => {
    const error = new AppError(ErrorType.VALIDATION, 'Test', 'Test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('handleError function', () => {
  it('should call ErrorHandler.handle', () => {
    const error = new Error('Test error');

    const result = handleError(error);

    expect(result).toBe('Test error');
  });
});
