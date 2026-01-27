import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Brain,
  GraduationCap,
  Scales,
  Play,
  Pause,
  ArrowClockwise,
  Lightning,
  Clock,
  Pulse,
  TrendUp,
  Circle,
  Speedometer,
  Info,
  BookOpen,
  WifiHigh,
  WifiSlash,
  CaretDoubleUp,
  CheckCircle,
  XCircle,
} from '@/components/Icon';
import { STORAGE_KEYS } from '../../constants/storageKeys';

type DataMode = 'idle' | 'demo' | 'live';

interface UserState {
  attention: number;
  fatigue: number;
  fusedFatigue?: number;
  visualFatigue?: number;
  motivation: number;
  cognitive: { mem: number; speed: number; stability: number };
}

interface AlgorithmWeights {
  thompson: number;
  linucb: number;
  heuristic: number;
  actr: number;
  fsrs: number;
  coldstart: number;
}

interface RawEvent {
  isCorrect: boolean;
  responseTime: number;
  wordId: string;
  timestamp: number;
}

interface FlowFrame {
  id: string;
  timestamp: number;
  rawEvent: RawEvent;
  state: UserState;
  weights: AlgorithmWeights;
  reward: { value: number; reason: string };
  decision: { difficulty: string; batchSize: number; intervalScale: number };
  activeLayer: 'perception' | 'modeling' | 'learning' | 'decision' | null;
}

const LAYERS = [
  {
    id: 'perception',
    title: '感知层',
    subtitle: '输入处理',
    icon: Eye,
    color: 'blue',
    metrics: ['响应时间', '正确率', '停留时间'],
  },
  {
    id: 'modeling',
    title: '建模层',
    subtitle: '状态更新',
    icon: Brain,
    color: 'purple',
    metrics: ['注意力', '疲劳度', '动机'],
  },
  {
    id: 'learning',
    title: '学习层',
    subtitle: '策略优化',
    icon: GraduationCap,
    color: 'amber',
    metrics: ['记忆强度', '学习速度', '稳定性'],
  },
  {
    id: 'decision',
    title: '决策层',
    subtitle: '行动执行',
    icon: Scales,
    color: 'emerald',
    metrics: ['难度', '批次大小', '间隔系数'],
  },
];

const ALGORITHMS = [
  { id: 'thompson', name: 'Thompson', desc: '概率采样', color: '#3B82F6' },
  { id: 'linucb', name: 'LinUCB', desc: '上下文探索', color: '#8B5CF6' },
  { id: 'actr', name: 'ACT-R', desc: '记忆模型', color: '#F59E0B' },
  { id: 'fsrs', name: 'FSRS', desc: '17参数间隔调度', color: '#06B6D4' },
  { id: 'heuristic', name: '启发式', desc: '规则推理', color: '#10B981' },
  { id: 'coldstart', name: '冷启动', desc: '新用户策略', color: '#EC4899' },
];

const MODELING_ALGORITHMS = [
  { id: 'attentionMonitor', name: '注意力监测', desc: '实时追踪', color: '#3B82F6' },
  { id: 'fatigueEstimator', name: '疲劳估计', desc: '多源融合', color: '#EF4444' },
  { id: 'cognitiveProfiler', name: '认知画像', desc: '能力建模', color: '#8B5CF6' },
  { id: 'motivationTracker', name: '动机追踪', desc: '情绪识别', color: '#F59E0B' },
  { id: 'trendAnalyzer', name: '趋势分析', desc: '掌握预测', color: '#14B8A6' },
];

