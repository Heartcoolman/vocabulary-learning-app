import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadSimple, NotePencil } from '../../components/Icon';
import apiClient from '../../services/ApiClient';
import { Books, CircleNotch } from '../../components/Icon';
import { BatchImportModal } from '../../components';
import { WordBook } from '../../types/models';
import { useToast, ConfirmModal, Modal } from '../../components/ui';
import { adminLogger } from '../../utils/logger';

export default function AdminWordBooks() {
    const navigate = useNavigate();
    const toast = useToast();
    const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editingBook, setEditingBook] = useState<WordBook | null>(null);
    const [newBook, setNewBook] = useState({
        name: '',
        description: '',
    });
    const [editBook, setEditBook] = useState({
        name: '',
        description: '',
    });
    const [importModal, setImportModal] = useState<{ isOpen: boolean; wordBookId: string; wordBookName: string }>({
        isOpen: false,
        wordBookId: '',
        wordBookName: '',
    });
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string }>({
        isOpen: false,
        id: '',
        name: '',
    });
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        loadWordBooks();
    }, []);

    const loadWordBooks = async () => {
        try {
            setIsLoading(true);
            setError(null);
            // 使用管理员接口获取所有系统词库（包括非公开的）
            const data = await apiClient.adminGetSystemWordBooks();
            setWordBooks(data);
        } catch (err) {
            adminLogger.error({ err }, '加载系统词库失败');
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateBook = async () => {
        if (!newBook.name.trim()) {
            toast.warning('请输入词库名称');
            return;
        }

        try {
            await apiClient.adminCreateSystemWordBook(newBook);
            setShowCreateDialog(false);
            setNewBook({ name: '', description: '' });
            toast.success('词库创建成功');
            loadWordBooks();
        } catch (err) {
            adminLogger.error({ err, wordBook: newBook }, '创建系统词库失败');
            toast.error(err instanceof Error ? err.message : '创建失败');
        }
    };

    const handleEditClick = (book: WordBook) => {
        setEditingBook(book);
        setEditBook({
            name: book.name,
            description: book.description || '',
        });
        setShowEditDialog(true);
    };

    const handleUpdateBook = async () => {
        if (!editingBook || !editBook.name.trim()) {
            toast.warning('请输入词库名称');
            return;
        }

        try {
            // 使用管理员专用的更新接口
            await apiClient.adminUpdateSystemWordBook(editingBook.id, editBook);
            setShowEditDialog(false);
            setEditingBook(null);
            setEditBook({ name: '', description: '' });
            toast.success('词库更新成功');
            loadWordBooks();
        } catch (err) {
            adminLogger.error({ err, wordBookId: editingBook.id, updates: editBook }, '更新系统词库失败');
            toast.error(err instanceof Error ? err.message : '更新失败');
        }
    };

    const openDeleteConfirm = (id: string, name: string) => {
        setDeleteConfirm({ isOpen: true, id, name });
    };

    const handleDeleteBook = async () => {
        setIsDeleting(true);
        try {
            await apiClient.adminDeleteSystemWordBook(deleteConfirm.id);
            toast.success('词库已删除');
            loadWordBooks();
        } catch (err) {
            adminLogger.error({ err, wordBookId: deleteConfirm.id }, '删除系统词库失败');
            toast.error(err instanceof Error ? err.message : '删除失败');
        } finally {
            setIsDeleting(false);
            setDeleteConfirm({ isOpen: false, id: '', name: '' });
        }
    };

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-gray-900">系统词库管理</h1>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
                <div className="text-center py-12">
                    <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
                    <p className="text-gray-600">正在加载...</p>
                </div>
            ) : wordBooks.length === 0 ? (
                <div className="text-center py-16">
                    <Books size={80} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">还没有创建系统词库</p>
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
                    >
                        创建第一个系统词库
                    </button>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {wordBooks.map((book) => (
                        <div
                            key={book.id}
                            className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
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

                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => navigate(`/wordbooks/${book.id}`)}
                                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
                                >
                                    查看详情
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEditClick(book)}
                                        className="flex-1 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-1"
                                        title="编辑词库"
                                    >
                                        <NotePencil size={16} weight="bold" />
                                        编辑
                                    </button>
                                    <button
                                        onClick={() => setImportModal({ isOpen: true, wordBookId: book.id, wordBookName: book.name })}
                                        className="flex-1 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-1"
                                        title="批量导入单词"
                                    >
                                        <UploadSimple size={16} weight="bold" />
                                        导入
                                    </button>
                                    <button
                                        onClick={() => openDeleteConfirm(book.id, book.name)}
                                        className="flex-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all duration-200 hover:scale-105 active:scale-95"
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 创建对话框 */}
            <Modal
                isOpen={showCreateDialog}
                onClose={() => {
                    setShowCreateDialog(false);
                    setNewBook({ name: '', description: '' });
                }}
                title="创建系统词库"
            >
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        词库名称 *
                    </label>
                    <input
                        type="text"
                        value={newBook.name}
                        onChange={(e) => setNewBook({ ...newBook, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        rows={3}
                        placeholder="简单描述这个词库..."
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleCreateBook}
                        className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
                    >
                        创建
                    </button>
                    <button
                        onClick={() => {
                            setShowCreateDialog(false);
                            setNewBook({ name: '', description: '' });
                        }}
                        className="flex-1 px-6 py-3 bg-gray-100 text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                        取消
                    </button>
                </div>
            </Modal>

            {/* 编辑对话框 */}
            <Modal
                isOpen={showEditDialog && editingBook !== null}
                onClose={() => {
                    setShowEditDialog(false);
                    setEditingBook(null);
                    setEditBook({ name: '', description: '' });
                }}
                title="编辑词库信息"
            >
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        词库名称 *
                    </label>
                    <input
                        type="text"
                        value={editBook.name}
                        onChange={(e) => setEditBook({ ...editBook, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="例如：TOEFL 核心词汇"
                    />
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        描述
                    </label>
                    <textarea
                        value={editBook.description}
                        onChange={(e) =>
                            setEditBook({ ...editBook, description: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        rows={3}
                        placeholder="简单描述这个词库..."
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleUpdateBook}
                        className="flex-1 px-6 py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
                    >
                        保存
                    </button>
                    <button
                        onClick={() => {
                            setShowEditDialog(false);
                            setEditingBook(null);
                            setEditBook({ name: '', description: '' });
                        }}
                        className="flex-1 px-6 py-3 bg-gray-100 text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                        取消
                    </button>
                </div>
            </Modal>

            <BatchImportModal
                isOpen={importModal.isOpen}
                onClose={() => setImportModal({ isOpen: false, wordBookId: '', wordBookName: '' })}
                wordBookId={importModal.wordBookId}
                onImportSuccess={() => {
                    loadWordBooks();
                }}
                isAdminMode={true}
            />

            {/* 删除确认弹窗 */}
            <ConfirmModal
                isOpen={deleteConfirm.isOpen}
                onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })}
                onConfirm={handleDeleteBook}
                title="删除系统词库"
                message={`确定要删除系统词库"${deleteConfirm.name}"吗？这将删除所有相关单词。`}
                confirmText="删除"
                cancelText="取消"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
}
