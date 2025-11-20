/**
 * 验证单词拼写是否有效
 * @param spelling 单词拼写
 * @returns 是否有效
 */
export function isValidSpelling(spelling: string): boolean {
  return spelling.trim().length > 0;
}

/**
 * 验证释义列表是否有效
 * @param meanings 释义列表
 * @returns 是否有效
 */
export function isValidMeanings(meanings: string[]): boolean {
  if (meanings.length === 0) {
    return false;
  }
  
  // 至少有一个非空释义
  return meanings.some(m => m.trim().length > 0);
}

/**
 * 验证测试选项
 * @param options 选项列表
 * @param correctAnswer 正确答案
 * @returns 验证结果
 */
export function validateTestOptions(
  options: string[],
  correctAnswer: string
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 检查选项数量
  if (options.length < 2 || options.length > 4) {
    errors.push('选项数量必须在2-4之间');
  }

  // 检查是否包含正确答案
  const correctCount = options.filter(opt => opt === correctAnswer).length;
  if (correctCount === 0) {
    errors.push('选项中必须包含正确答案');
  } else if (correctCount > 1) {
    errors.push('选项中只能有一个正确答案');
  }

  // 检查选项是否有重复
  const uniqueOptions = new Set(options);
  if (uniqueOptions.size !== options.length) {
    errors.push('选项中不能有重复项');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 验证单词对象
 * @param word 单词对象
 * @returns 验证结果
 */
export function validateWord(word: {
  spelling: string;
  phonetic?: string;
  meanings: string[];
  examples?: string[];
}): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isValidSpelling(word.spelling)) {
    errors.push('单词拼写不能为空');
  }

  if (!isValidMeanings(word.meanings)) {
    errors.push('至少需要一个有效的释义');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
