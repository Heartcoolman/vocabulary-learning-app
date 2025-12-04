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
  X
} from '../components/Icon';
import apiClient from '../services/ApiClient';
import { FileUpload } from '../components';
import { parseImportFile, WordImportData } from '../utils/importParsers';
import { WordBook } from '../types/models';
import { adminLogger } from '../utils/logger';

const STEPS = [
  { id: 1, name: '选择词书' },
  { id: 2, name: '上传文件' },
  { id: 3, name: '预览确认' },
  { id: 4, name: '导入结果' }
];

export default function BatchImportPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<WordImportData[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWordBooks = async () => {
      try {
        setIsLoading(true);
        const books = await apiClient.adminGetSystemWordBooks();
        setWordBooks(books);
        if (books.length > 0) {
          setSelectedBookId(books[0].id);
        }
      } catch (err) {
        adminLogger.error({ err }, '获取词书列表失败');
        setImportError('无法加载词书列表，请稍后重试');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWordBooks();
  }, []);

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

  const handleImport = async () => {
    if (!selectedBookId || parsedData.length === 0) return;

    setIsLoading(true);
    setImportError(null);

    try {
      const result = await apiClient.batchImportWords(selectedBookId, parsedData);

      setImportedCount(result.imported);
      setFailedCount(result.failed);

      if (result.errors && result.errors.length > 0) {
        setValidationErrors(prev => [...prev, ...result.errors!]);
      }

      setCurrentStep(4);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入请求失败');
      setCurrentStep(4);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedData([]);
    setValidationErrors([]);
    setImportedCount(0);
    setFailedCount(0);
    setImportError(null);
    setCurrentStep(1);
  };

  const renderStepIndicator = () => (
    <div className="w-full py-6 px-4 bg-white border-b border-gray-200 mb-8">
      <div className="max-w-4xl mx-auto">
        <nav aria-label="Progress">
          <ol className="flex items-center">
            {STEPS.map((step, index) => {
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;

              return (
                <li key={step.name} className={`relative ${index !== STEPS.length - 1 ? 'pr-8 sm:pr-20 w-full' : ''}`}>
                  <div className="flex items-center">
                    <div
                      className={`
                        relative flex h-8 w-8 items-center justify-center rounded-full border-2
                        ${isCompleted ? 'bg-blue-600 border-blue-600' : isCurrent ? 'border-blue-600 bg-white' : 'border-gray-300 bg-white'}
                      `}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-white" weight="fill" aria-hidden="true" />
                      ) : (
                        <span className={`text-sm font-bold ${isCurrent ? 'text-blue-600' : 'text-gray-500'}`}>
                          {step.id}
                        </span>
                      )}
                    </div>
                    <span className={`ml-3 text-sm font-medium ${isCurrent ? 'text-blue-600' : 'text-gray-500'} hidden sm:block`}>
                      {step.name}
                    </span>

                    {index !== STEPS.length - 1 && (
                      <div className="absolute top-4 left-0 w-full pl-14 -ml-2 lg:pl-20">
                         <div className={`h-0.5 w-full ${isCompleted ? 'bg-blue-600' : 'bg-gray-200'}`} />
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={20} weight="bold" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">批量导入单词</h1>
          </div>
        </div>
      </header>

      {renderStepIndicator()}

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 pb-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">

          {currentStep === 1 && (
            <div className="p-8 flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-4">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-blue-600" weight="bold" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">选择目标词书</h2>
                <p className="text-gray-500 mt-2">请选择您要将单词导入到哪个词书中</p>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-12">
                  <CircleNotch className="w-8 h-8 text-blue-500 animate-spin" weight="bold" />
                </div>
              ) : importError ? (
                <div className="bg-red-50 p-4 rounded-lg border border-red-100 text-red-700 text-center">
                  {importError}
                  <button onClick={() => window.location.reload()} className="block mx-auto mt-2 text-sm underline">重试</button>
                </div>
              ) : (
                <div className="max-w-md mx-auto w-full space-y-6">
                  <div>
                    <label htmlFor="wordbook-select" className="block text-sm font-medium text-gray-700 mb-2">
                      目标词书
                    </label>
                    <select
                      id="wordbook-select"
                      value={selectedBookId}
                      onChange={(e) => setSelectedBookId(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3"
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
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    下一步
                  </button>
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="p-8 flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-2">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <UploadSimple className="w-8 h-8 text-blue-600" weight="bold" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">上传数据文件</h2>
                <p className="text-gray-500 mt-2">支持 CSV 或 JSON 格式的数据文件</p>
              </div>

              <div className="max-w-xl mx-auto w-full space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
                  <p className="font-semibold flex items-center gap-2 mb-2">
                    <FileText size={16} weight="bold" />
                    文件格式要求:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-1 opacity-90">
                    <li>必需字段: spelling, phonetic, meanings, examples</li>
                    <li>CSV格式: 使用竖线 "|" 分隔多个释义或例句</li>
                    <li>最大文件大小: 5MB</li>
                  </ul>
                </div>

                <FileUpload
                  onFileSelect={handleFileSelect}
                  accept=".csv,.json"
                  maxSizeMB={5}
                />

                <div className="flex justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    上一步
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
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
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  重新上传
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {validationErrors.length > 0 ? (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-6 text-center">
                    <WarningCircle className="w-12 h-12 text-red-500 mx-auto mb-4" weight="bold" />
                    <h3 className="text-lg font-medium text-red-900 mb-2">数据校验失败</h3>
                    <p className="text-red-600 mb-4">发现 {validationErrors.length} 个错误，请修正后重新上传</p>
                    <div className="text-left bg-white rounded border border-red-200 p-4 max-h-60 overflow-y-auto">
                      <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                        {validationErrors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 w-1/4">拼写</th>
                          <th className="px-4 py-3 w-1/4">音标</th>
                          <th className="px-4 py-3">释义</th>
                          <th className="px-4 py-3 hidden sm:table-cell">例句</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {parsedData.slice(0, 5).map((word, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{word.spelling}</td>
                            <td className="px-4 py-3 text-gray-500 font-mono">{word.phonetic}</td>
                            <td className="px-4 py-3 text-gray-600">
                              <div className="truncate max-w-[150px]" title={word.meanings.join(', ')}>
                                {word.meanings.join(', ')}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                              <div className="truncate max-w-[200px]" title={word.examples.join(' | ')}>
                                {word.examples[0]}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedData.length > 5 && (
                      <div className="bg-gray-50 px-4 py-3 text-sm text-center text-gray-500 border-t border-gray-200 font-medium">
                        还有 {parsedData.length - 5} 条数据未显示...
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-white">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  上一步
                </button>
                <button
                  onClick={handleImport}
                  disabled={validationErrors.length > 0 || parsedData.length === 0 || isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-sm"
                >
                  {isLoading && <CircleNotch className="w-4 h-4 animate-spin" weight="bold" />}
                  {isLoading ? '导入中...' : '确认导入'}
                </button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
              {importError ? (
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                  <X className="w-10 h-10 text-red-600" weight="bold" />
                </div>
              ) : failedCount === 0 ? (
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle className="w-10 h-10 text-green-600" weight="bold" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                  <WarningCircle className="w-10 h-10 text-amber-600" weight="bold" />
                </div>
              )}

              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {importError ? '导入失败' : failedCount === 0 ? '导入成功' : '部分导入完成'}
              </h2>

              {importError ? (
                <p className="text-red-600 max-w-md mb-8">{importError}</p>
              ) : (
                <div className="mb-8 space-y-2">
                  <p className="text-gray-600">
                    成功导入 <span className="font-bold text-green-600 text-lg">{importedCount}</span> 个单词
                  </p>
                  {failedCount > 0 && (
                    <p className="text-gray-600">
                      失败 <span className="font-bold text-red-600 text-lg">{failedCount}</span> 个
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={handleReset}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-w-[120px]"
                >
                  继续导入
                </button>
                <button
                  onClick={() => navigate(-1)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-w-[120px] shadow-sm"
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
