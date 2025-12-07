import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Word, WordBook } from '../types/models';
import { Books, CircleNotch, MagnifyingGlass, X } from '../components/Icon';
import { useToast, Modal } from '../components/ui';
import { ConfirmModal } from '../components/ui';
import { uiLogger } from '../utils/logger';
import {
  useSystemWordBooks,
  useUserWordBooks,
  useSearchWords,
} from '../hooks/queries/useWordBooks';
import {
  useCreateWordBook,
  useDeleteWordBook,
} from '../hooks/mutations/useWordBookMutations';

// 搜索结果类型
type SearchResult = Word & { wordBook?: { id: string; name: string; type: string } };

/**
 * VocabularyPage - 词库管理页面（重构为词书列表）
 */
export default function VocabularyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookDesc, setNewBookDesc] = useState('');

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string }>(
    {
      isOpen: false,
      id: '',
      name: '',
    },
  );

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // 使用 React Query hooks
  const {
    data: systemBooks = [],
    isLoading: isLoadingSystem,
    error: systemError,
  } = useSystemWordBooks();
  const { data: userBooks = [], isLoading: isLoadingUser, error: userError } = useUserWordBooks();
  const {
    data: searchResults = [],
    isLoading: isSearching,
    isFetching: isSearchingFetching,
  } = useSearchWords(searchQuery, 20);

  const createWordBookMutation = useCreateWordBook();
  const deleteWordBookMutation = useDeleteWordBook();

  const isLoading = isLoadingSystem || isLoadingUser;
  const error = systemError || userError;

  // 防抖处理搜索显示
  useEffect(() => {
    if (searchQuery.trim()) {
      setShowSearchResults(true);
    } else {
      setShowSearchResults(false);
    }
  }, [searchQuery]);

  const clearSearch = () => {
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleCreateBook = async () => {
    if (!newBookName.trim()) {
      toast.warning('请输入词书名称');
      return;
    }

    try {
      await createWordBookMutation.mutateAsync({
        name: newBookName,
        description: newBookDesc,
      });

      setShowCreateDialog(false);
      setNewBookName('');
      setNewBookDesc('');
      toast.success('词书创建成功');
    } catch (err) {
      uiLogger.error({ err, name: newBookName }, '创建词书失败');
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const openDeleteConfirm = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const handleDeleteBook = async () => {
    try {
      await deleteWordBookMutation.mutateAsync(deleteConfirm.id);
      toast.success('词书已删除');
      setDeleteConfirm({ isOpen: false, id: '', name: '' });
    } catch (err) {
      uiLogger.error({ err, wordBookId: deleteConfirm.id }, '删除词书失败');
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const renderWordBookCard = (book: WordBook, isUserBook: boolean) => (
    <div
      key={book.id}
      className="animate-g3-fade-in cursor-pointer rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
    >
      {/* 词书信息 */}
      <div onClick={() => navigate(`/wordbooks/${book.id}`)}>
        <div className="mb-3 flex items-start justify-between">
          <h3 className="text-xl font-bold text-gray-900">{book.name}</h3>
          {!isUserBook && (
            <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-600">系统词库</span>
          )}
        </div>

        {book.description && (
          <p className="mb-4 line-clamp-2 text-sm text-gray-600">{book.description}</p>
        )}

        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
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
          className="flex-1 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
        >
          查看详情
        </button>

        {isUserBook && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDeleteConfirm(book.id, book.name);
            }}
            className="rounded-lg bg-red-50 px-4 py-2 text-red-600 transition-all duration-200 hover:bg-red-100"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );

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
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    );
  }

  const displayBooks = activeTab === 'system' ? systemBooks : userBooks;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">词库管理</h1>
        {activeTab === 'user' && (
          <button
            onClick={() => setShowCreateDialog(true)}
            className="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            + 新建词书
          </button>
        )}
      </div>

      {/* 搜索框 */}
      <div className="relative mb-6">
        <div className="relative">
          <MagnifyingGlass
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索单词..."
            className="w-full rounded-xl border border-gray-300 py-3 pl-12 pr-12 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* 搜索结果下拉 */}
        {showSearchResults && (
          <div className="absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            {isSearching || isSearchingFetching ? (
              <div className="p-4 text-center text-gray-500">
                <CircleNotch className="mx-auto mb-2 animate-spin" size={24} />
                搜索中...
              </div>
            ) : searchResults.length === 0 && searchQuery.trim() ? (
              <div className="p-4 text-center text-gray-500">未找到匹配的单词</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {searchResults.map((word) => (
                  <div
                    key={word.id}
                    onClick={() => {
                      if (word.wordBook) {
                        navigate(`/wordbooks/${word.wordBook.id}`);
                        clearSearch();
                      }
                    }}
                    className="cursor-pointer p-4 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{word.spelling}</div>
                        {word.phonetic && (
                          <div className="text-sm text-gray-500">{word.phonetic}</div>
                        )}
                        <div className="mt-1 text-sm text-gray-600">
                          {word.meanings.slice(0, 2).join('；')}
                        </div>
                      </div>
                      {word.wordBook && (
                        <span
                          className={`rounded px-2 py-1 text-xs ${
                            word.wordBook.type === 'SYSTEM'
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-green-100 text-green-600'
                          }`}
                        >
                          {word.wordBook.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          {error instanceof Error ? error.message : '加载失败'}
        </div>
      )}

      {/* 标签切换 */}
      <div className="mb-6 flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 font-medium transition-all ${
            activeTab === 'system'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          系统词库 ({systemBooks.length})
        </button>
        <button
          onClick={() => setActiveTab('user')}
          className={`px-4 py-2 font-medium transition-all ${
            activeTab === 'user'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          我的词库 ({userBooks.length})
        </button>
      </div>

      {/* 词书列表 */}
      {displayBooks.length === 0 ? (
        <div className="py-16 text-center">
          <Books size={80} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
          <p className="mb-4 text-gray-500">
            {activeTab === 'system' ? '暂无系统词库' : '还没有创建任何词书'}
          </p>
          {activeTab === 'user' && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-600 hover:shadow-xl focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
            >
              创建第一个词书
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {displayBooks.map((book) => renderWordBookCard(book, activeTab === 'user'))}
        </div>
      )}

      {/* 创建词书对话框 */}
      <Modal
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setNewBookName('');
          setNewBookDesc('');
        }}
        title="创建新词书"
      >
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">词书名称 *</label>
          <input
            type="text"
            value={newBookName}
            onChange={(e) => setNewBookName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            placeholder="例如：考研核心词汇"
          />
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700">描述（可选）</label>
          <textarea
            value={newBookDesc}
            onChange={(e) => setNewBookDesc(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="简单描述这个词书的用途..."
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCreateBook}
            className="flex-1 rounded-xl bg-blue-500 px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-600 hover:shadow-xl focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          >
            创建
          </button>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              setNewBookName('');
              setNewBookDesc('');
            }}
            className="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-200 hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95"
          >
            取消
          </button>
        </div>
      </Modal>

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
        isLoading={deleteWordBookMutation.isPending}
      />
    </div>
  );
}
