import { useState } from 'react';
import { CenterWordBookDetail as DetailType, wordBookCenterClient } from '../../services/client';
import { useAuth } from '../../contexts/AuthContext';
import { Modal, useToast } from '../ui';
import { Books, Download, Tag, X, Check } from '../Icon';

interface CenterWordBookDetailProps {
  detail: DetailType | null;
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export function CenterWordBookDetail({
  detail,
  isOpen,
  onClose,
  onImportSuccess,
}: CenterWordBookDetailProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [importing, setImporting] = useState(false);
  const [targetType, setTargetType] = useState<'SYSTEM' | 'USER'>(isAdmin ? 'SYSTEM' : 'USER');
  const { showToast } = useToast();

  if (!detail) return null;

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await wordBookCenterClient.importWordBook(detail.id, targetType);
      showToast(result.message, 'success');
      onImportSuccess();
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '导入失败';
      showToast(msg, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={detail.name} size="lg">
      <div className="space-y-4">
        <div className="flex gap-4">
          {detail.coverImage ? (
            <img
              src={detail.coverImage}
              alt={detail.name}
              className="h-24 w-24 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <Books className="h-10 w-10 text-white/80" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{detail.name}</h2>
            {detail.author && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">作者: {detail.author}</p>
            )}
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {detail.wordCount} 个单词 · 版本 {detail.version}
            </p>
            {detail.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {detail.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-slate-700 dark:text-gray-300"
                  >
                    <Tag className="mr-1 h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {detail.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300">{detail.description}</p>
        )}

        <div className="border-t pt-4 dark:border-slate-700">
          <h3 className="mb-2 font-medium text-gray-900 dark:text-white">
            单词预览 ({Math.min(10, detail.words.length)}/{detail.words.length})
          </h3>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {detail.words.slice(0, 10).map((word, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between border-b py-2 last:border-0 dark:border-slate-700"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{word.spelling}</span>
                  {word.phonetic && (
                    <span className="ml-2 text-sm text-gray-400">{word.phonetic}</span>
                  )}
                </div>
                <span className="max-w-[60%] truncate text-right text-sm text-gray-500 dark:text-gray-400">
                  {word.meanings[0]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-4 dark:border-slate-700">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            导入类型
          </label>
          <div className="flex gap-4">
            {isAdmin && (
              <label className="flex items-center">
                <input
                  type="radio"
                  name="targetType"
                  value="SYSTEM"
                  checked={targetType === 'SYSTEM'}
                  onChange={() => setTargetType('SYSTEM')}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">系统词书</span>
              </label>
            )}
            <label className="flex items-center">
              <input
                type="radio"
                name="targetType"
                value="USER"
                checked={targetType === 'USER'}
                onChange={() => setTargetType('USER')}
                className="mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {isAdmin ? '用户词书' : '我的词书'}
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
          >
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <>
                <span className="animate-spin">⟳</span>
                导入中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                导入词书
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
