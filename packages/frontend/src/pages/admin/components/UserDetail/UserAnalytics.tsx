import React, { memo } from 'react';
import { Target, Clock } from '../../../../components/Icon';
import { Flame, CalendarBlank, Lightning, Download } from '@phosphor-icons/react';

export interface HeatmapDataPoint {
  date: string;
  count: number;
  accuracy: number;
}

export interface DailyAccuracyPoint {
  date: string;
  accuracy: number | null;
}

export interface WeakWord {
  wordId: string;
  spelling: string;
  phonetic: string;
  total: number;
  errors: number;
  errorRate: number;
}

export interface LearningPattern {
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
}

export interface AnalyticsData {
  heatmapData: HeatmapDataPoint[];
  hourDistribution: number[];
  peakHours: number[];
  dailyAccuracyTrend: DailyAccuracyPoint[];
  avgResponseTime: number;
  learningPattern: LearningPattern;
  preferredTime: string;
  weakWords: WeakWord[];
}

export interface UserAnalyticsProps {
  analyticsData: AnalyticsData | null;
  isLoading: boolean;
  isExporting: boolean;
  onExport: (format: 'csv' | 'excel') => void;
}

/**
 * UserAnalytics Component
 * 显示用户学习分析，包括热力图、时段分布、准确率趋势、学习模式和薄弱环节
 */
