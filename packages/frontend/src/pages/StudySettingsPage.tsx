import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/ApiClient';
import { WordBook } from '../types/models';
import { CircleNotch } from '../components/Icon';
import { useToast } from '../components/ui';
import { uiLogger } from '../utils/logger';
import { useStudyConfig } from '../hooks/queries';
import { useUpdateStudyConfig } from '../hooks/mutations';

export default function StudySettingsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [dailyCount, setDailyCount] = useState(20);
  const [error, setError] = useState<string | null>(null);

  // 使用 React Query hooks
  const { data: studyConfig, isLoading: configLoading } = useStudyConfig();
  const updateConfigMutation = useUpdateStudyConfig();

  // 加载词书列表
  useEffect(() => {
    loadWordBooks();
  }, []);

  // 当配置加载后，初始化表单
  useEffect(() => {
    if (studyConfig) {
      setSelectedBookIds(studyConfig.selectedWordBookIds || []);
      setDailyCount(studyConfig.dailyWordCount || 20);
    }
  }, [studyConfig]);

  const loadWordBooks = async () => {
    try {
      const booksData = await apiClient.getAllAvailableWordBooks();
      setWordBooks(booksData);
    } catch (err) {
      uiLogger.error({ err }, '加载词书列表失败');
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  const toggleBook = (bookId: string) => {
    setSelectedBookIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId],
    );
  };

  const handleSave = async () => {
    if (selectedBookIds.length === 0) {
      setError('请至少选择一个词书');
      return;
    }

    if (dailyCount < 10 || dailyCount > 100) {
      setError('每日学习量必须在10-100之间');
      return;
    }

    try {
      setError(null);

      await updateConfigMutation.mutateAsync({
        selectedWordBookIds: selectedBookIds,
        dailyWordCount: dailyCount,
        studyMode: 'sequential',
      });

      // 保存成功后返回学习页面（根路径）
      toast.success('学习设置已保存');
      navigate('/');
    } catch (err) {
      uiLogger.error({ err, selectedBookIds, dailyCount }, '保存学习设置失败');
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 合并 loading 状态
  const isLoading = configLoading;
  const isSaving = updateConfigMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600" role="status" aria-live="polite">
            正在加载...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">学习设置</h1>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
            {error}
          </div>
        )}

        {/* 左右分栏布局 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左侧 - 词书选择 */}
          <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="mb-4 text-xl font-bold text-gray-900">选择学习词书</h2>
            <p className="mb-4 text-sm text-gray-600">选中的词书将用于每日学习，支持多选</p>

            {wordBooks.length === 0 ? (
              <div className="py-8 text-center text-gray-500">暂无可用词书，请先创建或添加词书</div>
            ) : (
              <div className="max-h-[500px] space-y-3 overflow-y-auto pr-2">
                {wordBooks.map((book) => (
                  <label
                    key={book.id}
                    className={`flex cursor-pointer items-center rounded-lg border p-4 transition-all duration-200 ${
                      selectedBookIds.includes(book.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    } `}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBookIds.includes(book.id)}
                      onChange={() => toggleBook(book.id)}
                      className="h-5 w-5 rounded text-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900">{book.name}</div>
                        {book.type === 'SYSTEM' && (
                          <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-600">
                            系统词库
                          </span>
                        )}
                      </div>
                      {book.description && (
                        <div className="mt-1 text-sm text-gray-600">{book.description}</div>
                      )}
                      <div className="mt-1 text-sm text-gray-500">{book.wordCount} 个单词</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 右侧 - 设置选项 */}
          <div className="space-y-6">
            {/* 每日学习量 */}
            <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900">每日学习量</h2>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={dailyCount}
                  onChange={(e) => setDailyCount(Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-500"
                />
                <div className="w-20 text-right text-2xl font-bold text-blue-500">{dailyCount}</div>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                预计学习时长：约 {Math.ceil(dailyCount * 0.5)} 分钟
              </p>
            </div>

            {/* 学习统计 */}
            {selectedBookIds.length > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-bold text-gray-900">当前选择</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">已选择词书</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {selectedBookIds.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">总单词数</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {wordBooks
                        .filter((b) => selectedBookIds.includes(b.id))
                        .reduce((sum, b) => sum + b.wordCount, 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-blue-200 pt-3">
                    <span className="text-gray-700">预计学习天数</span>
                    <span className="text-lg font-semibold text-blue-600">
                      {Math.ceil(
                        wordBooks
                          .filter((b) => selectedBookIds.includes(b.id))
                          .reduce((sum, b) => sum + b.wordCount, 0) / dailyCount,
                      )}{' '}
                      天
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || selectedBookIds.length === 0}
                className="w-full rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isSaving ? '保存中...' : '保存设置'}
              </button>

              <button
                onClick={() => navigate(-1)}
                className="w-full rounded-lg bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-200 hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
