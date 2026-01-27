import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Eye, Graph, Brain, ArrowsSplit, X } from '@/components/Icon';

interface NodeData {
  id: string;
  label: string;
  description: string;
  details: string[];
  icon: React.ElementType;
  color: string;
  position: { x: number; y: number };
}

const NODES: NodeData[] = [
  {
    id: 'perception',
    label: '感知层',
    description: '数据采集与过滤',
    details: ['视觉输入处理', '音频信号分析', '上下文感知', '注意力过滤'],
    icon: Eye,
    color: 'text-blue-500',
    position: { x: 0, y: -120 },
  },
  {
    id: 'modeling',
    label: '建模层',
    description: '知识结构化',
    details: ['知识图谱构建', '模式识别', '语义关联', '概念抽象'],
    icon: Graph,
    color: 'text-purple-500',
    position: { x: 120, y: 0 },
  },
  {
    id: 'learning',
    label: '学习层',
    description: '策略适应',
    details: ['学习表现追踪', '遗忘曲线分析', '难度调整', '反馈整合'],
    icon: Brain,
    color: 'text-pink-500',
    position: { x: 0, y: 120 },
  },
  {
    id: 'decision',
    label: '决策层',
    description: '行动执行',
    details: ['内容选择', '复习调度', '下一步预测', '干预触发'],
    icon: ArrowsSplit,
    color: 'text-teal-500',
    position: { x: -120, y: 0 },
  },
];

export default function AboutNeuralHub() {
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [isRippling, setIsRippling] = useState(false);
  const [rippleIndex, setRippleIndex] = useState(-1);

  useEffect(() => {
    if (isRippling) {
      let currentIndex = 0;
      setRippleIndex(currentIndex);

      const interval = setInterval(() => {
        currentIndex++;
        if (currentIndex >= NODES.length) {
          setIsRippling(false);
          setRippleIndex(-1);
          clearInterval(interval);
        } else {
          setRippleIndex(currentIndex);
        }
      }, 600);

      return () => clearInterval(interval);
    }
  }, [isRippling]);

  const triggerRipple = () => {
    if (!isRippling) setIsRippling(true);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute left-10 top-10 h-64 w-64 rounded-full bg-blue-200 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-64 w-64 rounded-full bg-purple-200 blur-3xl" />
      </div>

      <div className="relative flex h-[400px] w-[400px] items-center justify-center">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="-200 -200 400 400"
        >
          <defs>
            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0" />
              <stop offset="50%" stopColor="#60a5fa" stopOpacity="1" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
            </linearGradient>
          </defs>
          {NODES.map((node) => (
            <g key={`conn-${node.id}`}>
              <path
                d={`M 0 0 Q ${node.position.x * 0.5} ${node.position.y * 0.5} ${node.position.x} ${node.position.y}`}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="2"
              />
              <motion.path
                d={`M 0 0 Q ${node.position.x * 0.5} ${node.position.y * 0.5} ${node.position.x} ${node.position.y}`}
                fill="none"
                stroke="url(#flowGradient)"
                strokeWidth="2"
                strokeDasharray="4 4"
                initial={{ strokeDashoffset: 20 }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              />
            </g>
          ))}
        </svg>

        <motion.div
          className="group relative z-10 cursor-pointer"
          onClick={triggerRipple}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            className="absolute inset-0 rounded-full bg-blue-500 opacity-20"
            animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0, 0.2] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative z-10 flex h-20 w-20 flex-col items-center justify-center rounded-full border-2 border-blue-100 bg-white shadow-lg">
            <User size={32} className="mb-1 text-blue-600" />
            <span className="text-[10px] font-bold tracking-wider text-blue-900">用户</span>
          </div>
        </motion.div>

        {NODES.map((node, index) => {
          const isActive = activeNode === node.id;
          const isRippleActive = rippleIndex === index;

          return (
            <motion.div
              key={node.id}
              className="absolute"
              style={{
                left: `calc(50% + ${node.position.x}px)`,
                top: `calc(50% + ${node.position.y}px)`,
                transform: 'translate(-50%, -50%)',
              }}
              animate={{
                scale: isActive ? 1.2 : 1,
                opacity: activeNode && !isActive ? 0.4 : 1,
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              <motion.button
                onClick={() => setActiveNode(isActive ? null : node.id)}
                className={`group relative flex h-16 w-16 flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-md transition-all duration-300 hover:shadow-xl ${isActive ? 'z-20 ring-4 ring-blue-100 ring-offset-2' : 'z-10'}`}
                whileHover={{ scale: 1.1 }}
                animate={
                  isRippleActive
                    ? { scale: [1, 1.2, 1], boxShadow: '0 0 0 10px rgba(99, 102, 241, 0.2)' }
                    : {}
                }
              >
                <node.icon size={28} className={node.color} />
                <span className="absolute -bottom-6 whitespace-nowrap rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm">
                  {node.label}
                </span>
              </motion.button>
            </motion.div>
          );
        })}

        <AnimatePresence>
          {activeNode && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="absolute -bottom-48 left-1/2 z-30 w-80 -translate-x-1/2 rounded-2xl border border-white/50 bg-white/95 p-5 shadow-2xl backdrop-blur-xl"
            >
              {(() => {
                const node = NODES.find((n) => n.id === activeNode);
                if (!node) return null;
                return (
                  <div>
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`rounded-xl bg-slate-50 p-2.5 ${node.color} ring-1 ring-slate-100`}
                        >
                          <node.icon size={24} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold leading-tight text-slate-800">
                            {node.label}
                          </h3>
                          <p className="text-xs font-medium text-slate-500">{node.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveNode(null)}
                        className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {node.details.map((detail, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex items-center gap-2.5 text-sm text-slate-600"
                        >
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                          {detail}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
