import React from 'react';
import { Eye, Headphones, Hand, Brain, Sparkle, BookOpen } from './Icon';

export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'multimodal';

export type LearningStyleLegacy = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

export interface LearningStyleProfile {
  style: LearningStyle | LearningStyleLegacy;
  styleLegacy?: LearningStyleLegacy;
  confidence: number;
  scores: {
    visual: number;
    auditory: number;
    reading?: number;
    kinesthetic: number;
  };
  modelType?: 'rule_engine' | 'ml_sgd';
}

interface LearningStyleCardProps {
  data?: LearningStyleProfile;
}

const LearningStyleCard: React.FC<LearningStyleCardProps> = ({ data }) => {
  // Fallback data with VARK four dimensions
  const rawProfile = data || {
    style: 'visual' as const,
    confidence: 0.78,
    scores: { visual: 0.5, auditory: 0.2, reading: 0.2, kinesthetic: 0.1 },
  };

  // Normalize scores to ensure reading exists and handle mixed -> multimodal
  const profile: LearningStyleProfile = {
    ...rawProfile,
    style: rawProfile.style === 'mixed' ? 'multimodal' : rawProfile.style,
    scores: {
      ...rawProfile.scores,
      reading: rawProfile.scores.reading ?? 0,
    },
  };

  const getStyleConfig = (style: LearningStyle | LearningStyleLegacy) => {
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
      case 'reading':
        return {
          label: '读写型 (Reading)',
          icon: BookOpen,
          desc: '你对文字阅读和书写有较强偏好。建议多查看例句和释义，尝试做笔记。',
          color: 'text-amber-600',
          bg: 'bg-amber-50',
        };
      case 'kinesthetic':
        return {
          label: '动觉型 (Kinesthetic)',
          icon: Hand,
          desc: '通过互动和操作学习最有效。建议多参与拼写测试和互动小游戏。',
          color: 'text-rose-600',
          bg: 'bg-rose-50',
        };
      case 'multimodal':
      case 'mixed':
      default:
        return {
          label: '多模态型 (Multimodal)',
          icon: Brain,
          desc: '你能灵活运用多种感官进行学习。结合视听读写多种方式可达到最佳效果。',
          color: 'text-violet-600',
          bg: 'bg-violet-50',
        };
    }
  };

  const config = getStyleConfig(profile.style);
  const MainIcon = config.icon;

  // VARK four-dimensional metrics
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
      label: '读写',
      key: 'reading',
      score: profile.scores.reading ?? 0,
      icon: BookOpen,
      color: 'bg-amber-500',
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
  const maxScore = Math.max(...metrics.map((m) => m.score));

  return (
    <div className="flex h-full animate-g3-fade-in flex-col overflow-hidden rounded-card border border-gray-100 bg-white/80 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      <div className="p-6 pb-4">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-card p-3 ${config.bg} ${config.color}`}>
              <MainIcon size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{config.label}</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                AMAS VARK 学习风格模型
                {profile.modelType === 'ml_sgd' && (
                  <span className="ml-1 text-violet-500">(ML)</span>
                )}
              </p>
            </div>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-slate-700 dark:text-gray-300">
            {(profile.confidence * 100).toFixed(0)}% 置信度
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {metrics.map((m, idx) => (
            <div key={m.key} className="relative">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <m.icon size={14} className="opacity-70" /> {m.label}
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {(m.score * 100).toFixed(0)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                <div
                  style={{
                    width: `${(m.score / (maxScore || 1)) * 100}%`,
                    transitionDelay: `${200 + idx * 100}ms`,
                  }}
                  className={`h-full rounded-full transition-all duration-g3-slower ease-g3 ${m.color}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-gray-100 bg-gray-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/80">
        <div className="flex gap-3">
          <Sparkle className="mt-0.5 shrink-0 text-yellow-500" size={16} />
          <p className="text-sm leading-snug text-gray-600 dark:text-gray-300">
            <span className="font-medium text-gray-900 dark:text-white">建议：</span>
            {config.desc}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LearningStyleCard;
