import { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Word } from '../types/models';
import StorageService from '../services/StorageService';
import { validateWord } from '../utils/validation';
import { handleError } from '../utils/errorHandler';
import { debounce } from '../utils/debounce';

/**
 * VocabularyPage - 词库管理页面
 * 提供单词的增删改查功能
 */
export default function VocabularyPage() {
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 表单状态
  const [formData, setFormData] = useState({
    spelling: '',
    phonetic: '',
    meanings: [''],
    examples: [''],
    audioUrl: ''
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // 防抖搜索
  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      setSearchQuery(query);
    }, 300),
    []
  );

  // 过滤单词
  const filteredWords = useMemo(() => {
    if (!searchQuery.trim()) return words;
    
    const query = searchQuery.toLowerCase();
    return words.filter(word => 
      word.spelling.toLowerCase().includes(query) ||
      word.phonetic.toLowerCase().includes(query) ||
      word.meanings.some(m => m.toLowerCase().includes(query)) ||
      word.examples.some(e => e.toLowerCase().includes(query))
    );
  }, [words, searchQuery]);

  useEffect(() => {
    loadWords();
  }, []);

  const loadWords = async () => {
    try {
      setIsLoading(true);
      const loadedWords = await StorageService.getWords();
      setWords(loadedWords);
      setError(null);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      spelling: '',
      phonetic: '',
      meanings: [''],
      examples: [''],
      audioUrl: ''
    });
    setFormErrors([]);
    setIsEditing(false);
    setEditingWord(null);
    setShowForm(false);
  };

  const handleAddNew = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (word: Word) => {
    setFormData({
      spelling: word.spelling,
      phonetic: word.phonetic,
      meanings: [...word.meanings],
      examples: [...word.examples],
      audioUrl: word.audioUrl || ''
    });
    setEditingWord(word);
    setIsEditing(true);
    setShowForm(true);
    setFormErrors([]);
  };

  const handleDelete = async (wordId: string) => {
    if (!confirm('确定要删除这个单词吗？')) {
      return;
    }

    try {
      await StorageService.deleteWord(wordId);
      await loadWords();
    } catch (err) {
      alert(handleError(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);

    // 验证表单
    const validation = validateWord({
      spelling: formData.spelling,
      phonetic: formData.phonetic,
      meanings: formData.meanings.filter(m => m.trim() !== ''),
      examples: formData.examples.filter(e => e.trim() !== '')
    });

    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    try {
      if (isEditing && editingWord) {
        // 更新单词
        const updatedWord: Word = {
          ...editingWord,
          spelling: formData.spelling.trim(),
          phonetic: formData.phonetic.trim(),
          meanings: formData.meanings.filter(m => m.trim() !== ''),
          examples: formData.examples.filter(e => e.trim() !== ''),
          audioUrl: formData.audioUrl.trim() || undefined,
          updatedAt: Date.now()
        };
        await StorageService.updateWord(updatedWord);
      } else {
        // 添加新单词
        const newWord: Word = {
          id: uuidv4(),
          spelling: formData.spelling.trim(),
          phonetic: formData.phonetic.trim(),
          meanings: formData.meanings.filter(m => m.trim() !== ''),
          examples: formData.examples.filter(e => e.trim() !== ''),
          audioUrl: formData.audioUrl.trim() || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await StorageService.addWord(newWord);
      }

      await loadWords();
      resetForm();
    } catch (err) {
      setFormErrors([handleError(err)]);
    }
  };

  const updateMeaning = (index: number, value: string) => {
    const newMeanings = [...formData.meanings];
    newMeanings[index] = value;
    setFormData({ ...formData, meanings: newMeanings });
  };

  const addMeaning = () => {
    setFormData({ ...formData, meanings: [...formData.meanings, ''] });
  };

  const removeMeaning = (index: number) => {
    if (formData.meanings.length <= 1) return;
    const newMeanings = formData.meanings.filter((_, i) => i !== index);
    setFormData({ ...formData, meanings: newMeanings });
  };

  const updateExample = (index: number, value: string) => {
    const newExamples = [...formData.examples];
    newExamples[index] = value;
    setFormData({ ...formData, examples: newExamples });
  };

  const addExample = () => {
    setFormData({ ...formData, examples: [...formData.examples, ''] });
  };

  const removeExample = (index: number) => {
    if (formData.examples.length <= 1) return;
    const newExamples = formData.examples.filter((_, i) => i !== index);
    setFormData({ ...formData, examples: newExamples });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-gray-900">词库管理</h1>
        <div className="flex gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="搜索单词..."
            onChange={(e) => debouncedSearch(e.target.value)}
            className="flex-1 sm:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            aria-label="搜索单词"
          />
          <button
            onClick={handleAddNew}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 font-medium hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 whitespace-nowrap"
            aria-label="添加新单词"
          >
            + 添加单词
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* 单词表单 */}
      {showForm && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {isEditing ? '编辑单词' : '添加新单词'}
          </h2>

          {formErrors.length > 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <ul className="list-disc list-inside text-red-600">
                {formErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                单词拼写 *
              </label>
              <input
                type="text"
                value={formData.spelling}
                onChange={(e) => setFormData({ ...formData, spelling: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例如: hello"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                音标 *
              </label>
              <input
                type="text"
                value={formData.phonetic}
                onChange={(e) => setFormData({ ...formData, phonetic: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例如: həˈloʊ"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                中文释义 *
              </label>
              {formData.meanings.map((meaning, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={meaning}
                    onChange={(e) => updateMeaning(index, e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例如: 你好"
                  />
                  {formData.meanings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMeaning(index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      删除
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addMeaning}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + 添加释义
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                例句 *
              </label>
              {formData.examples.map((example, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={example}
                    onChange={(e) => updateExample(index, e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例如: Hello, how are you?"
                  />
                  {formData.examples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExample(index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      删除
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addExample}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + 添加例句
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                音频URL（可选）
              </label>
              <input
                type="text"
                value={formData.audioUrl}
                onChange={(e) => setFormData({ ...formData, audioUrl: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="音频文件URL"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                {isEditing ? '保存修改' : '添加单词'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 单词列表 */}
      {words.length === 0 ? (
        <div className="text-center py-12 animate-fade-in">
          <p className="text-gray-500 text-lg mb-4">词库为空</p>
          <p className="text-gray-400">点击上方"添加单词"按钮开始添加</p>
        </div>
      ) : filteredWords.length === 0 ? (
        <div className="text-center py-12 animate-fade-in">
          <p className="text-gray-500 text-lg mb-4">未找到匹配的单词</p>
          <p className="text-gray-400">尝试使用其他关键词搜索</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredWords.map((word, index) => (
            <div
              key={word.id}
              className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="mb-3">
                <h3 className="text-xl font-bold text-gray-900">{word.spelling}</h3>
                <p className="text-sm text-gray-600">/{word.phonetic}/</p>
              </div>
              
              <div className="mb-3">
                <p className="text-sm font-medium text-gray-700 mb-1">释义：</p>
                <ul className="text-sm text-gray-600 list-disc list-inside">
                  {word.meanings.map((meaning, idx) => (
                    <li key={idx}>{meaning}</li>
                  ))}
                </ul>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-1">例句：</p>
                <p className="text-sm text-gray-600 italic">{word.examples[0]}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(word)}
                  className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all duration-200 text-sm font-medium hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label={`编辑单词 ${word.spelling}`}
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(word.id)}
                  className="flex-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all duration-200 text-sm font-medium hover:scale-105 active:scale-95 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  aria-label={`删除单词 ${word.spelling}`}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