const UserAnalyticsComponent: React.FC<UserAnalyticsProps> = ({
  analyticsData,
  isLoading,
  isExporting,
  onExport,
}) => {
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="text-gray-600">加载学习数据中...</p>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="rounded-card border border-gray-200 bg-white p-12 text-center">
        <CalendarBlank size={64} weight="thin" className="mx-auto mb-4 text-gray-300" />
        <p className="text-lg text-gray-500">暂无学习数据</p>
        <p className="mt-2 text-sm text-gray-400">用户尚未开始学习</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 学习概况卡片 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* 平均响应时间 */}
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <Lightning size={32} weight="duotone" className="text-yellow-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900">
            {analyticsData.avgResponseTime.toFixed(1)}s
          </div>
          <div className="text-sm text-gray-600">平均响应时间</div>
        </div>

        {/* 学习偏好时段 */}
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <Clock size={32} weight="duotone" className="text-indigo-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900">
            {analyticsData.preferredTime === 'morning' && '上午'}
            {analyticsData.preferredTime === 'afternoon' && '下午'}
            {analyticsData.preferredTime === 'evening' && '傍晚'}
            {analyticsData.preferredTime === 'night' && '深夜'}
            {analyticsData.preferredTime === 'unknown' && '未知'}
          </div>
          <div className="text-sm text-gray-600">学习偏好时段</div>
        </div>

        {/* 最活跃时段 */}
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <Flame size={32} weight="duotone" className="text-orange-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900">
            {analyticsData.peakHours.length > 0 ? `${analyticsData.peakHours[0]}:00` : '-'}
          </div>
          <div className="text-sm text-gray-600">最活跃时段</div>
        </div>
      </div>

      {/* 30天学习活动热力图 */}
      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
        <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900">
          <CalendarBlank size={24} weight="duotone" className="text-blue-500" />
          30天学习活动热力图
        </h2>
        <div className="grid grid-cols-10 gap-2">
          {analyticsData.heatmapData.map((day, index) => {
            const maxCount = Math.max(...analyticsData.heatmapData.map((d) => d.count));
            const intensity = maxCount > 0 ? day.count / maxCount : 0;
            const bgColor =
              day.count === 0
                ? 'bg-gray-100'
                : intensity > 0.7
                  ? 'bg-green-600'
                  : intensity > 0.4
                    ? 'bg-green-400'
                    : 'bg-green-200';

            return (
              <div
                key={index}
                className={`aspect-square ${bgColor} rounded transition-all hover:scale-110`}
                title={`${day.date}: ${day.count}次学习, 正确率${(day.accuracy * 100).toFixed(0)}%`}
              />
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <span>少</span>
          <div className="flex gap-1">
            <div className="h-4 w-4 rounded bg-gray-100" />
            <div className="h-4 w-4 rounded bg-green-200" />
            <div className="h-4 w-4 rounded bg-green-400" />
            <div className="h-4 w-4 rounded bg-green-600" />
          </div>
          <span>多</span>
        </div>
      </div>

      {/* 学习时段分布 */}
      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
        <h2 className="mb-6 text-xl font-bold text-gray-900">24小时学习时段分布</h2>
        <div className="flex h-64 items-end gap-1">
          {analyticsData.hourDistribution.map((count, hour) => {
            const maxCount = Math.max(...analyticsData.hourDistribution);
            const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const isPeak = analyticsData.peakHours.includes(hour);

            return (
              <div
                key={hour}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${hour}:00 - ${count}次学习`}
              >
                <div
                  className={`w-full rounded-t transition-all ${
                    isPeak
                      ? 'bg-gradient-to-t from-orange-500 to-orange-400'
                      : 'bg-gradient-to-t from-blue-500 to-blue-400'
                  } hover:opacity-80`}
                  style={{ height: `${height}%` }}
                />
                {hour % 3 === 0 && <span className="text-xs text-gray-500">{hour}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 准确率趋势 */}
      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
        <h2 className="mb-6 text-xl font-bold text-gray-900">每日准确率趋势</h2>
        <div className="flex h-64 items-end gap-2">
          {analyticsData.dailyAccuracyTrend.map((point, index) => (
            <div
              key={index}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${point.date}: ${point.accuracy?.toFixed(1)}%`}
            >
              <div
                className={`w-full rounded-t transition-all ${
                  (point.accuracy || 0) >= 80
                    ? 'bg-gradient-to-t from-green-500 to-green-400'
                    : (point.accuracy || 0) >= 60
                      ? 'bg-gradient-to-t from-yellow-500 to-yellow-400'
                      : 'bg-gradient-to-t from-red-500 to-red-400'
                } hover:opacity-80`}
                style={{ height: `${point.accuracy}%` }}
              />
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-gray-500">
          最近 {analyticsData.dailyAccuracyTrend.length} 天
        </p>
      </div>

      {/* 学习模式分析 */}
      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
        <h2 className="mb-6 text-xl font-bold text-gray-900">学习模式分析</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-button bg-blue-50 p-4 text-center">
            <div className="mb-1 text-2xl font-bold text-blue-600">
              {analyticsData.learningPattern.morning}
            </div>
            <div className="text-sm text-gray-600">上午 (6-12点)</div>
          </div>
          <div className="rounded-button bg-green-50 p-4 text-center">
            <div className="mb-1 text-2xl font-bold text-green-600">
              {analyticsData.learningPattern.afternoon}
            </div>
            <div className="text-sm text-gray-600">下午 (12-18点)</div>
          </div>
          <div className="rounded-button bg-orange-50 p-4 text-center">
            <div className="mb-1 text-2xl font-bold text-orange-600">
              {analyticsData.learningPattern.evening}
            </div>
            <div className="text-sm text-gray-600">傍晚 (18-24点)</div>
          </div>
          <div className="rounded-button bg-purple-50 p-4 text-center">
            <div className="mb-1 text-2xl font-bold text-purple-600">
              {analyticsData.learningPattern.night}
            </div>
            <div className="text-sm text-gray-600">深夜 (0-6点)</div>
          </div>
        </div>
      </div>

      {/* 薄弱环节识别 */}
      {analyticsData.weakWords.length > 0 && (
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900">
            <Target size={24} weight="duotone" className="text-red-500" />
            薄弱环节识别
          </h2>
          <div className="space-y-3">
            {analyticsData.weakWords.map((word, index) => (
              <div
                key={word.wordId}
                className="flex items-center justify-between rounded-button bg-gray-50 p-4 transition-colors hover:bg-gray-100"
              >
                <div className="flex items-center gap-4">
                  <div className="text-lg font-semibold text-gray-400">#{index + 1}</div>
                  <div>
                    <div className="font-medium text-gray-900">{word.spelling}</div>
                    <div className="text-sm text-gray-500">{word.phonetic}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-sm text-gray-500">学习次数</div>
                    <div className="font-semibold text-gray-900">{word.total}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-500">错误次数</div>
                    <div className="font-semibold text-red-600">{word.errors}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-500">错误率</div>
                    <div
                      className={`font-bold ${
                        word.errorRate >= 0.7
                          ? 'text-red-600'
                          : word.errorRate >= 0.5
                            ? 'text-orange-600'
                            : 'text-yellow-600'
                      }`}
                    >
                      {(word.errorRate * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 导出学习报告按钮 */}
      <div className="rounded-card border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="mb-1 text-lg font-semibold text-gray-900">导出学习报告</h3>
            <p className="text-sm text-gray-600">导出包含学习轨迹、行为分析和效果评估的完整报告</p>
          </div>
          <button
            onClick={() => onExport('excel')}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-button bg-blue-600 px-6 py-3 text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={20} weight="bold" />
            <span>{isExporting ? '导出中...' : '导出报告'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const UserAnalytics = memo(UserAnalyticsComponent);
