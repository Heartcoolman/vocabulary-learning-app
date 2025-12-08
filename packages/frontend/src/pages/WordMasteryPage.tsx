import React, { useState, useEffect } from 'react';
import { ChartBar, Warning, MagnifyingGlass } from '@phosphor-icons/react';
import { useMasteryWords } from '../hooks/queries/useMasteryWords';
import type { MasteryEvaluation } from '../types/word-mastery';
import { MasteryStatsCard } from '../components/word-mastery/MasteryStatsCard';
import { MasteryWordItem } from '../components/word-mastery/MasteryWordItem';
import { WordMasteryDetailModal } from '../components/word-mastery/WordMasteryDetailModal';

interface WordWithMastery {
  id: string;
  spelling: string;
  meanings: string;
  mastery: MasteryEvaluation | null;
}

type FilterType = 'all' | 'mastered' | 'learning' | 'review';

const WordMasteryPage: React.FC = () => {
  // 使用React Query hooks
  const { words, stats, loading, error, refetch } = useMasteryWords();

  const [filteredWords, setFilteredWords] = useState(words);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let result = [...words];

    // Apply filter
    if (filter !== 'all') {
      result = result.filter((word) => {
        if (!word.mastery) return filter === 'learning';

        switch (filter) {
          case 'mastered':
            return word.mastery.isLearned;
          case 'learning':
            return !word.mastery.isLearned && word.mastery.score >= 0.4;
          case 'review':
            return !word.mastery.isLearned && word.mastery.score < 0.4;
          default:
            return true;
        }
      });
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (word) =>
          word.spelling.toLowerCase().includes(query) ||
          word.meanings.toLowerCase().includes(query),
      );
    }

    setFilteredWords(result);
  }, [filter, searchQuery, words]);

  const handleWordClick = (wordId: string) => {
    setSelectedWordId(wordId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedWordId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-purple-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <Warning size={48} className="mx-auto mb-4 text-red-400" />
          <p className="text-gray-600">{error}</p>
          <button onClick={() => refetch()} className="mt-4 rounded-lg bg-purple-500 px-4 py-2 text-white">
            重试
          </button>
        </div>
      </div>
    );
  }

  const hasData = words.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            <ChartBar className="text-purple-500" weight="duotone" />
            单词掌握度分析
          </h1>
          <p className="mt-1 text-sm text-gray-500">查看您的单词学习进度和记忆强度</p>
        </div>

        {!hasData ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-50">
              <ChartBar size={32} className="text-purple-400" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-gray-800">暂无学习记录</h3>
            <p className="text-gray-500">开始学习后，这里会显示你的单词掌握度分析</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                <MasteryStatsCard
                  label="已掌握"
                  value={stats.masteredWords || 0}
                  icon="mastered"
                  color="green"
                />
                <MasteryStatsCard
                  label="学习中"
                  value={stats.learningWords || 0}
                  icon="learning"
                  color="blue"
                />
                <MasteryStatsCard
                  label="需复习"
                  value={stats.needReviewCount || 0}
                  icon="review"
                  color="orange"
                />
                <MasteryStatsCard
                  label="总词汇量"
                  value={stats.totalWords || words.length}
                  icon="total"
                  color="purple"
                />
              </div>
            )}

            {/* Filters and Search */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row">
                {/* Filter Tabs */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all' as const, label: '全部' },
                    { value: 'mastered' as const, label: '已掌握' },
                    { value: 'learning' as const, label: '学习中' },
                    { value: 'review' as const, label: '需复习' },
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => setFilter(tab.value)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        filter === tab.value
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="ml-auto flex-1 md:max-w-xs">
                  <div className="relative">
                    <MagnifyingGlass
                      size={20}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="搜索单词..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Results count */}
              <div className="mt-4 text-sm text-gray-500">共 {filteredWords.length} 个单词</div>
            </div>

            {/* Word List */}
            <div className="space-y-3">
              {filteredWords.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
                  <p className="text-gray-500">没有找到匹配的单词</p>
                </div>
              ) : (
                filteredWords.map((word) => (
                  <div
                    key={word.id}
                    onClick={() => handleWordClick(word.id)}
                    className="cursor-pointer"
                  >
                    <MasteryWordItem
                      wordId={word.id}
                      spelling={word.spelling}
                      meanings={word.meanings}
                      mastery={word.mastery}
                    />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* 单词详情模态框 */}
      {selectedWordId && (
        <WordMasteryDetailModal
          wordId={selectedWordId}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default WordMasteryPage;
