import Papa from 'papaparse';

export interface WordImportData {
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
}

export interface ParseResult {
  success: boolean;
  data: WordImportData[];
  errors: string[];
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

function validateWordData(word: Partial<WordImportData>, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!word.spelling || typeof word.spelling !== 'string' || word.spelling.trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'spelling',
      message: '单词拼写不能为空',
    });
  }

  if (!word.phonetic || typeof word.phonetic !== 'string' || word.phonetic.trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'phonetic',
      message: '音标不能为空',
    });
  }

  if (!word.meanings || !Array.isArray(word.meanings) || word.meanings.length === 0) {
    errors.push({
      row: rowIndex,
      field: 'meanings',
      message: '至少需要一个释义',
    });
  } else if (word.meanings.some((m) => typeof m !== 'string' || m.trim() === '')) {
    errors.push({
      row: rowIndex,
      field: 'meanings',
      message: '释义不能包含空字符串',
    });
  }

  if (!word.examples || !Array.isArray(word.examples) || word.examples.length === 0) {
    errors.push({
      row: rowIndex,
      field: 'examples',
      message: '至少需要一个例句',
    });
  } else if (word.examples.some((e) => typeof e !== 'string' || e.trim() === '')) {
    errors.push({
      row: rowIndex,
      field: 'examples',
      message: '例句不能包含空字符串',
    });
  }

  if (word.audioUrl !== undefined && word.audioUrl !== null && typeof word.audioUrl !== 'string') {
    errors.push({
      row: rowIndex,
      field: 'audioUrl',
      message: 'audioUrl必须是字符串',
    });
  }

  return errors;
}

export async function parseCSVFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      transformHeader: (header) => {
        const trimmed = header.trim();
        return trimmed.replace(/^\uFEFF/, '');
      },
      complete: (results) => {
        const data: WordImportData[] = [];
        const errors: string[] = [];
        const validationErrors: ValidationError[] = [];

        if (results.data.length === 0) {
          resolve({
            success: false,
            data: [],
            errors: ['CSV文件为空，没有有效数据'],
          });
          return;
        }

        results.data.forEach((row, index) => {
          try {
            const meanings = row.meanings
              ? row.meanings
                  .split('|')
                  .map((m) => m.trim())
                  .filter((m) => m.length > 0)
              : [];

            const examples = row.examples
              ? row.examples
                  .split('|')
                  .map((e) => e.trim())
                  .filter((e) => e.length > 0)
              : [];

            const word: WordImportData = {
              spelling: row.spelling?.trim() || '',
              phonetic: row.phonetic?.trim() || '',
              meanings,
              examples,
              audioUrl: row.audioUrl?.trim() || undefined,
            };

            const rowErrors = validateWordData(word, index + 2);
            if (rowErrors.length > 0) {
              validationErrors.push(...rowErrors);
            } else {
              data.push(word);
            }
          } catch (error) {
            errors.push(
              `第 ${index + 2} 行解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
            );
          }
        });

        if (validationErrors.length > 0) {
          validationErrors.forEach((err) => {
            errors.push(`第 ${err.row} 行，字段 "${err.field}": ${err.message}`);
          });
        }

        if (results.errors && results.errors.length > 0) {
          results.errors.forEach((err) => {
            errors.push(
              `CSV解析错误 (第 ${err.row !== undefined ? err.row + 1 : '?'} 行): ${err.message}`,
            );
          });
        }

        resolve({
          success: errors.length === 0,
          data,
          errors,
        });
      },
      error: (error) => {
        resolve({
          success: false,
          data: [],
          errors: [`CSV解析失败: ${error.message}`],
        });
      },
    });
  });
}

export async function parseJSONFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          resolve({
            success: false,
            data: [],
            errors: ['JSON文件必须是数组格式'],
          });
          return;
        }

        if (parsed.length === 0) {
          resolve({
            success: false,
            data: [],
            errors: ['JSON文件为空，没有有效数据'],
          });
          return;
        }

        const data: WordImportData[] = [];
        const errors: string[] = [];
        const validationErrors: ValidationError[] = [];

        parsed.forEach((item, index) => {
          try {
            const meanings = Array.isArray(item.meanings)
              ? item.meanings
                  .map((m: unknown) => (typeof m === 'string' ? m.trim() : String(m)))
                  .filter((m: string) => m.length > 0)
              : [];

            const examples = Array.isArray(item.examples)
              ? item.examples
                  .map((e: unknown) => (typeof e === 'string' ? e.trim() : String(e)))
                  .filter((e: string) => e.length > 0)
              : [];

            let audioUrl: string | undefined = undefined;
            if (item.audioUrl !== undefined && item.audioUrl !== null) {
              if (typeof item.audioUrl === 'string' && item.audioUrl.trim().length > 0) {
                audioUrl = item.audioUrl.trim();
              }
            }

            const word: WordImportData = {
              spelling: item.spelling?.trim() || '',
              phonetic: item.phonetic?.trim() || '',
              meanings,
              examples,
              audioUrl,
            };

            const rowErrors = validateWordData(word, index + 1);
            if (rowErrors.length > 0) {
              validationErrors.push(...rowErrors);
            } else {
              data.push(word);
            }
          } catch (error) {
            errors.push(
              `第 ${index + 1} 项解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
            );
          }
        });

        if (validationErrors.length > 0) {
          validationErrors.forEach((err) => {
            errors.push(`第 ${err.row} 项，字段 "${err.field}": ${err.message}`);
          });
        }

        resolve({
          success: errors.length === 0,
          data,
          errors,
        });
      } catch (error) {
        resolve({
          success: false,
          data: [],
          errors: [`JSON解析失败: ${error instanceof Error ? error.message : '未知错误'}`],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        errors: ['文件读取失败'],
      });
    };

    reader.readAsText(file);
  });
}

export async function parseImportFile(file: File): Promise<ParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'csv':
      return parseCSVFile(file);
    case 'json':
      return parseJSONFile(file);
    default:
      return {
        success: false,
        data: [],
        errors: [`不支持的文件格式: ${extension}`],
      };
  }
}
