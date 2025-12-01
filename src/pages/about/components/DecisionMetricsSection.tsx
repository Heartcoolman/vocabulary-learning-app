import React from 'react';
import { Timer, TrendUp, TrendDown, Target } from '@/components/Icon';

export interface DecisionMetricsSectionProps {
  strategy: {
    interval_scale?: number;
    new_ratio?: number;
    difficulty?: string;
    batch_size?: number;
    hint_level?: number;
  };
  confidence: number;
  reward?: number;
  totalDurationMs?: number;
  decisionSource: string;
  coldstartPhase?: string;
}

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  easy: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', label: '简单' },
  mid: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: '中等' },
  hard: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', label: '困难' }
};

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}

function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2 mb-2 text-slate-500">
        {icon && <span className="text-slate-400">{icon}</span>}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export function DecisionMetricsSection({
  strategy,
  confidence,
  reward,
  totalDurationMs,
  decisionSource,
  coldstartPhase
}: DecisionMetricsSectionProps) {
  const getDifficultyBadge = (difficulty?: string) => {
    if (!difficulty) return <span className="text-slate-400">-</span>;

    const style = DIFFICULTY_STYLES[difficulty.toLowerCase()] || {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
      label: difficulty
    };

    return (
      <span className={`px-2 py-0.5 text-xs rounded-full border ${style.bg} ${style.text} ${style.border}`}>
        {style.label}
      </span>
    );
  };

  const getRewardDisplay = (val?: number) => {
    if (val === undefined) return <span className="text-slate-400">未定义</span>;
    if (val > 0) {
      return (
        <span className="text-green-600 flex items-center gap-1">
          <TrendUp size={14} /> +{val.toFixed(2)}
        </span>
      );
    }
    if (val < 0) {
      return (
        <span className="text-red-600 flex items-center gap-1">
          <TrendDown size={14} /> {val.toFixed(2)}
        </span>
      );
    }
    return <span className="text-slate-600">{val}</span>;
  };

  return (
    <div>
      <h3 className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">
        决策指标与策略
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="难度设定"
          icon={<Target size={14} />}
          value={getDifficultyBadge(strategy.difficulty)}
        />

        <MetricCard
          label="批次大小"
          value={strategy.batch_size ?? '-'}
        />

        <MetricCard
          label="新词比例"
          value={strategy.new_ratio !== undefined ? `${(strategy.new_ratio * 100).toFixed(0)}%` : '-'}
        />

        <MetricCard
          label="间隔缩放"
          icon={<TrendUp size={14} />}
          value={strategy.interval_scale ? `${strategy.interval_scale}x` : '-'}
        />

        <MetricCard
          label="决策置信度"
          value={
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
              <span className="text-xs">{(confidence * 100).toFixed(1)}%</span>
            </div>
          }
        />

        <MetricCard
          label="预测奖励"
          value={getRewardDisplay(reward)}
        />

        <MetricCard
          label="计算耗时"
          icon={<Timer size={14} />}
          value={<span className="font-mono">{totalDurationMs?.toFixed(0) ?? 0} ms</span>}
        />

        <MetricCard
          label="决策来源"
          value={
            <div className="flex flex-col gap-0.5">
              <span className="capitalize">{decisionSource}</span>
              {coldstartPhase && (
                <span className="text-[10px] text-amber-600 font-normal">
                  冷启动: {coldstartPhase}
                </span>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
