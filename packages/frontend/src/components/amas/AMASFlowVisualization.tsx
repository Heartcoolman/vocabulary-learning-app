import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Brain,
  GraduationCap,
  Scales,
  Play,
  Pause,
  ArrowClockwise,
  Circle,
  WifiHigh,
  WifiSlash,
} from '@/components/Icon';
import { STORAGE_KEYS } from '../../constants/storageKeys';

export type FlowMode = 'idle' | 'demo' | 'live';

interface UserState {
  attention: number;
  fatigue: number;
  fusedFatigue?: number;
  visualFatigue?: number;
  motivation: number;
  cognitive: { mem: number; speed: number; stability: number };
}

interface AlgorithmWeights {
  ige: number;
  swd: number;
  heuristic: number;
  msmt: number;
  mdm: number;
  coldstart: number;
}

interface RawEvent {
  isCorrect: boolean;
  responseTime: number;
  wordId: string;
  timestamp: number;
}

export interface FlowFrame {
  id: string;
  timestamp: number;
  rawEvent: RawEvent;
  state: UserState;
  weights: AlgorithmWeights;
  reward: { value: number; reason: string };
  decision: { difficulty: string; batchSize: number; intervalScale: number };
  activeLayer: 'perception' | 'modeling' | 'learning' | 'decision' | null;
}

export interface AMASFlowVisualizationProps {
  mode: FlowMode;
  userId?: string;
  autoPlay?: boolean;
  showControls?: boolean;
  compact?: boolean;
  adminMode?: boolean;
  onConnectionChange?: (connected: boolean) => void;
}

const LAYERS = [
  { id: 'perception', title: '感知层', subtitle: '输入处理', icon: Eye, color: 'blue' },
  { id: 'modeling', title: '建模层', subtitle: '状态更新', icon: Brain, color: 'purple' },
  { id: 'learning', title: '学习层', subtitle: '策略优化', icon: GraduationCap, color: 'amber' },
  { id: 'decision', title: '决策层', subtitle: '行动执行', icon: Scales, color: 'emerald' },
];

const CARD_SPRING = { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.85 };
const STAGGER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: CARD_SPRING },
};

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
    ige: 0.2 + Math.random() * 0.2,
    swd: 0.15 + Math.random() * 0.2,
    msmt: 0.15 + Math.random() * 0.15,
    mdm: 0.12 + Math.random() * 0.18,
    heuristic: 0.1 + Math.random() * 0.15,
    coldstart: 0.05 + Math.random() * 0.1,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  Object.keys(weights).forEach((k) => {
    weights[k as keyof AlgorithmWeights] /= total;
  });

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

