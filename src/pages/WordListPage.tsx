import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Word } from '../types/models';
import { ArrowLeft, Star, Target, Clock, MagnifyingGlass, CheckCircle, Warning, ArrowClockwise } from '../components/Icon';
import LearningService from '../services/LearningService';
import StorageService from '../services/StorageService';
import { useToast } from '../components/ui';
import { uiLogger } from '../utils/logger';

interface WordWithState extends Word {
  masteryLevel: number;
  score: number;
  nextReviewDate: string;
  accuracy: number;
  studyCount: number;
}

type SortField = 'score' | 'accuracy' | 'studyCount' | 'masteryLevel';
type SortOrder = 'asc' | 'desc';

/**
 * 单词列表页面
 * 显示所有单词及其学习状态，支持筛选和排序
 */
export default function WordListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [words, setWords] = useState<WordWithState[]>([]);
  const [filteredWords, setFilteredWords] = useState<WordWithState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 筛选条件
  const [filterMasteryLevel, setFilterMasteryLevel] = useState<number | null>(null);
  const [filterScoreRange, setFilterScoreRange] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 排序条件
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 手动调整相关状态
  const [selectedWord, setSelectedWord] = useState<WordWithState | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'mastered' | 'needsPractice' | 'reset' | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);

  useEffect(() => {
    loadWords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    applyFiltersAndSort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, filterMasteryLevel, filterScoreRange, searchQuery, sortField, sortOrder]);

  const loadWords = async () => {
    if (!user) {
      setError('请先登录');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 获取所有单词
      const allWords = await StorageService.getWords();

      // 获取学习统计数据
      const studyStats = await StorageService.getStudyStatistics();

      // 批量获取所有单词的学习状态（避免 N+1 查询）
      const wordIds = allWords.map(w => w.id);
      const states = await StorageService.getWordLearningStates(user.id, wordIds);
      const stateMap = new Map(states.map(s => [s.wordId, s]));

      // 批量获取所有单词的评分数据
      const scores = await StorageService.getWordScores(user.id, wordIds);
      const scoreMap = new Map(scores.map(s => [s.wordId, s]));

      // 组装单词 + 状态
      const wordsWithState: WordWithState[] = allWords.map((word) => {
        const state = stateMap.get(word.id);
        const scoreData = scoreMap.get(word.id);

        // 从统计数据中获取该单词的答题记录
        const wordStat = studyStats.wordStats.get(word.id);
        const accuracy = wordStat && wordStat.attempts > 0
          ? wordStat.correct / wordStat.attempts
          : 0;
        const studyCount = wordStat?.attempts || 0;

        return {
          ...word,
          masteryLevel: state?.masteryLevel || 0,
          score: scoreData?.totalScore || 0,
          nextReviewDate: state?.nextReviewDate
            ? new Date(state.nextReviewDate).toLocaleDateString('zh-CN')
            : '未知',
          accuracy,
          studyCount
        };
      });

      setWords(wordsWithState);
      setIsLoading(false);
    } catch (err) {
      uiLogger.error({ err }, '加载单词列表失败');
      setError('加载单词列表失败');
      setIsLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let result = [...words];

    // 应用搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(word => 
        word.spelling.toLowerCase().includes(query) ||
        word.meanings.some(m => m.toLowerCase().includes(query))
      );
    }

    // 应用掌握程度过滤
    if (filterMasteryLevel !== null) {
      result = result.filter(word => word.masteryLevel === filterMasteryLevel);
    }

    // 应用得分范围过滤
    if (filterScoreRange !== 'all') {
      switch (filterScoreRange) {
        case 'low':
          result = result.filter(word => word.score < 40);
          break;
        case 'medium':
          result = result.filter(word => word.score >= 40 && word.score < 80);
          break;
        case 'high':
          result = result.filter(word => word.score >= 80);
          break;
      }
    }

    // 应用排序
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'accuracy':
          comparison = a.accuracy - b.accuracy;
          break;
        case 'studyCount':
          comparison = a.studyCount - b.studyCount;
          break;
        case 'masteryLevel':
          comparison = a.masteryLevel - b.masteryLevel;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredWords(result);
  };

  // const handleSort = (field: SortField) => {
  //   if (sortField === field) {
  //     // 切换排序顺序
  //     setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  //   } else {
  //     // 新字段，默认降序
  //     setSortField(field);
  //     setSortOrder('desc');
  //   }
  // };

  const handleAdjustWord = (word: WordWithState, action: 'mastered' | 'needsPractice' | 'reset') => {
    setSelectedWord(word);
    setConfirmAction(action);
    setShowConfirmDialog(true);
  };

  const confirmAdjustment = async () => {
    if (!user || !selectedWord || !confirmAction) return;

    try {
      setIsAdjusting(true);

      switch (confirmAction) {
        case 'mastered':
          await LearningService.markAsMastered(user.id, selectedWord.id);
          break;
        case 'needsPractice':
          await LearningService.markAsNeedsPractice(user.id, selectedWord.id);
          break;
        case 'reset':
          await LearningService.resetProgress(user.id, selectedWord.id);
          break;
      }

      // 重新加载单词列表
      await loadWords();

      setShowConfirmDialog(false);
      setSelectedWord(null);
      setConfirmAction(null);
    } catch (err) {
      uiLogger.error({ err, wordId: selectedWord.id, action: confirmAction }, '调整单词状态失败');
      toast.error('调整失败，请重试');
    } finally {
      setIsAdjusting(false);
    }
  };

  const cancelAdjustment = () => {
    setShowConfirmDialog(false);
    setSelectedWord(null);
    setConfirmAction(null);
  };

  const getActionText = () => {
    switch (confirmAction) {
      case 'mastered':
        return '标记为已掌握';
      case 'needsPractice':
        return '标记为需要重点学习';
      case 'reset':
        return '重置学习进度';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">正在加载单词列表...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/learning')}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            返回学习
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 animate-g3-fade-in">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label="返回"
            >
              <ArrowLeft size={20} weight="bold" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">单词列表</h1>
          </div>
          <div className="text-sm text-gray-600">
            共 {filteredWords.length} / {words.length} 个单词
          </div>
        </div>

        {/* 筛选和搜索 */}
        <div className="mb-6 p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 搜索框 */}
            <div className="relative">
              <MagnifyingGlass 
                size={20} 
                weight="bold" 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="搜索单词..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* 掌握程度筛选 */}
            <select
              value={filterMasteryLevel === null ? 'all' : filterMasteryLevel}
              onChange={(e) => setFilterMasteryLevel(e.target.value === 'all' ? null : Number(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">所有掌握程度</option>
              {[0, 1, 2, 3, 4, 5].map(level => (
                <option key={level} value={level}>{level} 级</option>
              ))}
            </select>

            {/* 得分范围筛选 */}
            <select
              value={filterScoreRange}
              onChange={(e) => setFilterScoreRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">所有得分</option>
              <option value="low">低分 (0-40)</option>
              <option value="medium">中等 (40-80)</option>
              <option value="high">高分 (80-100)</option>
            </select>

            {/* 排序选择 */}
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-') as [SortField, SortOrder];
                setSortField(field);
                setSortOrder(order);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="score-desc">得分 (高到低)</option>
              <option value="score-asc">得分 (低到高)</option>
              <option value="masteryLevel-desc">掌握程度 (高到低)</option>
              <option value="masteryLevel-asc">掌握程度 (低到高)</option>
              <option value="accuracy-desc">正确率 (高到低)</option>
              <option value="accuracy-asc">正确率 (低到高)</option>
              <option value="studyCount-desc">学习次数 (多到少)</option>
              <option value="studyCount-asc">学习次数 (少到多)</option>
            </select>
          </div>
        </div>

        {/* 单词列表 */}
        {filteredWords.length === 0 ? (
          <div className="text-center py-12">
            <MagnifyingGlass size={80} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
            <p className="text-gray-500 text-lg">没有找到符合条件的单词</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredWords.map((word) => (
              <div
                key={word.id}
                className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.01]"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  {/* 单词信息 */}
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">
                      {word.spelling}
                    </h3>
                    <p className="text-gray-600 mb-2">/{word.phonetic}/</p>
                    <p className="text-gray-700">{word.meanings[0]}</p>
                  </div>

                  {/* 学习状态 */}
                  <div className="flex flex-wrap gap-6">
                    {/* 掌握程度 */}
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">掌握程度</span>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, index) => (
                          <Star
                            key={index}
                            size={16}
                            weight={index < word.masteryLevel ? 'fill' : 'regular'}
                            color={index < word.masteryLevel ? '#f59e0b' : '#d1d5db'}
                          />
                        ))}
                      </div>
                    </div>

                    {/* 单词得分 */}
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">得分</span>
                      <div className="flex items-center gap-1">
                        <Target size={16} weight="duotone" color="#3b82f6" />
                        <span className="text-lg font-bold text-gray-900">
                          {Math.round(word.score)}
                        </span>
                      </div>
                    </div>

                    {/* 下次复习 */}
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">下次复习</span>
                      <div className="flex items-center gap-1">
                        <Clock size={16} weight="duotone" color="#8b5cf6" />
                        <span className="text-sm font-medium text-gray-900">
                          {word.nextReviewDate}
                        </span>
                      </div>
                    </div>

                    {/* 手动调整按钮 */}
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleAdjustWord(word, 'mastered')}
                        className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1"
                        title="标记为已掌握"
                      >
                        <CheckCircle size={14} weight="bold" />
                        已掌握
                      </button>
                      <button
                        onClick={() => handleAdjustWord(word, 'needsPractice')}
                        className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium hover:bg-yellow-200 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1"
                        title="标记为需要重点学习"
                      >
                        <Warning size={14} weight="bold" />
                        重点学习
                      </button>
                      <button
                        onClick={() => handleAdjustWord(word, 'reset')}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1"
                        title="重置学习进度"
                      >
                        <ArrowClockwise size={14} weight="bold" />
                        重置
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 确认对话框 */}
        {showConfirmDialog && selectedWord && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6 animate-g3-fade-in">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full animate-g3-slide-up">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                确认操作
              </h3>
              <p className="text-gray-600 mb-6">
                确定要对单词 <span className="font-bold text-gray-900">"{selectedWord.spelling}"</span> 执行
                <span className="font-bold text-blue-600"> {getActionText()} </span>
                操作吗？
              </p>
              <div className="flex gap-4">
                <button
                  onClick={cancelAdjustment}
                  disabled={isAdjusting}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  onClick={confirmAdjustment}
                  disabled={isAdjusting}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdjusting ? '处理中...' : '确认'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
