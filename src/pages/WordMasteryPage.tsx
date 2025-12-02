import React, { useState, useEffect } from 'react';
import { TrendingUp, Award, BookOpen, Target } from 'lucide-react';
import apiClient from '../services/ApiClient';
import ProgressBarChart from '../components/ProgressBarChart';
import type { UserMasteryStats } from '../types/word-mastery';

const WordMasteryPage: React.FC = () => {
  const [stats, setStats] = useState<UserMasteryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMasteryStats();
  }, []);

  const loadMasteryStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getWordMasteryStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载掌握度数据失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || '数据加载失败'}</p>
          <button
            onClick={loadMasteryStats}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const progressData = [
    {
      label: '已学会',
      value: stats.masteredWords,
      maxValue: stats.totalWords,
      color: 'bg-green-500'
    },
    {
      label: '学习中',
      value: stats.learningWords,
      maxValue: stats.totalWords,
      color: 'bg-yellow-500'
    },
    {
      label: '未开始',
      value: stats.newWords,
      maxValue: stats.totalWords,
      color: 'bg-gray-400'
    }
  ];

  const masteryRate = stats.totalWords > 0
    ? ((stats.masteredWords / stats.totalWords) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Award className="text-blue-600" size={32} />
            单词掌握度分析
          </h1>
          <p className="text-gray-600">追踪你的学习进度和掌握情况</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">总单词数</h3>
              <BookOpen className="text-blue-500" size={20} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.totalWords}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">已学会</h3>
              <Award className="text-green-500" size={20} />
            </div>
            <p className="text-3xl font-bold text-green-600">{stats.masteredWords}</p>
            <p className="text-sm text-gray-500 mt-1">{masteryRate}%</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">学习中</h3>
              <TrendingUp className="text-yellow-500" size={20} />
            </div>
            <p className="text-3xl font-bold text-yellow-600">{stats.learningWords}</p>
            <p className="text-sm text-gray-500 mt-1">
              {stats.totalWords > 0 ? ((stats.learningWords / stats.totalWords) * 100).toFixed(1) : 0}%
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">需要复习</h3>
              <Target className="text-purple-500" size={20} />
            </div>
            <p className="text-3xl font-bold text-purple-600">{stats.needReviewCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">掌握度分布</h2>
            <ProgressBarChart data={progressData} height={48} />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">学习指标</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">平均掌握度评分</span>
                <span className="text-lg font-semibold text-gray-900">
                  {(stats.averageScore * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">平均ACT-R提取概率</span>
                <span className="text-lg font-semibold text-blue-600">
                  {(stats.averageRecall * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">需要复习单词</span>
                <span className="text-lg font-semibold text-orange-600">{stats.needReviewCount}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-600">未学习单词</span>
                <span className="text-lg font-semibold text-gray-600">{stats.newWords}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">💡 关于掌握度分析</h4>
          <p className="text-sm text-blue-700">
            掌握度评分基于 AMAS 自适应学习算法，综合考虑 SRS 等级、ACT-R 提取概率和最近答题准确率。
            ACT-R 提取概率反映了你能够回忆单词的可能性。系统会自动识别需要复习的单词并优先推送。
          </p>
        </div>
      </div>
    </div>
  );
};

export default WordMasteryPage;
