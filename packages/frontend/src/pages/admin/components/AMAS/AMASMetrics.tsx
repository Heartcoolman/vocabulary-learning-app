import React, { memo } from 'react';
import {
  CircleNotch,
  Warning,
  ArrowClockwise,
  TrendUp,
  TrendDown,
  Minus,
  ChartLine,
} from '../../../../components/Icon';
import type { LearningCurveData } from '../../../../types/explainability';

// ==================== 类型定义 ====================

export interface AMASMetricsProps {
  /** 学习曲线数据 */
  data: LearningCurveData | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 刷新回调 */
  onRefresh: () => void;
  /** 当前选择的天数 */
  days: number;
  /** 天数变化回调 */
  onDaysChange: (days: number) => void;
}

// ==================== 辅助函数 ====================

/**
 * 获取趋势图标
 */
const getTrendIcon = (trend: string): React.ReactNode => {
  switch (trend) {
    case 'up':
      return <TrendUp size={20} weight="bold" className="text-green-500" />;
    case 'down':
      return <TrendDown size={20} weight="bold" className="text-red-500" />;
    default:
      return <Minus size={20} weight="bold" className="text-gray-500" />;
  }
};

/**
 * 获取趋势标签
 */
const getTrendLabel = (trend: string): string => {
  switch (trend) {
    case 'up':
      return '上升趋势';
    case 'down':
      return '下降趋势';
    default:
      return '平稳';
  }
};

// ==================== 子组件 ====================

/**
 * 统计摘要卡片
 */
const StatSummaryCard = memo(function StatSummaryCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className={`rounded-button ${colorClass} p-4`}>
      <p className="mb-1 text-sm text-gray-600">{label}</p>
      <p
        className={`text-3xl font-bold ${colorClass.includes('blue') ? 'text-blue-600' : colorClass.includes('green') ? 'text-green-600' : 'text-purple-600'}`}
      >
        {value}
      </p>
    </div>
  );
});

/**
 * 趋势卡片
 */
const TrendCard = memo(function TrendCard({ trend }: { trend: string }) {
  return (
    <div className="flex items-center justify-between rounded-button bg-purple-50 p-4">
      <div>
        <p className="mb-1 text-sm text-gray-600">趋势</p>
        <p className="text-lg font-bold text-purple-600">{getTrendLabel(trend)}</p>
      </div>
      {getTrendIcon(trend)}
    </div>
  );
});

/**
 * 掌握度进度条
 */
const MasteryProgressBar = memo(function MasteryProgressBar({
  date,
  mastery,
}: {
  date: string;
  mastery: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-gray-500">
        {new Date(date).toLocaleDateString('zh-CN', {
          month: 'short',
          day: 'numeric',
        })}
      </span>
      <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-g3-normal"
          style={{ width: `${mastery * 100}%` }}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-700">
          {(mastery * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
});

/**
 * 迷你趋势图
 */
const MiniTrendChart = memo(function MiniTrendChart({
  label,
  data,
  colorClass,
}: {
  label: string;
  data: number[];
  colorClass: string;
}) {
  return (
    <div className="rounded-button bg-gray-50 p-3">
      <p className="mb-2 text-xs text-gray-600">{label}</p>
      <div className="flex h-16 items-end gap-1">
        {data.map((value, idx) => (
          <div
            key={idx}
            className={`flex-1 rounded-t ${colorClass} transition-all duration-g3-normal`}
            style={{ height: `${value * 100}%` }}
            title={`${(value * 100).toFixed(0)}%`}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * 天数选择器
 */
const DaysSelector = memo(function DaysSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-button border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value={7}>最近 7 天</option>
      <option value={14}>最近 14 天</option>
      <option value={30}>最近 30 天</option>
      <option value={60}>最近 60 天</option>
    </select>
  );
});

// ==================== 主组件 ====================

/**
 * AMAS 指标展示组件 - 学习曲线图表
 * 追踪用户的掌握度变化趋势，帮助了解学习进度
 */
function AMASMetricsComponent({
  data,
  isLoading,
  error,
  onRefresh,
  days,
  onDaysChange,
}: AMASMetricsProps) {
  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
      {/* 标题栏 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <ChartLine size={24} weight="duotone" className="text-blue-500" />
          学习曲线
        </h2>
        <div className="flex items-center gap-2">
          <DaysSelector value={days} onChange={onDaysChange} />
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="rounded-button p-2 transition-all hover:bg-gray-100 disabled:opacity-50"
            title="刷新"
          >
            <ArrowClockwise size={20} weight="bold" className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
        </div>
      ) : error ? (
        /* 错误状态 */
        <div className="py-8 text-center text-gray-500">
          <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      ) : data ? (
        /* 数据展示 */
        <div className="space-y-6">
          {/* 统计摘要 */}
          <div className="grid gap-4 md:grid-cols-3">
            <StatSummaryCard
              label="当前掌握度"
              value={`${(data.currentMastery * 100).toFixed(1)}%`}
              colorClass="bg-blue-50"
            />
            <StatSummaryCard
              label="平均注意力"
              value={`${(data.averageAttention * 100).toFixed(1)}%`}
              colorClass="bg-green-50"
            />
            <TrendCard trend={data.trend} />
          </div>

          {/* 掌握度变化图表 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">掌握度变化</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {data.points.map((point, idx) => (
                <MasteryProgressBar
                  key={idx}
                  date={point.date}
                  mastery={point.mastery ?? point.masteredCount ?? 0}
                />
              ))}
            </div>
          </div>

          {/* 状态趋势 */}
          {data.points.length > 0 && data.points[0].attention !== undefined && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">状态趋势</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <MiniTrendChart
                  label="注意力趋势"
                  data={data.points.slice(-10).map((p) => p.attention ?? 0)}
                  colorClass="bg-green-400"
                />
                <MiniTrendChart
                  label="疲劳度趋势"
                  data={data.points.slice(-10).map((p) => p.fatigue ?? 0)}
                  colorClass="bg-red-400"
                />
                <MiniTrendChart
                  label="动机趋势"
                  data={data.points.slice(-10).map((p) => p.motivation ?? 0)}
                  colorClass="bg-purple-400"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 空状态 */
        <div className="py-8 text-center text-gray-500">暂无学习曲线数据</div>
      )}
    </div>
  );
}

export const AMASMetrics = memo(AMASMetricsComponent);
export default AMASMetrics;
