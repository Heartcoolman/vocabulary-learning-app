import React, { useState, useCallback, useRef } from 'react';
import { X, Warning, CheckCircle, CircleNotch, FileText } from './Icon';
import { Modal } from './ui/Modal';
import FileUpload from './FileUpload';
import { parseImportFile, WordImportData } from '../utils/importParsers';
import { adminClient, wordClient } from '../services/client';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  wordBookId: string;
  onImportSuccess: (importedCount: number) => void;
  isAdminMode?: boolean; // 是否为管理员模式
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'result';

const BatchImportModalComponent: React.FC<BatchImportModalProps> = ({
  isOpen,
  onClose,
  wordBookId,
  onImportSuccess,
  isAdminMode = false,
}) => {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<WordImportData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const isCancelledRef = useRef(false);

  const resetState = useCallback(() => {
    setStep('upload');
    setParsedData([]);
    setErrors([]);
    setImportedCount(0);
    setFailedCount(0);
    setImportError(null);
    setFile(null);
    setIsImporting(false);
    setIsCancelling(false);
    isCancelledRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    if (isImporting) {
      // 显示确认对话框
      const confirmed = window.confirm('导入正在进行中，确定要取消吗？');
      if (confirmed) {
        // 设置取消标志和取消状态，让正在进行的导入操作可以检测到
        isCancelledRef.current = true;
        setIsCancelling(true);
      }
      return;
    }
    resetState();
    onClose();
  }, [onClose, resetState, isImporting]);

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    if (!selectedFile) {
      resetState();
      return;
    }

    try {
      const result = await parseImportFile(selectedFile);
      setParsedData(result.data);
      setErrors(result.errors);
      setStep('preview');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : '解析文件时发生未知错误']);
      setStep('preview');
    }
  };

  const handleConfirmImport = async () => {
    if (parsedData.length === 0) return;

    setStep('importing');
    setIsImporting(true);
    setImportError(null);
    isCancelledRef.current = false;

    try {
      // 根据是否为管理员模式选择相应的 API
      const response = isAdminMode
        ? await adminClient.batchAddWordsToSystemWordBook(wordBookId, parsedData)
        : await wordClient.batchImportWords(wordBookId, parsedData);

      if (isCancelledRef.current) {
        setIsCancelling(false);
        resetState();
        onClose();
        return;
      }

      // 处理响应
      if (Array.isArray(response)) {
        // adminBatchAddWordsToSystemWordBook 返回导入的单词数组
        setImportedCount(response.length);
        setFailedCount(0);
      } else {
        // batchImportWords 返回 { imported, failed, errors? } 对象
        setImportedCount(response.imported);
        setFailedCount(response.failed);

        if (response.errors && response.errors.length > 0) {
          setErrors((prev) => [...prev, ...response.errors!]);
        }
      }

      if (Array.isArray(response) ? response.length > 0 : response.imported > 0) {
        onImportSuccess(Array.isArray(response) ? response.length : response.imported);
      }

      setStep('result');
      setIsImporting(false);
    } catch (err) {
      if (isCancelledRef.current) {
        setIsCancelling(false);
        resetState();
        onClose();
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '导入请求失败';
      setImportError(errorMessage);
      setStep('result');
      setIsImporting(false);
    }
  };

  // 移除 createPortal，直接返回 Modal
  // Modal 组件内部处理了 createPortal 和样式
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="批量导入单词"
      maxWidth="2xl"
      closeOnOverlayClick={!isImporting}
      showCloseButton={!isImporting}
    >
      <div className="flex max-h-[70vh] flex-col overflow-hidden">
        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-1">
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="rounded-button border border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/30">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-300">
                  <FileText size={16} />
                  文件格式要求
                </h3>
                <ul className="list-inside list-disc space-y-1 text-sm text-blue-700 dark:text-blue-400">
                  <li>支持 CSV 或 JSON 格式</li>
                  <li>
                    必须包含字段: spelling (拼写), phonetic (音标), meanings (释义), examples (例句)
                  </li>
                  <li>CSV使用竖线 "|" 分隔多个释义或例句</li>
                </ul>
              </div>

              <FileUpload onFileSelect={handleFileSelect} accept=".csv,.json" maxSizeMB={5} />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  解析结果预览
                  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    (共 {parsedData.length} 个单词)
                  </span>
                </h3>
                <button
                  onClick={() => {
                    setFile(null);
                    setParsedData([]);
                    setErrors([]);
                    setStep('upload');
                  }}
                  className="text-sm text-blue-600 transition-colors duration-g3-fast hover:text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  重新上传
                </button>
              </div>

              {errors.length > 0 ? (
                <div className="rounded-button border border-red-100 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
                  <div className="mb-2 flex items-center gap-2 font-medium text-red-800 dark:text-red-300">
                    <Warning size={18} weight="bold" />
                    发现 {errors.length} 个错误
                  </div>
                  <ul className="max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-sm text-red-600 dark:text-red-400">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-red-700 dark:text-red-300">
                    请修改文件后重新上传。
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-button border border-gray-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300">
                        <tr>
                          <th className="w-1/4 px-4 py-3">拼写</th>
                          <th className="w-1/4 px-4 py-3">音标</th>
                          <th className="px-4 py-3">释义预览</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                        {parsedData.slice(0, 5).map((word, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                              {word.spelling}
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">
                              {word.phonetic}
                            </td>
                            <td className="max-w-xs truncate px-4 py-3 text-gray-600 dark:text-gray-400">
                              {word.meanings.join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedData.length > 5 && (
                    <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-center text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400">
                      还有 {parsedData.length - 5} 条数据未显示...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
              <CircleNotch size={48} weight="bold" className="animate-spin text-blue-500" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {isCancelling ? '正在取消...' : '正在导入...'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {isCancelling
                  ? '请稍候，正在安全取消导入操作'
                  : `请稍候，正在处理 ${parsedData.length} 个单词`}
              </p>
            </div>
          )}

          {step === 'result' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-8 text-center">
              {importError ? (
                <div className="mb-2 rounded-full bg-red-100 p-4 text-red-600 dark:bg-red-900/30">
                  <X size={48} />
                </div>
              ) : failedCount === 0 ? (
                <div className="mb-2 rounded-full bg-green-100 p-4 text-green-600 dark:bg-green-900/30">
                  <CheckCircle size={48} weight="bold" />
                </div>
              ) : (
                <div className="mb-2 rounded-full bg-amber-100 p-4 text-amber-600 dark:bg-amber-900/30">
                  <Warning size={48} weight="bold" />
                </div>
              )}

              <div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  {importError ? '导入失败' : failedCount === 0 ? '导入成功' : '部分导入完成'}
                </h3>

                {importError ? (
                  <p className="mx-auto max-w-md text-red-600 dark:text-red-400">{importError}</p>
                ) : (
                  <div className="space-y-1 text-gray-600 dark:text-gray-300">
                    <p>
                      成功导入:{' '}
                      <span className="font-bold text-green-600 dark:text-green-400">
                        {importedCount}
                      </span>
                    </p>
                    {failedCount > 0 && (
                      <p>
                        导入失败:{' '}
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {failedCount}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {!importError && errors.length > 0 && (
                <div className="max-h-40 w-full overflow-y-auto rounded-button border border-amber-100 bg-amber-50 p-4 text-left dark:border-amber-800 dark:bg-amber-900/30">
                  <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    失败详情:
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-xs text-amber-700 dark:text-amber-400">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="mt-6 flex justify-end gap-3 pt-4">
          {step === 'preview' ? (
            <>
              <button
                onClick={handleClose}
                className="rounded-button border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700 dark:focus:ring-slate-600"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={errors.length > 0 || parsedData.length === 0}
                className="rounded-button bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                确认导入
              </button>
            </>
          ) : step === 'result' ? (
            <button
              onClick={handleClose}
              className="rounded-button bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
            >
              完成
            </button>
          ) : step === 'upload' ? (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              取消
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

/**
 * Memoized BatchImportModal component
 * Note: This component has complex internal state, so memo primarily prevents
 * re-renders from parent component updates when props haven't changed
 */
const BatchImportModal = React.memo(BatchImportModalComponent, (prevProps, nextProps) => {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.onClose === nextProps.onClose &&
    prevProps.wordBookId === nextProps.wordBookId &&
    prevProps.onImportSuccess === nextProps.onImportSuccess &&
    prevProps.isAdminMode === nextProps.isAdminMode
  );
});

export default BatchImportModal;
