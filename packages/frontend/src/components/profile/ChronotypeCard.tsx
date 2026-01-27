import React from 'react';
import { Sun, Moon, SunHorizon } from '@/components/Icon';

interface ChronotypeCardProps {
  type: 'morning' | 'evening' | 'neutral';
  confidence: number;
  peakHours: number[];
}

export const ChronotypeCard: React.FC<ChronotypeCardProps> = ({ type, confidence, peakHours }) => {
  const isMorning = type === 'morning';
  const isEvening = type === 'evening';

  const getIcon = () => {
    if (isMorning) return <Sun size={32} className="text-amber-500" />;
    if (isEvening) return <Moon size={32} className="text-blue-500" />;
    return <SunHorizon size={32} className="text-teal-500" />;
  };

  const getTitle = () => {
    if (isMorning) return '早鸟型';
    if (isEvening) return '夜猫子型';
    return '全天候型';
  };

  const getDescription = () => {
    if (isMorning) return '您的精力在早晨最充沛，适合开启新一天的挑战。';
    if (isEvening) return '夜深人静时您的专注力达到顶峰。';
    return '您在一天中的精力分配比较均衡。';
  };

  const formatHours = (hours: number[]) => {
    if (!hours.length) return '暂无数据';
    return hours.map((h) => `${h}:00`).join(', ');
  };

  return (
    <div className="group relative overflow-hidden rounded-card border border-gray-100 bg-white p-6 shadow-soft transition-all duration-g3-normal hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800">
      {/* Background Decoration */}
      <div
        className={`absolute right-0 top-0 -mr-10 -mt-10 h-32 w-32 rounded-full opacity-10 blur-3xl transition-colors duration-g3-slow ${isMorning ? 'bg-amber-400' : isEvening ? 'bg-blue-600' : 'bg-teal-400'}`}
      />

      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-card bg-gray-50 p-3 transition-transform duration-g3-normal group-hover:scale-110 dark:bg-slate-700">
            {getIcon()}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              置信度
            </span>
            <div className="flex items-center gap-1">
              <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full ${isMorning ? 'bg-amber-500' : isEvening ? 'bg-blue-500' : 'bg-teal-500'}`}
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400">
                {Math.round(confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        <h3 className="mb-1 text-lg font-bold text-gray-800 dark:text-white">{getTitle()}</h3>
        <p className="mb-4 h-10 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {getDescription()}
        </p>

        <div className="border-t border-gray-50 pt-4 dark:border-slate-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">黄金时间</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono font-semibold text-gray-700 dark:bg-slate-700 dark:text-gray-300">
              {formatHours(peakHours)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
