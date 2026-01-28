import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiClient from '../services/client';
import { handleError } from '../utils/errorHandler';
import { TimePreference, GoldenTimeResult, isInsufficientData } from '../types/amas-enhanced';
import {
  Clock,
  Star,
  Warning,
  ChartBar,
  Sparkle,
  Coffee,
  Lightbulb,
  Sun,
  Moon,
  Calendar,
} from '../components/Icon';
import { Spinner } from '../components/ui/Spinner';

/**
 * LearningTimePage - 智能学习时机推荐页面
 * 显示24小时时间偏好分布图、黄金学习时间徽章、数据不足提示
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */
export default function LearningTimePage() {
  const navigate = useNavigate();
  const [timePreference, setTimePreference] = useState<TimePreference | null>(null);
  const [goldenTime, setGoldenTime] = useState<(GoldenTimeResult & { message: string }) | null>(
    null,
  );
  const [insufficientData, setInsufficientData] = useState<{
    minRequired: number;
    currentCount: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 并行获取时间偏好和黄金时间
      const [prefResponse, goldenResponse] = await Promise.all([
        ApiClient.getTimePreferences(),
        ApiClient.getGoldenTime(),
      ]);

      // 检查是否数据不足
      if (isInsufficientData(prefResponse)) {
        setInsufficientData({
          minRequired: prefResponse.minRequired,
          currentCount: prefResponse.currentCount,
        });
        setTimePreference(null);
      } else {
        setTimePreference(prefResponse);
        setInsufficientData(null);
      }

      setGoldenTime(goldenResponse);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 获取小时对应的时段图标
  const getTimeIcon = (hour: number) => {
    if (hour >= 6 && hour < 12) return Sun;
    if (hour >= 12 && hour < 18) return Coffee;
    if (hour >= 18 && hour < 22) return Lightbulb;
    return Moon;
  };

  // 获取小时对应的时段名称
  const getTimePeriod = (hour: number) => {
    if (hour >= 6 && hour < 12) return '上午';
    if (hour >= 12 && hour < 14) return '中午';
    if (hour >= 14 && hour < 18) return '下午';
    if (hour >= 18 && hour < 22) return '晚上';
    return '深夜';
  };

  // 格式化小时显示
  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  // 获取柱状图颜色
  const getBarColor = (score: number, isGolden: boolean) => {
    if (isGolden) return 'bg-yellow-400';
    if (score >= 0.7) return 'bg-green-500';
    if (score >= 0.4) return 'bg-blue-500';
    return 'bg-gray-300 dark:bg-slate-600';
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-gray-400">正在分析学习时间偏好...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">出错了</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button
            onClick={loadData}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl animate-g3-fade-in px-4 py-8">
        {/* 页面标题 */}
        <header className="mb-8">
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <Clock size={32} color="#3b82f6" />
            学习时间分析
          </h1>
          <p className="text-gray-600 dark:text-gray-400">了解你的最佳学习时段，提高学习效率</p>
        </header>

        {/* 黄金学习时间徽章 */}
        {goldenTime && (
          <div
            className={`mb-8 rounded-card border-2 p-6 transition-all duration-g3-normal ${
              goldenTime.isGolden
                ? 'border-yellow-300 bg-gradient-to-r from-yellow-50 to-orange-50 shadow-elevated dark:border-yellow-600 dark:from-yellow-900/30 dark:to-orange-900/30'
                : 'border-gray-200 bg-white/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80'
            } `}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full ${
                  goldenTime.isGolden
                    ? 'animate-pulse bg-yellow-400'
                    : 'bg-gray-100 dark:bg-slate-700'
                } `}
              >
                {goldenTime.isGolden ? (
                  <Star size={32} color="#ffffff" />
                ) : (
                  <Clock size={32} color="#6b7280" />
                )}
              </div>
              <div className="flex-1">
                <h2
                  className={`text-xl font-bold ${goldenTime.isGolden ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-700 dark:text-gray-300'} flex items-center gap-1`}
                >
                  {goldenTime.isGolden ? (
                    <>
                      <Sparkle size={20} className="text-yellow-500" /> 黄金学习时间！
                    </>
                  ) : (
                    '当前时间'
                  )}
                </h2>
                <p
                  className={
                    goldenTime.isGolden
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }
                >
                  {goldenTime.message}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  当前时间: {formatHour(goldenTime.currentHour)}
                </p>
              </div>
              {goldenTime.isGolden && goldenTime.matchedSlot && (
                <div className="text-right">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">学习效率</p>
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                    {Math.round(goldenTime.matchedSlot.score * 100)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 数据不足提示 */}
        {insufficientData && (
          <div className="mb-8 rounded-card border-2 border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-800 dark:bg-blue-900/20">
            <ChartBar size={64} color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="mb-2 text-xl font-bold text-blue-800 dark:text-blue-300">数据收集中</h2>
            <p className="mb-4 text-blue-600 dark:text-blue-300">
              需要至少 <span className="font-bold">{insufficientData.minRequired}</span>{' '}
              次学习会话才能分析时间偏好
            </p>
            <div className="mx-auto mb-2 h-4 w-full max-w-xs rounded-full bg-blue-200 dark:bg-blue-800">
              <div
                className="h-4 rounded-full bg-blue-500 transition-all duration-g3-slow"
                style={{
                  width: `${Math.min((insufficientData.currentCount / insufficientData.minRequired) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="text-sm text-blue-500 dark:text-blue-400">
              当前进度: {insufficientData.currentCount} / {insufficientData.minRequired}
            </p>
            <button
              onClick={() => navigate('/learning')}
              className="mt-6 rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              开始学习
            </button>
          </div>
        )}

        {/* 时间偏好分析 */}
        {timePreference && (
          <>
            {/* 推荐时间段 */}
            <div className="mb-8 rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                <Sparkle size={24} color="#a855f7" />
                推荐学习时段
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {timePreference.preferredSlots.map((slot, index) => {
                  const TimeIcon = getTimeIcon(slot.hour);
                  return (
                    <div
                      key={slot.hour}
                      className={`rounded-card border-2 p-4 transition-all duration-g3-fast hover:scale-105 ${
                        index === 0
                          ? 'border-yellow-300 bg-gradient-to-br from-yellow-50 to-orange-50 dark:border-yellow-600 dark:from-yellow-900/30 dark:to-orange-900/30'
                          : 'border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800'
                      } `}
                    >
                      <div className="mb-2 flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${index === 0 ? 'bg-yellow-400' : 'bg-gray-200 dark:bg-slate-700'} `}
                        >
                          <TimeIcon size={20} color={index === 0 ? '#ffffff' : '#6b7280'} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {formatHour(slot.hour)}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {getTimePeriod(slot.hour)}
                          </p>
                        </div>
                        {index === 0 && (
                          <span className="ml-auto rounded-full bg-yellow-400 px-2 py-1 text-xs font-bold text-yellow-900">
                            最佳
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">学习效率</span>
                        <span
                          className={`font-bold ${index === 0 ? 'text-yellow-700' : 'text-gray-700 dark:text-gray-300'}`}
                        >
                          {Math.round(slot.score * 100)}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700">
                        <div
                          className={`h-2 rounded-full transition-all duration-g3-slow ${index === 0 ? 'bg-yellow-400' : 'bg-blue-500'}`}
                          style={{ width: `${slot.score * 100}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        置信度: {Math.round(slot.confidence * 100)}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 24小时分布图 */}
            <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <ChartBar size={24} color="#3b82f6" />
                  {viewMode === 'day' ? '24小时学习效率分布' : '每周学习效率分布'}
                </h2>
                <div className="flex items-center gap-3">
                  <div className="flex rounded-button border border-gray-200 bg-gray-50 p-0.5 dark:border-slate-600 dark:bg-slate-700">
                    <button
                      onClick={() => setViewMode('day')}
                      className={`flex items-center gap-1 rounded-button px-3 py-1 text-sm transition-all duration-g3-fast ${
                        viewMode === 'day'
                          ? 'bg-white text-blue-600 shadow-soft dark:bg-slate-600 dark:text-blue-400'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      <Clock size={14} />日
                    </button>
                    <button
                      onClick={() => setViewMode('week')}
                      className={`flex items-center gap-1 rounded-button px-3 py-1 text-sm transition-all duration-g3-fast ${
                        viewMode === 'week'
                          ? 'bg-white text-blue-600 shadow-soft dark:bg-slate-600 dark:text-blue-400'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      <Calendar size={14} />周
                    </button>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    基于 {timePreference.sampleCount} 次学习记录
                  </span>
                </div>
              </div>

              {viewMode === 'day' ? (
                <>
                  {/* 柱状图 */}
                  <div className="relative">
                    <div className="mb-2 flex h-48 items-end justify-between gap-1">
                      {timePreference.timePref.map((score, hour) => {
                        const isGoldenHour = timePreference.preferredSlots.some(
                          (s) => s.hour === hour,
                        );
                        const isCurrentHour = goldenTime?.currentHour === hour;
                        return (
                          <div
                            key={hour}
                            className="group relative flex flex-1 flex-col items-center"
                          >
                            {/* 悬停提示 */}
                            <div className="absolute bottom-full z-10 mb-2 opacity-0 transition-opacity duration-g3-fast group-hover:opacity-100">
                              <div className="whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white dark:bg-slate-700">
                                {formatHour(hour)}: {Math.round(score * 100)}%
                              </div>
                            </div>
                            {/* 柱子 */}
                            <div
                              className={`w-full cursor-pointer rounded-t transition-all duration-g3-normal hover:opacity-80 ${getBarColor(score, isGoldenHour)} ${isCurrentHour ? 'ring-2 ring-blue-500 ring-offset-2' : ''} `}
                              style={{ height: `${Math.max(score * 100, 4)}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* X轴标签 */}
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      {[0, 6, 12, 18, 23].map((hour) => (
                        <span key={hour}>{formatHour(hour)}</span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-48 items-center justify-center text-gray-500 dark:text-gray-400">
                  <div className="text-center">
                    <Calendar size={48} className="mx-auto mb-2 opacity-50" />
                    <p>周视图开发中...</p>
                  </div>
                </div>
              )}

              {/* 图例 */}
              <div className="mt-6 flex items-center justify-center gap-6 border-t border-gray-200 pt-4 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-yellow-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">推荐时段</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-green-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">高效时段</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-blue-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">一般时段</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-gray-300" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">低效时段</span>
                </div>
              </div>

              {/* 置信度说明 */}
              <div className="mt-4 rounded-card bg-gray-50 p-4 dark:bg-slate-900">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">分析置信度:</span>{' '}
                  {Math.round(timePreference.confidence * 100)}%
                  {timePreference.confidence < 0.7 && (
                    <span className="ml-2 text-yellow-600">(继续学习可提高分析准确度)</span>
                  )}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
