import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  WarningCircle,
  UploadSimple,
  FileText,
  CircleNotch,
  BookOpen,
  X,
} from '../components/Icon';
import apiClient from '../services/ApiClient';
import { FileUpload } from '../components';
import { parseImportFile, WordImportData } from '../utils/importParsers';
import { WordBook } from '../types/models';
import { adminLogger } from '../utils/logger';
import { useBatchImport, BatchOperationProgress } from '../hooks/mutations/useBatchOperations';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';

const STEPS = [
  { id: 1, name: '选择词书' },
  { id: 2, name: '上传文件' },
  { id: 3, name: '预览确认' },
  { id: 4, name: '导入结果' },
];

export default function BatchImportPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<WordImportData[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<BatchOperationProgress | null>(null);

  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  // 使用 React Query 获取词书列表
  const {
    data: wordBooks = [],
    isLoading: isLoadingBooks,
    error: booksError,
  } = useQuery({
    queryKey: queryKeys.wordbooks.lists(),
    queryFn: async () => {
      const books = await apiClient.adminGetSystemWordBooks();
      if (books.length > 0 && !selectedBookId) {
        setSelectedBookId(books[0].id);
      }
      return books;
    },
    retry: 2,
  });

  // 使用批量导入 hook
  const { mutate: importWords, isPending: isImporting } = useBatchImport({
    onSuccess: (result) => {
      setImportedCount(result.imported);
      setFailedCount(result.failed);
      if (result.errors.length > 0) {
        setValidationErrors((prev) => [...prev, ...result.errors]);
      }
      setCurrentStep(4);
      setProgress(null);
    },
    onError: (error) => {
      setImportError(error.message);
      setCurrentStep(4);
      setProgress(null);
    },
    onProgress: (p) => {
      setProgress(p);
    },
  });

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setValidationErrors([]);

    if (!selectedFile) return;

    setIsLoading(true);
    try {
      const result = await parseImportFile(selectedFile);
      setParsedData(result.data);

      if (!result.success) {
        setValidationErrors(result.errors);
      }

      setCurrentStep(3);
    } catch (err) {
      setValidationErrors([err instanceof Error ? err.message : '文件解析失败']);
      setCurrentStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = () => {
    if (!selectedBookId || parsedData.length === 0) return;

    setImportError(null);
    importWords({
      wordBookId: selectedBookId,
      words: parsedData,
    });
  };

  const handleReset = () => {
    setFile(null);
    setParsedData([]);
    setValidationErrors([]);
    setImportedCount(0);
    setFailedCount(0);
    setImportError(null);
    setProgress(null);
    setCurrentStep(1);
  };

  const renderStepIndicator = () => (
    <div className="mb-8 w-full border-b border-gray-200 bg-white px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <nav aria-label="Progress">
          <ol className="flex items-center">
            {STEPS.map((step, index) => {
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;

              return (
                <li
                  key={step.name}
                  className={`relative ${index !== STEPS.length - 1 ? 'w-full pr-8 sm:pr-20' : ''}`}
                >
                  <div className="flex items-center">
                    <div
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 ${isCompleted ? 'border-blue-600 bg-blue-600' : isCurrent ? 'border-blue-600 bg-white' : 'border-gray-300 bg-white'} `}
                    >
                      {isCompleted ? (
                        <CheckCircle
                          className="h-5 w-5 text-white"
                          weight="fill"
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className={`text-sm font-bold ${isCurrent ? 'text-blue-600' : 'text-gray-500'}`}
                        >
                          {step.id}
                        </span>
                      )}
                    </div>
                    <span
                      className={`ml-3 text-sm font-medium ${isCurrent ? 'text-blue-600' : 'text-gray-500'} hidden sm:block`}
                    >
                      {step.name}
                    </span>

                    {index !== STEPS.length - 1 && (
                      <div className="absolute left-0 top-4 -ml-2 w-full pl-14 lg:pl-20">
                        <div
                          className={`h-0.5 w-full ${isCompleted ? 'bg-blue-600' : 'bg-gray-200'}`}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="Go back"
            >
              <ArrowLeft size={20} weight="bold" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">批量导入单词</h1>
          </div>
        </div>
      </header>

      {renderStepIndicator()}

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-12">
        <div className="flex min-h-[500px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {currentStep === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 flex flex-col gap-6 p-8 duration-300">
              <div className="mb-4 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                  <BookOpen className="h-8 w-8 text-blue-600" weight="bold" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">选择目标词书</h2>
                <p className="mt-2 text-gray-500">请选择您要将单词导入到哪个词书中</p>
              </div>

              {isLoadingBooks ? (
                <div className="flex justify-center py-12">
                  <CircleNotch className="h-8 w-8 animate-spin text-blue-500" weight="bold" />
                </div>
              ) : booksError ? (
                <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-center text-red-700">
                  无法加载词书列表，请稍后重试
                  <button
                    onClick={() => window.location.reload()}
                    className="mx-auto mt-2 block text-sm underline"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-md space-y-6">
                  <div>
                    <label
                      htmlFor="wordbook-select"
                      className="mb-2 block text-sm font-medium text-gray-700"
                    >
                      目标词书
                    </label>
                    <select
                      id="wordbook-select"
                      value={selectedBookId}
                      onChange={(e) => setSelectedBookId(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 py-3 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    >
                      {wordBooks.map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.name} ({book.wordCount} 词)
                        </option>
                      ))}
                    </select>
                    {wordBooks.length === 0 && (
                      <p className="mt-2 text-sm text-amber-600">暂无可用词书，请先创建。</p>
                    )}
                  </div>

                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={!selectedBookId}
                    className="flex w-full justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一步
                  </button>
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 flex flex-col gap-6 p-8 duration-300">
              <div className="mb-2 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                  <UploadSimple className="h-8 w-8 text-blue-600" weight="bold" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">上传数据文件</h2>
                <p className="mt-2 text-gray-500">支持 CSV 或 JSON 格式的数据文件</p>
              </div>

              <div className="mx-auto w-full max-w-xl space-y-6">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                  <p className="mb-2 flex items-center gap-2 font-semibold">
                    <FileText size={16} weight="bold" />
                    文件格式要求:
                  </p>
                  <ul className="ml-1 list-inside list-disc space-y-1 opacity-90">
                    <li>必需字段: spelling, phonetic, meanings, examples</li>
                    <li>CSV格式: 使用竖线 "|" 分隔多个释义或例句</li>
                    <li>最大文件大小: 5MB</li>
                  </ul>
                </div>

                <FileUpload onFileSelect={handleFileSelect} accept=".csv,.json" maxSizeMB={5} />

                <div className="flex justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    上一步
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 flex h-full flex-col duration-300">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">预览数据</h2>
                  <p className="text-sm text-gray-500">
                    共解析出 {parsedData.length} 条数据
                    {file && <span className="ml-2">({file.name})</span>}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setParsedData([]);
                    setValidationErrors([]);
                    setCurrentStep(2);
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  重新上传
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {validationErrors.length > 0 ? (
                  <div className="rounded-lg border border-red-100 bg-red-50 p-6 text-center">
                    <WarningCircle className="mx-auto mb-4 h-12 w-12 text-red-500" weight="bold" />
                    <h3 className="mb-2 text-lg font-medium text-red-900">数据校验失败</h3>
                    <p className="mb-4 text-red-600">
                      发现 {validationErrors.length} 个错误，请修正后重新上传
                    </p>
                    <div className="max-h-60 overflow-y-auto rounded border border-red-200 bg-white p-4 text-left">
                      <ul className="list-inside list-disc space-y-1 text-sm text-red-700">
                        {validationErrors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 font-medium text-gray-700">
                        <tr>
                          <th className="w-1/4 px-4 py-3">拼写</th>
                          <th className="w-1/4 px-4 py-3">音标</th>
                          <th className="px-4 py-3">释义</th>
                          <th className="hidden px-4 py-3 sm:table-cell">例句</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {parsedData.slice(0, 5).map((word, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{word.spelling}</td>
                            <td className="px-4 py-3 font-mono text-gray-500">{word.phonetic}</td>
                            <td className="px-4 py-3 text-gray-600">
                              <div
                                className="max-w-[150px] truncate"
                                title={word.meanings.join(', ')}
                              >
                                {word.meanings.join(', ')}
                              </div>
                            </td>
                            <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">
                              <div
                                className="max-w-[200px] truncate"
                                title={word.examples.join(' | ')}
                              >
                                {word.examples[0]}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedData.length > 5 && (
                      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm font-medium text-gray-500">
                        还有 {parsedData.length - 5} 条数据未显示...
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 bg-white p-6">
                {/* 进度指示器 */}
                {progress && (
                  <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-blue-900">{progress.stage}</span>
                      <span className="text-blue-700">{progress.progress}%</span>
                    </div>
                    <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-blue-200">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-blue-700">
                      <span>
                        已处理: {progress.processed}/{progress.total}
                      </span>
                      <span>
                        成功: {progress.succeeded} | 失败: {progress.failed}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={isImporting}
                    className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一步
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={validationErrors.length > 0 || parsedData.length === 0 || isImporting}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isImporting && <CircleNotch className="h-4 w-4 animate-spin" weight="bold" />}
                    {isImporting ? '导入中...' : '确认导入'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 flex h-full flex-col items-center justify-center p-8 text-center duration-300">
              {importError ? (
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                  <X className="h-10 w-10 text-red-600" weight="bold" />
                </div>
              ) : failedCount === 0 ? (
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-10 w-10 text-green-600" weight="bold" />
                </div>
              ) : (
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
                  <WarningCircle className="h-10 w-10 text-amber-600" weight="bold" />
                </div>
              )}

              <h2 className="mb-2 text-3xl font-bold text-gray-900">
                {importError ? '导入失败' : failedCount === 0 ? '导入成功' : '部分导入完成'}
              </h2>

              {importError ? (
                <p className="mb-8 max-w-md text-red-600">{importError}</p>
              ) : (
                <div className="mb-8 space-y-2">
                  <p className="text-gray-600">
                    成功导入{' '}
                    <span className="text-lg font-bold text-green-600">{importedCount}</span> 个单词
                  </p>
                  {failedCount > 0 && (
                    <p className="text-gray-600">
                      失败 <span className="text-lg font-bold text-red-600">{failedCount}</span> 个
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={handleReset}
                  className="min-w-[120px] rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50"
                >
                  继续导入
                </button>
                <button
                  onClick={() => navigate(-1)}
                  className="min-w-[120px] rounded-lg bg-blue-600 px-6 py-3 text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  返回列表
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
