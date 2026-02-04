import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { WordBook } from '../types/models';
import { Books, MagnifyingGlass, X, User, Shuffle, ArrowRight } from '../components/Icon';
import { useToast, Modal, Spinner } from '../components/ui';
import { ConfirmModal } from '../components/ui';
import { uiLogger } from '../utils/logger';
import {
  useSystemWordBooks,
  useUserWordBooks,
  useSearchWords,
  useWordBookUpdates,
} from '../hooks/queries/useWordBooks';
import {
  useCreateWordBook,
  useDeleteWordBook,
  useSyncWordBook,
} from '../hooks/mutations/useWordBookMutations';
import { UpdateBadge, UpdateConfirmModal } from '../components/wordbook-center';
import { ClusterCard } from '../components/semantic';
import { useWordClusters } from '../hooks/queries/useWordClusters';
import { useSemanticStats } from '../hooks/queries/useSemanticStats';
import { semanticClient, type UpdateInfo } from '../services/client';
import { buildSeedWords } from '../utils/learningSeed';

type ViewMode = 'wordbooks' | 'themes';

/**
 * VocabularyPage - 词库管理页面（重构为词书列表）
 */
export default function VocabularyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [viewMode] = useState<ViewMode>('wordbooks');
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

  // 更新弹窗状态
  const [updateModal, setUpdateModal] = useState<{ isOpen: boolean; update: UpdateInfo | null }>({
    isOpen: false,
    update: null,
  });

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
  const syncWordBookMutation = useSyncWordBook();

  // 语义相关数据
  const { stats: semanticStats } = useSemanticStats();
  const shouldFetchClusters =
    viewMode === 'themes' &&
    (semanticStats?.available ?? false) &&
    (semanticStats?.coverage ?? 0) >= 0.5;
  const { clusters, isLoading: isClustersLoading } = useWordClusters(shouldFetchClusters);

  // 获取更新信息
  const { data: updates = [] } = useWordBookUpdates();

  // 构建更新映射表
  const updateMap = useMemo(() => {
    const map = new Map<string, UpdateInfo>();
    updates.filter((u) => u.hasUpdate).forEach((u) => map.set(u.id, u));
    return map;
  }, [updates]);

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

  const handleSyncWordBook = async () => {
    if (!updateModal.update) return;
    try {
      const result = await syncWordBookMutation.mutateAsync(updateModal.update.id);
      toast.success(
        `更新成功：新增/更新 ${result.upsertedCount} 词，移除 ${result.deletedCount} 词`,
      );
      setUpdateModal({ isOpen: false, update: null });
    } catch (err) {
      uiLogger.error({ err, wordbookId: updateModal.update.id }, '同步词书失败');
      toast.error(err instanceof Error ? err.message : '同步失败');
    }
  };

  const handleLearnTheme = async (clusterId: string) => {
    try {
      const detail = await semanticClient.getClusterDetail(clusterId);
      const seedWords = buildSeedWords(detail.words);
      if (seedWords.length === 0) {
        toast.info('该主题暂无可学习的单词');
        return;
      }
      navigate('/', {
        state: {
          seedWords,
          seedSource: 'cluster',
          seedLabel: detail.themeLabel,
        },
      });
    } catch (err) {
      uiLogger.error({ err, clusterId }, '加载主题单词失败');
      toast.error(err instanceof Error ? err.message : '加载主题单词失败');
    }
  };

  const renderWordBookCard = (book: WordBook, isUserBook: boolean) => {
    const update = updateMap.get(book.id);
    return (
      <div
        key={book.id}
        className="flex h-full animate-g3-fade-in cursor-pointer flex-col rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-[1.02] hover:shadow-elevated dark:border-slate-700/60 dark:bg-slate-800/80"
      >
        {/* 词书信息 */}
        <div onClick={() => navigate(`/wordbooks/${book.id}`)} className="flex flex-1 flex-col">
          <div className="mb-2 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{book.name}</h3>
              {update && (
                <UpdateBadge
                  currentVersion={update.currentVersion}
                  newVersion={update.newVersion}
                />
              )}
            </div>
            {!isUserBook && (
              <span className="flex-shrink-0 rounded bg-blue-100 px-2 py-1 text-sm text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                系统词库
              </span>
            )}
          </div>

          <p className="mb-3 line-clamp-2 min-h-[2.5rem] text-base text-gray-600 dark:text-gray-400">
            {book.description || '\u00A0'}
          </p>

          {book.sourceAuthor?.trim() && (
            <p className="mb-2 flex items-center truncate text-sm text-gray-500 dark:text-gray-400">
              <User aria-hidden="true" className="mr-1 h-3 w-3 flex-shrink-0" />
              <span className="truncate">{book.sourceAuthor.trim()}</span>
            </p>
          )}

          <div className="mb-3 mt-auto flex items-center gap-2 text-base text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Books size={16} />
              {book.wordCount} 个单词{book.sourceVersion && ` · v${book.sourceVersion}`}
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/wordbooks/${book.id}`)}
            className="flex-1 rounded-button bg-blue-500 px-4 py-2 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            查看详情
          </button>

          {update && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUpdateModal({ isOpen: true, update });
              }}
              className="rounded-button bg-green-50 px-4 py-2 text-green-600 transition-all duration-g3-fast hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
            >
              更新
            </button>
          )}

          {isUserBook && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openDeleteConfirm(book.id, book.name);
              }}
              className="rounded-button bg-red-50 px-4 py-2 text-red-600 transition-all duration-g3-fast hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              删除
            </button>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-gray-400">正在加载...</p>
        </div>
      </div>
    );
  }

  const displayBooks = activeTab === 'system' ? systemBooks : userBooks;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">词库管理</h1>
          {activeTab === 'user' && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              + 新建词书
            </button>
          )}
        </div>

        {/* 搜索框 */}
        <div className="relative mb-4">
          <div className="relative">
            <MagnifyingGlass
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索单词..."
              className="w-full rounded-card border border-gray-300 bg-white py-3 pl-12 pr-12 text-gray-900 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* 搜索结果下拉 */}
          {showSearchResults && (
            <div className="absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-card border border-gray-200 bg-white shadow-elevated dark:border-slate-700 dark:bg-slate-800">
              {isSearching || isSearchingFetching ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  <Spinner className="mx-auto mb-2" size="sm" color="secondary" />
                  搜索中...
                </div>
              ) : searchResults.length === 0 && searchQuery.trim() ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  未找到匹配的单词
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {searchResults.map((word) => (
                    <div
                      key={word.id}
                      onClick={() => {
                        if (word.wordBook) {
                          navigate(`/wordbooks/${word.wordBook.id}`);
                          clearSearch();
                        } else {
                          toast.info('该单词未关联词书');
                        }
                      }}
                      className="cursor-pointer p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {word.spelling}
                          </div>
                          {word.phonetic && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {word.phonetic}
                            </div>
                          )}
                          <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            {word.meanings.slice(0, 2).join('；')}
                          </div>
                        </div>
                        {word.wordBook && (
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              word.wordBook.type === 'SYSTEM'
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
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
          <div className="mb-4 rounded-button border border-red-200 bg-red-50 p-4 text-base text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
            {error instanceof Error ? error.message : '加载失败'}
          </div>
        )}

        {/* 易混淆词入口卡片 */}
        {semanticStats?.available && (
          <div
            onClick={() => navigate('/confusion-words')}
            className="mb-4 flex cursor-pointer items-center gap-4 rounded-card border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 transition-all duration-g3-fast hover:scale-[1.01] hover:shadow-soft dark:border-purple-800/50 dark:from-purple-900/20 dark:to-indigo-900/20"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40">
              <Shuffle size={24} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">易混淆词检测</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                发现语义相近的词对，针对性练习避免混淆
              </p>
            </div>
            <ArrowRight size={20} className="text-gray-400" />
          </div>
        )}

        {/* 视图模式切换 - 暂时隐藏主题视图功能 */}
        {/* <div className="mb-4 flex gap-2 rounded-card border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('wordbooks')}
            className={`flex-1 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
              viewMode === 'wordbooks'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700'
            }`}
          >
            <Books size={16} className="inline mr-1" />
            词书视图
          </button>
          <button
            type="button"
            onClick={() => setViewMode('themes')}
            disabled={!semanticStats?.available}
            className={`flex-1 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
              viewMode === 'themes'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-slate-700'
            }`}
          >
            <Target size={16} className="inline mr-1" />
            主题视图
          </button>
        </div> */}

        {/* 标签切换 - 仅在词书视图显示 */}
        {viewMode === 'wordbooks' && (
          <div className="mb-4 flex gap-4 border-b border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2 font-medium transition-all ${
                activeTab === 'system'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              系统词库 ({systemBooks.length})
            </button>
            <button
              onClick={() => setActiveTab('user')}
              className={`px-4 py-2 font-medium transition-all ${
                activeTab === 'user'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              我的词库 ({userBooks.length})
            </button>
          </div>
        )}

        {/* 内容区域 */}
        {viewMode === 'themes' ? (
          // 主题视图
          semanticStats?.coverage !== undefined && semanticStats.coverage < 0.5 ? (
            <div className="py-16 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                向量数据不足（当前覆盖率 {(semanticStats.coverage * 100).toFixed(0)}
                %），无法使用主题视图
              </p>
            </div>
          ) : isClustersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="xl" color="primary" />
            </div>
          ) : clusters.length === 0 ? (
            <div className="py-16 text-center text-gray-500 dark:text-gray-400">暂无主题数据</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {clusters.map((cluster) => (
                <ClusterCard key={cluster.id} cluster={cluster} onLearnTheme={handleLearnTheme} />
              ))}
            </div>
          )
        ) : displayBooks.length === 0 ? (
          <div className="py-16 text-center">
            <Books size={80} color="#9ca3af" className="mx-auto mb-4" />
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              {activeTab === 'system' ? '暂无系统词库' : '还没有创建任何词书'}
            </p>
            {activeTab === 'user' && (
              <button
                onClick={() => setShowCreateDialog(true)}
                className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 hover:shadow-floating focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
              >
                创建第一个词书
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              词书名称 *
            </label>
            <input
              type="text"
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              className="w-full rounded-button border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="例如：考研核心词汇"
            />
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              描述（可选）
            </label>
            <textarea
              value={newBookDesc}
              onChange={(e) => setNewBookDesc(e.target.value)}
              className="w-full rounded-button border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              rows={3}
              placeholder="简单描述这个词书的用途..."
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCreateBook}
              className="flex-1 rounded-card bg-blue-500 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 hover:shadow-floating focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
            >
              创建
            </button>
            <button
              onClick={() => {
                setShowCreateDialog(false);
                setNewBookName('');
                setNewBookDesc('');
              }}
              className="flex-1 rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
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

        {/* 更新确认弹窗 */}
        <UpdateConfirmModal
          isOpen={updateModal.isOpen}
          onClose={() => setUpdateModal({ isOpen: false, update: null })}
          onConfirm={handleSyncWordBook}
          update={updateModal.update}
          isLoading={syncWordBookMutation.isPending}
        />
      </div>
    </div>
  );
}
