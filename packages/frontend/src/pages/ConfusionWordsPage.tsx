import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CaretDown, CaretRight, Warning, BookOpen, Tag } from '../components/Icon';
import { Spinner, useToast } from '../components/ui';
import {
  useConfusionPairs,
  useConfusionByCluster,
  useConfusionCacheStatus,
  useSemanticStats,
  useWordBooks,
} from '../hooks/queries';
import { ConfusionPairCard } from '../components/semantic/ConfusionPairCard';
import { ThemeCardSkeleton } from '../components/skeletons/PageSkeleton';
import type { ConfusionPair, ClusterConfusionCount } from '../services/client';
import { buildSeedWords, buildBatchSeedFromPairs } from '../utils/learningSeed';

const THRESHOLD_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

interface ThemeCardProps {
  cluster: ClusterConfusionCount;
  threshold: number;
  isExpanded: boolean;
  onToggle: () => void;
  onStartBatch: (pairs: ConfusionPair[], count: number, themeLabel: string) => void;
}

function ThemeCard({ cluster, threshold, isExpanded, onToggle, onStartBatch }: ThemeCardProps) {
  const [learningCount, setLearningCount] = useState(Math.min(5, cluster.pairCount));
  const { pairs, isLoading } = useConfusionPairs({
    clusterId: cluster.clusterId,
    threshold,
    limit: 50,
    enabled: isExpanded,
  });

  const maxCount = Math.min(pairs.length, cluster.pairCount);

  useEffect(() => {
    if (pairs.length > 0) {
      setLearningCount(Math.min(5, pairs.length));
    }
  }, [pairs.length]);

  const handleStartLearning = () => {
    const selectedPairs = pairs.slice(0, learningCount);
    onStartBatch(selectedPairs, learningCount, cluster.themeLabel);
  };

  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 shadow-soft backdrop-blur-sm transition-all duration-g3-fast dark:border-slate-700 dark:bg-slate-800/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <CaretDown size={20} className="text-gray-500" />
          ) : (
            <CaretRight size={20} className="text-gray-500" />
          )}
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Tag size={18} className="text-blue-500" />
              {cluster.themeLabel}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {cluster.pairCount} 对易混淆词
            </p>
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
          {cluster.pairCount}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 p-5 dark:border-slate-700">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="md" color="primary" />
            </div>
          ) : pairs.length === 0 ? (
            <p className="py-4 text-center text-gray-500 dark:text-gray-400">该主题暂无混淆词对</p>
          ) : (
            <>
              <div className="mb-4 rounded-button bg-gray-50 p-4 dark:bg-slate-700/50">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  选择学习数量: {learningCount} 对
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max={maxCount}
                    value={learningCount}
                    onChange={(e) => setLearningCount(parseInt(e.target.value, 10))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-500 dark:bg-slate-600"
                  />
                  <input
                    type="number"
                    min="1"
                    max={maxCount}
                    value={learningCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= maxCount) {
                        setLearningCount(val);
                      }
                    }}
                    className="w-16 rounded-button border border-gray-300 px-2 py-1 text-center text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartLearning}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-button bg-blue-500 px-4 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-[1.02] hover:bg-blue-600 active:scale-[0.98]"
              >
                <BookOpen size={20} />
                开始学习 {learningCount} 对
              </button>

              <div className="space-y-3">
                {pairs.slice(0, 6).map((pair, index) => (
                  <div
                    key={`${pair.word1.id}-${pair.word2.id}-${index}`}
                    className="flex items-center justify-between rounded-button bg-gray-50 p-3 dark:bg-slate-700/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {pair.word1.spelling}
                      </span>
                      <span className="text-gray-400">vs</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {pair.word2.spelling}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {((1 - pair.distance) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
                {pairs.length > 6 && (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                    还有 {pairs.length - 6} 对...
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConfusionWordsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [threshold, setThreshold] = useState(0.15);
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const [fallbackMode] = useState(false);
  const [wordBookId, setWordBookId] = useState<string | undefined>(undefined);

  const { stats } = useSemanticStats();
  const { data: wordBooks = [] } = useWordBooks();
  const debouncedThreshold = useDebouncedValue(threshold, THRESHOLD_DEBOUNCE_MS);

  const { status: cacheStatus, isLoading: isCacheStatusLoading } = useConfusionCacheStatus(
    stats?.available ?? false,
  );

  // Auto-enable fallback mode when cache is not ready (after status check completes)
  const cacheNotReady = !isCacheStatusLoading && cacheStatus && !cacheStatus.ready;

  const { clusters, isLoading: isClustersLoading } = useConfusionByCluster({
    threshold: debouncedThreshold,
    enabled: (stats?.available ?? false) && (cacheStatus?.ready ?? false) && !fallbackMode,
  });

  // Auto-fallback when clusters loaded but empty, or cache not ready
  const shouldUseFallback =
    fallbackMode || cacheNotReady || (!isClustersLoading && clusters.length === 0);

  // Fallback mode: load pairs directly without clustering
  const { pairs: fallbackPairs, isLoading: isFallbackLoading } = useConfusionPairs({
    wordBookId,
    threshold: debouncedThreshold,
    limit: 30,
    enabled: shouldUseFallback && (stats?.available ?? false),
  });

  const handlePracticePair = (pair: ConfusionPair) => {
    // 收集当前词对 + 其他混淆词作为学习和干扰项来源
    const allConfusionWords = [
      pair.word1,
      pair.word2,
      ...fallbackPairs
        .filter((p) => p.word1.id !== pair.word1.id && p.word2.id !== pair.word2.id)
        .flatMap((p) => [p.word1, p.word2])
        .slice(0, 18), // 限制数量
    ];
    const seedWords = buildSeedWords(allConfusionWords);
    if (seedWords.length === 0) {
      toast.info('暂无可练习的单词');
      return;
    }
    navigate('/', {
      state: {
        seedWords,
        seedSource: 'confusion',
      },
    });
  };

  const handleStartBatch = (pairs: ConfusionPair[], count: number, themeLabel: string) => {
    const selectedPairs = pairs.slice(0, count);
    const seedWords = buildBatchSeedFromPairs(selectedPairs);

    if (seedWords.length === 0) {
      toast.info('暂无可练习的单词');
      return;
    }

    navigate('/', {
      state: {
        seedWords,
        seedSource: 'confusion-batch',
        themeLabel,
        confusionPairs: selectedPairs,
        currentPairIndex: 0,
      },
    });
  };

  const toggleCluster = (clusterId: string) => {
    setExpandedClusterId((prev) => (prev === clusterId ? null : clusterId));
  };

  if (!stats?.available) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="max-w-md px-4 text-center">
          <Warning size={64} className="mx-auto mb-4 text-gray-400" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">功能不可用</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            向量服务未启用，无法使用易混淆词检测功能
          </p>
          <button
            onClick={() => navigate(-1)}
            className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen animate-g3-fade-in bg-gray-50 px-4 py-8 dark:bg-slate-900">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              aria-label="返回"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">易混淆词学习</h1>
          </div>
        </div>

        <div className="mb-6 rounded-card border border-gray-200/60 bg-white/80 p-5 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            相似度阈值: {threshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.05"
            max="0.25"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-500 dark:bg-slate-700"
          />
          <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>更严格 (0.05)</span>
            <span>更宽松 (0.25)</span>
          </div>
        </div>

        {shouldUseFallback ? (
          // Fallback mode: show pairs list without clustering
          <div className="space-y-4">
            {cacheNotReady && !fallbackMode && (
              <div className="rounded-card border border-blue-200 bg-blue-50/80 p-3 text-sm shadow-soft backdrop-blur-sm dark:border-blue-700/50 dark:bg-blue-900/20">
                <p className="text-blue-700 dark:text-blue-200">
                  主题聚类缓存尚未生成，当前显示全局易混淆词对
                </p>
              </div>
            )}

            {/* Wordbook selector for fallback mode */}
            <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                选择词书范围
              </label>
              <select
                value={wordBookId ?? ''}
                onChange={(e) => setWordBookId(e.target.value || undefined)}
                className="w-full rounded-button border border-gray-300 bg-white px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">全部词库</option>
                {wordBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.name} ({book.wordCount} 词)
                  </option>
                ))}
              </select>
              {stats && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  向量覆盖: {stats.embeddedCount ?? 0} / {stats.totalCount ?? 0} 词
                </p>
              )}
            </div>
            {isFallbackLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" color="primary" />
              </div>
            ) : fallbackPairs.length === 0 ? (
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-8 text-center shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <p className="text-gray-500 dark:text-gray-400">未找到相似度在此阈值范围内的词对</p>
                <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                  尝试调整阈值或确保词库已生成向量
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {fallbackPairs.map((pair, index) => (
                  <ConfusionPairCard
                    key={`${pair.word1.id}-${pair.word2.id}-${index}`}
                    pair={pair}
                    onPractice={handlePracticePair}
                  />
                ))}
              </div>
            )}
          </div>
        ) : isClustersLoading ? (
          <ThemeCardSkeleton count={5} />
        ) : (
          <div className="space-y-4">
            {clusters.map((cluster) => (
              <ThemeCard
                key={cluster.clusterId}
                cluster={cluster}
                threshold={debouncedThreshold}
                isExpanded={expandedClusterId === cluster.clusterId}
                onToggle={() => toggleCluster(cluster.clusterId)}
                onStartBatch={handleStartBatch}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
