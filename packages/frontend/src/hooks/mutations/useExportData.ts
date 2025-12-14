/**
 * useExportData - 数据导出 Mutation Hook
 *
 * 功能：
 * - 导出单词数据（JSON/CSV格式）
 * - 导出学习记录
 * - 导出用户进度
 * - 支持进度跟踪
 * - 自动缓存更新
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient from '../../services/client';
import type { Word, AnswerRecord } from '../../types/models';
import { PAGINATION_CONFIG } from '../../constants/pagination';
import { addExportHistory } from '../queries/useExportHistory';

/**
 * 导出格式类型
 */
export type ExportFormat = 'json' | 'csv';

/**
 * 导出数据类型
 */
export type ExportDataType = 'words' | 'records' | 'progress' | 'all';

/**
 * 导出参数
 */
export interface ExportDataParams {
  /** 导出数据类型 */
  dataType: ExportDataType;
  /** 导出格式 */
  format: ExportFormat;
  /** 词书ID（可选，用于过滤单词） */
  wordBookId?: string;
  /** 开始日期（可选，用于过滤记录） */
  startDate?: string;
  /** 结束日期（可选，用于过滤记录） */
  endDate?: string;
  /** 是否包含详细信息 */
  includeDetails?: boolean;
}

/**
 * 导出结果
 */
export interface ExportDataResult {
  /** 导出的文件内容 */
  data: string | Blob;
  /** 文件名 */
  filename: string;
  /** 导出的记录数量 */
  count: number;
  /** 文件大小（字节） */
  size: number;
  /** 导出时间戳 */
  timestamp: number;
}

/**
 * 导出进度信息
 */
export interface ExportProgress {
  /** 当前进度（0-100） */
  progress: number;
  /** 当前阶段描述 */
  stage: string;
  /** 已处理的记录数 */
  processed: number;
  /** 总记录数 */
  total: number;
}

/**
 * 将数据转换为CSV格式
 */
