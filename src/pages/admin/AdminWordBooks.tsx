import { useState, useEffect } from 'react';
import apiClient from '../../services/ApiClient';
import { Books } from '../../components/Icon';

export default function AdminWordBooks() {
    const [wordBooks, setWordBooks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newBook, setNewBook] = useState({
        name: '',
        description: '',
    });

    useEffect(() => {
        loadWordBooks();
    }, []);

    const loadWordBooks = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await apiClient.getSystemWordBooks();
            setWordBooks(data);
        } catch (err) {
            console.error('加载系统词库失败:', err);
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateBook = async () => {
        if (!newBook.name.trim()) {
            alert('请输入词库名称');
            return;
        }

        try {
            await apiClient.adminCreateSystemWordBook(newBook);
            setShowCreateDialog(false);
            setNewBook({ name: '', description: '' });
            loadWordBooks();
        } catch (err) {
            console.error('创建系统词库失败:', err);
            alert(err instanceof Error ? err.message : '创建失败');
        }
    };

    const handleDeleteBook = async (id: string, name: string) => {
        if (!confirm(`确定要删除系统词库"${name}"吗？这将删除所有相关单词。`)) {
            return;
        }

        try {
            await apiClient.adminDeleteSystemWordBook(id);
            loadWordBooks();
        } catch (err) {
            console.error('删除系统词库失败:', err);
            alert(err instanceof Error ? err.message : '删除失败');
        }
    };

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-gray-900">系统词库管理</h1>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200"
                >
                    + 创建系统词库
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : wordBooks.length === 0 ? (
                <div className="text-center py-16">
                    <Books size={80} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">还没有创建系统词库</p>
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
                    >
                        创建第一个系统词库
                    </button>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {wordBooks.map((book) => (
                        <div
                            key={book.id}
                            className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <h3 className="text-xl font-bold text-gray-900">{book.name}</h3>
                                <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs">
                                    系统
                                </span>
                            </div>

                            {book.description && (
                                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                                    {book.description}
                                </p>
                            )}

                            <div className="text-gray-500 text-sm mb-4 flex items-center gap-1">
                                <Books size={16} weight="bold" />
                                {book.wordCount} 个单词
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => (window.location.href = `/wordbooks/${book.id}`)}
                                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all"
                                >
                                    查看详情
                                </button>
                                <button
                                    onClick={() => handleDeleteBook(book.id, book.name)}
                                    className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all"
                                >
                                    删除
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 创建对话框 */}
            {showCreateDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            创建系统词库
                        </h2>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                词库名称 *
                            </label>
                            <input
                                type="text"
                                value={newBook.name}
                                onChange={(e) => setNewBook({ ...newBook, name: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="例如：TOEFL 核心词汇"
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                描述
                            </label>
                            <textarea
                                value={newBook.description}
                                onChange={(e) =>
                                    setNewBook({ ...newBook, description: e.target.value })
                                }
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                rows={3}
                                placeholder="简单描述这个词库..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCreateBook}
                                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
                            >
                                创建
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateDialog(false);
                                    setNewBook({ name: '', description: '' });
                                }}
                                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
