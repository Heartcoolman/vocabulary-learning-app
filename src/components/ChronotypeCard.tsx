import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Sunrise, TrendingUp } from 'lucide-react';

export type ChronotypeCategory = 'morning' | 'evening' | 'intermediate';

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
}

const ChronotypeCard: React.FC<ChronotypeCardProps> = ({ data }) => {
  // Fallback/Placeholder data if none provided
  const profile: ChronotypeProfile = data || {
    category: 'intermediate',
    peakHours: [9, 10, 11, 19, 20],
    confidence: 0.85,
    learningHistory: []
  };

  const getCategoryConfig = (category: ChronotypeCategory) => {
    switch (category) {
      case 'morning':
        return {
          label: '早起鸟 (Morning Lark)',
          icon: Sunrise,
          color: 'text-amber-600',
          bg: 'bg-amber-100',
          gradient: 'from-amber-500 to-orange-400',
          desc: '你的大脑在清晨最活跃，适合处理高难度任务。'
        };
      case 'evening':
        return {
          label: '夜猫子 (Night Owl)',
          icon: Moon,
          color: 'text-indigo-600',
          bg: 'bg-indigo-100',
          gradient: 'from-indigo-500 to-purple-500',
          desc: '你在夜晚思维更敏捷,适合进行深度学习。'
        };
      default:
        return {
          label: '随时适应 (Intermediate)',
          icon: Sun,
          color: 'text-blue-600',
          bg: 'bg-blue-100',
          gradient: 'from-blue-500 to-cyan-400',
          desc: '你的精力分布较均衡，可灵活安排学习时间。'
        };
    }
  };

  const config = getCategoryConfig(profile.category);
  const Icon = config.icon;

  // Generate 24h blocks
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-100 overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-gray-50 flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${config.bg} ${config.color}`}>
            <Icon size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{config.label}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              <TrendingUp size={14} />
              <span>置信度: {(profile.confidence * 100).toFixed(0)}%</span>

              {/* Confidence Bar */}
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden ml-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${profile.confidence * 100}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full bg-gradient-to-r ${config.gradient}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          {config.desc}
        </p>

        {/* 24H Timeline Visualization */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400 px-1">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:59</span>
          </div>

          <div className="relative h-12 flex items-end gap-[2px] rounded-lg overflow-hidden bg-gray-50 border border-gray-100 p-1">
            {hours.map((hour) => {
              const isPeak = profile.peakHours.includes(hour);
              return (
                <motion.div
                  key={hour}
                  initial={{ height: '20%' }}
                  animate={{
                    height: isPeak ? '100%' : '30%',
                    opacity: isPeak ? 1 : 0.3
                  }}
                  transition={{ delay: hour * 0.02 }}
                  className={`flex-1 rounded-sm relative group cursor-default
                    ${isPeak ? `bg-gradient-to-t ${config.gradient}` : 'bg-gray-300'}
                  `}
                >
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap">
                      {hour}:00 {isPeak ? '✨ 黄金时间' : ''}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-500">
            <div className={`w-3 h-3 rounded bg-gradient-to-r ${config.gradient}`}></div>
            <span>黄金学习时段</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChronotypeCard;
