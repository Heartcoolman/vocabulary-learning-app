/**
 * 错误类型枚举
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  STORAGE = 'STORAGE',
  AUDIO = 'AUDIO',
  EMPTY_VOCABULARY = 'EMPTY_VOCABULARY',
  SESSION = 'SESSION',
  UNKNOWN = 'UNKNOWN'
}

/**
 * 应用错误类
 */
export class AppError extends Error {
  type: ErrorType;
  userMessage: string;

  constructor(type: ErrorType, message: string, userMessage: string) {
    super(message);
    this.type = type;
    this.userMessage = userMessage;
    this.name = 'AppError';
  }
}

/**
 * 错误处理器
 */
export class ErrorHandler {
  /**
   * 处理错误并返回用户友好的消息
   */
  static handle(error: unknown): string {
    console.error('Error occurred:', error);

    if (error instanceof AppError) {
      return error.userMessage;
    }

    if (error instanceof Error) {
      // 根据错误消息判断类型
      if (error.message.includes('数据库') || error.message.includes('存储')) {
        return '保存失败，请稍后重试';
      }
      if (error.message.includes('音频') || error.message.includes('发音')) {
        return '发音不可用';
      }
      if (error.message.includes('词库为空')) {
        return '词库为空，请先添加单词';
      }
      
      return error.message;
    }

    return '发生未知错误，请稍后重试';
  }

  /**
   * 创建验证错误
   */
  static validationError(message: string, userMessage: string): AppError {
    return new AppError(ErrorType.VALIDATION, message, userMessage);
  }

  /**
   * 创建存储错误
   */
  static storageError(message: string): AppError {
    return new AppError(
      ErrorType.STORAGE,
      message,
      '保存失败，请稍后重试'
    );
  }

  /**
   * 创建音频错误
   */
  static audioError(message: string): AppError {
    return new AppError(
      ErrorType.AUDIO,
      message,
      '发音不可用'
    );
  }

  /**
   * 创建空词库错误
   */
  static emptyVocabularyError(): AppError {
    return new AppError(
      ErrorType.EMPTY_VOCABULARY,
      'Vocabulary is empty',
      '词库为空，请先添加单词'
    );
  }

  /**
   * 创建会话错误
   */
  static sessionError(message: string): AppError {
    return new AppError(
      ErrorType.SESSION,
      message,
      '会话已重置'
    );
  }
}

/**
 * 便捷的错误处理函数
 */
export function handleError(error: unknown): string {
  return ErrorHandler.handle(error);
}
