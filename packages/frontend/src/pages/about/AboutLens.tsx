import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Graph, Brain, Gavel } from '@phosphor-icons/react';

const LAYERS = [
  {
    id: 'perception',
    label: '感知层',
    icon: Eye,
    color: 'text-rose-600',
    bgStart: 'from-rose-50',
    bgEnd: 'to-rose-100',
    patternId: 'pattern-noise',
    detail: {
      title: '感知层',
      subtitle: '感知与过滤',
      desc: '摄取高维感知流，应用弹性噪声过滤从混沌中提取信号。',
      stats: ['信号保真度', '噪声抑制', '输入延迟'],
    },
  },
  {
    id: 'modeling',
    label: '建模层',
    icon: Graph,
    color: 'text-blue-600',
    bgStart: 'from-blue-50',
    bgEnd: 'to-blue-100',
    patternId: 'pattern-grid',
    detail: {
      title: '建模层',
      subtitle: '抽象与结构',
      desc: '构建环境的动态图表示，预测状态转换。',
      stats: ['图节点数', '边密度', '预测准确率'],
    },
  },
  {
    id: 'learning',
    label: '学习层',
    icon: Brain,
    color: 'text-amber-600',
    bgStart: 'from-amber-50',
    bgEnd: 'to-amber-100',
    patternId: 'pattern-dots',
    detail: {
      title: '学习层',
      subtitle: '优化与记忆',
      desc: '基于历史反馈循环更新内部权重，最小化误差梯度。',
      stats: ['损失梯度', '内存占用', '适应速率'],
    },
  },
  {
    id: 'decision',
    label: '决策层',
    icon: Gavel,
    color: 'text-emerald-600',
    bgStart: 'from-emerald-50',
    bgEnd: 'to-emerald-100',
    patternId: 'pattern-lines',
    detail: {
      title: '决策层',
      subtitle: '执行与效用',
      desc: '根据效用函数评估潜在未来状态，选择最优行动。',
      stats: ['效用分数', '风险因子', '置信区间'],
    },
  },
];

export default function AboutLens() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const getRotation = () => {
    if (!selectedId) return 0;
    const index = LAYERS.findIndex((l) => l.id === selectedId);
    if (index === -1) return 0;
    const angles = [225, 135, 45, -45];
    return angles[index];
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#FDFCF8] py-24 font-sans">
      <svg className="absolute h-0 w-0">
        <defs>
          <pattern
            id="pattern-noise"
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <filter id="noiseFilter">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.65"
                numOctaves="3"
                stitchTiles="stitch"
              />
            </filter>
            <rect width="100%" height="100%" filter="url(#noiseFilter)" opacity="0.4" />
          </pattern>
          <pattern
            id="pattern-grid"
            x="0"
            y="0"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.3"
            />
          </pattern>
          <pattern
            id="pattern-dots"
            x="0"
            y="0"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.5" fill="currentColor" opacity="0.4" />
          </pattern>
          <pattern
            id="pattern-lines"
            x="0"
            y="0"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="12"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.2"
            />
          </pattern>
        </defs>
      </svg>

      <div className="relative z-10 mb-12">
        <motion.div
          className="relative h-[480px] w-[480px] rounded-full border-4 border-white/40 bg-white/50 shadow-2xl backdrop-blur-xl"
          animate={{ rotate: getRotation() }}
          transition={{ type: 'spring', stiffness: 40, damping: 15, mass: 1 }}
        >
          {LAYERS.map((layer, i) => {
            const isSelected = selectedId === layer.id;
            const isDimmed = selectedId && !isSelected;
            const pos = [
              'top-0 left-0 rounded-tl-[100%]',
              'top-0 right-0 rounded-tr-[100%]',
              'bottom-0 right-0 rounded-br-[100%]',
              'bottom-0 left-0 rounded-bl-[100%]',
            ][i];
            const origin = [
              'origin-bottom-right',
              'origin-bottom-left',
              'origin-top-left',
              'origin-top-right',
            ][i];

            return (
              <motion.button
                key={layer.id}
                className={`absolute h-1/2 w-1/2 ${pos} ${origin} group cursor-pointer overflow-hidden outline-none`}
                onClick={() => setSelectedId(isSelected ? null : layer.id)}
                whileHover={{ scale: 1.02, zIndex: 10 }}
                animate={{
                  scale: isSelected ? 1.05 : 1,
                  opacity: isDimmed ? 0.4 : 1,
                  filter: isDimmed ? 'grayscale(0.6)' : 'grayscale(0)',
                }}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${layer.bgStart} ${layer.bgEnd} opacity-90`}
                />
                <svg
                  className={`absolute inset-0 h-full w-full ${layer.color} opacity-30 mix-blend-multiply`}
                >
                  <rect width="100%" height="100%" fill={`url(#${layer.patternId})`} />
                </svg>
                <motion.div
                  className="absolute inset-0 flex flex-col items-center justify-center p-12"
                  animate={{ rotate: -getRotation() }}
                  transition={{ type: 'spring', stiffness: 40, damping: 15, mass: 1 }}
                >
                  <div
                    className={`mb-2 rounded-xl bg-white/80 p-3 shadow-sm backdrop-blur ${layer.color}`}
                  >
                    <layer.icon weight="duotone" className="h-8 w-8" />
                  </div>
                  <span
                    className={`text-xs font-bold uppercase tracking-widest ${layer.color} rounded-full bg-white/60 px-3 py-1`}
                  >
                    {layer.label}
                  </span>
                </motion.div>
                <div className="pointer-events-none absolute inset-0 border border-white/20" />
              </motion.button>
            );
          })}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/90 shadow-inner backdrop-blur">
            <div className="h-3 w-3 rounded-full bg-stone-300" />
          </div>
        </motion.div>
      </div>

      <div className="relative min-h-[240px] w-full max-w-4xl px-6">
        <AnimatePresence mode="wait">
          {selectedId ? (
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="relative"
            >
              <div className="absolute -top-12 left-1/2 h-12 w-px -translate-x-1/2 bg-stone-300" />
              <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-stone-300" />
              {(() => {
                const layer = LAYERS.find((l) => l.id === selectedId);
                if (!layer) return null;
                return (
                  <div className="relative flex flex-col items-center gap-8 overflow-hidden rounded-2xl border border-stone-100 bg-white p-8 shadow-xl md:flex-row md:items-start">
                    <div
                      className={`absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r ${layer.bgStart} ${layer.bgEnd}`}
                    />
                    <div className={`shrink-0 rounded-2xl bg-stone-50 p-6 ${layer.color}`}>
                      <layer.icon size={48} weight="duotone" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <h3 className="mb-2 text-3xl font-bold text-stone-900">
                        {layer.detail.title}
                      </h3>
                      <p
                        className={`mb-4 text-sm font-bold uppercase tracking-widest ${layer.color}`}
                      >
                        {layer.detail.subtitle}
                      </p>
                      <p className="mb-6 text-lg leading-relaxed text-stone-600">
                        {layer.detail.desc}
                      </p>
                      <div className="flex flex-wrap justify-center gap-3 md:justify-start">
                        {layer.detail.stats.map((stat) => (
                          <span
                            key={stat}
                            className="rounded-md border border-stone-200 bg-stone-100 px-3 py-1 text-sm font-medium text-stone-600"
                          >
                            {stat}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 text-center text-stone-400"
            >
              <p className="text-lg font-medium">选择一个象限探索系统架构</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
