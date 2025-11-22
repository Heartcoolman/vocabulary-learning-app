import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/ApiClient';
import { WordBook } from '../types/models';

export default function StudySettingsPage() {
    const navigate = useNavigate();
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
            console.error('加载数据失败:', err);
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
            alert('学习设置已保存！');
            navigate('/');
        } catch (err) {
            console.error('保存失败:', err);
            setError(err instanceof Error ? err.message : '保存失败');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-gray-500">加载中...</div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">学习设置</h1>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                    {error}
                </div>
            )}

            {/* 词书选择 */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-4">选择学习词书</h2>
                <p className="text-sm text-gray-600 mb-4">
                    选中的词书将用于每日学习，支持多选
                </p>

                {wordBooks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        暂无可用词书，请先创建或添加词书
                    </div>
                ) : (
                    <div className="space-y-3">
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

            {/* 每日学习量 */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
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
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                    <div className="text-sm text-gray-700">
                        <div className="flex justify-between mb-2">
                            <span>已选择词书：</span>
                            <span className="font-medium">{selectedBookIds.length} 个</span>
                        </div>
                        <div className="flex justify-between">
                            <span>总单词数：</span>
                            <span className="font-medium">
                                {wordBooks
                                    .filter((b) => selectedBookIds.includes(b.id))
                                    .reduce((sum, b) => sum + b.wordCount, 0)}{' '}
                                个
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-4">
                <button
                    onClick={handleSave}
                    disabled={isSaving || selectedBookIds.length === 0}
                    className="
            flex-1 px-6 py-3
            bg-blue-500 text-white
            rounded-lg font-medium
            hover:bg-blue-600
            disabled:bg-gray-300 disabled:cursor-not-allowed
            transition-all duration-200
            hover:scale-105 active:scale-95
          "
                >
                    {isSaving ? '保存中...' : '保存设置'}
                </button>

                <button
                    onClick={() => navigate(-1)}
                    className="
            px-6 py-3
            bg-gray-100 text-gray-900
            rounded-lg font-medium
            hover:bg-gray-200
            transition-all duration-200
          "
                >
                    取消
                </button>
            </div>
        </div>
    );
}
