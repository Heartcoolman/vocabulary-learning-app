import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Cube, GraduationCap, Scales, Check, CaretRight } from '@/components/Icon';

interface Layer {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  station: { x: number; y: number };
}

const LAYERS: Layer[] = [
  {
    id: 'perception',
    title: '感知层',
    subtitle: '输入处理',
    description: '捕获并规范化环境中的原始信号，过滤噪声并建立基准真值。',
    icon: Eye,
    color: 'text-blue-600',
    station: { x: 150, y: 250 },
  },
  {
    id: 'modeling',
    title: '建模层',
    subtitle: '结构分析',
    description: '构建用户状态的连贯心智模型，将行为映射到认知模式。',
    icon: Cube,
    color: 'text-purple-600',
    station: { x: 380, y: 170 },
  },
  {
    id: 'learning',
    title: '学习层',
    subtitle: '自适应优化',
    description: '基于成功指标更新长期知识，优化记忆保持策略。',
    icon: GraduationCap,
    color: 'text-blue-600',
    station: { x: 620, y: 330 },
  },
  {
    id: 'decision',
    title: '决策层',
    subtitle: '行动执行',
    description: '选择最优干预措施，平衡即时需求与长期目标。',
    icon: Scales,
    color: 'text-emerald-600',
    station: { x: 850, y: 250 },
  },
];

export default function AboutRibbon() {
  const [activeStep, setActiveStep] = useState(0);

  const pathD = `M 0,250 C 75,250 75,250 150,250 C 225,250 250,170 380,170 C 510,170 490,330 620,330 C 750,330 775,250 850,250 C 925,250 1000,250 1000,250`;

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-white lg:flex-row">
      <nav className="border-r border-gray-100 bg-gray-50/50 p-8 lg:w-72 lg:flex-shrink-0">
        <div className="mb-8">
          <h2 className="font-serif text-2xl font-bold text-gray-900">AMAS 循环</h2>
          <p className="mt-2 font-mono text-xs tracking-wider text-gray-500">系统架构</p>
        </div>
        <div className="relative flex flex-col space-y-0">
          <div className="absolute left-4 top-4 h-[calc(100%-2rem)] w-0.5 bg-gray-200" />
          {LAYERS.map((layer, index) => (
            <button
              key={layer.id}
              onClick={() => setActiveStep(index)}
              className={`group relative flex items-start py-4 pl-12 text-left transition-all hover:bg-white/50 hover:pl-14 ${activeStep === index ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              <div
                className={`absolute left-[0.85rem] top-5 z-10 box-content h-2.5 w-2.5 rounded-full border-2 bg-white transition-colors duration-300 ${activeStep >= index ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}
              />
              <div>
                <span
                  className={`block font-mono text-[10px] uppercase tracking-widest ${activeStep === index ? 'font-bold text-gray-900' : 'text-gray-400'}`}
                >
                  0{index + 1}
                </span>
                <span
                  className={`block font-serif text-lg ${activeStep === index ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
                >
                  {layer.title}
                </span>
              </div>
            </button>
          ))}
        </div>
      </nav>

      <div className="relative flex-grow overflow-hidden bg-white">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1000 500"
          preserveAspectRatio="xMidYMid slice"
        >
          <path d={pathD} fill="none" stroke="#F1F5F9" strokeWidth="12" strokeLinecap="round" />
          <motion.path
            d={pathD}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: (activeStep + 0.5) / LAYERS.length }}
            transition={{ duration: 1, ease: 'easeInOut' }}
          />
          <motion.path
            d={pathD}
            fill="none"
            stroke="#93C5FD"
            strokeWidth="8"
            strokeLinecap="round"
            strokeOpacity="0.5"
            animate={{
              pathLength: [(activeStep + 0.5) / LAYERS.length, (activeStep + 1.2) / LAYERS.length],
              opacity: [0, 0.5, 0],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
          />
        </svg>

        {LAYERS.map((layer, index) => {
          const isActive = activeStep === index;
          const isPast = activeStep > index;
          return (
            <div
              key={layer.id}
              className="absolute flex items-center justify-center"
              style={{
                left: `${(layer.station.x / 1000) * 100}%`,
                top: `${(layer.station.y / 500) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="absolute inset-0 -z-10 rounded-full bg-blue-100 blur-xl"
                    style={{ width: '120px', height: '120px', left: '-30px', top: '-30px' }}
                  />
                )}
              </AnimatePresence>
              <motion.button
                onClick={() => setActiveStep(index)}
                whileHover={{ scale: 1.05 }}
                animate={{
                  scale: isActive ? 1.1 : 1,
                  backgroundColor: isActive || isPast ? '#ffffff' : '#f8fafc',
                  borderColor: isActive ? '#3b82f6' : isPast ? '#94a3b8' : '#e2e8f0',
                }}
                className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-4 shadow-sm transition-shadow ${isActive ? 'shadow-lg ring-4 ring-blue-50' : ''}`}
              >
                {isPast && !isActive ? (
                  <Check weight="bold" className="h-6 w-6 text-slate-400" />
                ) : (
                  <layer.icon
                    weight={isActive ? 'fill' : 'regular'}
                    className={`h-7 w-7 ${isActive ? layer.color : 'text-gray-400'}`}
                  />
                )}
              </motion.button>
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="absolute top-24 z-20 w-64 rounded-2xl border border-gray-100 bg-white p-5 shadow-xl"
                  >
                    <div
                      className={`mb-2 font-mono text-[10px] font-bold uppercase tracking-widest ${layer.color}`}
                    >
                      {layer.subtitle}
                    </div>
                    <h3 className="mb-2 font-serif text-xl font-bold text-gray-900">
                      {layer.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-600">{layer.description}</p>
                    <div className="mt-4 flex items-center text-xs font-medium text-gray-400">
                      处理中 <CaretRight className="ml-1" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
