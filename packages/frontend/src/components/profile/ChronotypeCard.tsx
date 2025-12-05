import React from 'react';
import { Sun, Moon, SunHorizon } from '@phosphor-icons/react';

interface ChronotypeCardProps {
  type: 'morning' | 'evening' | 'neutral';
  confidence: number;
  peakHours: number[];
}

export const ChronotypeCard: React.FC<ChronotypeCardProps> = ({ type, confidence, peakHours }) => {
  const isMorning = type === 'morning';
  const isEvening = type === 'evening';

  const getIcon = () => {
    if (isMorning) return <Sun size={32} weight="duotone" className="text-amber-500" />;
    if (isEvening) return <Moon size={32} weight="duotone" className="text-indigo-500" />;
    return <SunHorizon size={32} weight="duotone" className="text-teal-500" />;
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
    return hours.map(h => `${h}:00`).join(', ');
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 relative overflow-hidden group">
      {/* Background Decoration */}
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 -mr-10 -mt-10 transition-colors duration-500
        ${isMorning ? 'bg-amber-400' : isEvening ? 'bg-indigo-600' : 'bg-teal-400'}`}
      />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="p-3 bg-gray-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
            {getIcon()}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">置信度</span>
            <div className="flex items-center gap-1">
              <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isMorning ? 'bg-amber-500' : isEvening ? 'bg-indigo-500' : 'bg-teal-500'}`}
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-600">{Math.round(confidence * 100)}%</span>
            </div>
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-800 mb-1">{getTitle()}</h3>
        <p className="text-sm text-gray-500 mb-4 h-10 leading-relaxed">{getDescription()}</p>

        <div className="pt-4 border-t border-gray-50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">黄金时间</span>
            <span className="font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
              {formatHours(peakHours)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
