import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Brain, Lightning, Scales, CaretRight } from '@phosphor-icons/react';
import { G3_DURATION, G3_EASING } from '../../utils/animations';

interface Layer {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  accent: string;
  bg: string;
}

const LAYERS: Layer[] = [
  {
    id: 'perception',
    title: '感知层',
    subtitle: '感知与输入',
    description: '通过多模态输入捕获原始交互、上下文和感知数据。',
    icon: Eye,
    color: 'text-sky-600',
    accent: 'bg-sky-500',
    bg: 'bg-sky-50/80',
  },
  {
    id: 'modeling',
    title: '建模层',
    subtitle: '结构与状态',
    description: '构建并更新动态用户模型和知识图谱。',
    icon: Brain,
    color: 'text-violet-600',
    accent: 'bg-violet-500',
    bg: 'bg-violet-50/80',
  },
  {
    id: 'learning',
    title: '学习层',
    subtitle: '适应与成长',
    description: '分析学习表现，更新掌握程度，优化记忆曲线。',
    icon: Lightning,
    color: 'text-emerald-600',
    accent: 'bg-emerald-500',
    bg: 'bg-emerald-50/80',
  },
  {
    id: 'decision',
    title: '决策层',
    subtitle: '行动与策略',
    description: '确定最优的下一步教学行动，最大化学习效率。',
    icon: Scales,
    color: 'text-rose-600',
    accent: 'bg-rose-500',
    bg: 'bg-rose-50/80',
  },
];

export default function AboutCascade() {
  const [activeId, setActiveId] = useState<string>('perception');

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[20%] h-[150%] w-[150%] origin-top-left -rotate-12 bg-gradient-to-br from-white via-slate-50 to-slate-100" />
      </div>

      <div className="container relative z-10 mx-auto flex min-h-screen flex-col gap-16 px-6 py-12 lg:flex-row lg:py-20">
        <div className="flex flex-1 flex-col justify-center">
          <header className="mb-12 lg:ml-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: G3_DURATION.slower / 1000, ease: G3_EASING.standard }}
            >
              <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-slate-900 lg:text-7xl">
                AMAS <span className="block font-light text-slate-400 lg:inline">系统</span>
              </h1>
              <p className="max-w-lg text-xl leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-700">自适应掌握习得系统</span>
                通过持续的四阶段认知循环运行。
              </p>
            </motion.div>
          </header>

          <div className="flex flex-col space-y-3">
            {LAYERS.map((layer, index) => (
              <motion.div
                key={layer.id}
                layout
                onClick={() => setActiveId(layer.id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  marginLeft: activeId === layer.id ? 0 : `${index * 1.5}rem`,
                  scale: activeId === layer.id ? 1.02 : 1,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={`relative cursor-pointer overflow-hidden rounded-xl border backdrop-blur-md transition-colors duration-g3-normal ${activeId === layer.id ? 'bg-white shadow-xl ring-1 ring-slate-900/5' : `${layer.bg} border-transparent shadow-sm hover:border-slate-200`}`}
              >
                <div className="flex items-start gap-5 p-6">
                  <div
                    className={`rounded-xl p-3.5 transition-colors duration-g3-normal ${activeId === layer.id ? layer.accent + ' text-white' : 'bg-white ' + layer.color}`}
                  >
                    <layer.icon size={28} weight={activeId === layer.id ? 'fill' : 'bold'} />
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="mb-1 flex items-center justify-between">
                      <h3
                        className={`text-xl font-bold ${activeId === layer.id ? 'text-slate-900' : 'text-slate-700'}`}
                      >
                        {layer.title}
                      </h3>
                      <CaretRight
                        size={20}
                        weight="bold"
                        className={`transition-transform duration-g3-normal ease-g3 ${activeId === layer.id ? 'rotate-90 text-slate-300' : 'text-slate-400'}`}
                      />
                    </div>
                    <p
                      className={`mb-3 text-xs font-bold uppercase tracking-widest ${activeId === layer.id ? layer.color : 'text-slate-400'}`}
                    >
                      {layer.subtitle}
                    </p>
                    <AnimatePresence>
                      {activeId === layer.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{
                            duration: G3_DURATION.normal / 1000,
                            ease: G3_EASING.standard,
                          }}
                          className="overflow-hidden"
                        >
                          <p className="pb-2 leading-relaxed text-slate-600">{layer.description}</p>
                          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
                            <div
                              className={`h-1.5 w-1.5 rounded-full ${layer.accent} animate-pulse`}
                            />
                            数据流处理中
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="sticky top-0 hidden h-screen w-72 flex-col justify-center py-20 lg:flex">
          <div className="rounded-2xl border border-white bg-white/80 p-8 shadow-lg backdrop-blur-xl">
            <div className="relative space-y-8">
              <div className="absolute bottom-4 left-[15px] top-4 w-0.5 bg-slate-100" />
              {LAYERS.map((layer) => (
                <div key={layer.id} className="relative z-10 flex items-center gap-4">
                  <motion.div
                    animate={{
                      scale: activeId === layer.id ? 1.25 : 1,
                      backgroundColor: activeId === layer.id ? '#0f172a' : '#fff',
                      borderColor: activeId === layer.id ? '#0f172a' : '#cbd5e1',
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors"
                  >
                    <layer.icon
                      size={14}
                      weight="bold"
                      className={activeId === layer.id ? 'text-white' : 'text-slate-300'}
                    />
                  </motion.div>
                  <div
                    className={`text-sm font-semibold transition-all duration-g3-normal ${activeId === layer.id ? 'translate-x-1 text-slate-900' : 'text-slate-300'}`}
                  >
                    {layer.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
