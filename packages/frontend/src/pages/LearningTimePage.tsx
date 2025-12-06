import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiClient from '../services/ApiClient';
import { handleError } from '../utils/errorHandler';
import {
  TimePreference,
  GoldenTimeResult,
  isInsufficientData
} from '../types/amas-enhanced';
import {
  Clock,
  Star,
  Warning,
  CircleNotch,
  ChartBar,
  Sparkle,
  Coffee,
  Lightbulb,
  Sun,
  Moon
} from '../components/Icon';

/**
 * LearningTimePage - 智能学习时机推荐页面
 * 显示24小时时间偏好分布图、黄金学习时间徽章、数据不足提示
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */
export default function LearningTimePage() {
  const navigate = useNavigate();
  const [timePreference, setTimePreference] = useState<TimePreference | null>(null);
  const [goldenTime, setGoldenTime] = useState<GoldenTimeResult & { message: string } | null>(null);
  const [insufficientData, setInsufficientData] = useState<{ minRequired: number; currentCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        ApiClient.getGoldenTime()
      ]);

      // 检查是否数据不足
      if (isInsufficientData(prefResponse)) {
        setInsufficientData({
          minRequired: prefResponse.minRequired,
          currentCount: prefResponse.currentCount
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
    return 'bg-gray-300';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600">正在分析学习时间偏好...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center max-w-md px-4" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 animate-g3-fade-in">
        {/* 页面标题 */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Clock size={32} weight="duotone" color="#3b82f6" />
            学习时间分析
          </h1>
          <p className="text-gray-600">了解你的最佳学习时段，提高学习效率</p>
        </header>

        {/* 黄金学习时间徽章 */}
        {goldenTime && (
          <div className={`
            mb-8 p-6 rounded-2xl border-2 transition-all duration-300
            ${goldenTime.isGolden
              ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300 shadow-lg'
              : 'bg-white/80 backdrop-blur-sm border-gray-200'
            }
          `}>
            <div className="flex items-center gap-4">
              <div className={`
                w-16 h-16 rounded-full flex items-center justify-center
                ${goldenTime.isGolden
                  ? 'bg-yellow-400 animate-pulse'
                  : 'bg-gray-100'
                }
              `}>
                {goldenTime.isGolden ? (
                  <Star size={32} weight="fill" color="#ffffff" />
                ) : (
                  <Clock size={32} weight="duotone" color="#6b7280" />
                )}
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${goldenTime.isGolden ? 'text-yellow-700' : 'text-gray-700'} flex items-center gap-1`}>
                  {goldenTime.isGolden ? <><Sparkle size={20} weight="fill" className="text-yellow-500" /> 黄金学习时间！</> : '当前时间'}
                </h2>
                <p className={goldenTime.isGolden ? 'text-yellow-600' : 'text-gray-500'}>
                  {goldenTime.message}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  当前时间: {formatHour(goldenTime.currentHour)}
                </p>
              </div>
              {goldenTime.isGolden && goldenTime.matchedSlot && (
                <div className="text-right">
                  <p className="text-sm text-yellow-600">学习效率</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {Math.round(goldenTime.matchedSlot.score * 100)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 数据不足提示 */}
        {insufficientData && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-8 text-center mb-8">
            <ChartBar size={64} weight="duotone" color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="text-xl font-bold text-blue-800 mb-2">数据收集中</h2>
            <p className="text-blue-600 mb-4">
              需要至少 <span className="font-bold">{insufficientData.minRequired}</span> 次学习会话才能分析时间偏好
            </p>
            <div className="w-full max-w-xs mx-auto bg-blue-200 rounded-full h-4 mb-2">
              <div
                className="bg-blue-500 h-4 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((insufficientData.currentCount / insufficientData.minRequired) * 100, 100)}%` }}
              />
            </div>
            <p className="text-sm text-blue-500">
              当前进度: {insufficientData.currentCount} / {insufficientData.minRequired}
            </p>
            <button
              onClick={() => navigate('/learning')}
              className="mt-6 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              开始学习
            </button>
          </div>
        )}

        {/* 时间偏好分析 */}
        {timePreference && (
          <>
            {/* 推荐时间段 */}
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 mb-8 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Sparkle size={24} weight="duotone" color="#a855f7" />
                推荐学习时段
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {timePreference.preferredSlots.map((slot, index) => {
                  const TimeIcon = getTimeIcon(slot.hour);
                  return (
                    <div
                      key={slot.hour}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-200 hover:scale-105
                        ${index === 0
                          ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-300'
                          : 'bg-gray-50 border-gray-200'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center
                          ${index === 0 ? 'bg-yellow-400' : 'bg-gray-200'}
                        `}>
                          <TimeIcon size={20} weight="fill" color={index === 0 ? '#ffffff' : '#6b7280'} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{formatHour(slot.hour)}</p>
                          <p className="text-sm text-gray-500">{getTimePeriod(slot.hour)}</p>
                        </div>
                        {index === 0 && (
                          <span className="ml-auto px-2 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
                            最佳
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-sm text-gray-600">学习效率</span>
                        <span className={`font-bold ${index === 0 ? 'text-yellow-700' : 'text-gray-700'}`}>
                          {Math.round(slot.score * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${index === 0 ? 'bg-yellow-400' : 'bg-blue-500'}`}
                          style={{ width: `${slot.score * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        置信度: {Math.round(slot.confidence * 100)}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 24小时分布图 */}
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ChartBar size={24} weight="duotone" color="#3b82f6" />
                  24小时学习效率分布
                </h2>
                <div className="text-sm text-gray-500">
                  基于 {timePreference.sampleCount} 次学习记录
                </div>
              </div>

              {/* 柱状图 */}
              <div className="relative">
                <div className="flex items-end justify-between gap-1 h-48 mb-2">
                  {timePreference.timePref.map((score, hour) => {
                    const isGoldenHour = timePreference.preferredSlots.some(s => s.hour === hour);
                    const isCurrentHour = goldenTime?.currentHour === hour;
                    return (
                      <div
                        key={hour}
                        className="flex-1 flex flex-col items-center group relative"
                      >
                        {/* 悬停提示 */}
                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                          <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            {formatHour(hour)}: {Math.round(score * 100)}%
                          </div>
                        </div>
                        {/* 柱子 */}
                        <div
                          className={`
                            w-full rounded-t transition-all duration-300 cursor-pointer
                            hover:opacity-80
                            ${getBarColor(score, isGoldenHour)}
                            ${isCurrentHour ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                          `}
                          style={{ height: `${Math.max(score * 100, 4)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* X轴标签 */}
                <div className="flex justify-between text-xs text-gray-500">
                  {[0, 6, 12, 18, 23].map(hour => (
                    <span key={hour}>{formatHour(hour)}</span>
                  ))}
                </div>
              </div>

              {/* 图例 */}
              <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-400" />
                  <span className="text-sm text-gray-600">推荐时段</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500" />
                  <span className="text-sm text-gray-600">高效时段</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-500" />
                  <span className="text-sm text-gray-600">一般时段</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-gray-300" />
                  <span className="text-sm text-gray-600">低效时段</span>
                </div>
              </div>

              {/* 置信度说明 */}
              <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">分析置信度:</span> {Math.round(timePreference.confidence * 100)}%
                  {timePreference.confidence < 0.7 && (
                    <span className="text-yellow-600 ml-2">
                      (继续学习可提高分析准确度)
                    </span>
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
