import React from 'react';
import { motion } from 'framer-motion';
import { Eye, Headphones, Hand, Brain, Sparkle } from './Icon';

export type LearningStyle = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

export interface LearningStyleProfile {
  style: LearningStyle;
  confidence: number;
  scores: {
    visual: number;
    auditory: number;
    kinesthetic: number;
  };
}

interface LearningStyleCardProps {
  data?: LearningStyleProfile;
}

const LearningStyleCard: React.FC<LearningStyleCardProps> = ({ data }) => {
  // Fallback data
  const profile: LearningStyleProfile = data || {
    style: 'visual',
    confidence: 0.78,
    scores: { visual: 0.65, auditory: 0.25, kinesthetic: 0.1 },
  };

  const getStyleConfig = (style: LearningStyle) => {
    switch (style) {
      case 'visual':
        return {
          label: '视觉型 (Visual)',
          icon: Eye,
          desc: '你对图像、图表和书面文字记忆深刻。建议多使用思维导图和颜色标记。',
          color: 'text-sky-600',
          bg: 'bg-sky-50',
        };
      case 'auditory':
        return {
          label: '听觉型 (Auditory)',
          icon: Headphones,
          desc: '通过聆听和朗读能达到最佳效果。建议开启单词发音，尝试跟读练习。',
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
        };
      case 'kinesthetic':
        return {
          label: '动觉型 (Kinesthetic)',
          icon: Hand,
          desc: '通过互动和操作学习最有效。建议多参与拼写测试和互动小游戏。',
          color: 'text-rose-600',
          bg: 'bg-rose-50',
        };
      default:
        return {
          label: '混合型 (Mixed)',
          icon: Brain,
          desc: '你能灵活运用多种感官进行学习。结合视听动多种方式可达到最佳效果。',
          color: 'text-violet-600',
          bg: 'bg-violet-50',
        };
    }
  };

  const config = getStyleConfig(profile.style);
  const MainIcon = config.icon;

  // Prepare data for visualization
  const metrics = [
    { label: '视觉', key: 'visual', score: profile.scores.visual, icon: Eye, color: 'bg-sky-500' },
    {
      label: '听觉',
      key: 'auditory',
      score: profile.scores.auditory,
      icon: Headphones,
      color: 'bg-emerald-500',
    },
    {
      label: '动觉',
      key: 'kinesthetic',
      score: profile.scores.kinesthetic,
      icon: Hand,
      color: 'bg-rose-500',
    },
  ];

  // Calculate max for scaling (relative width)
  const maxScore = Math.max(...Object.values(profile.scores));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-100 bg-white/80 shadow-sm backdrop-blur-sm"
    >
      <div className="p-6 pb-4">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-3 ${config.bg} ${config.color}`}>
              <MainIcon size={24} weight="duotone" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{config.label}</h3>
              <p className="mt-1 text-xs text-gray-500">AMAS 学习风格模型</p>
            </div>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {(profile.confidence * 100).toFixed(0)}% 置信度
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {metrics.map((m, idx) => (
            <div key={m.key} className="relative">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <m.icon size={14} weight="bold" className="opacity-70" /> {m.label}
                </span>
                <span className="font-medium text-gray-900">{(m.score * 100).toFixed(0)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(m.score / (maxScore || 1)) * 100}%` }}
                  transition={{ duration: 0.8, delay: 0.2 + idx * 0.1 }}
                  className={`h-full rounded-full ${m.color}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-gray-100 bg-gray-50/80 p-4">
        <div className="flex gap-3">
          <Sparkle className="mt-0.5 shrink-0 text-yellow-500" size={16} weight="duotone" />
          <p className="text-sm leading-snug text-gray-600">
            <span className="font-medium text-gray-900">建议：</span>
            {config.desc}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default LearningStyleCard;
