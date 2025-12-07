import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Word } from '../types/models';
import {
  ArrowLeft,
  Star,
  Target,
  Clock,
  MagnifyingGlass,
  CheckCircle,
  Warning,
  ArrowClockwise,
  WarningCircle,
} from '../components/Icon';
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
  const [confirmAction, setConfirmAction] = useState<'mastered' | 'needsPractice' | 'reset' | null>(
    null,
  );
  const [isAdjusting, setIsAdjusting] = useState(false);

  const loadWords = useCallback(async () => {
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
      const wordIds = allWords.map((w) => w.id);
      const states = await StorageService.getWordLearningStates(user.id, wordIds);
      const stateMap = new Map(states.map((s) => [s.wordId, s]));

      // 批量获取所有单词的评分数据
      const scores = await StorageService.getWordScores(user.id, wordIds);
      const scoreMap = new Map(scores.map((s) => [s.wordId, s]));

      // 组装单词 + 状态
      const wordsWithState: WordWithState[] = allWords.map((word) => {
        const state = stateMap.get(word.id);
        const scoreData = scoreMap.get(word.id);

        // 从统计数据中获取该单词的答题记录
        const wordStat = studyStats.wordStats.get(word.id);
        const accuracy =
          wordStat && wordStat.attempts > 0 ? wordStat.correct / wordStat.attempts : 0;
        const studyCount = wordStat?.attempts || 0;

        return {
          ...word,
          masteryLevel: state?.masteryLevel || 0,
          score: scoreData?.totalScore || 0,
          nextReviewDate: state?.nextReviewDate
            ? new Date(state.nextReviewDate).toLocaleDateString('zh-CN')
            : '未知',
          accuracy,
          studyCount,
        };
      });

      setWords(wordsWithState);
      setIsLoading(false);
    } catch (err) {
      uiLogger.error({ err }, '加载单词列表失败');
      setError('加载单词列表失败');
      setIsLoading(false);
    }
  }, [user]);

  const applyFiltersAndSort = useCallback(() => {
    let result = [...words];

    // 应用搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (word) =>
          word.spelling.toLowerCase().includes(query) ||
          word.meanings.some((m) => m.toLowerCase().includes(query)),
      );
    }

    // 应用掌握程度过滤
    if (filterMasteryLevel !== null) {
      result = result.filter((word) => word.masteryLevel === filterMasteryLevel);
    }

    // 应用得分范围过滤
    if (filterScoreRange !== 'all') {
      switch (filterScoreRange) {
        case 'low':
          result = result.filter((word) => word.score < 40);
          break;
        case 'medium':
          result = result.filter((word) => word.score >= 40 && word.score < 80);
          break;
        case 'high':
          result = result.filter((word) => word.score >= 80);
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
  }, [words, filterMasteryLevel, filterScoreRange, searchQuery, sortField, sortOrder]);

  // 加载单词数据
  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // 应用筛选和排序
  useEffect(() => {
    applyFiltersAndSort();
  }, [applyFiltersAndSort]);

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

  const handleAdjustWord = (
    word: WordWithState,
    action: 'mastered' | 'needsPractice' | 'reset',
  ) => {
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
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="text-gray-600">正在加载单词列表...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <WarningCircle size={64} weight="fill" className="mx-auto mb-4 text-red-500" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">加载失败</h2>
          <p className="mb-6 text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/learning')}
            className="rounded-lg bg-blue-500 px-6 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            返回学习
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen animate-g3-fade-in bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-all duration-200 hover:scale-105 hover:bg-gray-50 active:scale-95"
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
        <div className="mb-6 rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* 搜索框 */}
            <div className="relative">
              <MagnifyingGlass
                size={20}
                weight="bold"
                className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400"
              />
              <input
                type="text"
                placeholder="搜索单词..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 掌握程度筛选 */}
            <select
              value={filterMasteryLevel === null ? 'all' : filterMasteryLevel}
              onChange={(e) =>
                setFilterMasteryLevel(e.target.value === 'all' ? null : Number(e.target.value))
              }
              className="rounded-lg border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">所有掌握程度</option>
              {[0, 1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level} 级
                </option>
              ))}
            </select>

            {/* 得分范围筛选 */}
            <select
              value={filterScoreRange}
              onChange={(e) => setFilterScoreRange(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
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
              className="rounded-lg border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
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
          <div className="py-12 text-center">
            <MagnifyingGlass size={80} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
            <p className="text-lg text-gray-500">没有找到符合条件的单词</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredWords.map((word) => (
              <div
                key={word.id}
                className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  {/* 单词信息 */}
                  <div className="flex-1">
                    <h3 className="mb-1 text-2xl font-bold text-gray-900">{word.spelling}</h3>
                    <p className="mb-2 text-gray-600">/{word.phonetic}/</p>
                    <p className="text-gray-700">{word.meanings[0]}</p>
                  </div>

                  {/* 学习状态 */}
                  <div className="flex flex-wrap gap-6">
                    {/* 掌握程度 */}
                    <div className="flex flex-col items-center">
                      <span className="mb-1 text-xs text-gray-500">掌握程度</span>
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
                      <span className="mb-1 text-xs text-gray-500">得分</span>
                      <div className="flex items-center gap-1">
                        <Target size={16} weight="duotone" color="#3b82f6" />
                        <span className="text-lg font-bold text-gray-900">
                          {Math.round(word.score)}
                        </span>
                      </div>
                    </div>

                    {/* 下次复习 */}
                    <div className="flex flex-col items-center">
                      <span className="mb-1 text-xs text-gray-500">下次复习</span>
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
                        className="flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 transition-all duration-200 hover:scale-105 hover:bg-green-200 active:scale-95"
                        title="标记为已掌握"
                      >
                        <CheckCircle size={14} weight="bold" />
                        已掌握
                      </button>
                      <button
                        onClick={() => handleAdjustWord(word, 'needsPractice')}
                        className="flex items-center gap-1 rounded-lg bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-700 transition-all duration-200 hover:scale-105 hover:bg-yellow-200 active:scale-95"
                        title="标记为需要重点学习"
                      >
                        <Warning size={14} weight="bold" />
                        重点学习
                      </button>
                      <button
                        onClick={() => handleAdjustWord(word, 'reset')}
                        className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all duration-200 hover:scale-105 hover:bg-gray-200 active:scale-95"
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
          <div className="fixed inset-0 z-50 flex animate-g3-fade-in items-center justify-center bg-black bg-opacity-50 p-6">
            <div className="w-full max-w-md animate-g3-slide-up rounded-2xl bg-white p-8 shadow-xl">
              <h3 className="mb-4 text-2xl font-bold text-gray-900">确认操作</h3>
              <p className="mb-6 text-gray-600">
                确定要对单词{' '}
                <span className="font-bold text-gray-900">"{selectedWord.spelling}"</span> 执行
                <span className="font-bold text-blue-600"> {getActionText()} </span>
                操作吗？
              </p>
              <div className="flex gap-4">
                <button
                  onClick={cancelAdjustment}
                  disabled={isAdjusting}
                  className="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-200 hover:scale-105 hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmAdjustment}
                  disabled={isAdjusting}
                  className="flex-1 rounded-xl bg-blue-500 px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-600 hover:shadow-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
