import { useState, useEffect, useMemo } from 'react';
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
    Warning
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
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; wordId: string; spelling: string }>({
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
            <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
                <div className="text-center">
                    <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
                    <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
                </div>
            </div>
        );
    }

    if (error || !wordBook) {
        return (
            <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
                <div className="text-center max-w-md px-4" role="alert" aria-live="assertive">
                    <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
                    <p className="text-gray-600 mb-6">{error || '词书不存在'}</p>
                    <button
                        onClick={() => navigate('/vocabulary')}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
            <div className="max-w-7xl mx-auto px-4 py-8 animate-g3-fade-in">
                {/* 头部 */}
                <header className="mb-8">
                    <nav className="mb-6">
                        <button
                            onClick={() => navigate('/vocabulary')}
                            className="
                                inline-flex items-center text-blue-500 hover:text-blue-600 
                                font-medium transition-all duration-200 
                                hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg px-3 py-2
                            "
                            aria-label="返回词库列表"
                        >
                            <ArrowLeft size={16} weight="bold" className="mr-2" />
                            返回词库列表
                        </button>
                    </nav>

                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <h1 className="text-3xl font-bold text-gray-900">
                                    {wordBook.name}
                                </h1>
                                {!isUserBook && (
                                    <span className="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
                                        系统词库
                                    </span>
                                )}
                            </div>
                            {wordBook.description && (
                                <p className="text-gray-600 text-lg mb-2">{wordBook.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                    <Books size={18} weight="duotone" color="#6b7280" />
                                    共 {wordBook.wordCount} 个单词
                                </span>
                                {totalPages > 1 && (
                                    <span className="flex items-center gap-1">
                                        <File size={18} weight="duotone" color="#6b7280" />
                                        第 {currentPage} / {totalPages} 页
                                    </span>
                                )}
                            </div>
                        </div>

                        {isUserBook && (
                            <button
                                onClick={() => setShowAddWord(true)}
                                className="
                                    px-6 py-3 
                                    bg-blue-500 text-white 
                                    rounded-lg 
                                    font-medium
                                    hover:bg-blue-600 
                                    transition-all duration-200 
                                    hover:scale-105 active:scale-95
                                    focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                    shadow-sm hover:shadow-md
                                "
                                aria-label="添加新单词"
                            >
                                <Plus size={18} weight="bold" className="mr-2" />
                                添加单词
                            </button>
                        )}
                    </div>
                </header>

                {/* 单词网格 */}
                <main>
                    {words.length === 0 ? (
                        <div className="text-center py-16 animate-g3-slide-up">
                            <BookOpen className="mx-auto mb-6 animate-pulse" size={96} weight="thin" color="#9ca3af" />
                            <h2 className="text-2xl font-bold text-gray-900 mb-3">这个词书还没有单词</h2>
                            <p className="text-gray-600 mb-8">开始添加单词，构建你的个性化词库吧</p>
                            {isUserBook && (
                                <button
                                    onClick={() => setShowAddWord(true)}
                                    className="
                                        px-8 py-4 
                                        bg-blue-500 text-white 
                                        rounded-lg 
                                        font-medium
                                        hover:bg-blue-600 
                                        transition-all duration-200 
                                        hover:scale-105 active:scale-95
                                        focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                        shadow-lg hover:shadow-xl
                                    "
                                    aria-label="添加第一个单词"
                                >
                                    <Plus size={20} weight="bold" className="mr-2" />
                                    添加第一个单词
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* 网格布局 */}
                            <div
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8"
                                role="grid"
                                aria-label="单词列表"
                            >
                                {paginatedWords.map((word, index) => (
                                    <div
                                        key={word.id}
                                        onClick={() => handleWordClick(word)}
                                        role="gridcell"
                                        aria-label={`单词: ${word.spelling}, ${word.phonetic}`}
                                        className="
                                            group p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl 
                                            shadow-sm hover:shadow-xl hover:scale-[1.03]
                                            cursor-pointer transition-all duration-300
                                            flex flex-col justify-between min-h-[200px]
                                            hover:border-blue-400 hover:bg-white/95
                                            focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2
                                            animate-g3-fade-in
                                        "
                                        style={{ animationDelay: `${index * 30}ms` }}
                                    >
                                        <div className="flex-1 space-y-4">
                                            {/* 单词拼写 */}
                                            <h3 className="text-2xl font-bold text-gray-900 text-center group-hover:text-blue-600 transition-colors duration-200">
                                                {word.spelling}
                                            </h3>

                                            {/* 音标 */}
                                            <div className="flex items-center justify-center">
                                                <span className="text-base text-gray-600 font-medium bg-gray-100 px-4 py-1.5 rounded-full">
                                                    /{word.phonetic}/
                                                </span>
                                            </div>

                                            {/* 释义列表 */}
                                            <div className="text-sm text-gray-700 space-y-2 pt-2">
                                                {word.meanings.slice(0, 2).map((meaning, idx) => (
                                                    <div key={idx} className="flex items-start gap-2">
                                                        <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="flex-1 line-clamp-1 pt-0.5">{meaning}</span>
                                                    </div>
                                                ))}
                                                {word.meanings.length > 2 && (
                                                    <div className="text-blue-600 font-medium text-center text-xs pt-1">
                                                        +{word.meanings.length - 2} 个释义
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
                                                className="
                                                    mt-4 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 
                                                    rounded-lg transition-all duration-200 
                                                    hover:scale-105 active:scale-95
                                                    font-medium border border-red-200 hover:border-red-300
                                                    flex items-center justify-center gap-1
                                                "
                                                aria-label={`删除单词 ${word.spelling}`}
                                            >
                                                <Trash size={16} weight="bold" />
                                                删除
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* 分页控件 */}
                            {totalPages > 1 && (
                                <nav
                                    className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200/60"
                                    role="navigation"
                                    aria-label="分页导航"
                                >
                                    <div className="text-sm text-gray-600 font-medium">
                                        <span className="flex items-center gap-2">
                                            <ListNumbers size={18} weight="duotone" color="#6b7280" />
                                            显示第 {(currentPage - 1) * wordsPerPage + 1} - {Math.min(currentPage * wordsPerPage, words.length)} 个，共 {words.length} 个单词
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="
                                                px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium
                                                hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed 
                                                transition-all duration-200 hover:scale-105 active:scale-95
                                                focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                                                disabled:hover:scale-100
                                            "
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
                                                        className={`
                                                            w-10 h-10 rounded-lg font-medium transition-all duration-200
                                                            hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                                            ${currentPage === pageNum
                                                                ? 'bg-blue-500 text-white shadow-lg'
                                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                            }
                                                        `}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            className="
                                                px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium
                                                hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed 
                                                transition-all duration-200 hover:scale-105 active:scale-95
                                                focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                                                disabled:hover:scale-100
                                            "
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

                    {/* 单词详情对话框 */}
                    {showWordDetail && selectedWord && (
                        <div
                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="word-detail-title"
                        >
                            <div className="bg-white rounded-3xl shadow-xl p-12 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-g3-slide-up">
                                {/* 关闭按钮 */}
                                <button
                                    onClick={() => setShowWordDetail(false)}
                                    className="
                                ml-auto mb-4 w-10 h-10 rounded-full hover:bg-gray-200 
                                flex items-center justify-center transition-all
                                hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                            "
                                    aria-label="关闭对话框"
                                >
                                    <span className="text-gray-600 text-2xl">×</span>
                                </button>

                                {/* 单词和发音 */}
                                <div className="text-center mb-12">
                                    <div className="flex items-center justify-center mb-4">
                                        <h3
                                            id="word-detail-title"
                                            className="text-8xl font-bold text-gray-900"
                                        >
                                            {selectedWord.spelling}
                                        </h3>
                                        <button
                                            onClick={() => handlePronounceDetail(selectedWord.spelling)}
                                            disabled={isPronouncing}
                                            className={`
                                        ml-6 w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 
                                        shadow-lg hover:shadow-xl flex items-center justify-center
                                        transition-all group
                                        focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                        disabled:cursor-not-allowed
                                        ${isPronouncing ? 'animate-pulse' : 'hover:scale-110 active:scale-95'}
                                    `}
                                            aria-label={isPronouncing ? '正在播放发音' : `播放 ${selectedWord.spelling} 的发音`}
                                            aria-pressed={isPronouncing}
                                        >
                                            <SpeakerHigh size={28} weight="fill" className="text-white group-hover:animate-pulse" />
                                        </button>
                                    </div>
                                    <p className="text-3xl text-gray-400">/{selectedWord.phonetic}/</p>
                                </div>

                                {/* 分隔线 */}
                                <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-8"></div>

                                {/* 释义和例句 - 左右布局 */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* 释义 */}
                                    <div>
                                        <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
                                            释义
                                        </h4>
                                        <div className="space-y-3">
                                            {selectedWord.meanings.map((meaning, idx) => (
                                                <div key={idx} className="flex items-baseline">
                                                    <span className="text-blue-500 font-bold text-lg mr-4">{idx + 1}.</span>
                                                    <span className="text-gray-900 text-xl">{meaning}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 例句 */}
                                    {selectedWord.examples.length > 0 && selectedWord.examples[0] && (
                                        <div>
                                            <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
                                                例句
                                            </h4>
                                            <div className="space-y-4">
                                                {selectedWord.examples.map((example, idx) => (
                                                    <blockquote
                                                        key={idx}
                                                        className="border-l-4 border-blue-500 pl-6 py-2 italic text-gray-700"
                                                    >
                                                        {example}
                                                    </blockquote>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 添加单词对话框 */}
                    {showAddWord && (
                        <div
                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="add-word-title"
                        >
                            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-g3-slide-up">
                                <h2
                                    id="add-word-title"
                                    className="text-3xl font-bold text-gray-900 mb-6"
                                >
                                    添加新单词
                                </h2>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            单词拼写 <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={newWord.spelling}
                                            onChange={(e) =>
                                                setNewWord({ ...newWord, spelling: e.target.value })
                                            }
                                            className="
                                        w-full px-4 py-3 border border-gray-300 rounded-lg 
                                        focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                        transition-all text-lg
                                    "
                                            placeholder="例如：hello"
                                            aria-required="true"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            音标 <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={newWord.phonetic}
                                            onChange={(e) =>
                                                setNewWord({ ...newWord, phonetic: e.target.value })
                                            }
                                            className="
                                        w-full px-4 py-3 border border-gray-300 rounded-lg 
                                        focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                        transition-all text-lg
                                    "
                                            placeholder="例如：həˈloʊ"
                                            aria-required="true"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            中文释义
                                        </label>
                                        {newWord.meanings.map((meaning, idx) => (
                                            <input
                                                key={idx}
                                                type="text"
                                                value={meaning}
                                                onChange={(e) => updateMeaning(idx, e.target.value)}
                                                className="
                                            w-full px-4 py-3 border border-gray-300 rounded-lg 
                                            focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                            transition-all mb-3 text-lg
                                        "
                                                placeholder={`释义 ${idx + 1}`}
                                            />
                                        ))}
                                        <button
                                            onClick={addMeaning}
                                            className="
                                        px-4 py-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 
                                        rounded-lg transition-all duration-200 font-medium
                                        hover:scale-105 active:scale-95 flex items-center
                                    "
                                        >
                                            <Plus size={16} weight="bold" className="mr-1" />
                                            添加更多释义
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            例句
                                        </label>
                                        {newWord.examples.map((example, idx) => (
                                            <input
                                                key={idx}
                                                type="text"
                                                value={example}
                                                onChange={(e) => updateExample(idx, e.target.value)}
                                                className="
                                            w-full px-4 py-3 border border-gray-300 rounded-lg 
                                            focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                            transition-all mb-3 text-lg
                                        "
                                                placeholder={`例句 ${idx + 1}`}
                                            />
                                        ))}
                                        <button
                                            onClick={addExample}
                                            className="
                                        px-4 py-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 
                                        rounded-lg transition-all duration-200 font-medium
                                        hover:scale-105 active:scale-95 flex items-center
                                    "
                                        >
                                            <Plus size={16} weight="bold" className="mr-1" />
                                            添加更多例句
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-4 mt-8">
                                    <button
                                        onClick={handleAddWord}
                                        className="
                                    flex-1 px-6 py-3 bg-blue-500 text-white rounded-xl 
                                    font-medium hover:bg-blue-600 transition-all duration-200 
                                    hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                    text-lg shadow-lg hover:shadow-xl
                                "
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
                                        className="
                                    flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl 
                                    font-medium hover:bg-gray-200 transition-all duration-200 
                                    hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                                    text-lg
                                "
                                    >
                                        取消
                                    </button>
                                </div>
                            </div>
                        </div>
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
