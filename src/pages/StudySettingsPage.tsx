import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/ApiClient';
import { WordBook } from '../types/models';
import { CircleNotch } from '../components/Icon';
import { useToast } from '../components/ui';
import { uiLogger } from '../utils/logger';

export default function StudySettingsPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
    const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
    const [dailyCount, setDailyCount] = useState(20);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 加载词书列表和学习配置
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // 并行加载词书和配置
            const [booksData, configData] = await Promise.all([
                apiClient.getAllAvailableWordBooks(),
                apiClient.getStudyConfig(),
            ]);

            setWordBooks(booksData);
            setSelectedBookIds(configData.selectedWordBookIds || []);
            setDailyCount(configData.dailyWordCount || 20);
        } catch (err) {
            uiLogger.error({ err }, '加载学习设置数据失败');
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleBook = (bookId: string) => {
        setSelectedBookIds((prev) =>
            prev.includes(bookId)
                ? prev.filter((id) => id !== bookId)
                : [...prev, bookId]
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
            setIsSaving(true);
            setError(null);

            await apiClient.updateStudyConfig({
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
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
                <div className="text-center">
                    <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
                    <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 py-8 animate-g3-fade-in">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">学习设置</h1>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                        {error}
                    </div>
                )}

                {/* 左右分栏布局 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 左侧 - 词书选择 */}
                    <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl p-6 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">选择学习词书</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            选中的词书将用于每日学习，支持多选
                        </p>

                        {wordBooks.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                暂无可用词书，请先创建或添加词书
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                                {wordBooks.map((book) => (
                                    <label
                                        key={book.id}
                                        className={`
                          flex items-center p-4
                          border rounded-lg
                          cursor-pointer
                          transition-all duration-200
                          ${selectedBookIds.includes(book.id)
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 hover:bg-gray-50'
                                            }
                        `}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedBookIds.includes(book.id)}
                                            onChange={() => toggleBook(book.id)}
                                            className="w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
                                        />
                                        <div className="ml-3 flex-1">
                                            <div className="flex items-center gap-2">
                                                <div className="font-medium text-gray-900">{book.name}</div>
                                                {book.type === 'SYSTEM' && (
                                                    <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs">
                                                        系统词库
                                                    </span>
                                                )}
                                            </div>
                                            {book.description && (
                                                <div className="text-sm text-gray-600 mt-1">
                                                    {book.description}
                                                </div>
                                            )}
                                            <div className="text-sm text-gray-500 mt-1">
                                                {book.wordCount} 个单词
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 右侧 - 设置选项 */}
                    <div className="space-y-6">
                        {/* 每日学习量 */}
                        <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl p-6 shadow-sm">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">每日学习量</h2>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min="10"
                                    max="100"
                                    step="5"
                                    value={dailyCount}
                                    onChange={(e) => setDailyCount(Number(e.target.value))}
                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="text-2xl font-bold text-blue-500 w-20 text-right">
                                    {dailyCount}
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 mt-2">
                                预计学习时长：约 {Math.ceil(dailyCount * 0.5)} 分钟
                            </p>
                        </div>

                        {/* 学习统计 */}
                        {selectedBookIds.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">当前选择</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-700">已选择词书</span>
                                        <span className="text-2xl font-bold text-blue-600">{selectedBookIds.length}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-700">总单词数</span>
                                        <span className="text-2xl font-bold text-blue-600">
                                            {wordBooks
                                                .filter((b) => selectedBookIds.includes(b.id))
                                                .reduce((sum, b) => sum + b.wordCount, 0)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center pt-3 border-t border-blue-200">
                                        <span className="text-gray-700">预计学习天数</span>
                                        <span className="text-lg font-semibold text-blue-600">
                                            {Math.ceil(wordBooks
                                                .filter((b) => selectedBookIds.includes(b.id))
                                                .reduce((sum, b) => sum + b.wordCount, 0) / dailyCount)} 天
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
                                className="
                                    w-full px-6 py-3
                                    bg-blue-500 text-white
                                    rounded-lg font-medium
                                    hover:bg-blue-600
                                    disabled:bg-gray-300 disabled:cursor-not-allowed
                                    transition-all duration-200
                                    hover:scale-105 active:scale-95
                                    focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                "
                            >
                                {isSaving ? '保存中...' : '保存设置'}
                            </button>

                            <button
                                onClick={() => navigate(-1)}
                                className="
                                    w-full px-6 py-3
                                    bg-gray-100 text-gray-900
                                    rounded-lg font-medium
                                    hover:bg-gray-200
                                    transition-all duration-200
                                    hover:scale-105 active:scale-95
                                    focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                                "
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