function generateMockFrame(prevFrame: FlowFrame | null): FlowFrame {
  const now = Date.now();
  const isCorrect = Math.random() > 0.3;
  const responseTime = 1500 + Math.random() * 3000;

  const prevState = prevFrame?.state || {
    attention: 0.7,
    fatigue: 0.3,
    visualFatigue: 0.25,
    fusedFatigue: 0.28,
    motivation: 0.6,
    cognitive: { mem: 0.5, speed: 0.6, stability: 0.7 },
  };

  const attention = Math.max(0.1, Math.min(1, prevState.attention + (Math.random() - 0.5) * 0.1));
  const fatigue = Math.max(
    0,
    Math.min(1, prevState.fatigue + (isCorrect ? -0.02 : 0.05) + Math.random() * 0.03),
  );
  const visualFatigue = Math.max(
    0,
    Math.min(1, (prevState.visualFatigue ?? 0.25) + (Math.random() - 0.4) * 0.06),
  );
  const fusedFatigue = Math.max(
    0,
    Math.min(1, fatigue * 0.4 + visualFatigue * 0.4 + 0.2 * Math.min(1, (now % 3600000) / 1800000)),
  );
  const motivation = Math.max(
    0.1,
    Math.min(1, prevState.motivation + (isCorrect ? 0.03 : -0.05) + (Math.random() - 0.5) * 0.05),
  );

  const weights: AlgorithmWeights = {
    thompson: 0.2 + Math.random() * 0.2,
    linucb: 0.15 + Math.random() * 0.2,
    actr: 0.15 + Math.random() * 0.15,
    fsrs: 0.12 + Math.random() * 0.18,
    heuristic: 0.1 + Math.random() * 0.15,
    coldstart: 0.05 + Math.random() * 0.1,
  };
  const total =
    weights.thompson +
    weights.linucb +
    weights.actr +
    weights.fsrs +
    weights.heuristic +
    weights.coldstart;
  weights.thompson /= total;
  weights.linucb /= total;
  weights.actr /= total;
  weights.fsrs /= total;
  weights.heuristic /= total;
  weights.coldstart /= total;

  return {
    id: `frame-${now}`,
    timestamp: now,
    rawEvent: {
      isCorrect,
      responseTime,
      wordId: `word-${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
    },
    state: {
      attention,
      fatigue,
      visualFatigue,
      fusedFatigue,
      motivation,
      cognitive: {
        mem: Math.max(0.1, Math.min(1, prevState.cognitive.mem + (isCorrect ? 0.02 : -0.03))),
        speed: Math.max(
          0.1,
          Math.min(1, prevState.cognitive.speed + (responseTime < 2000 ? 0.01 : -0.01)),
        ),
        stability: Math.max(
          0.1,
          Math.min(1, prevState.cognitive.stability + (Math.random() - 0.5) * 0.05),
        ),
      },
    },
    weights,
    reward: {
      value: isCorrect ? 0.3 + Math.random() * 0.4 : -0.2 - Math.random() * 0.3,
      reason: isCorrect ? '正确回答' : '回答错误',
    },
    decision: {
      difficulty: fusedFatigue > 0.7 ? 'easy' : attention > 0.6 ? 'hard' : 'mid',
      batchSize: Math.floor(5 + (1 - fusedFatigue) * 10),
      intervalScale: 0.8 + motivation * 0.4,
    },
    activeLayer: null,
  };
}

function StateGauge({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
}) {
  const percentage = Math.round(value * 100);
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference * (1 - value);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg className="h-full w-full -rotate-90">
          <circle
            cx="48"
            cy="48"
            r="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-100"
          />
          <motion.circle
            cx="48"
            cy="48"
            r="36"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon size={20} className="mb-1 text-gray-600" />
          <span className="text-lg font-bold text-gray-900">{percentage}%</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-medium text-gray-600">{label}</span>
    </div>
  );
}

function AlgorithmWheel({ weights }: { weights: AlgorithmWeights }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let currentAngle = -90;

  return (
    <div className="relative mx-auto h-48 w-48">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {ALGORITHMS.map((algo) => {
          const weight = weights[algo.id as keyof AlgorithmWeights];
          const angle = (weight / total) * 360;
          const startAngle = currentAngle;
          currentAngle += angle;

          const startRad = (startAngle * Math.PI) / 180;
          const endRad = ((startAngle + angle) * Math.PI) / 180;
          const largeArc = angle > 180 ? 1 : 0;

          const x1 = 50 + 40 * Math.cos(startRad);
          const y1 = 50 + 40 * Math.sin(startRad);
          const x2 = 50 + 40 * Math.cos(endRad);
          const y2 = 50 + 40 * Math.sin(endRad);

          return (
            <motion.path
              key={algo.id}
              d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={algo.color}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.85, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="cursor-pointer hover:opacity-100"
            />
          );
        })}
        <circle cx="50" cy="50" r="20" fill="white" />
        <text x="50" y="53" textAnchor="middle" className="fill-gray-700 text-[8px] font-bold">
          集成决策
        </text>
      </svg>
      <div className="absolute -bottom-8 left-0 right-0 flex justify-center gap-3 text-xs">
        {ALGORITHMS.map((algo) => (
          <div key={algo.id} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: algo.color }} />
            <span className="text-gray-600">
              {Math.round(weights[algo.id as keyof AlgorithmWeights] * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendLine({ data, color }: { data: number[]; color: string }) {
  const width = 120;
  const height = 40;
  const padding = 4;

  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((v - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={padding + (width - 2 * padding)}
        cy={height - padding - ((data[data.length - 1] - min) / range) * (height - 2 * padding)}
        r="3"
        fill={color}
      />
    </svg>
  );
}

const CARD_SPRING = { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.85 };
const STAGGER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: CARD_SPRING },
};

function DataParticle({
  from,
  to,
  color,
  delay,
}: {
  from: number;
  to: number;
  color: string;
  delay: number;
}) {
  const fromX = `${from}%`;
  const toX = `${to}%`;
  return (
    <>
      {/* Glow trail - single element with box-shadow */}
      <motion.div
        className="absolute top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full"
        style={{
          backgroundColor: color,
          left: fromX,
          boxShadow: `0 0 20px 8px ${color}40`,
          willChange: 'transform, opacity',
        }}
        initial={{ x: 0, opacity: 0, scale: 0.5 }}
        animate={{ x: `calc(${toX} - ${fromX})`, opacity: [0, 0.6, 0], scale: [0.5, 1, 0.3] }}
        transition={{ duration: 0.9, delay, ease: 'easeOut' }}
        aria-hidden="true"
      />
      {/* Main particle */}
      <motion.div
        className="pointer-events-none absolute top-1/2 z-20 -translate-y-1/2"
        style={{ left: fromX, willChange: 'transform, opacity' }}
        initial={{ x: 0, opacity: 0 }}
        animate={{ x: `calc(${toX} - ${fromX})`, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.8, delay, ease: 'circOut' }}
        aria-hidden="true"
      >
        <div className="relative flex items-center">
          <div
            className="h-3 w-3 rounded-full bg-white"
            style={{ boxShadow: `0 0 12px 3px ${color}` }}
          />
          <div
            className="absolute right-0.5 top-1/2 h-[2px] -translate-y-1/2 rounded-l-full"
            style={{ width: '45px', background: `linear-gradient(to left, ${color}, transparent)` }}
          />
        </div>
      </motion.div>
    </>
  );
}

const INTRO_STAGES = [
  {
    title: '感知层',
    subtitle: 'Perception',
    icon: Eye,
    description: '多维度捕捉学习者的实时状态与环境信息，构建全面的用户画像。',
    details: ['注意力追踪', '疲劳度监测', '学习动机评估'],
    fullDescription:
      '感知层是 AMAS 系统的数据入口，负责实时采集用户的多模态交互信号。通过分析答题响应时间、正确率波动、页面停留模式等行为数据，结合视觉疲劳检测算法，构建用户当前的认知状态快照。',
    features: [
      { name: '响应时间分析', desc: '毫秒级追踪用户反应速度变化' },
      { name: '正确率追踪', desc: '实时监测答题准确度趋势' },
      { name: '视觉疲劳检测', desc: '基于眨眼频率和注视模式的疲劳评估' },
      { name: '行为模式识别', desc: '识别学习节奏和注意力波动规律' },
    ],
    accentColor: 'bg-blue-500',
    bgColor: 'bg-blue-50/50',
    textColor: 'text-blue-600',
    borderColor: '#3B82F6',
  },
  {
    title: '建模层',
    subtitle: 'Modeling',
    icon: Brain,
    description: '构建动态的学习者认知模型，量化核心认知能力维度。',
    details: ['遗忘曲线拟合', '认知反应速度', 'TrendAnalyzer'],
    fullDescription:
      '建模层将感知层的原始数据转化为结构化的用户认知模型。采用 ACT-R 认知架构理论，动态拟合个性化遗忘曲线，追踪记忆激活度衰减规律，量化用户的记忆强度、学习速度和知识稳定性。',
    features: [
      { name: '个性化遗忘曲线', desc: '基于历史数据拟合用户专属记忆衰减模型' },
      { name: 'ACT-R 记忆激活', desc: '计算每个知识点的实时激活强度' },
      { name: '认知负荷评估', desc: '评估当前学习任务的认知资源消耗' },
      { name: 'TrendAnalyzer', desc: '分析学习趋势与掌握度演化轨迹' },
    ],
    accentColor: 'bg-purple-500',
    bgColor: 'bg-purple-50/50',
    textColor: 'text-purple-600',
    borderColor: '#8B5CF6',
  },
  {
    title: '学习层',
    subtitle: 'Learning',
    icon: GraduationCap,
    description: '持续进化的算法集成引擎，从交互数据中提取最优策略。',
    details: ['Thompson采样', 'FSRS调度', '集成策略投票'],
    fullDescription:
      '学习层是 AMAS 的智能核心，集成多种强化学习和间隔重复算法。通过 Thompson Sampling 进行概率探索，LinUCB 处理上下文特征，FSRS 实现个性化间隔调度，在探索与利用之间动态平衡，持续优化学习策略。',
    features: [
      { name: 'Thompson Sampling', desc: '贝叶斯概率采样，平衡探索与利用' },
      { name: 'LinUCB 上下文赌博机', desc: '根据用户特征选择最优复习策略' },
      { name: 'FSRS 17参数调度', desc: '17维参数驱动的个性化间隔优化' },
      { name: 'Ensemble 集成投票', desc: '多算法加权融合，提高决策鲁棒性' },
    ],
    accentColor: 'bg-amber-500',
    bgColor: 'bg-amber-50/50',
    textColor: 'text-amber-600',
    borderColor: '#F59E0B',
  },
  {
    title: '决策层',
    subtitle: 'Decision',
    icon: Scales,
    description: '生成个性化的学习策略与即时反馈，实现精准教学。',
    details: ['动态复习间隔', '自适应难度', '心流体验维持'],
    fullDescription:
      '决策层综合所有上游信息，生成最终的学习策略。根据用户疲劳度动态调整题目难度和批次大小，优化复习间隔以最大化长期记忆保持，同时维持用户的心流体验，避免过度疲劳或无聊。',
    features: [
      { name: '难度自适应', desc: '根据状态实时调整题目难度等级' },
      { name: '智能批次控制', desc: '疲劳时减少题量，状态好时增加强度' },
      { name: '间隔优化', desc: '计算每个单词的最佳复习时机' },
      { name: '心流维持', desc: '保持适度挑战，维持学习动力' },
    ],
    accentColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50/50',
    textColor: 'text-emerald-600',
    borderColor: '#10B981',
  },
];

function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [translateY, setTranslateY] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (expandedIndex !== null) return;
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = 0;
    },
    [expandedIndex],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (expandedIndex !== null) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY < 0) {
        currentYRef.current = deltaY;
        setTranslateY(deltaY * 0.5);
      }
    },
    [expandedIndex],
  );

  const handleTouchEnd = useCallback(() => {
    if (expandedIndex !== null) return;
    if (currentYRef.current < -50) {
      setIsExiting(true);
      setTimeout(onDismiss, 350);
    } else {
      setTranslateY(0);
    }
  }, [onDismiss, expandedIndex]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (expandedIndex !== null) return;
      if (e.deltaY > 30) {
        setIsExiting(true);
        setTimeout(onDismiss, 350);
      }
    },
    [onDismiss, expandedIndex],
  );

  const handleCardClick = useCallback(
    (index: number) => {
      setExpandedIndex(expandedIndex === index ? null : index);
    },
    [expandedIndex],
  );

  const expandedStage = expandedIndex !== null ? INTRO_STAGES[expandedIndex] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-slate-50 p-6"
      style={{
        transform: isExiting ? 'translate3d(0, -100%, 0)' : `translate3d(0, ${translateY}px, 0)`,
        transition: isExiting
          ? 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
          : translateY === 0
            ? 'transform 0.2s ease-out'
            : 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-0 top-0 h-1/2 w-1/2 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle at center, #bfdbfe 0%, transparent 60%)' }}
        />
        <div
          className="absolute bottom-0 right-0 h-1/2 w-1/2 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle at center, #ddd6fe 0%, transparent 60%)' }}
        />
      </div>

      {/* 详情面板 */}
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-6 transition-all duration-300"
        style={{
          opacity: expandedStage ? 1 : 0,
          pointerEvents: expandedStage ? 'auto' : 'none',
          backgroundColor: expandedStage ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)',
        }}
        onClick={() => setExpandedIndex(null)}
      >
        <div
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl transition-all duration-300"
          style={{
            borderTop: expandedStage
              ? `4px solid ${expandedStage.borderColor}`
              : '4px solid transparent',
            transform: expandedStage ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(20px)',
            opacity: expandedStage ? 1 : 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {expandedStage && (
            <>
              <div className={`p-6 ${expandedStage.bgColor}`}>
                <div className="mb-4 flex items-center gap-4">
                  <div
                    className={`rounded-2xl p-3 text-white ${expandedStage.accentColor} transition-transform duration-500`}
                    style={{ transform: 'rotate(-5deg) scale(1.05)' }}
                  >
                    <expandedStage.icon size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{expandedStage.title}</h2>
                    <span
                      className={`text-sm font-medium uppercase tracking-wide ${expandedStage.textColor}`}
                    >
                      {expandedStage.subtitle}
                    </span>
                  </div>
                  <button
                    className="ml-auto rounded-full p-2 transition-colors hover:bg-black/5"
                    onClick={() => setExpandedIndex(null)}
                  >
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <p className="leading-relaxed text-gray-700">{expandedStage.fullDescription}</p>
              </div>

              <div className="p-6">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
                  核心功能
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {expandedStage.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-4 transition-all duration-300"
                      style={{
                        opacity: expandedStage ? 1 : 0,
                        transform: expandedStage ? 'translateY(0)' : 'translateY(10px)',
                        transitionDelay: `${100 + idx * 50}ms`,
                      }}
                    >
                      <div className={`text-sm font-bold ${expandedStage.textColor} mb-1`}>
                        {feature.name}
                      </div>
                      <div className="text-sm text-gray-600">{feature.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="relative z-10 mb-8 text-center transition-all duration-500 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Core Architecture
        </div>
        <h1 className="mb-3 text-4xl font-bold text-gray-900 md:text-5xl">
          <span className="mb-1 block text-3xl text-slate-300 md:text-4xl">AMAS</span>
          <span className="bg-gradient-to-r from-blue-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
            Adaptive Intelligence
          </span>
        </h1>
        <p className="text-lg text-gray-500">像私人教练一样懂你的自适应学习系统</p>
      </div>

      <div className="relative z-10 mb-8 grid w-full max-w-4xl grid-cols-1 gap-3 md:grid-cols-2">
        {INTRO_STAGES.map((stage, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={stage.title}
              className={`cursor-pointer rounded-2xl border bg-white/90 p-4 transition-all duration-300 ease-out ${stage.bgColor}`}
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted
                  ? isHovered
                    ? 'translateY(-4px) scale(1.02)'
                    : 'translateY(0) scale(1)'
                  : 'translateY(16px) scale(1)',
                transitionDelay: mounted ? '0ms' : `${150 + i * 80}ms`,
                borderColor: isHovered ? stage.borderColor : 'rgba(255,255,255,0.6)',
                boxShadow: isHovered
                  ? '0 12px 24px -8px rgba(0,0,0,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => handleCardClick(i)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-xl p-2 text-white transition-transform duration-300 ${stage.accentColor}`}
                  style={{
                    transform: isHovered ? 'scale(1.1) rotate(-3deg)' : 'scale(1) rotate(0)',
                  }}
                >
                  <stage.icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">{stage.title}</h3>
                    <span className="text-xs text-gray-400">点击查看详情</span>
                  </div>
                  <span
                    className={`text-xs font-medium uppercase tracking-wide ${stage.textColor}`}
                  >
                    {stage.subtitle}
                  </span>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                    {stage.description}
                  </p>

                  <div
                    className="overflow-hidden transition-all duration-300 ease-out"
                    style={{
                      maxHeight: isHovered ? '100px' : '0px',
                      opacity: isHovered ? 1 : 0,
                      marginTop: isHovered ? '12px' : '0px',
                    }}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {stage.details.map((d) => (
                        <span
                          key={d}
                          className={`rounded-full border px-2 py-1 text-xs ${stage.textColor} bg-white/80`}
                          style={{ borderColor: 'currentColor', opacity: 0.8 }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="relative z-10 flex animate-bounce cursor-pointer flex-col items-center gap-1 text-gray-400 transition-opacity duration-500"
        style={{ opacity: mounted ? 1 : 0, transitionDelay: '500ms' }}
        onClick={() => {
          setIsExiting(true);
          setTimeout(onDismiss, 350);
        }}
      >
        <CaretDoubleUp size={24} />
        <span className="text-xs font-medium uppercase tracking-widest">上滑进入</span>
      </div>
    </div>
  );
}

export default function AboutDataFlow() {
  const [showIntro, setShowIntro] = useState(true);
  const [mode, setMode] = useState<DataMode>('idle');
  const [frames, setFrames] = useState<FlowFrame[]>([]);
  const [currentFrame, setCurrentFrame] = useState<FlowFrame | null>(null);
  const [activeLayerIndex, setActiveLayerIndex] = useState(-1);
  const [particles, setParticles] = useState<
    { id: string; from: number; to: number; color: string }[]
  >([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastFrameRef = useRef<FlowFrame | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [ambientParticles, setAmbientParticles] = useState<
    {
      id: string;
      left: string;
      top: string;
      size: number;
      opacity: number;
      duration: number;
      delay: number;
    }[]
  >([]);
  useEffect(() => {
    setAmbientParticles(
      Array.from({ length: 8 }, (_, i) => ({
        id: `ambient-${i}`,
        left: `${12 + Math.random() * 76}%`,
        top: `${18 + Math.random() * 55}%`,
        size: 2 + Math.random() * 2,
        opacity: 0.15 + Math.random() * 0.15,
        duration: 5 + Math.random() * 3,
        delay: i * 0.3,
      })),
    );
  }, []);

  const stateHistory = useMemo(() => {
    const history = {
      attention: [] as number[],
      fatigue: [] as number[],
      motivation: [] as number[],
    };
    frames.slice(-20).forEach((f) => {
      history.attention.push(f.state.attention);
      history.fatigue.push(f.state.fatigue);
      history.motivation.push(f.state.motivation);
    });
    return history;
  }, [frames]);

  const simulateDataFlow = useCallback(() => {
    const newFrame = generateMockFrame(lastFrameRef.current);
    lastFrameRef.current = newFrame;
    setFrames((prev) => [...prev.slice(-49), newFrame]);
    setCurrentFrame(newFrame);

    const layerPositions = [12.5, 37.5, 62.5, 87.5];
    const colors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'];

    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setActiveLayerIndex(0);
    setParticles([{ id: `p-${Date.now()}-0`, from: 0, to: layerPositions[0], color: colors[0] }]);

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(1);
        setParticles((prev) => [
          ...prev,
          {
            id: `p-${Date.now()}-1`,
            from: layerPositions[0],
            to: layerPositions[1],
            color: colors[1],
          },
        ]);
      }, 400),
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(2);
        setParticles((prev) => [
          ...prev,
          {
            id: `p-${Date.now()}-2`,
            from: layerPositions[1],
            to: layerPositions[2],
            color: colors[2],
          },
        ]);
      }, 800),
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(3);
        setParticles((prev) => [
          ...prev,
          {
            id: `p-${Date.now()}-3`,
            from: layerPositions[2],
            to: layerPositions[3],
            color: colors[3],
          },
        ]);
      }, 1200),
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(-1);
        setParticles([]);
      }, 2000),
    );
  }, []);

  const startDemo = useCallback(() => {
    setMode('demo');
    setFrames([]);
    lastFrameRef.current = null;
  }, []);

  const stopDemo = useCallback(() => {
    setMode('idle');
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setActiveLayerIndex(-1);
    setParticles([]);
  }, []);

  const animateFlowLayers = useCallback(() => {
    const layerPositions = [12.5, 37.5, 62.5, 87.5];
    const colors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'];

    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setActiveLayerIndex(0);
    setParticles([{ id: `p-${Date.now()}-0`, from: 0, to: layerPositions[0], color: colors[0] }]);

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(1);
        setParticles((prev) => [
          ...prev,
          {
            id: `p-${Date.now()}-1`,
            from: layerPositions[0],
            to: layerPositions[1],
            color: colors[1],
          },
        ]);
      }, 400),
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(2);
        setParticles((prev) => [
          ...prev,
          {
            id: `p-${Date.now()}-2`,
            from: layerPositions[1],
            to: layerPositions[2],
            color: colors[2],
          },
        ]);
      }, 800),
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(3);
        setParticles((prev) => [
          ...prev,
          {
            id: `p-${Date.now()}-3`,
            from: layerPositions[2],
            to: layerPositions[3],
            color: colors[3],
          },
        ]);
      }, 1200),
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(-1);
        setParticles([]);
      }, 2000),
    );
  }, []);

  const processSSEFrame = useCallback(
    (data: {
      timestamp: number;
      rawEvent: { isCorrect: boolean; responseTime: number; wordId: string };
      state: {
        attention: number;
        fatigue: number;
        fusedFatigue?: number;
        visualFatigue?: number;
        motivation: number;
        cognitive: { mem: number; speed: number; stability: number };
      };
      weights: Record<string, number>;
      reward: { value: number; reason: string };
      decision: { difficulty: string; batchSize: number; intervalScale: number };
    }) => {
      const newFrame: FlowFrame = {
        id: `frame-${data.timestamp}`,
        timestamp: data.timestamp,
        rawEvent: {
          isCorrect: data.rawEvent.isCorrect,
          responseTime: data.rawEvent.responseTime,
          wordId: data.rawEvent.wordId,
          timestamp: data.timestamp,
        },
        state: {
          attention: data.state.attention,
          fatigue: data.state.fatigue,
          fusedFatigue: data.state.fusedFatigue,
          visualFatigue: data.state.visualFatigue,
          motivation: data.state.motivation,
          cognitive: data.state.cognitive,
        },
        weights: {
          thompson: data.weights.thompson ?? 0.25,
          linucb: data.weights.linucb ?? 0.25,
          actr: data.weights.actr ?? 0.2,
          fsrs: data.weights.fsrs ?? 0.15,
          heuristic: data.weights.heuristic ?? 0.1,
          coldstart: data.weights.coldstart ?? 0.05,
        },
        reward: data.reward,
        decision: data.decision,
        activeLayer: null,
      };

      lastFrameRef.current = newFrame;
      setFrames((prev) => [...prev.slice(-49), newFrame]);
      setCurrentFrame(newFrame);
      animateFlowLayers();
    },
    [animateFlowLayers],
  );

  const startLiveMode = useCallback(
    async (email: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) {
        alert('请先登录');
        return;
      }

      // 通过邮箱查询用户 ID
      try {
        const lookupRes = await fetch(
          `/api/realtime/lookup-user?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
        );
        const lookupData = await lookupRes.json();
        if (!lookupRes.ok || !lookupData.success) {
          alert(lookupData.error || '未找到该邮箱对应的用户');
          return;
        }
        const targetUserId = lookupData.data.userId;

        setMode('live');
        setSessionId(email);
        setFrames([]);
        lastFrameRef.current = null;

        const url = `/api/realtime/users/${targetUserId}/stream?event_types=amas-flow&token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onopen = () => {
          setSseConnected(true);
        };

        es.addEventListener('amas-flow', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed.payload) {
              processSSEFrame(parsed.payload);
            }
          } catch {
            // Parse error ignored
          }
        });

        es.addEventListener('ping', () => {
          // Keep-alive
        });

        es.onerror = () => {
          setSseConnected(false);
        };
      } catch {
        alert('查询用户失败');
      }
    },
    [processSSEFrame],
  );

  const stopLiveMode = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setSseConnected(false);
    setMode('idle');
    setSessionId('');
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setActiveLayerIndex(-1);
    setParticles([]);
  }, []);

  useEffect(() => {
    if (mode === 'demo') {
      simulateDataFlow();
      intervalRef.current = setInterval(simulateDataFlow, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [mode, simulateDataFlow]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const formatTime = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const formatPercent = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 font-sans">
      {showIntro && <IntroOverlay onDismiss={() => setShowIntro(false)} />}

      {/* Animated Background - GPU optimized with CSS animations */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute left-[-8%] top-[-8%] h-[35%] w-[35%] animate-pulse rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(191, 219, 254, 0.5) 0%, transparent 70%)',
            animationDuration: '3s',
          }}
        />
        <div
          className="absolute bottom-[-8%] right-[-8%] h-[35%] w-[35%] animate-pulse rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(221, 214, 254, 0.5) 0%, transparent 70%)',
            animationDuration: '3s',
            animationDelay: '1s',
          }}
        />
        <div
          className="absolute left-[48%] top-[35%] h-[25%] w-[25%] -translate-x-1/2 animate-pulse rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(167, 243, 208, 0.4) 0%, transparent 70%)',
            animationDuration: '3s',
            animationDelay: '2s',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AMAS 数据流可视化</h1>
            <p className="mt-1 text-sm text-gray-500">
              {mode === 'live' && sessionId
                ? `正在监听: ${sessionId}`
                : '实时观察学习数据在四层架构中的流动与决策过程'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {mode === 'live' && (
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${sseConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {sseConnected ? <WifiHigh size={16} /> : <WifiSlash size={16} />}
                {sseConnected ? '已连接' : '断开'}
              </div>
            )}
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${mode === 'demo' ? 'bg-amber-100 text-amber-700' : mode === 'live' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
            >
              <Circle
                size={8}
                weight="fill"
                className={
                  mode === 'demo'
                    ? 'animate-pulse text-amber-500'
                    : mode === 'live'
                      ? 'animate-pulse text-green-500'
                      : 'text-gray-400'
                }
              />
              {mode === 'demo' ? '演示模式' : mode === 'live' ? '实时模式' : '待机'}
            </div>
            {mode === 'idle' && (
              <button
                onClick={startDemo}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
              >
                <Play size={18} />
                启动演示
              </button>
            )}
            {mode === 'demo' && (
              <>
                <button
                  onClick={stopDemo}
                  className="rounded-lg border border-gray-200 bg-white p-2 transition-colors hover:bg-gray-50"
                >
                  <Pause size={20} />
                </button>
                <button
                  onClick={simulateDataFlow}
                  className="rounded-lg border border-gray-200 bg-white p-2 transition-colors hover:bg-gray-50"
                >
                  <ArrowClockwise size={20} />
                </button>
              </>
            )}
            {mode === 'live' && (
              <button
                onClick={stopLiveMode}
                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-white transition-colors hover:bg-red-600"
              >
                <Pause size={18} />
                停止监听
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {mode === 'idle' && !currentFrame && (
          <div className="rounded-3xl border border-white/60 bg-white/85 p-12 shadow-lg ring-1 ring-black/[0.03]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
                <BookOpen size={40} className="text-blue-500" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">暂无学习数据</h2>
              <p className="mb-6 max-w-md text-gray-500">
                此页面用于可视化 AMAS
                系统在学习过程中的实时数据流。当你开始学习单词时，这里将展示每次答题的数据如何流经感知、建模、学习、决策四个层级。
              </p>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={startDemo}
                  className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-6 py-3 text-white transition-colors hover:bg-blue-600"
                >
                  <Play size={20} />
                  启动演示模式
                </button>
                <a
                  href="/learn"
                  className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <GraduationCap size={20} />
                  去学习
                </a>
              </div>
              <div className="w-full max-w-md">
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="输入用户邮箱启动实时监听"
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.currentTarget.value.trim();
                        if (input) startLiveMode(input);
                      }
                    }}
                  />
                  <button
                    onClick={(e) => {
                      const input = (
                        e.currentTarget.previousElementSibling as HTMLInputElement
                      )?.value.trim();
                      if (input) startLiveMode(input);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-white transition-colors hover:bg-green-600"
                  >
                    <WifiHigh size={18} />
                    实时监听
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  输入要监听的用户邮箱，当该用户学习时数据会实时显示
                </p>
              </div>
              <div className="mt-8 max-w-lg rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-start gap-3">
                  <Info size={20} className="mt-0.5 flex-shrink-0 text-green-600" />
                  <div className="text-left text-sm text-green-800">
                    <p className="mb-1 font-medium">实时监听说明</p>
                    <p className="text-green-700">
                      输入用户邮箱后，当该用户在学习页面答题时，这里会实时展示 AMAS
                      系统的数据流动过程。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pipeline - only show when has data */}
        {(mode !== 'idle' || currentFrame) && (
          <>
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-8 shadow-xl ring-1 ring-black/[0.03]">
              {/* Ambient Particles - CSS animated */}
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-3xl">
                {ambientParticles.map((p) => (
                  <span
                    key={p.id}
                    className="absolute animate-float rounded-full bg-slate-400/40"
                    style={{
                      left: p.left,
                      top: p.top,
                      width: p.size,
                      height: p.size,
                      opacity: p.opacity,
                      animationDuration: `${p.duration}s`,
                      animationDelay: `${p.delay}s`,
                    }}
                  />
                ))}
              </div>
              {/* Connecting Line with Pulse */}
              <div className="absolute left-[12.5%] right-[12.5%] top-1/2 z-[5] h-[2px] -translate-y-1/2 overflow-hidden rounded-full bg-gray-100">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-100 via-purple-100 to-emerald-100 opacity-60" />
                <motion.div
                  className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-blue-300/50 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                  style={{ willChange: 'transform' }}
                />
              </div>

              <AnimatePresence>
                {particles.map((p) => (
                  <DataParticle key={p.id} from={p.from} to={p.to} color={p.color} delay={0} />
                ))}
              </AnimatePresence>

              <motion.div
                className="relative z-20 grid grid-cols-4 gap-6"
                variants={STAGGER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                {LAYERS.map((layer, index) => {
                  const isActive = activeLayerIndex === index;
                  const colors: Record<
                    string,
                    { bg: string; border: string; text: string; icon: string; ring: string }
                  > = {
                    blue: {
                      bg: 'bg-blue-50/80',
                      border: 'border-blue-200',
                      text: 'text-blue-700',
                      icon: 'text-blue-500',
                      ring: 'ring-blue-100',
                    },
                    purple: {
                      bg: 'bg-purple-50/80',
                      border: 'border-purple-200',
                      text: 'text-purple-700',
                      icon: 'text-purple-500',
                      ring: 'ring-purple-100',
                    },
                    amber: {
                      bg: 'bg-amber-50/80',
                      border: 'border-amber-200',
                      text: 'text-amber-700',
                      icon: 'text-amber-500',
                      ring: 'ring-amber-100',
                    },
                    emerald: {
                      bg: 'bg-emerald-50/80',
                      border: 'border-emerald-200',
                      text: 'text-emerald-700',
                      icon: 'text-emerald-500',
                      ring: 'ring-emerald-100',
                    },
                  };
                  const c = colors[layer.color];
                  const layerRgb =
                    layer.color === 'blue'
                      ? '#3B82F6'
                      : layer.color === 'purple'
                        ? '#8B5CF6'
                        : layer.color === 'amber'
                          ? '#F59E0B'
                          : '#10B981';
                  const rippleColor =
                    layer.color === 'blue'
                      ? '#93C5FD'
                      : layer.color === 'purple'
                        ? '#C4B5FD'
                        : layer.color === 'amber'
                          ? '#FCD34D'
                          : '#6EE7B7';

                  return (
                    <motion.div key={layer.id} variants={STAGGER_ITEM}>
                      <motion.div
                        animate={{
                          y: isActive ? -3 : 0,
                          scale: isActive ? 1.03 : 1,
                          boxShadow: isActive
                            ? '0 16px 32px -12px rgba(15, 23, 42, 0.2)'
                            : '0 2px 8px -2px rgba(0,0,0,0.06)',
                        }}
                        transition={CARD_SPRING}
                        className={`relative rounded-2xl border p-5 transition-colors ${
                          isActive
                            ? `bg-white/95 ${c.border} ring-2 ring-offset-2 ring-offset-slate-50 ${c.ring}`
                            : 'border-white/70 bg-white/80 hover:bg-white/90'
                        }`}
                      >
                        {isActive && (
                          <>
                            <motion.div
                              className="absolute inset-0 rounded-2xl"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: [0.06, 0.12, 0.06] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                              style={{ backgroundColor: layerRgb, willChange: 'opacity' }}
                            />
                            <motion.div
                              className="absolute -inset-1 rounded-[18px] border"
                              initial={{ opacity: 0.4, scale: 0.98 }}
                              animate={{ opacity: 0, scale: 1.08 }}
                              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                              style={{ borderColor: rippleColor, willChange: 'transform, opacity' }}
                            />
                          </>
                        )}
                        <div className="relative z-10">
                          <div className="mb-3 flex items-center gap-2.5">
                            <div className={`rounded-xl p-2.5 ${c.bg} shadow-inner`}>
                              <layer.icon size={22} className={c.icon} />
                            </div>
                            <div>
                              <h3 className={`font-bold ${c.text}`}>{layer.title}</h3>
                              <p className="text-xs text-gray-500">{layer.subtitle}</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm">
                            {index === 0 && currentFrame && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">响应时间</span>
                                  <span className="font-medium">
                                    {formatTime(currentFrame.rawEvent.responseTime)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">正确率</span>
                                  <span
                                    className={`font-medium ${currentFrame.rawEvent.isCorrect ? 'text-green-600' : 'text-red-600'}`}
                                  >
                                    {currentFrame.rawEvent.isCorrect ? '正确' : '错误'}
                                  </span>
                                </div>
                              </>
                            )}
                            {index === 1 && currentFrame && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">注意力</span>
                                  <span className="font-medium">
                                    {formatPercent(currentFrame.state.attention)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">疲劳度</span>
                                  <span className="font-medium">
                                    {formatPercent(currentFrame.state.fatigue)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">动机</span>
                                  <span className="font-medium">
                                    {formatPercent(currentFrame.state.motivation)}
                                  </span>
                                </div>
                              </>
                            )}
                            {index === 2 && currentFrame && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">记忆强度</span>
                                  <span className="font-medium">
                                    {formatPercent(currentFrame.state.cognitive.mem)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">学习速度</span>
                                  <span className="font-medium">
                                    {formatPercent(currentFrame.state.cognitive.speed)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">稳定性</span>
                                  <span className="font-medium">
                                    {formatPercent(currentFrame.state.cognitive.stability)}
                                  </span>
                                </div>
                              </>
                            )}
                            {index === 3 && currentFrame && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">难度</span>
                                  <span className="font-medium">
                                    {currentFrame.decision.difficulty === 'easy'
                                      ? '简单'
                                      : currentFrame.decision.difficulty === 'hard'
                                        ? '困难'
                                        : '中等'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">批次大小</span>
                                  <span className="font-medium">
                                    {currentFrame.decision.batchSize}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">间隔系数</span>
                                  <span className="font-medium">
                                    {currentFrame.decision.intervalScale.toFixed(2)}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>

            {/* Bottom Panels */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Algorithm Weights */}
              <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-lg ring-1 ring-black/[0.03]">
                <div className="mb-6 flex items-center gap-2">
                  <Lightning size={20} className="text-amber-500" />
                  <h2 className="font-bold text-gray-900">算法集成权重</h2>
                </div>
                {currentFrame && <AlgorithmWheel weights={currentFrame.weights} />}
                <div className="mt-10 grid grid-cols-2 gap-3">
                  {ALGORITHMS.map((algo) => (
                    <div
                      key={algo.id}
                      className="flex items-center gap-2 rounded-lg bg-gray-50 p-2"
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: algo.color }}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{algo.name}</div>
                        <div className="text-xs text-gray-500">{algo.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* User State Gauges */}
              <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-lg ring-1 ring-black/[0.03]">
                <div className="mb-4 flex items-center gap-2">
                  <Speedometer size={20} className="text-blue-500" />
                  <h2 className="font-bold text-gray-900">用户状态</h2>
                </div>
                {currentFrame && (
                  <div className="space-y-4">
                    <div className="flex justify-around">
                      <StateGauge
                        label="注意力"
                        value={currentFrame.state.attention}
                        color="#3B82F6"
                        icon={Eye}
                      />
                      <StateGauge
                        label="融合疲劳"
                        value={currentFrame.state.fusedFatigue ?? currentFrame.state.fatigue}
                        color="#EF4444"
                        icon={Pulse}
                      />
                      <StateGauge
                        label="动机"
                        value={currentFrame.state.motivation}
                        color="#F59E0B"
                        icon={TrendUp}
                      />
                    </div>
                    <div className="border-t border-gray-100 pt-4">
                      <div className="mb-3 text-center text-xs text-gray-500">疲劳分解</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-red-50 p-2 text-center">
                          <div className="text-lg font-bold text-red-700">
                            {Math.round((currentFrame.state.fatigue ?? 0) * 100)}%
                          </div>
                          <div className="text-xs text-red-600">行为疲劳</div>
                        </div>
                        <div className="rounded-lg bg-rose-50 p-2 text-center">
                          <div className="text-lg font-bold text-rose-700">
                            {Math.round((currentFrame.state.visualFatigue ?? 0) * 100)}%
                          </div>
                          <div className="text-xs text-rose-600">视觉疲劳</div>
                        </div>
                        <div className="rounded-lg bg-orange-50 p-2 text-center">
                          <div className="text-lg font-bold text-orange-700">
                            {Math.round(
                              (currentFrame.state.fusedFatigue ?? currentFrame.state.fatigue) * 100,
                            )}
                            %
                          </div>
                          <div className="text-xs text-orange-600">融合疲劳</div>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 pt-4">
                      <div className="mb-3 text-center text-xs text-gray-500">认知档案</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-purple-50 p-2 text-center">
                          <div className="text-lg font-bold text-purple-700">
                            {Math.round(currentFrame.state.cognitive.mem * 100)}%
                          </div>
                          <div className="text-xs text-purple-600">记忆</div>
                        </div>
                        <div className="rounded-lg bg-cyan-50 p-2 text-center">
                          <div className="text-lg font-bold text-cyan-700">
                            {Math.round(currentFrame.state.cognitive.speed * 100)}%
                          </div>
                          <div className="text-xs text-cyan-600">速度</div>
                        </div>
                        <div className="rounded-lg bg-green-50 p-2 text-center">
                          <div className="text-lg font-bold text-green-700">
                            {Math.round(currentFrame.state.cognitive.stability * 100)}%
                          </div>
                          <div className="text-xs text-green-600">稳定性</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Trend Lines */}
              <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-lg ring-1 ring-black/[0.03]">
                <div className="mb-6 flex items-center gap-2">
                  <TrendUp size={20} className="text-emerald-500" />
                  <h2 className="font-bold text-gray-900">状态趋势</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">注意力</span>
                    <TrendLine data={stateHistory.attention} color="#3B82F6" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">疲劳度</span>
                    <TrendLine data={stateHistory.fatigue} color="#EF4444" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">动机</span>
                    <TrendLine data={stateHistory.motivation} color="#F59E0B" />
                  </div>
                </div>
                {currentFrame && (
                  <div className="mt-6 rounded-lg bg-gray-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Clock size={16} className="text-gray-400" />
                      <span className="text-xs text-gray-500">最近奖励</span>
                    </div>
                    <div
                      className={`text-lg font-bold ${currentFrame.reward.value > 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {currentFrame.reward.value > 0 ? '+' : ''}
                      {currentFrame.reward.value.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">{currentFrame.reward.reason}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Modeling Algorithms Panel */}
            <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-lg ring-1 ring-black/[0.03]">
              <div className="mb-4 flex items-center gap-2">
                <Brain size={20} className="text-purple-500" />
                <h2 className="font-bold text-gray-900">建模层算法</h2>
                <span className="ml-auto text-xs text-gray-400">Modeling Layer</span>
              </div>
              {currentFrame && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {MODELING_ALGORITHMS.map((algo, idx) => {
                    const values = [
                      currentFrame.state.attention,
                      currentFrame.state.fusedFatigue ?? currentFrame.state.fatigue,
                      (currentFrame.state.cognitive.mem +
                        currentFrame.state.cognitive.speed +
                        currentFrame.state.cognitive.stability) /
                        3,
                      currentFrame.state.motivation,
                      Math.max(
                        0,
                        Math.min(
                          1,
                          0.5 +
                            (stateHistory.attention.length > 1
                              ? (stateHistory.attention[stateHistory.attention.length - 1] -
                                  stateHistory.attention[0]) *
                                0.8
                              : 0),
                        ),
                      ),
                    ];
                    const value = values[idx];
                    return (
                      <div
                        key={algo.id}
                        className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900">{algo.name}</div>
                          <div className="text-xs font-bold" style={{ color: algo.color }}>
                            {Math.round(value * 100)}%
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{algo.desc}</div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: algo.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round(value * 100)}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Event Log */}
            <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-lg ring-1 ring-black/[0.03]">
              <div className="mb-4 flex items-center gap-2">
                <Pulse size={20} className="text-purple-500" />
                <h2 className="font-bold text-gray-900">事件日志</h2>
                <span className="ml-auto text-xs text-gray-400">最近 {frames.length} 条</span>
              </div>
              <div className="overflow-x-auto">
                <div className="flex gap-2 pb-2">
                  {frames.slice(-10).map((frame) => (
                    <motion.div
                      key={frame.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex-shrink-0 rounded-lg border p-3 ${frame.rawEvent.isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
                    >
                      <div className="text-xs text-gray-500">
                        {new Date(frame.timestamp).toLocaleTimeString()}
                      </div>
                      <div
                        className={`flex items-center gap-1 text-sm font-medium ${frame.rawEvent.isCorrect ? 'text-green-700' : 'text-red-700'}`}
                      >
                        {frame.rawEvent.isCorrect ? (
                          <>
                            <CheckCircle size={14} weight="fill" /> 正确
                          </>
                        ) : (
                          <>
                            <XCircle size={14} weight="fill" /> 错误
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTime(frame.rawEvent.responseTime)}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
