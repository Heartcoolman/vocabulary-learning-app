import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, Brain, BookOpen, Gavel } from '@/components/Icon';

const layers = [
  {
    id: 'perception',
    number: '01',
    title: '感知层',
    description: '捕获交互中的原始输入信号。',
    icon: Eye,
    color: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-200/50',
  },
  {
    id: 'modeling',
    number: '02',
    title: '建模层',
    description: '将数据结构化为有意义的模式。',
    icon: Brain,
    color: 'from-purple-500/20 to-pink-500/20',
    borderColor: 'border-purple-200/50',
  },
  {
    id: 'learning',
    number: '03',
    title: '学习层',
    description: '基于历史表现调整学习策略。',
    icon: BookOpen,
    color: 'from-amber-500/20 to-orange-500/20',
    borderColor: 'border-amber-200/50',
  },
  {
    id: 'decision',
    number: '04',
    title: '决策层',
    description: '为用户执行最优行动。',
    icon: Gavel,
    color: 'from-emerald-500/20 to-teal-500/20',
    borderColor: 'border-emerald-200/50',
  },
];

export default function AboutGlassStack() {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - left - width / 2) / 25;
    const y = (e.clientY - top - height / 2) / 25;
    setMousePosition({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePosition({ x: 0, y: 0 });
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 py-20">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative h-[500px] w-[400px]"
        style={{ perspective: '1200px' }}
      >
        <motion.div
          className="relative h-full w-full"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{
            rotateX: -mousePosition.y,
            rotateY: mousePosition.x,
          }}
          transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
        >
          {layers.map((layer, index) => {
            const distance = (index - activeIndex + layers.length) % layers.length;
            const zIndex = layers.length - distance;
            const scale = 1 - distance * 0.05;
            const yOffset = distance * 30;
            const opacity = 1 - distance * 0.15;
            const blur = distance * 2;

            return (
              <motion.div
                key={layer.id}
                onClick={() => setActiveIndex(index)}
                animate={{
                  scale,
                  y: yOffset,
                  z: -distance * 80,
                  opacity,
                  filter: `blur(${blur}px)`,
                  rotateX: distance * -2,
                }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                className={`absolute inset-0 rounded-[2rem] border ${layer.borderColor} bg-gradient-to-br ${layer.color} flex origin-bottom cursor-pointer flex-col p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:brightness-105`}
                style={{
                  zIndex,
                  background:
                    'linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)',
                  boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div className="mb-12 flex items-start justify-between">
                  <h2 className="font-serif text-5xl tracking-tighter text-slate-900/10">
                    {layer.number}
                  </h2>
                  <div className="rounded-2xl bg-white/40 p-4 text-slate-700 shadow-sm">
                    <layer.icon size={32} />
                  </div>
                </div>

                <div className="relative z-10 mt-auto">
                  <h3 className="mb-3 text-3xl font-bold tracking-tight text-slate-800">
                    {layer.title}
                  </h3>
                  <p className="text-lg font-medium leading-relaxed text-slate-600">
                    {layer.description}
                  </p>
                </div>

                <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 mix-blend-overlay blur-3xl" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
