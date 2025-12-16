import React, { useMemo } from 'react';
import { ChartLine } from '../Icon';
import { StateHistoryPoint } from '../../types/amas-enhanced';
import { formatShortDate } from '../../utils/historyUtils';

interface StateHistoryChartProps {
  stateHistory: StateHistoryPoint[];
}

/**
 * renderMetricChart - 渲染单个指标的迷你图表卡片
 */
const MetricChart: React.FC<{
  data: StateHistoryPoint[];
  metric: keyof Omit<StateHistoryPoint, 'date' | 'trendState'>;
  color: string;
  label: string;
}> = React.memo(({ data, metric, color, label }) => {
  const { values, currentValue, change, isPositiveChange, hasChange } = useMemo(() => {
    if (!data || data.length === 0)
      return { values: [], currentValue: 0, change: 0, isPositiveChange: true, hasChange: false };

    const vals = data.map((d) => d[metric] as number);
    const current = vals[vals.length - 1];
    const previous = vals.length > 1 ? vals[0] : current;
    const diff = current - previous;

    // 疲劳度特殊处理：下降是好事
    const isPosMetric = metric !== 'fatigue';
    const isPosChange = isPosMetric ? diff >= 0 : diff <= 0;
    const hasChg = vals.length > 1 && Math.abs(diff) > 0.001;

    return {
      values: vals,
      currentValue: current,
      change: diff,
      isPositiveChange: isPosChange,
      hasChange: hasChg,
    };
  }, [data, metric]);

  // 转换为百分比显示
  const displayValue = (currentValue * 100).toFixed(0);

  // 生成迷你折线图路径（仅当数据>=3天时）
  const { showMiniChart, miniChartPath, chartPoints } = useMemo(() => {
    const show = values.length >= 3;
    if (!show) return { showMiniChart: false, miniChartPath: '', chartPoints: null };

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 0.01; // 避免除以0
    const chartWidth = 100;
    const chartHeight = 24;
    const padding = 2;

    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - ((v - minVal) / range) * (chartHeight - padding * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const startX = padding;
    const startY =
      chartHeight - padding - ((values[0] - minVal) / range) * (chartHeight - padding * 2);
    const endX = chartWidth - padding;
    const endY =
      chartHeight -
      padding -
      ((values[values.length - 1] - minVal) / range) * (chartHeight - padding * 2);

    return {
      showMiniChart: true,
      miniChartPath: points.join(' '),
      chartPoints: { startX, startY, endX, endY },
    };
  }, [values]);

  return (
    <div className="rounded-card border border-gray-200 bg-white p-5 transition-all hover:shadow-elevated">
      {/* 标题和趋势箭头 */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {hasChange && (
          <span
            className={`text-sm font-semibold ${isPositiveChange ? 'text-green-500' : 'text-red-500'}`}
          >
            {change > 0 ? '↗' : '↘'}
          </span>
        )}
      </div>

      {/* 主数值 - 大号显示 */}
      <div className="mb-3 text-center">
        <span className="text-4xl font-bold" style={{ color }}>
          {displayValue}
        </span>
        <span className="ml-1 text-lg text-gray-400">%</span>
      </div>

      {/* 迷你折线图（仅当数据>=3天时显示） */}
      {showMiniChart && (
        <div className="mb-3">
          <svg
            viewBox="-2 -2 104 28"
            className="h-6 w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <path
              d={miniChartPath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
            {/* 起点和终点圆点 */}
            {chartPoints && (
              <>
                <circle
                  cx={chartPoints.startX}
                  cy={chartPoints.startY}
                  r="3"
                  fill={color}
                  opacity="0.5"
                />
                <circle cx={chartPoints.endX} cy={chartPoints.endY} r="3" fill={color} />
              </>
            )}
          </svg>
        </div>
      )}

      {/* 简洁的进度条 */}
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-g3-slower ease-g3"
          style={{
            width: `${Math.min(100, currentValue * 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
});

MetricChart.displayName = 'MetricChart';

/**
 * StateHistoryChart - 状态历史折线图
 */
const StateHistoryChart: React.FC<StateHistoryChartProps> = React.memo(({ stateHistory }) => {
  if (!stateHistory || stateHistory.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <ChartLine size={24} weight="duotone" color="#3b82f6" />
          状态历史趋势
        </h2>
        <span className="text-sm text-gray-400">
          {formatShortDate(stateHistory[0].date)} -{' '}
          {formatShortDate(stateHistory[stateHistory.length - 1].date)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricChart data={stateHistory} metric="attention" color="#3b82f6" label="注意力" />
        <MetricChart data={stateHistory} metric="motivation" color="#22c55e" label="动机" />
        <MetricChart data={stateHistory} metric="memory" color="#a855f7" label="记忆力" />
        <MetricChart data={stateHistory} metric="speed" color="#f59e0b" label="速度" />
        <MetricChart data={stateHistory} metric="stability" color="#06b6d4" label="稳定性" />
        <MetricChart data={stateHistory} metric="fatigue" color="#ef4444" label="疲劳度" />
      </div>
    </div>
  );
});

StateHistoryChart.displayName = 'StateHistoryChart';

export default StateHistoryChart;