export default function AMASFlowVisualization({
  mode: initialMode,
  userId,
  autoPlay = true,
  showControls = true,
  compact = false,
  adminMode = false,
  onConnectionChange,
}: AMASFlowVisualizationProps) {
  const [mode, setMode] = useState<FlowMode>(initialMode);
  const [, setFrames] = useState<FlowFrame[]>([]);
  const [currentFrame, setCurrentFrame] = useState<FlowFrame | null>(null);
  const [activeLayerIndex, setActiveLayerIndex] = useState(-1);
  const [particles, setParticles] = useState<
    { id: string; from: number; to: number; color: string }[]
  >([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastFrameRef = useRef<FlowFrame | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      threshold: 0.1,
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const animateFlowLayers = useCallback(() => {
    const layerPositions = [12.5, 37.5, 62.5, 87.5];
    const colors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'];

    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setActiveLayerIndex(0);
    setParticles([{ id: `p-${Date.now()}-0`, from: 0, to: layerPositions[0], color: colors[0] }]);

    [1, 2, 3].forEach((i) => {
      timeoutsRef.current.push(
        setTimeout(() => {
          setActiveLayerIndex(i);
          setParticles((prev) => [
            ...prev,
            {
              id: `p-${Date.now()}-${i}`,
              from: layerPositions[i - 1],
              to: layerPositions[i],
              color: colors[i],
            },
          ]);
        }, i * 400),
      );
    });

    timeoutsRef.current.push(
      setTimeout(() => {
        setActiveLayerIndex(-1);
        setParticles([]);
      }, 2000),
    );
  }, []);

  const simulateDataFlow = useCallback(() => {
    const newFrame = generateMockFrame(lastFrameRef.current);
    lastFrameRef.current = newFrame;
    setFrames((prev) => [...prev.slice(-49), newFrame]);
    setCurrentFrame(newFrame);
    animateFlowLayers();
  }, [animateFlowLayers]);

  const processSSEFrame = useCallback(
    (data: {
      timestamp: number;
      rawEvent: { isCorrect: boolean; responseTime: number; wordId: string };
      state: UserState;
      weights: Record<string, number>;
      reward: { value: number; reason: string };
      decision: { difficulty: string; batchSize: number; intervalScale: number };
    }) => {
      const newFrame: FlowFrame = {
        id: `frame-${data.timestamp}`,
        timestamp: data.timestamp,
        rawEvent: { ...data.rawEvent, timestamp: data.timestamp },
        state: data.state,
        weights: {
          ige: data.weights.ige ?? 0.25,
          swd: data.weights.swd ?? 0.25,
          msmt: data.weights.msmt ?? 0.2,
          mdm: data.weights.mdm ?? 0.15,
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

  const connectSSE = useCallback(() => {
    if (!userId) return;
    if (eventSourceRef.current) return;

    const tokenKey = adminMode ? 'admin_token' : STORAGE_KEYS.AUTH_TOKEN;
    const token = localStorage.getItem(tokenKey);
    if (!token) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const url = `/api/realtime/users/${userId}/stream?event_types=amas-flow&token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setSseConnected(true);
      onConnectionChangeRef.current?.(true);
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    es.addEventListener('amas-flow', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.payload && typeof parsed.payload === 'object') {
          processSSEFrame(parsed.payload);
        }
      } catch {
        // Parse error ignored
      }
    });

    es.onerror = () => {
      setSseConnected(false);
      onConnectionChangeRef.current?.(false);
      es.close();
      eventSourceRef.current = null;

      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
      }
    };
  }, [userId, processSSEFrame, adminMode]);

  const disconnectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setSseConnected(false);
    onConnectionChangeRef.current?.(false);
  }, []);

  useEffect(() => {
    if (mode === 'demo' && isVisible && autoPlay) {
      simulateDataFlow();
      intervalRef.current = setInterval(simulateDataFlow, 3000);
    } else if (mode === 'live' && userId) {
      connectSSE();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      disconnectSSE();
    };
  }, [mode, isVisible, autoPlay, userId, simulateDataFlow, connectSSE, disconnectSSE]);

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

  const formatPercent = (v: number) => `${Math.round(v * 100)}%`;

  const containerClass = compact
    ? 'relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-4'
    : 'relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-8 shadow-floating ring-1 ring-black/[0.03]';

  return (
    <div ref={containerRef} className={containerClass}>
      {showControls && !compact && (
        <div className="mb-4 flex items-center justify-between">
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
          </div>
          <div className="flex items-center gap-2">
            {mode === 'idle' && (
              <button
                onClick={startDemo}
                className="flex items-center gap-2 rounded-button bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
              >
                <Play size={18} />
                启动演示
              </button>
            )}
            {mode === 'demo' && (
              <>
                <button
                  onClick={stopDemo}
                  className="rounded-button border border-gray-200 bg-white p-2 transition-colors hover:bg-gray-50"
                  aria-label="暂停演示"
                >
                  <Pause size={20} />
                </button>
                <button
                  onClick={simulateDataFlow}
                  className="rounded-button border border-gray-200 bg-white p-2 transition-colors hover:bg-gray-50"
                  aria-label="刷新数据"
                >
                  <ArrowClockwise size={20} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
        className={`relative z-20 grid ${compact ? 'grid-cols-4 gap-3' : 'grid-cols-4 gap-6'}`}
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
                className={`relative rounded-card border ${compact ? 'p-3' : 'p-5'} transition-colors ${
                  isActive
                    ? `bg-white/95 ${c.border} ring-2 ring-offset-2 ring-offset-slate-50 ${c.ring}`
                    : 'border-white/70 bg-white/80 hover:bg-white/90'
                }`}
              >
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-card"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.06, 0.12, 0.06] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ backgroundColor: layerRgb, willChange: 'opacity' }}
                  />
                )}
                <div className="relative z-10">
                  <div className={`mb-3 flex items-center gap-2.5 ${compact ? 'mb-2' : ''}`}>
                    <div
                      className={`rounded-card ${compact ? 'p-1.5' : 'p-2.5'} ${c.bg} shadow-inner`}
                    >
                      <layer.icon size={compact ? 16 : 22} className={c.icon} />
                    </div>
                    <div>
                      <h3 className={`font-bold ${c.text} ${compact ? 'text-sm' : ''}`}>
                        {layer.title}
                      </h3>
                      {!compact && <p className="text-xs text-gray-500">{layer.subtitle}</p>}
                    </div>
                  </div>
                  {!compact && currentFrame && (
                    <div className="space-y-2 text-sm">
                      {index === 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-500">响应时间</span>
                            <span className="font-medium">
                              {(currentFrame.rawEvent.responseTime / 1000).toFixed(1)}s
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
                      {index === 1 && (
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
                        </>
                      )}
                      {index === 2 && (
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
                        </>
                      )}
                      {index === 3 && (
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
                            <span className="font-medium">{currentFrame.decision.batchSize}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
