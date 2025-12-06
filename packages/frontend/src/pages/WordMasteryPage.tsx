import React, { useState, useEffect } from 'react';
import { ChartBar, Warning, MagnifyingGlass } from '@phosphor-icons/react';
import apiClient from '../services/ApiClient';
import type { UserMasteryStats, MasteryEvaluation } from '../types/word-mastery';
import { MasteryStatsCard } from '../components/word-mastery/MasteryStatsCard';
import { MasteryWordItem } from '../components/word-mastery/MasteryWordItem';
import { WordMasteryDetailModal } from '../components/word-mastery/WordMasteryDetailModal';
import { learningLogger } from '../utils/logger';

interface WordWithMastery {
  id: string;
  spelling: string;
  meanings: string;
  mastery: MasteryEvaluation | null;
}

type FilterType = 'all' | 'mastered' | 'learning' | 'review';

const WordMasteryPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UserMasteryStats | null>(null);
  const [words, setWords] = useState<WordWithMastery[]>([]);
  const [filteredWords, setFilteredWords] = useState<WordWithMastery[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load stats
      const statsData = await apiClient.getWordMasteryStats();
      setStats(statsData);

      // Load learned words only (words with learning records)
      const wordsData = await apiClient.getLearnedWords();

      // Batch load mastery data
      const wordIds = wordsData.map(w => w.id);
      const batchSize = 100;
      const masteryDataArray: MasteryEvaluation[] = [];

      for (let i = 0; i < wordIds.length; i += batchSize) {
        const batch = wordIds.slice(i, i + batchSize);
        const batchMastery = await apiClient.batchProcessWordMastery(batch);
        masteryDataArray.push(...batchMastery);
      }

      // Convert to map
      const masteryMap: Record<string, MasteryEvaluation> = {};
      masteryDataArray.forEach(m => {
        masteryMap[m.wordId] = m;
      });

      // Combine words with mastery data
      const wordsWithMastery: WordWithMastery[] = wordsData.map(word => ({
        id: word.id,
        spelling: word.spelling,
        meanings: word.meanings.join('; '),
        mastery: masteryMap[word.id] || null
      }));

      setWords(wordsWithMastery);
      setFilteredWords(wordsWithMastery);
    } catch (err) {
      setError('加载数据失败，请稍后重试');
      learningLogger.error({ err }, '加载单词掌握度数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let result = [...words];

    // Apply filter
    if (filter !== 'all') {
      result = result.filter(word => {
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
        word =>
          word.spelling.toLowerCase().includes(query) ||
          word.meanings.toLowerCase().includes(query)
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <Warning size={48} className="mx-auto text-red-400 mb-4" />
          <p className="text-gray-600">{error}</p>
          <button onClick={loadData} className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-lg">
            重试
          </button>
        </div>
      </div>
    );
  }

  const hasData = words.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ChartBar className="text-purple-500" weight="duotone" />
            单词掌握度分析
          </h1>
          <p className="text-sm text-gray-500 mt-1">查看您的单词学习进度和记忆强度</p>
        </div>

        {!hasData ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ChartBar size={32} className="text-purple-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">暂无学习记录</h3>
            <p className="text-gray-500">开始学习后，这里会显示你的单词掌握度分析</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Filter Tabs */}
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'all' as const, label: '全部' },
                    { value: 'mastered' as const, label: '已掌握' },
                    { value: 'learning' as const, label: '学习中' },
                    { value: 'review' as const, label: '需复习' }
                  ].map(tab => (
                    <button
                      key={tab.value}
                      onClick={() => setFilter(tab.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                <div className="flex-1 md:max-w-xs ml-auto">
                  <div className="relative">
                    <MagnifyingGlass
                      size={20}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="搜索单词..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Results count */}
              <div className="mt-4 text-sm text-gray-500">
                共 {filteredWords.length} 个单词
              </div>
            </div>

            {/* Word List */}
            <div className="space-y-3">
              {filteredWords.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
                  <p className="text-gray-500">没有找到匹配的单词</p>
                </div>
              ) : (
                filteredWords.map(word => (
                  <div key={word.id} onClick={() => handleWordClick(word.id)} className="cursor-pointer">
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
