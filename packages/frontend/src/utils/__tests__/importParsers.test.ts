/**
 * ImportParsers 单元测试
 * 测试文件导入解析工具的功能
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCSVFile, parseJSONFile, parseImportFile } from '../importParsers';

// 创建模拟 File 对象
function createMockFile(content: string, name: string, type: string): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

describe('ImportParsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCSVFile', () => {
    it('should parse valid CSV file', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,/ˈæp.əl/,苹果|水果,I eat an apple.|The apple is red.
banana,/bəˈnæn.ə/,香蕉,I like banana.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.data[0].spelling).toBe('apple');
      expect(result.data[0].phonetic).toBe('/ˈæp.əl/');
      expect(result.data[0].meanings).toEqual(['苹果', '水果']);
      expect(result.data[0].examples).toEqual(['I eat an apple.', 'The apple is red.']);
    });

    it('should handle CSV with optional audioUrl', async () => {
      const csvContent = `spelling,phonetic,meanings,examples,audioUrl
apple,/ˈæp.əl/,苹果,I eat an apple.,https://example.com/apple.mp3`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].audioUrl).toBe('https://example.com/apple.mp3');
    });

    it('should fail on empty CSV file', async () => {
      const csvContent = `spelling,phonetic,meanings,examples`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report validation errors for missing spelling', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
,/ˈæp.əl/,苹果,I eat an apple.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('spelling') || e.includes('拼写'))).toBe(true);
    });

    it('should report validation errors for missing phonetic', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,,苹果,I eat an apple.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('phonetic') || e.includes('音标'))).toBe(true);
    });

    it('should report validation errors for missing meanings', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,/ˈæp.əl/,,I eat an apple.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('meanings') || e.includes('释义'))).toBe(true);
    });

    it('should report validation errors for missing examples', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,/ˈæp.əl/,苹果,`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('examples') || e.includes('例句'))).toBe(true);
    });

    it('should handle BOM character in CSV', async () => {
      const csvContent = `\uFEFFspelling,phonetic,meanings,examples
apple,/ˈæp.əl/,苹果,I eat an apple.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].spelling).toBe('apple');
    });

    it('should skip empty lines in CSV', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,/ˈæp.əl/,苹果,I eat an apple.

banana,/bəˈnæn.ə/,香蕉,I like banana.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('should trim whitespace from values', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
  apple  ,  /ˈæp.əl/  ,  苹果  ,  I eat an apple.  `;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].spelling).toBe('apple');
      expect(result.data[0].phonetic).toBe('/ˈæp.əl/');
    });

    it('should filter out empty meanings after split', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,/ˈæp.əl/,苹果||水果,I eat an apple.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseCSVFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].meanings).toEqual(['苹果', '水果']);
    });
  });

  describe('parseJSONFile', () => {
    it('should parse valid JSON array', async () => {
      const jsonContent = JSON.stringify([
        {
          spelling: 'apple',
          phonetic: '/ˈæp.əl/',
          meanings: ['苹果', '水果'],
          examples: ['I eat an apple.'],
        },
        {
          spelling: 'banana',
          phonetic: '/bəˈnæn.ə/',
          meanings: ['香蕉'],
          examples: ['I like banana.'],
        },
      ]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.data[0].spelling).toBe('apple');
      expect(result.data[0].meanings).toEqual(['苹果', '水果']);
    });

    it('should handle JSON with audioUrl', async () => {
      const jsonContent = JSON.stringify([
        {
          spelling: 'apple',
          phonetic: '/ˈæp.əl/',
          meanings: ['苹果'],
          examples: ['I eat an apple.'],
          audioUrl: 'https://example.com/apple.mp3',
        },
      ]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].audioUrl).toBe('https://example.com/apple.mp3');
    });

    it('should fail on non-array JSON', async () => {
      const jsonContent = JSON.stringify({
        spelling: 'apple',
        phonetic: '/ˈæp.əl/',
        meanings: ['苹果'],
        examples: ['I eat an apple.'],
      });

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('JSON文件必须是数组格式');
    });

    it('should fail on empty JSON array', async () => {
      const jsonContent = JSON.stringify([]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('为空'))).toBe(true);
    });

    it('should fail on invalid JSON', async () => {
      const jsonContent = '{ invalid json }';

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('JSON解析失败'))).toBe(true);
    });

    it('should report validation errors for missing fields', async () => {
      const jsonContent = JSON.stringify([
        {
          spelling: 'apple',
          // missing phonetic, meanings, examples
        },
      ]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle null audioUrl', async () => {
      const jsonContent = JSON.stringify([
        {
          spelling: 'apple',
          phonetic: '/ˈæp.əl/',
          meanings: ['苹果'],
          examples: ['I eat an apple.'],
          audioUrl: null,
        },
      ]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].audioUrl).toBeUndefined();
    });

    it('should trim whitespace from string values', async () => {
      const jsonContent = JSON.stringify([
        {
          spelling: '  apple  ',
          phonetic: '  /ˈæp.əl/  ',
          meanings: ['  苹果  '],
          examples: ['  I eat an apple.  '],
        },
      ]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].spelling).toBe('apple');
      expect(result.data[0].phonetic).toBe('/ˈæp.əl/');
    });

    it('should convert non-string meanings to strings', async () => {
      const jsonContent = JSON.stringify([
        {
          spelling: 'apple',
          phonetic: '/ˈæp.əl/',
          meanings: [123, '苹果'],
          examples: ['I eat an apple.'],
        },
      ]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseJSONFile(file);

      expect(result.success).toBe(true);
      expect(result.data[0].meanings).toEqual(['123', '苹果']);
    });
  });

  describe('parseImportFile', () => {
    it('should route CSV files correctly', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,/ˈæp.əl/,苹果,I eat an apple.`;

      const file = createMockFile(csvContent, 'words.csv', 'text/csv');

      const result = await parseImportFile(file);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('should route JSON files correctly', async () => {
      const jsonContent = JSON.stringify([
        {
          spelling: 'apple',
          phonetic: '/ˈæp.əl/',
          meanings: ['苹果'],
          examples: ['I eat an apple.'],
        },
      ]);

      const file = createMockFile(jsonContent, 'words.json', 'application/json');

      const result = await parseImportFile(file);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('should reject unsupported file formats', async () => {
      const txtContent = 'some text content';

      const file = createMockFile(txtContent, 'words.txt', 'text/plain');

      const result = await parseImportFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('不支持的文件格式'))).toBe(true);
    });

    it('should reject XML files', async () => {
      const xmlContent = '<words><word>apple</word></words>';

      const file = createMockFile(xmlContent, 'words.xml', 'application/xml');

      const result = await parseImportFile(file);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('不支持的文件格式'))).toBe(true);
    });

    it('should handle uppercase file extensions', async () => {
      const csvContent = `spelling,phonetic,meanings,examples
apple,/ˈæp.əl/,苹果,I eat an apple.`;

      const file = createMockFile(csvContent, 'words.CSV', 'text/csv');

      const result = await parseImportFile(file);

      expect(result.success).toBe(true);
    });
  });
});
