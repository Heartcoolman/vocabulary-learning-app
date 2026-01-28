import { useState, useEffect } from 'react';
import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion';
import {
  Brain,
  Cube,
  Lightning,
  Target,
  GitCommit,
  Cpu,
  Database,
  ChartBar,
} from '@/components/Icon';

const STAGES = [
  {
    id: 'perception',
    label: '感知层',
    icon: Brain,
    color: 'text-blue-500',
    desc: '输入处理',
    metrics: { label: '准确率', value: '99.8%' },
  },
  {
    id: 'modeling',
    label: '建模层',
    icon: Cube,
    color: 'text-purple-500',
    desc: '结构分析',
    metrics: { label: '延迟', value: '12ms' },
  },
  {
    id: 'learning',
    label: '学习层',
    icon: Lightning,
    color: 'text-amber-500',
    desc: '自适应成长',
    metrics: { label: '记忆率', value: '94%' },
  },
  {
    id: 'decision',
    label: '决策层',
    icon: Target,
    color: 'text-emerald-500',
    desc: '最优行动',
    metrics: { label: '置信度', value: '98%' },
  },
];

export default function AboutPipeline() {
  const [progress, setProgress] = useState(0);
  const progressMv = useMotionValue(0);
  const smoothProgress = useSpring(progressMv, { damping: 20, stiffness: 100 });

  useEffect(() => {
    progressMv.set(progress);
  }, [progress, progressMv]);

  const backgroundX = useTransform(smoothProgress, [0, 100], ['0%', '-300%']);
  const travelerColor = useTransform(
    smoothProgress,
    [0, 33, 66, 100],
    ['#3b82f6', '#a855f7', '#f59e0b', '#10b981'],
  );
  const travelerScale = useTransform(smoothProgress, [0, 33, 66, 100], [1, 1.2, 1.5, 1]);
  const travelerRotate = useTransform(smoothProgress, [0, 100], [0, 360]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-8">
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-card bg-white font-mono shadow-elevated">
        <div className="border-b border-slate-200 p-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
                <GitCommit size={32} />
                AMAS 动态流水线
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                系统状态: <span className="font-bold text-emerald-600">运行中</span>
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">数据吞吐量</div>
              <div className="text-xl font-bold text-slate-700">
                {Math.floor(100 + progress * 2.5)} MB/s
              </div>
            </div>
          </div>
        </div>

        <div className="relative h-64 overflow-hidden bg-slate-100">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          <motion.div
            className="absolute left-0 top-0 flex h-full items-center pl-[50%] pr-[50%]"
            style={{ x: backgroundX }}
          >
            <div className="absolute left-0 right-0 top-1/2 -z-10 h-1 bg-slate-300" />
            {STAGES.map((stage, idx) => (
              <div
                key={stage.id}
                className="relative flex w-96 flex-shrink-0 flex-col items-center justify-center"
              >
                <div
                  className={`absolute top-1/2 h-32 w-1 -translate-y-1/2 bg-slate-300 transition-colors duration-g3-slow ${progress >= idx * 33 ? 'bg-slate-400' : ''}`}
                />
                <div
                  className={`z-10 rounded-full border-2 bg-white p-4 transition-all duration-g3-slow ${progress >= idx * 33 ? 'scale-110 border-current shadow-elevated ' + stage.color : 'border-slate-300 grayscale'}`}
                >
                  <stage.icon
                    size={32}
                    weight={progress >= idx * 33 ? 'fill' : 'regular'}
                    className={progress >= idx * 33 ? stage.color : 'text-slate-400'}
                  />
                </div>
                <div className="absolute top-8 w-full text-center">
                  <div className="mb-1 text-xs font-bold tracking-widest text-slate-400">
                    阶段 0{idx + 1}
                  </div>
                  <div
                    className={`text-lg font-bold ${progress >= idx * 33 ? 'text-slate-800' : 'text-slate-300'}`}
                  >
                    {stage.label}
                  </div>
                </div>
                <motion.div
                  className="absolute bottom-8 right-12 rounded border border-slate-200 bg-white/80 p-2 text-xs shadow-soft backdrop-blur"
                  animate={{
                    opacity: progress >= idx * 33 - 10 && progress <= idx * 33 + 40 ? 1 : 0.5,
                  }}
                >
                  <div className="text-slate-400">{stage.metrics.label}</div>
                  <div className={`font-mono font-bold ${stage.color}`}>{stage.metrics.value}</div>
                </motion.div>
              </div>
            ))}
          </motion.div>

          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              style={{
                backgroundColor: travelerColor,
                scale: travelerScale,
                rotate: travelerRotate,
              }}
              className="flex h-12 w-12 items-center justify-center rounded-button text-white shadow-[0_0_30px_rgba(59,130,246,0.5)]"
            >
              <Cpu size={24} />
            </motion.div>
            <motion.div
              className="absolute inset-0 -z-10 rounded-button blur-xl"
              style={{ backgroundColor: travelerColor, opacity: 0.5 }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-slate-200 bg-white p-6">
          <button
            onClick={() => setProgress(0)}
            className="rounded-button p-2 text-slate-500 hover:bg-slate-100"
          >
            <Database size={20} />
          </button>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="absolute bottom-0 left-0 top-0 bg-slate-800"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <button
            onClick={() => setProgress(100)}
            className="rounded-button p-2 text-slate-500 hover:bg-slate-100"
          >
            <ChartBar size={20} />
          </button>
          <div className="w-12 text-right font-mono font-bold text-slate-600">{progress}%</div>
        </div>
      </div>
    </div>
  );
}
