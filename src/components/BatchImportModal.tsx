import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Warning, CheckCircle, CircleNotch, FileText } from './Icon';
import { fadeInVariants, scaleInVariants } from '../utils/animations';
import FileUpload from './FileUpload';
import { parseImportFile, WordImportData } from '../utils/importParsers';
import apiClient from '../services/ApiClient';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  wordBookId: string;
  onImportSuccess: (importedCount: number) => void;
  isAdminMode?: boolean; // 是否为管理员模式
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'result';

const BatchImportModal: React.FC<BatchImportModalProps> = ({
  isOpen,
  onClose,
  wordBookId,
  onImportSuccess,
  isAdminMode = false
}) => {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<WordImportData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const resetState = useCallback(() => {
    setStep('upload');
    setParsedData([]);
    setErrors([]);
    setImportedCount(0);
    setFailedCount(0);
    setImportError(null);
    setFile(null);
    setIsImporting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isImporting) return;
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
    let isCancelled = false;

    try {
      // 根据是否为管理员模式选择相应的 API
      const response = isAdminMode
        ? await apiClient.adminBatchAddWordsToSystemWordBook(wordBookId, parsedData)
        : await apiClient.batchImportWords(wordBookId, parsedData);

      if (isCancelled) return;

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
          setErrors(prev => [...prev, ...response.errors!]);
        }
      }

      if (Array.isArray(response) ? response.length > 0 : response.imported > 0) {
         onImportSuccess(Array.isArray(response) ? response.length : response.imported);
      }

      setStep('result');
      setIsImporting(false);
    } catch (err) {
      if (isCancelled) return;

      const errorMessage = err instanceof Error ? err.message : '导入请求失败';
      setImportError(errorMessage);
      setStep('result');
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeInVariants}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={scaleInVariants}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">批量导入单词</h2>
          <button
            onClick={handleClose}
            disabled={isImporting}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <FileText size={16} />
                  文件格式要求
                </h3>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>支持 CSV 或 JSON 格式</li>
                  <li>必须包含字段: spelling (拼写), phonetic (音标), meanings (释义), examples (例句)</li>
                  <li>CSV使用竖线 "|" 分隔多个释义或例句</li>
                </ul>
              </div>

              <FileUpload
                onFileSelect={handleFileSelect}
                accept=".csv,.json"
                maxSizeMB={5}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  解析结果预览
                  <span className="ml-2 text-sm font-normal text-gray-500">
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
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  重新上传
                </button>
              </div>

              {errors.length > 0 ? (
                <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
                    <Warning size={18} weight="bold" />
                    发现 {errors.length} 个错误
                  </div>
                  <ul className="list-disc list-inside text-sm text-red-600 space-y-1 max-h-40 overflow-y-auto">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-red-700">
                    请修改文件后重新上传。
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 w-1/4">拼写</th>
                          <th className="px-4 py-3 w-1/4">音标</th>
                          <th className="px-4 py-3">释义预览</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {parsedData.slice(0, 5).map((word, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{word.spelling}</td>
                            <td className="px-4 py-3 text-gray-600 font-mono">{word.phonetic}</td>
                            <td className="px-4 py-3 text-gray-600 truncate max-w-xs">
                              {word.meanings.join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedData.length > 5 && (
                    <div className="bg-gray-50 px-4 py-2 text-xs text-center text-gray-500 border-t border-gray-200">
                      还有 {parsedData.length - 5} 条数据未显示...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <CircleNotch size={48} weight="bold" className="text-blue-500 animate-spin" />
              <h3 className="text-lg font-medium text-gray-900">正在导入...</h3>
              <p className="text-gray-500">请稍候，正在处理 {parsedData.length} 个单词</p>
            </div>
          )}

          {step === 'result' && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
              {importError ? (
                <div className="p-4 rounded-full bg-red-100 text-red-600 mb-2">
                  <X size={48} weight="bold" />
                </div>
              ) : failedCount === 0 ? (
                <div className="p-4 rounded-full bg-green-100 text-green-600 mb-2">
                  <CheckCircle size={48} weight="bold" />
                </div>
              ) : (
                <div className="p-4 rounded-full bg-amber-100 text-amber-600 mb-2">
                  <Warning size={48} weight="bold" />
                </div>
              )}

              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {importError ? '导入失败' : failedCount === 0 ? '导入成功' : '部分导入完成'}
                </h3>

                {importError ? (
                  <p className="text-red-600 max-w-md mx-auto">{importError}</p>
                ) : (
                  <div className="space-y-1 text-gray-600">
                    <p>成功导入: <span className="font-bold text-green-600">{importedCount}</span></p>
                    {failedCount > 0 && (
                      <p>导入失败: <span className="font-bold text-red-600">{failedCount}</span></p>
                    )}
                  </div>
                )}
              </div>

              {!importError && errors.length > 0 && (
                <div className="w-full bg-amber-50 border border-amber-100 rounded-lg p-4 text-left max-h-40 overflow-y-auto">
                  <p className="text-sm font-semibold text-amber-800 mb-2">失败详情:</p>
                  <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          {step === 'preview' ? (
             <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={errors.length > 0 || parsedData.length === 0}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                确认导入
              </button>
             </>
          ) : step === 'result' ? (
             <button
               onClick={handleClose}
               className="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 transition-colors"
             >
               完成
             </button>
          ) : step === 'upload' ? (
             <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
             >
               取消
             </button>
          ) : null}
        </div>

      </motion.div>
    </motion.div>
  );
};

export default BatchImportModal;
