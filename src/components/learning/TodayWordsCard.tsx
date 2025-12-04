import { useState, useEffect } from 'react';
import { Play, BookOpen, Star, Target, WarningCircle } from '../Icon';
import ApiClient from '../../services/ApiClient';
import { Word } from '../../types/models';
import { learningLogger } from '../../utils/logger';

interface TodayWordsCardProps {
  onStartLearning: (words: Word[]) => void;
}

export default function TodayWordsCard({ onStartLearning }: TodayWordsCardProps) {
  const [todayWords, setTodayWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTodayWords();
  }, []);

  const loadTodayWords = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await ApiClient.getTodayWords();

      // 显示前 10 个单词（后端已经按优先级排序）
      setTodayWords(response.words.slice(0, 10));
    } catch (err) {
      learningLogger.error({ err }, '加载今日推荐单词失败');
      setError('无法加载今日推荐单词，请检查网络连接。');
    } finally {
      setLoading(false);
    }
  };

  const handleStartLearning = () => {
    if (todayWords.length > 0) {
      onStartLearning(todayWords);
    }
  };

  // 根据索引获取优先级指示器颜色（前面的单词优先级更高）
  const getPriorityColor = (index: number) => {
    if (index < 3) return 'bg-red-500'; // 前3个高优先级
    if (index < 6) return 'bg-amber-500'; // 中间3个中优先级
    return 'bg-green-500'; // 其余低优先级
  };

  // 根据索引获取优先级文字
  const getPriorityText = (index: number) => {
    if (index < 3) return '高优先级';
    if (index < 6) return '中优先级';
    return '低优先级';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
        <div className="flex items-start gap-3">
          <WarningCircle size={24} weight="duotone" color="#ef4444" className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-1">加载失败</h3>
            <p className="text-sm text-gray-600 mb-3">{error}</p>
            <button
              onClick={loadTodayWords}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (todayWords.length === 0) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-sm border border-blue-100 p-6">
        <div className="text-center">
          <BookOpen size={48} weight="duotone" color="#3b82f6" className="mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">暂无推荐单词</h3>
          <p className="text-sm text-gray-600">
            请先添加词书或单词，系统将为您智能推荐学习内容
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 头部 */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
              <Target size={24} weight="duotone" />
            </div>
            <div>
              <h3 className="text-xl font-bold">今日推荐单词</h3>
              <p className="text-blue-100 text-sm mt-0.5">
                为您精心挑选的学习内容
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
            <BookOpen size={18} weight="bold" />
            <span className="font-bold text-lg">{todayWords.length}</span>
            <span className="text-xs font-medium">个单词</span>
          </div>
        </div>
      </div>

      {/* 单词列表 */}
      <div className="p-6 max-h-96 overflow-y-auto custom-scrollbar">
        <div className="space-y-3">
          {todayWords.map((word, index) => (
            <div
              key={word.id}
              className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-200"
            >
              {/* 序号 */}
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center font-bold text-sm">
                {index + 1}
              </div>

              {/* 单词信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-gray-900 text-lg truncate">
                    {word.spelling}
                  </h4>
                </div>
                <p className="text-sm text-gray-500 mb-1">
                  {word.phonetic}
                </p>
                <p className="text-sm text-gray-700 truncate">
                  {word.meanings[0]}
                </p>
              </div>

              {/* 优先级指示器 */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${getPriorityColor(index)}`}></div>
                <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                  {getPriorityText(index)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="p-6 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-4">
          {/* 统计信息 */}
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Star size={16} weight="fill" color="#f59e0b" />
              <span className="text-gray-600">
                高优先级: <span className="font-bold text-gray-900">
                  {Math.min(3, todayWords.length)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Target size={16} weight="bold" color="#8b5cf6" />
              <span className="text-gray-600">
                总计: <span className="font-bold text-gray-900">
                  {todayWords.length}
                </span>
              </span>
            </div>
          </div>

          {/* 开始学习按钮 */}
          <button
            onClick={handleStartLearning}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 group"
          >
            <Play size={20} weight="fill" className="group-hover:scale-110 transition-transform" />
            开始学习
          </button>
        </div>
      </div>

      {/* 自定义滚动条样式 */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
