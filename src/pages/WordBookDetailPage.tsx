import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/ApiClient';
import { Word, WordBook } from '../types/models';

export default function WordBookDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [wordBook, setWordBook] = useState<WordBook | null>(null);
    const [words, setWords] = useState<Word[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddWord, setShowAddWord] = useState(false);

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
        } catch (err) {
            console.error('加载词书详情失败:', err);
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddWord = async () => {
        if (!newWord.spelling || !newWord.phonetic) {
            alert('请填写单词拼写和音标');
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
            loadWordBookDetail();
        } catch (err) {
            console.error('添加单词失败:', err);
            alert(err instanceof Error ? err.message : '添加失败');
        }
    };

    const handleDeleteWord = async (wordId: string, spelling: string) => {
        if (!confirm(`确定要删除单词"${spelling}"吗？`)) {
            return;
        }

        try {
            await apiClient.removeWordFromWordBook(id!, wordId);
            loadWordBookDetail();
        } catch (err) {
            console.error('删除单词失败:', err);
            alert(err instanceof Error ? err.message : '删除失败');
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
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-gray-500">加载中...</div>
            </div>
        );
    }

    if (error || !wordBook) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="text-red-600">{error || '词书不存在'}</div>
                <button
                    onClick={() => navigate('/vocabulary')}
                    className="mt-4 px-4 py-2 bg-gray-100 rounded-lg"
                >
                    返回
                </button>
            </div>
        );
    }

    const isUserBook = wordBook.type === 'USER';

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl">
            {/* 头部 */}
            <div className="mb-8">
                <button
                    onClick={() => navigate('/vocabulary')}
                    className="text-blue-500 hover:text-blue-600 mb-4"
                >
                    ← 返回词库列表
                </button>

                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold text-gray-900">
                                {wordBook.name}
                            </h1>
                            {!isUserBook && (
                                <span className="px-3 py-1 bg-blue-100 text-blue-600 rounded text-sm">
                                    系统词库
                                </span>
                            )}
                        </div>
                        {wordBook.description && (
                            <p className="text-gray-600">{wordBook.description}</p>
                        )}
                        <p className="text-gray-500 text-sm mt-2">
                            共 {wordBook.wordCount} 个单词
                        </p>
                    </div>

                    {isUserBook && (
                        <button
                            onClick={() => setShowAddWord(true)}
                            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200"
                        >
                            + 添加单词
                        </button>
                    )}
                </div>
            </div>

            {/* 单词列表 */}
            {words.length === 0 ? (
                <div className="text-center py-16">
                    <div className="text-gray-400 text-5xl mb-4">📖</div>
                    <p className="text-gray-500 mb-4">这个词书还没有单词</p>
                    {isUserBook && (
                        <button
                            onClick={() => setShowAddWord(true)}
                            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
                        >
                            添加第一个单词
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {words.map((word) => (
                        <div
                            key={word.id}
                            className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-baseline gap-3 mb-2">
                                        <h3 className="text-2xl font-bold text-gray-900">
                                            {word.spelling}
                                        </h3>
                                        <span className="text-gray-500">{word.phonetic}</span>
                                    </div>

                                    <div className="mb-3">
                                        <span className="text-sm font-medium text-gray-700">
                                            释义：
                                        </span>
                                        <div className="mt-1">
                                            {word.meanings.map((meaning, idx) => (
                                                <div key={idx} className="text-gray-900">
                                                    {idx + 1}. {meaning}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {word.examples.length > 0 && word.examples[0] && (
                                        <div>
                                            <span className="text-sm font-medium text-gray-700">
                                                例句：
                                            </span>
                                            <div className="mt-1 space-y-1">
                                                {word.examples.map((example, idx) => (
                                                    <div key={idx} className="text-gray-600 text-sm">
                                                        {example}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {isUserBook && (
                                    <button
                                        onClick={() => handleDeleteWord(word.id, word.spelling)}
                                        className="ml-4 px-3 py-1 text-red-600 hover:bg-red-50 rounded transition-all"
                                    >
                                        删除
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 添加单词对话框 */}
            {showAddWord && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            添加新单词
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    单词拼写 *
                                </label>
                                <input
                                    type="text"
                                    value={newWord.spelling}
                                    onChange={(e) =>
                                        setNewWord({ ...newWord, spelling: e.target.value })
                                    }
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="例如：hello"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    音标 *
                                </label>
                                <input
                                    type="text"
                                    value={newWord.phonetic}
                                    onChange={(e) =>
                                        setNewWord({ ...newWord, phonetic: e.target.value })
                                    }
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="例如：həˈloʊ"
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
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-2"
                                        placeholder={`释义 ${idx + 1}`}
                                    />
                                ))}
                                <button
                                    onClick={addMeaning}
                                    className="text-blue-500 text-sm hover:text-blue-600"
                                >
                                    + 添加更多释义
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
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-2"
                                        placeholder={`例句 ${idx + 1}`}
                                    />
                                ))}
                                <button
                                    onClick={addExample}
                                    className="text-blue-500 text-sm hover:text-blue-600"
                                >
                                    + 添加更多例句
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleAddWord}
                                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
                            >
                                添加
                            </button>
                            <button
                                onClick={() => setShowAddWord(false)}
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
