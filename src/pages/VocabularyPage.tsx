import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/ApiClient';
import { WordBook } from '../types/models';
import { Books, CircleNotch } from '../components/Icon';
import { useToast } from '../components/ui';
import { ConfirmModal } from '../components/ui';
import { uiLogger } from '../utils/logger';

/**
 * VocabularyPage - 词库管理页面（重构为词书列表）
 */
export default function VocabularyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [systemBooks, setSystemBooks] = useState<WordBook[]>([]);
  const [userBooks, setUserBooks] = useState<WordBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookDesc, setNewBookDesc] = useState('');

  // 删除确认弹窗状态
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

      const [system, user] = await Promise.all([
        apiClient.getSystemWordBooks(),
        apiClient.getUserWordBooks(),
      ]);

      setSystemBooks(system);
      setUserBooks(user);
    } catch (err) {
      uiLogger.error({ err }, '加载词书列表失败');
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBook = async () => {
    if (!newBookName.trim()) {
      toast.warning('请输入词书名称');
      return;
    }

    try {
      await apiClient.createWordBook({
        name: newBookName,
        description: newBookDesc,
      });

      setShowCreateDialog(false);
      setNewBookName('');
      setNewBookDesc('');
      toast.success('词书创建成功');
      loadWordBooks();
    } catch (err) {
      uiLogger.error({ err, name: newBookName }, '创建词书失败');
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const openDeleteConfirm = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const handleDeleteBook = async () => {
    setIsDeleting(true);
    try {
      await apiClient.deleteWordBook(deleteConfirm.id);
      toast.success('词书已删除');
      loadWordBooks();
    } catch (err) {
      uiLogger.error({ err, wordBookId: deleteConfirm.id }, '删除词书失败');
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsDeleting(false);
      setDeleteConfirm({ isOpen: false, id: '', name: '' });
    }
  };

  const renderWordBookCard = (book: WordBook, isUserBook: boolean) => (
    <div
      key={book.id}
      className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer animate-g3-fade-in"
    >
      {/* 词书信息 */}
      <div onClick={() => navigate(`/wordbooks/${book.id}`)}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-xl font-bold text-gray-900">{book.name}</h3>
          {!isUserBook && (
            <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs">
              系统词库
            </span>
          )}
        </div>

        {book.description && (
          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {book.description}
          </p>
        )}

        <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
          <span className="flex items-center gap-1">
            <Books size={16} weight="bold" />
            {book.wordCount} 个单词
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/wordbooks/${book.id}`)}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          查看详情
        </button>

        {isUserBook && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDeleteConfirm(book.id, book.name);
            }}
            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all duration-200"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    );
  }

  const displayBooks = activeTab === 'system' ? systemBooks : userBooks;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">词库管理</h1>
        {activeTab === 'user' && (
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            + 新建词书
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* 标签切换 */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'system'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900'
            }`}
        >
          系统词库 ({systemBooks.length})
        </button>
        <button
          onClick={() => setActiveTab('user')}
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'user'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900'
            }`}
        >
          我的词库 ({userBooks.length})
        </button>
      </div>

      {/* 词书列表 */}
      {displayBooks.length === 0 ? (
        <div className="text-center py-16">
          <Books size={80} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
          <p className="text-gray-500 mb-4">
            {activeTab === 'system' ? '暂无系统词库' : '还没有创建任何词书'}
          </p>
          {activeTab === 'user' && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
            >
              创建第一个词书
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {displayBooks.map((book) =>
            renderWordBookCard(book, activeTab === 'user')
          )}
        </div>
      )}

      {/* 创建词书对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="create-book-title">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl animate-g3-slide-up">
            <h2 id="create-book-title" className="text-2xl font-bold text-gray-900 mb-6">
              创建新词书
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                词书名称 *
              </label>
              <input
                type="text"
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例如：考研核心词汇"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                描述（可选）
              </label>
              <textarea
                value={newBookDesc}
                onChange={(e) => setNewBookDesc(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="简单描述这个词书的用途..."
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
                  setNewBookName('');
                  setNewBookDesc('');
                }}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })}
        onConfirm={handleDeleteBook}
        title="删除词书"
        message={`确定要删除词书"${deleteConfirm.name}"吗？这将删除词书中的所有单词。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
