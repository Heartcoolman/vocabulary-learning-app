import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/ApiClient';
import AudioService from '../services/AudioService';
import { Word, WordBook } from '../types/models';
import {
  Books,
  File,
  BookOpen,
  Plus,
  ArrowLeft,
  ArrowRight,
  Trash,
  ListNumbers,
  SpeakerHigh,
  CircleNotch,
  Warning,
} from '../components/Icon';
import { useToast, ConfirmModal } from '../components/ui';
import { uiLogger } from '../utils/logger';

export default function WordBookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [wordBook, setWordBook] = useState<WordBook | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddWord, setShowAddWord] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [showWordDetail, setShowWordDetail] = useState(false);
  const [isPronouncing, setIsPronouncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    wordId: string;
    spelling: string;
  }>({
    isOpen: false,
    wordId: '',
    spelling: '',
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const wordsPerPage = 20;

  // 新单词表单
  const [newWord, setNewWord] = useState({
    spelling: '',
    phonetic: '',
    meanings: [''],
    examples: [''],
  });

  useEffect(() => {
    if (id) {
      loadWordBookDetail();
    }
  }, [id]);

  const loadWordBookDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [bookData, wordsData] = await Promise.all([
        apiClient.getWordBookById(id!),
        apiClient.getWordBookWords(id!),
      ]);

      setWordBook(bookData);
      setWords(wordsData);
      setCurrentPage(1); // 重置到第一页
    } catch (err) {
      uiLogger.error({ err, wordBookId: id }, '加载词书详情失败');
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddWord = async () => {
    if (!newWord.spelling || !newWord.phonetic) {
      toast.warning('请填写单词拼写和音标');
      return;
    }

    try {
      await apiClient.addWordToWordBook(id!, newWord);
      setShowAddWord(false);
      setNewWord({
        spelling: '',
        phonetic: '',
        meanings: [''],
        examples: [''],
      });
      toast.success('单词添加成功');
      loadWordBookDetail();
    } catch (err) {
      uiLogger.error({ err, word: newWord, wordBookId: id }, '添加单词失败');
      toast.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const openDeleteConfirm = (wordId: string, spelling: string) => {
    setDeleteConfirm({ isOpen: true, wordId, spelling });
  };

  const handleDeleteWord = async () => {
    setIsDeleting(true);
    try {
      await apiClient.removeWordFromWordBook(id!, deleteConfirm.wordId);
      setCurrentPage(1);
      toast.success('单词已删除');
      loadWordBookDetail();
    } catch (err) {
      uiLogger.error({ err, wordId: deleteConfirm.wordId, wordBookId: id }, '删除单词失败');
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsDeleting(false);
      setDeleteConfirm({ isOpen: false, wordId: '', spelling: '' });
    }
  };

  // 计算分页数据
  const paginatedWords = useMemo(() => {
    const startIndex = (currentPage - 1) * wordsPerPage;
    const endIndex = startIndex + wordsPerPage;
    return words.slice(startIndex, endIndex);
  }, [words, currentPage]);

  const totalPages = Math.ceil(words.length / wordsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleWordClick = (word: Word) => {
    setSelectedWord(word);
    setShowWordDetail(true);
  };

  const handlePronounceDetail = async (word: string) => {
    if (isPronouncing) return;

    try {
      setIsPronouncing(true);
      await AudioService.playPronunciation(word);
    } catch (err) {
      uiLogger.error({ err, word }, '播放发音失败');
    } finally {
      setIsPronouncing(false);
    }
  };

  const updateMeaning = (index: number, value: string) => {
    const updated = [...newWord.meanings];
    updated[index] = value;
    setNewWord({ ...newWord, meanings: updated });
  };

  const addMeaning = () => {
    setNewWord({ ...newWord, meanings: [...newWord.meanings, ''] });
  };

  const updateExample = (index: number, value: string) => {
    const updated = [...newWord.examples];
    updated[index] = value;
    setNewWord({ ...newWord, examples: updated });
  };

  const addExample = () => {
    setNewWord({ ...newWord, examples: [...newWord.examples, ''] });
  };

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

  if (error || !wordBook) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center" role="alert" aria-live="assertive">
          <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">出错了</h2>
          <p className="mb-6 text-gray-600">{error || '词书不存在'}</p>
          <button
            onClick={() => navigate('/vocabulary')}
            className="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          >
            返回词库列表
          </button>
        </div>
      </div>
    );
  }

  const isUserBook = wordBook.type === 'USER';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-8">
        {/* 头部 */}
        <header className="mb-8">
          <nav className="mb-6">
            <button
              onClick={() => navigate('/vocabulary')}
              className="inline-flex items-center rounded-lg px-3 py-2 font-medium text-blue-500 transition-all duration-200 hover:scale-105 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="返回词库列表"
            >
              <ArrowLeft size={16} weight="bold" className="mr-2" />
              返回词库列表
            </button>
          </nav>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{wordBook.name}</h1>
                {!isUserBook && (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-600">
                    系统词库
                  </span>
                )}
              </div>
              {wordBook.description && (
                <p className="mb-2 text-lg text-gray-600">{wordBook.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Books size={18} weight="duotone" color="#6b7280" />共 {wordBook.wordCount} 个单词
                </span>
                {totalPages > 1 && (
                  <span className="flex items-center gap-1">
                    <File size={18} weight="duotone" color="#6b7280" />第 {currentPage} /{' '}
                    {totalPages} 页
                  </span>
                )}
              </div>
            </div>

            {isUserBook && (
              <button
                onClick={() => setShowAddWord(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-blue-600 hover:shadow-md focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="添加新单词"
              >
                <Plus size={18} weight="bold" />
                添加单词
              </button>
            )}
          </div>
        </header>

        {/* 单词网格 */}
        <main>
          {words.length === 0 ? (
            <div className="animate-g3-slide-up py-16 text-center">
              <BookOpen
                className="mx-auto mb-6 animate-pulse"
                size={96}
                weight="thin"
                color="#9ca3af"
              />
              <h2 className="mb-3 text-2xl font-bold text-gray-900">这个词书还没有单词</h2>
              <p className="mb-8 text-gray-600">开始添加单词，构建你的个性化词库吧</p>
              {isUserBook && (
                <button
                  onClick={() => setShowAddWord(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-3 font-medium text-white shadow-md transition-all hover:bg-blue-600 hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="添加第一个单词"
                >
                  <Plus size={20} weight="bold" />
                  添加第一个单词
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 网格布局 */}
              <div
                className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                role="grid"
                aria-label="单词列表"
              >
                {paginatedWords.map((word, index) => (
                  <div
                    key={word.id}
                    onClick={() => handleWordClick(word)}
                    role="gridcell"
                    aria-label={`单词: ${word.spelling}, ${word.phonetic}`}
                    className="group animate-g3-fade-in cursor-pointer rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:scale-[1.02] hover:border-blue-300 hover:bg-white/95 hover:shadow-lg"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="space-y-3">
                      {/* 单词拼写 */}
                      <h3 className="text-center text-xl font-bold text-gray-900 transition-colors group-hover:text-blue-600">
                        {word.spelling}
                      </h3>

                      {/* 音标 */}
                      <div className="flex items-center justify-center">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500">
                          /{word.phonetic}/
                        </span>
                      </div>

                      {/* 释义列表 */}
                      <div className="space-y-1.5 pt-1 text-sm text-gray-600">
                        {word.meanings.slice(0, 2).map((meaning, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                              {idx + 1}
                            </span>
                            <span className="line-clamp-1 flex-1">{meaning}</span>
                          </div>
                        ))}
                        {word.meanings.length > 2 && (
                          <div className="pt-1 text-center text-xs text-blue-500">
                            +{word.meanings.length - 2} 更多
                          </div>
                        )}
                      </div>
                    </div>

                    {isUserBook && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteConfirm(word.id, word.spelling);
                        }}
                        className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-500 transition-all hover:bg-red-50 hover:text-red-600"
                        aria-label={`删除单词 ${word.spelling}`}
                      >
                        <Trash size={14} weight="bold" />
                        删除
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 分页控件 */}
              {totalPages > 1 && (
                <nav
                  className="flex flex-col items-center justify-between gap-4 rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm sm:flex-row"
                  role="navigation"
                  aria-label="分页导航"
                >
                  <div className="text-sm font-medium text-gray-600">
                    <span className="flex items-center gap-2">
                      <ListNumbers size={18} weight="duotone" color="#6b7280" />
                      显示第 {(currentPage - 1) * wordsPerPage + 1} -{' '}
                      {Math.min(currentPage * wordsPerPage, words.length)} 个，共 {words.length}{' '}
                      个单词
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="flex h-10 items-center rounded-lg bg-gray-100 px-4 font-medium text-gray-700 transition-all duration-200 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                      aria-label="上一页"
                    >
                      <ArrowLeft size={16} weight="bold" className="mr-1" />
                      上一页
                    </button>

                    {/* 页码按钮 */}
                    <div className="flex gap-1" role="group" aria-label="页码">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            aria-label={`第 ${pageNum} 页`}
                            aria-current={currentPage === pageNum ? 'page' : undefined}
                            className={`h-10 w-10 rounded-lg font-medium transition-all duration-200 hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 ${
                              currentPage === pageNum
                                ? 'bg-blue-500 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            } `}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="flex h-10 items-center rounded-lg bg-gray-100 px-4 font-medium text-gray-700 transition-all duration-200 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                      aria-label="下一页"
                    >
                      下一页
                      <ArrowRight size={16} weight="bold" className="ml-1" />
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}

          {/* 单词详情对话框 - 使用 Portal 渲染到 body */}
          {showWordDetail &&
            selectedWord &&
            createPortal(
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="word-detail-title"
              >
                {/* 背景遮罩 */}
                <div
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => setShowWordDetail(false)}
                />

                {/* 弹窗内容 */}
                <div className="relative max-h-[85vh] w-full max-w-xl animate-g3-slide-up overflow-hidden rounded-2xl border border-gray-200/60 bg-white/95 shadow-2xl backdrop-blur-md">
                  {/* 关闭按钮 */}
                  <button
                    onClick={() => setShowWordDetail(false)}
                    className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition-all hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 active:scale-95"
                    aria-label="关闭对话框"
                  >
                    <span className="text-xl font-light text-gray-500">×</span>
                  </button>

                  {/* 主内容区 */}
                  <div className="max-h-[85vh] overflow-y-auto p-8">
                    {/* 单词和发音 */}
                    <div className="mb-8 text-center">
                      <div className="mb-3 flex items-center justify-center gap-4">
                        <h3
                          id="word-detail-title"
                          className="text-5xl font-bold text-gray-900 md:text-6xl"
                        >
                          {selectedWord.spelling}
                        </h3>
                        <button
                          onClick={() => handlePronounceDetail(selectedWord.spelling)}
                          disabled={isPronouncing}
                          className={`flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 shadow-lg transition-all hover:bg-blue-600 hover:shadow-xl focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed ${isPronouncing ? 'animate-pulse' : 'hover:scale-110 active:scale-95'}`}
                          aria-label={
                            isPronouncing ? '正在播放发音' : `播放 ${selectedWord.spelling} 的发音`
                          }
                          aria-pressed={isPronouncing}
                        >
                          <SpeakerHigh size={28} weight="fill" className="text-white" />
                        </button>
                      </div>
                      <span className="inline-block rounded-full bg-gray-100 px-5 py-2 text-xl text-gray-500 md:text-2xl">
                        /{selectedWord.phonetic}/
                      </span>
                    </div>

                    {/* 分隔线 */}
                    <div className="mb-6 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

                    {/* 释义 */}
                    <div className="mb-6">
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        释义
                      </h4>
                      <div className="space-y-2">
                        {selectedWord.meanings.map((meaning, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white">
                              {idx + 1}
                            </span>
                            <span className="pt-0.5 text-lg leading-relaxed text-gray-800">
                              {meaning}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 例句 */}
                    {selectedWord.examples.length > 0 && selectedWord.examples[0] && (
                      <div>
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                          例句
                        </h4>
                        <div className="space-y-3">
                          {selectedWord.examples
                            .filter((e) => e)
                            .map((example, idx) => (
                              <blockquote
                                key={idx}
                                className="border-l-3 rounded-r-lg border-blue-400 bg-blue-50/50 py-2 pl-4 italic text-gray-600"
                              >
                                {example}
                              </blockquote>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )}

          {/* 添加单词对话框 - 使用 Portal 渲染到 body */}
          {showAddWord &&
            createPortal(
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-word-title"
              >
                {/* 背景遮罩 */}
                <div
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => {
                    setShowAddWord(false);
                    setNewWord({ spelling: '', phonetic: '', meanings: [''], examples: [''] });
                  }}
                />

                {/* 弹窗内容 */}
                <div className="relative max-h-[85vh] w-full max-w-lg animate-g3-slide-up overflow-y-auto rounded-2xl border border-gray-200/60 bg-white p-8 shadow-2xl">
                  <h2 id="add-word-title" className="mb-6 text-3xl font-bold text-gray-900">
                    添加新单词
                  </h2>

                  <div className="space-y-6">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        单词拼写 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newWord.spelling}
                        onChange={(e) => setNewWord({ ...newWord, spelling: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                        placeholder="例如：hello"
                        aria-required="true"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        音标 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newWord.phonetic}
                        onChange={(e) => setNewWord({ ...newWord, phonetic: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                        placeholder="例如：həˈloʊ"
                        aria-required="true"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        中文释义
                      </label>
                      {newWord.meanings.map((meaning, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={meaning}
                          onChange={(e) => updateMeaning(idx, e.target.value)}
                          className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-lg transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                          placeholder={`释义 ${idx + 1}`}
                        />
                      ))}
                      <button
                        onClick={addMeaning}
                        className="flex items-center rounded-lg px-4 py-2 font-medium text-blue-500 transition-all duration-200 hover:scale-105 hover:bg-blue-50 hover:text-blue-600 active:scale-95"
                      >
                        <Plus size={16} weight="bold" className="mr-1" />
                        添加更多释义
                      </button>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">例句</label>
                      {newWord.examples.map((example, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={example}
                          onChange={(e) => updateExample(idx, e.target.value)}
                          className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-lg transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                          placeholder={`例句 ${idx + 1}`}
                        />
                      ))}
                      <button
                        onClick={addExample}
                        className="flex items-center rounded-lg px-4 py-2 font-medium text-blue-500 transition-all duration-200 hover:scale-105 hover:bg-blue-50 hover:text-blue-600 active:scale-95"
                      >
                        <Plus size={16} weight="bold" className="mr-1" />
                        添加更多例句
                      </button>
                    </div>
                  </div>

                  <div className="mt-8 flex gap-4">
                    <button
                      onClick={handleAddWord}
                      className="flex-1 rounded-xl bg-blue-500 px-6 py-3 text-lg font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-600 hover:shadow-xl focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
                    >
                      添加单词
                    </button>
                    <button
                      onClick={() => {
                        setShowAddWord(false);
                        setNewWord({
                          spelling: '',
                          phonetic: '',
                          meanings: [''],
                          examples: [''],
                        });
                      }}
                      className="flex-1 rounded-xl bg-gray-100 px-6 py-3 text-lg font-medium text-gray-700 transition-all duration-200 hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </main>

        {/* 删除确认弹窗 */}
        <ConfirmModal
          isOpen={deleteConfirm.isOpen}
          onClose={() => setDeleteConfirm({ isOpen: false, wordId: '', spelling: '' })}
          onConfirm={handleDeleteWord}
          title="删除单词"
          message={`确定要删除单词"${deleteConfirm.spelling}"吗？`}
          confirmText="删除"
          cancelText="取消"
          variant="danger"
          isLoading={isDeleting}
        />
      </div>
    </div>
  );
}