function convertToCSV(data: unknown[], headers: string[]): string {
  const csvRows: string[] = [];

  // 添加表头
  csvRows.push(headers.join(','));

  // 添加数据行
  for (const row of data) {
    const values = headers.map((header) => {
      const value = (row as Record<string, unknown>)[header];
      // 处理包含逗号或换行的值
      if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      // 处理数组
      if (Array.isArray(value)) {
        return `"${value.join('|')}"`;
      }
      return value?.toString() ?? '';
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * 导出单词数据
 */
async function exportWords(
  params: ExportDataParams,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ExportDataResult> {
  onProgress?.({
    progress: 10,
    stage: '获取单词数据',
    processed: 0,
    total: 0,
  });

  // 获取单词数据
  let words: Word[];
  if (params.wordBookId) {
    try {
      words = await apiClient.getWordBookWords(params.wordBookId);
    } catch (error) {
      // 如果按词书获取失败，回退到全量，避免导出中断
      words = await apiClient.getWords();
      console.warn('按词书导出失败，已回退到全量导出', error);
    }
  } else {
    words = await apiClient.getWords();
  }

  onProgress?.({
    progress: 50,
    stage: '处理数据',
    processed: words.length,
    total: words.length,
  });

  // 根据格式导出
  let data: string | Blob;
  let filename: string;

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0];

  if (params.format === 'json') {
    data = JSON.stringify(words, null, 2);
    filename = `words-export-${dateStr}.json`;
  } else {
    // CSV格式
    const headers = ['spelling', 'phonetic', 'meanings', 'examples', 'audioUrl'];
    data = convertToCSV(words, headers);
    filename = `words-export-${dateStr}.csv`;
  }

  onProgress?.({
    progress: 100,
    stage: '完成',
    processed: words.length,
    total: words.length,
  });

  return {
    data,
    filename,
    count: words.length,
    size: new Blob([data]).size,
    timestamp,
  };
}

/**
 * 导出学习记录
 */
async function exportRecords(
  params: ExportDataParams,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ExportDataResult> {
  onProgress?.({
    progress: 10,
    stage: '获取学习记录',
    processed: 0,
    total: 0,
  });

  // 获取学习记录（可能需要分页）
  const { records } = await apiClient.getRecords({ page: 1, pageSize: PAGINATION_CONFIG.EXPORT });

  onProgress?.({
    progress: 50,
    stage: '处理数据',
    processed: records.length,
    total: records.length,
  });

  // 根据日期范围过滤
  let filteredRecords = records;
  if (params.startDate || params.endDate) {
    const startTime = params.startDate ? new Date(params.startDate).getTime() : 0;
    const endTime = params.endDate ? new Date(params.endDate).getTime() : Date.now();
    filteredRecords = records.filter((r) => r.timestamp >= startTime && r.timestamp <= endTime);
  }

  // 根据格式导出
  let data: string | Blob;
  let filename: string;

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0];

  if (params.format === 'json') {
    data = JSON.stringify(filteredRecords, null, 2);
    filename = `records-export-${dateStr}.json`;
  } else {
    // CSV格式
    const headers = [
      'wordId',
      'timestamp',
      'selectedAnswer',
      'correctAnswer',
      'isCorrect',
      'responseTime',
    ];
    data = convertToCSV(filteredRecords, headers);
    filename = `records-export-${dateStr}.csv`;
  }

  onProgress?.({
    progress: 100,
    stage: '完成',
    processed: filteredRecords.length,
    total: filteredRecords.length,
  });

  return {
    data,
    filename,
    count: filteredRecords.length,
    size: new Blob([data]).size,
    timestamp,
  };
}

/**
 * 导出用户进度
 */
async function exportProgress(
  params: ExportDataParams,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ExportDataResult> {
  onProgress?.({
    progress: 10,
    stage: '获取进度数据',
    processed: 0,
    total: 0,
  });

  // 获取各种进度数据
  const [studyConfig, statistics] = await Promise.all([
    apiClient.getStudyConfig(),
    apiClient.getUserStatistics(),
  ]);

  onProgress?.({
    progress: 50,
    stage: '处理数据',
    processed: 1,
    total: 1,
  });

  const progressData = {
    studyConfig,
    statistics,
    exportedAt: new Date().toISOString(),
  };

  // 根据格式导出
  let data: string | Blob;
  let filename: string;

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0];

  if (params.format === 'json') {
    data = JSON.stringify(progressData, null, 2);
    filename = `progress-export-${dateStr}.json`;
  } else {
    // CSV格式 - 简化版
    const flatData = [
      {
        dailyWordCount: studyConfig.dailyWordCount,
        studyMode: studyConfig.studyMode,
        totalWords: statistics.totalWords,
        totalRecords: statistics.totalRecords,
        correctRate: statistics.correctRate,
      },
    ];
    const headers = Object.keys(flatData[0]);
    data = convertToCSV(flatData, headers);
    filename = `progress-export-${dateStr}.csv`;
  }

  onProgress?.({
    progress: 100,
    stage: '完成',
    processed: 1,
    total: 1,
  });

  return {
    data,
    filename,
    count: 1,
    size: new Blob([data]).size,
    timestamp,
  };
}

/**
 * 导出所有数据
 */
async function exportAll(
  params: ExportDataParams,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ExportDataResult> {
  onProgress?.({
    progress: 0,
    stage: '准备导出',
    processed: 0,
    total: 3,
  });

  // 导出所有类型的数据
  const [wordsResult, recordsResult, progressResult] = await Promise.all([
    exportWords({ ...params, dataType: 'words' }, (p) => {
      onProgress?.({
        ...p,
        progress: p.progress / 3,
        processed: 0,
        total: 3,
      });
    }),
    exportRecords({ ...params, dataType: 'records' }, (p) => {
      onProgress?.({
        ...p,
        progress: 33 + p.progress / 3,
        processed: 1,
        total: 3,
      });
    }),
    exportProgress({ ...params, dataType: 'progress' }, (p) => {
      onProgress?.({
        ...p,
        progress: 66 + p.progress / 3,
        processed: 2,
        total: 3,
      });
    }),
  ]);

  // 合并所有数据
  const allData = {
    words: JSON.parse(wordsResult.data as string),
    records: JSON.parse(recordsResult.data as string),
    progress: JSON.parse(progressResult.data as string),
    exportedAt: new Date().toISOString(),
  };

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0];

  // 只支持JSON格式的完整导出
  const data = JSON.stringify(allData, null, 2);
  const filename = `all-data-export-${dateStr}.json`;

  onProgress?.({
    progress: 100,
    stage: '完成',
    processed: 3,
    total: 3,
  });

  return {
    data,
    filename,
    count: wordsResult.count + recordsResult.count + progressResult.count,
    size: new Blob([data]).size,
    timestamp,
  };
}

/**
 * 导出数据的 Mutation Hook
 *
 * @example
 * ```tsx
 * function ExportButton() {
 *   const [progress, setProgress] = useState<ExportProgress | null>(null);
 *   const { mutate, isPending } = useExportData({
 *     onSuccess: (result) => {
 *       // 触发下载
 *       const blob = new Blob([result.data]);
 *       const url = URL.createObjectURL(blob);
 *       const a = document.createElement('a');
 *       a.href = url;
 *       a.download = result.filename;
 *       a.click();
 *       URL.revokeObjectURL(url);
 *     },
 *     onProgress: setProgress,
 *   });
 *
 *   return (
 *     <button onClick={() => mutate({ dataType: 'words', format: 'json' })}>
 *       导出单词
 *     </button>
 *   );
 * }
 * ```
 */
export function useExportData(options?: {
  onSuccess?: (result: ExportDataResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: ExportProgress) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation<ExportDataResult, Error, ExportDataParams>({
    mutationFn: async (params: ExportDataParams) => {
      // 根据数据类型选择导出函数
      switch (params.dataType) {
        case 'words':
          return exportWords(params, options?.onProgress);
        case 'records':
          return exportRecords(params, options?.onProgress);
        case 'progress':
          return exportProgress(params, options?.onProgress);
        case 'all':
          return exportAll(params, options?.onProgress);
        default:
          throw new Error(`不支持的导出类型: ${params.dataType}`);
      }
    },
    onSuccess: (result, variables) => {
      // 记录导出历史（本地持久化）并刷新缓存
      addExportHistory({
        ...result,
        dataType: variables.dataType,
        format: variables.format,
        status: 'success',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.export.history() });

      options?.onSuccess?.(result);
    },
    onError: (error: Error, variables) => {
      if (variables) {
        addExportHistory({
          data: '',
          filename: '',
          count: 0,
          size: 0,
          timestamp: Date.now(),
          dataType: variables.dataType,
          format: variables.format,
          status: 'failed',
          error: error.message,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.export.history() });
      }
      options?.onError?.(error);
    },
  });
}

/**
 * 下载导出的数据
 */
export function downloadExportData(result: ExportDataResult): void {
  const blob =
    result.data instanceof Blob
      ? result.data
      : new Blob([result.data], { type: 'text/plain;charset=utf-8' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
