import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/ApiClient';
import { WordBook } from '../types/models';

/**
 * VocabularyPage - 词库管理页面（重构为词书列表）
 */
export default function VocabularyPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [systemBooks, setSystemBooks] = useState<WordBook[]>([]);
  const [userBooks, setUserBooks] = useState<WordBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookDesc, setNewBookDesc] = useState('');

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
      console.error('加载词书失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBook = async () => {
    if (!newBookName.trim()) {
      alert('请输入词书名称');
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
      loadWordBooks();
    } catch (err) {
      console.error('创建词书失败:', err);
      alert(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteBook = async (id: string, name: string) => {
    if (!confirm(`确定要删除词书"${name}"吗？这将删除词书中的所有单词。`)) {
      return;
    }

    try {
      await apiClient.deleteWordBook(id);
      loadWordBooks();
    } catch (err) {
      console.error('删除词书失败:', err);
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const renderWordBookCard = (book: WordBook, isUserBook: boolean) => (
    <div
      key={book.id}
      className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer animate-fade-in"
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
          <span>📚 {book.wordCount} 个单词</span>
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
              handleDeleteBook(book.id, book.name);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">加载中...</div>
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
          <div className="text-gray-400 text-5xl mb-4">📚</div>
          <p className="text-gray-500 mb-4">
            {activeTab === 'system' ? '暂无系统词库' : '还没有创建任何词书'}
          </p>
          {activeTab === 'user' && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 animate-fade-in">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
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
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200"
              >
                创建
              </button>
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewBookName('');
                  setNewBookDesc('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200"
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
