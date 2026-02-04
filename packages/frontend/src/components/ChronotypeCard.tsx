import React from 'react';
import { Sun, Moon, SunHorizon, TrendUp, Sparkle } from '@phosphor-icons/react';

// 支持 'neutral' 作为 'intermediate' 的别名
export type ChronotypeType = 'morning' | 'evening' | 'intermediate' | 'neutral';
export type ChronotypeCategory = ChronotypeType;

export interface ChronotypeProfile {
  category: ChronotypeCategory;
  peakHours: number[];
  confidence: number;
  learningHistory?: Array<{
    hour: number;
    performance: number;
  }>;
}

interface ChronotypeCardProps {
  data?: ChronotypeProfile;
  // 扁平化 props 支持（向后兼容 profile 版本调用方式）
  type?: ChronotypeType;
  confidence?: number;
  peakHours?: number[];
}

const ChronotypeCard: React.FC<ChronotypeCardProps> = ({ data, type, confidence, peakHours }) => {
  // 支持扁平化 props 或 data 对象
  const profile: ChronotypeProfile = data || {
    category: type || 'intermediate',
    peakHours: peakHours || [9, 10, 11, 19, 20],
    confidence: confidence ?? 0.85,
    learningHistory: [],
  };

  const getCategoryConfig = (category: ChronotypeCategory) => {
    switch (category) {
      case 'morning':
        return {
          label: '早起鸟 (Morning Lark)',
          icon: SunHorizon,
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          gradient: 'from-amber-500 to-orange-400',
          desc: '你的大脑在清晨最活跃，适合处理高难度任务。',
        };
      case 'evening':
        return {
          label: '夜猫子 (Night Owl)',
          icon: Moon,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          gradient: 'from-blue-500 to-purple-500',
          desc: '你在夜晚思维更敏捷,适合进行深度学习。',
        };
      case 'intermediate':
      case 'neutral':
      default:
        return {
          label: '随时适应 (Intermediate)',
          icon: Sun,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          gradient: 'from-blue-500 to-cyan-400',
          desc: '你的精力分布较均衡，可灵活安排学习时间。',
        };
    }
  };

  const config = getCategoryConfig(profile.category);
  const Icon = config.icon;

  // Generate 24h blocks
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="animate-g3-fade-in overflow-hidden rounded-card border border-gray-100 bg-white/80 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-50 p-6 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className={`rounded-card p-3 ${config.bg} ${config.color}`}>
            <Icon size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{config.label}</h3>
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <TrendUp size={14} />
              <span>置信度: {(profile.confidence * 100).toFixed(0)}%</span>

              {/* Confidence Bar */}
              <div className="ml-1 h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                <div
                  style={{ width: `${profile.confidence * 100}%` }}
                  className={`h-full bg-gradient-to-r transition-all duration-g3-slower ease-g3 ${config.gradient}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        <p className="mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {config.desc}
        </p>

        {/* 24H Timeline Visualization */}
        <div className="space-y-2">
          <div className="flex justify-between px-1 text-xs text-gray-400 dark:text-gray-500">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:59</span>
          </div>

          <div className="relative flex h-12 items-end gap-[2px] overflow-hidden rounded-button border border-gray-100 bg-gray-50 p-1 dark:border-slate-700 dark:bg-slate-900">
            {hours.map((hour) => {
              const isPeak = profile.peakHours.includes(hour);
              return (
                <div
                  key={hour}
                  style={{
                    height: isPeak ? '100%' : '30%',
                    opacity: isPeak ? 1 : 0.3,
                    transitionDelay: `${hour * 20}ms`,
                  }}
                  className={`group relative flex-1 cursor-default rounded-sm transition-all duration-g3-normal ${isPeak ? `bg-gradient-to-t ${config.gradient}` : 'bg-gray-300'} `}
                >
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 group-hover:block">
                    <div className="flex items-center gap-1 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white">
                      {hour}:00{' '}
                      {isPeak ? (
                        <>
                          <Sparkle size={12} /> 黄金时间
                        </>
                      ) : (
                        ''
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div className={`h-3 w-3 rounded bg-gradient-to-r ${config.gradient}`}></div>
            <span>黄金学习时段</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChronotypeCard;
