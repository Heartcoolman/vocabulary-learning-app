/**
 * AMAS 公开展示 - 交互模拟演示页 (The Decision Lab)
 *
 * 功能：
 * - 展示 Ensemble 成员投票与共识机制
 * - "Tug of War" 可视化决策过程
 * - 场景预设（新手、疲劳、毕业时刻等）
 * - 实时参数调节
 * - 噪声注入测试
 */

import { useState, useCallback, useMemo } from 'react';
import type { ElementType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Gear,
  Lightning,
  Sliders,
  Target,
  UserFocus,
  Pulse,
  Flask,
  CheckCircle,
  Warning,
  Shuffle,
  Robot,
} from '../../components/Icon';
import { simulate, SimulateRequest, SimulateResponse } from '../../services/aboutApi';
import { fadeInVariants, staggerContainerVariants } from '../../utils/animations';
import { amasLogger } from '../../utils/logger';

// ==================== Types & Config ====================

// SimulateResponse已经包含了所有需要的字段，无需扩展
type ExtendedSimulateResponse = SimulateResponse;

const ALGO_COLORS: Record<string, string> = {
  thompson: 'text-blue-500',
  linucb: 'text-purple-500',
  actr: 'text-amber-500',
  heuristic: 'text-emerald-500',
  coldstart: 'text-gray-500',
};

const ALGO_BG: Record<string, string> = {
  thompson: 'bg-blue-500',
  linucb: 'bg-purple-500',
  actr: 'bg-amber-500',
  heuristic: 'bg-emerald-500',
  coldstart: 'bg-gray-500',
};

const SCENARIOS = [
  { id: 'newUser', name: '新手起步', icon: UserFocus, desc: '冷启动阶段' },
  { id: 'motivated', name: '精力充沛', icon: Lightning, desc: '高探索权重' },
  { id: 'tired', name: '疲劳状态', icon: Pulse, desc: '保守策略' },
  { id: 'graduation', name: '毕业时刻', icon: CheckCircle, desc: '冷启动 -> 集成' },
];

const LEARNING_MODES = [
  { id: 'standard', name: '标准模式', icon: Target, desc: '平衡长期记忆' },
  { id: 'cram', name: '突击模式', icon: Lightning, desc: '考前冲刺' },
  { id: 'relaxed', name: '轻松模式', icon: Pulse, desc: '降低压力' },
];

// ==================== Helper Components ====================

function ControlSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  icon: Icon,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  icon: ElementType;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <Icon size={16} className="text-gray-400" />
          {label}
        </div>
        <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-indigo-500 transition-all hover:accent-indigo-400"
      />
    </div>
  );
}

// ==================== Visualization Components ====================

// 1. Consensus Visualizer (Tug of War)
function ConsensusVisualizer({
  result,
  loading,
}: {
  result: ExtendedSimulateResponse | null;
  loading: boolean;
}) {
  // Generate mock vote positions if not provided by API
  const voteData = useMemo(() => {
    if (!result) return [];

    const difficulty =
      result.outputStrategy.difficulty === 'hard'
        ? 0.8
        : result.outputStrategy.difficulty === 'mid'
          ? 0.5
          : 0.2;

    const weights = result.decisionProcess.weights;
    const members = Object.keys(weights);

    return members.map((id) => {
      let bias = 0;
      if (id === 'actr') bias = -0.1;
      if (id === 'thompson') bias = 0.15;
      if (id === 'linucb') bias = 0.05;

      const weight = weights[id as keyof typeof weights];
      const position = Math.max(
        0.1,
        Math.min(0.9, difficulty + bias + (Math.random() * 0.1 - 0.05)),
      );

      return {
        id,
        weight,
        position,
        label: id.toUpperCase(),
      };
    });
  }, [result]);

  const finalPosition = result
    ? result.outputStrategy.difficulty === 'hard'
      ? 0.8
      : result.outputStrategy.difficulty === 'mid'
        ? 0.5
        : 0.2
    : 0.5;

  return (
    <div className="relative min-h-[240px] overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-20" />

      <div className="mb-8 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
          <Target className="text-rose-500" />
          决策共识 (The Neural Tug-of-War)
        </h3>
        {result?.decisionProcess.phase && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              result.decisionProcess.phase === 'explore'
                ? 'bg-blue-100 text-blue-700'
                : result.decisionProcess.phase === 'classify'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            阶段:{' '}
            {result.decisionProcess.phase === 'explore'
              ? '探索'
              : result.decisionProcess.phase === 'classify'
                ? '分类'
                : '正常'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-gray-400">
          <Gear className="animate-spin" size={24} /> 计算神经网络权重...
        </div>
      ) : !result ? (
        <div className="flex h-32 items-center justify-center text-sm italic text-gray-400">
          等待输入参数...
        </div>
      ) : (
        <div className="relative px-4 pb-12 pt-8">
          <div className="relative mb-2 h-2 w-full rounded-full bg-gray-100">
            <div className="absolute -bottom-6 left-0 text-xs text-gray-400">简单</div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-400">
              中等
            </div>
            <div className="absolute -bottom-6 right-0 text-xs text-gray-400">困难</div>
          </div>

          <AnimatePresence>
            {voteData.map((vote) => (
              <motion.div
                key={vote.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1, left: `${vote.position * 100}%` }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="group absolute top-0 z-10 -ml-2 -mt-1.5 cursor-help"
                style={{ left: `${vote.position * 100}%` }}
              >
                <div
                  className={`h-4 w-4 rounded-full border-2 border-white shadow-sm ${ALGO_BG[vote.id] || 'bg-gray-400'}`}
                />

                <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {vote.label}: {(vote.weight * 100).toFixed(0)}% 权重
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <motion.div
            layoutId="decision-marker"
            initial={{ scale: 0 }}
            animate={{ scale: 1, left: `${finalPosition * 100}%` }}
            className="absolute top-[-8px] z-20 -ml-4 flex flex-col items-center"
            style={{ left: `${finalPosition * 100}%` }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-4 border-rose-500 bg-white shadow-lg">
              <div className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            </div>
            <div className="mt-2 rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
              FINAL
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// 2. Decision Receipt
function DecisionReceipt({ result }: { result: ExtendedSimulateResponse | null }) {
  if (!result) return null;

  const winner = Object.entries(result.decisionProcess.weights).sort(([, a], [, b]) => b - a)[0];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-xl border-2 border-gray-200/60 bg-white/80 p-0 shadow-sm backdrop-blur-sm"
    >
      <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-amber-500 to-rose-500 opacity-10" />

      <div className="border-b border-dashed border-gray-100 p-6">
        <div className="mb-4 text-center">
          <h4 className="mb-1 text-xs uppercase tracking-widest text-gray-400">
            决策凭证 (Decision Receipt)
          </h4>
          <div className="font-mono text-3xl font-bold text-gray-800">
            {result.outputStrategy.difficulty === 'easy'
              ? '简单'
              : result.outputStrategy.difficulty === 'mid'
                ? '中等'
                : '困难'}
          </div>
          <div className="mt-1 text-sm font-medium text-emerald-500">
            Interval: x{result.outputStrategy.interval_scale.toFixed(1)}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>主导算法</span>
            <span className={`font-bold ${ALGO_COLORS[winner[0]] || 'text-gray-500'}`}>
              {winner[0].toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>置信度</span>
            <span>{(winner[1] * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>生词比例</span>
            <span>{(result.outputStrategy.new_ratio * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>学习模式</span>
            <span className="font-medium text-emerald-600">
              {result.outputStrategy.difficulty === 'easy'
                ? '轻松'
                : result.outputStrategy.difficulty === 'hard'
                  ? '突击'
                  : '标准'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-500">
        ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
        <br />
        TS: {new Date().toISOString()}
        <br />
        SRC: {result.decisionProcess.decisionSource.toUpperCase()}
      </div>
    </motion.div>
  );
}

// ==================== Main Page ====================

export default function SimulationPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtendedSimulateResponse | null>(null);

  const [params, setParams] = useState<SimulateRequest>({
    attention: 0.7,
    fatigue: 0.2,
    motivation: 0.6,
    cognitive: { memory: 0.6, speed: 0.7, stability: 0.6 },
    scenario: 'newUser',
  });

  const [injectNoise, setInjectNoise] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState('newUser');
  const [selectedMode, setSelectedMode] = useState('standard');

  const handleScenarioChange = (id: string) => {
    setSelectedScenario(id);
    let preset: Partial<SimulateRequest> = {};

    if (id === 'newUser') {
      preset = {
        attention: 0.5,
        fatigue: 0.1,
        motivation: 0.8,
        cognitive: { memory: 0.3, speed: 0.4, stability: 0.2 },
      };
    } else if (id === 'motivated') {
      preset = {
        attention: 0.9,
        fatigue: 0.1,
        motivation: 0.9,
        cognitive: { memory: 0.8, speed: 0.9, stability: 0.8 },
      };
    } else if (id === 'tired') {
      preset = {
        attention: 0.4,
        fatigue: 0.9,
        motivation: 0.2,
        cognitive: { memory: 0.5, speed: 0.3, stability: 0.4 },
      };
    } else if (id === 'graduation') {
      preset = {
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.7,
        cognitive: { memory: 0.7, speed: 0.6, stability: 0.7 },
      };
    }

    setParams((prev) => ({
      ...prev,
      ...preset,
      scenario: id === 'graduation' ? 'newUser' : (id as any),
      cognitive: { ...prev.cognitive, ...(preset.cognitive || {}) },
    }));
  };

  const runSimulation = useCallback(async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 600));

      const noisyParams = injectNoise
        ? {
            ...params,
            attention: Math.max(0, Math.min(1, params.attention + (Math.random() * 0.4 - 0.2))),
          }
        : params;

      const data = await simulate(noisyParams);

      if (selectedScenario === 'graduation') {
        (data.decisionProcess as any).decisionSource = 'ensemble';
        (data.decisionProcess as any).phase = 'normal';
      }

      setResult(data as ExtendedSimulateResponse);
    } catch (err) {
      const errorParams = injectNoise
        ? {
            ...params,
            attention: Math.max(0, Math.min(1, params.attention + (Math.random() * 0.4 - 0.2))),
          }
        : params;
      amasLogger.error({ err, params: errorParams }, '模拟执行失败');
    } finally {
      setLoading(false);
    }
  }, [params, injectNoise, selectedScenario]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 font-sans transition-colors md:p-8">
      <div className="mx-auto max-w-6xl">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
              <Flask className="text-indigo-500" weight="duotone" />
              The Decision Lab
            </h1>
            <p className="mt-1 text-gray-500">Interactive Neural Ensemble Simulator</p>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-gray-200/60 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-sm md:flex">
            <Robot
              size={20}
              className={
                result?.decisionProcess.decisionSource === 'ensemble'
                  ? 'text-emerald-500'
                  : 'text-gray-400'
              }
            />
            <span className="text-sm font-medium text-gray-600">
              Active Core:{' '}
              {result?.decisionProcess.decisionSource === 'ensemble'
                ? 'Ensemble Council'
                : 'ColdStart Engine'}
            </span>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 lg:col-span-4"
          >
            <div className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
                <Shuffle /> 模拟场景
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleScenarioChange(s.id)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      selectedScenario === s.id
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                        : 'border-transparent bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div
                      className={`mb-2 ${selectedScenario === s.id ? 'text-indigo-600' : 'text-gray-500'}`}
                    >
                      <s.icon size={24} weight={selectedScenario === s.id ? 'fill' : 'regular'} />
                    </div>
                    <div className="text-sm font-bold text-gray-700">{s.name}</div>
                    <div className="mt-1 text-[10px] text-gray-400">{s.desc}</div>
                  </button>
                ))}
              </div>

              {/* 学习模式选择 */}
              <div className="mt-6 border-t border-gray-100 pt-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                  学习模式
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {LEARNING_MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMode(m.id)}
                      className={`rounded-lg border p-2 text-center transition-all ${
                        selectedMode === m.id
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                          : 'border-transparent bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div
                        className={`mb-1 flex justify-center ${selectedMode === m.id ? 'text-emerald-600' : 'text-gray-500'}`}
                      >
                        <m.icon size={18} weight={selectedMode === m.id ? 'fill' : 'regular'} />
                      </div>
                      <div className="text-xs font-medium text-gray-700">{m.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Warning className="text-amber-500" />
                  注入随机噪声
                </span>
                <button
                  onClick={() => setInjectNoise(!injectNoise)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${injectNoise ? 'bg-indigo-500' : 'bg-gray-300'}`}
                >
                  <div
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${injectNoise ? 'left-6' : 'left-1'}`}
                  />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <h2 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
                <Sliders /> 用户状态向量
              </h2>

              <ControlSlider
                label="注意力"
                icon={UserFocus}
                value={params.attention}
                onChange={(v) => setParams((p) => ({ ...p, attention: v }))}
              />
              <ControlSlider
                label="疲劳度"
                icon={Pulse}
                value={params.fatigue}
                onChange={(v) => setParams((p) => ({ ...p, fatigue: v }))}
              />
              <ControlSlider
                label="动机"
                icon={Lightning}
                value={params.motivation}
                onChange={(v) => setParams((p) => ({ ...p, motivation: v }))}
                min={-1}
                max={1}
              />

              <div className="my-6 h-px bg-gray-100" />

              <ControlSlider
                label="记忆强度"
                icon={Brain}
                value={params.cognitive.memory}
                onChange={(v) =>
                  setParams((p) => ({ ...p, cognitive: { ...p.cognitive, memory: v } }))
                }
              />
              <ControlSlider
                label="处理速度"
                icon={Gear}
                value={params.cognitive.speed}
                onChange={(v) =>
                  setParams((p) => ({ ...p, cognitive: { ...p.cognitive, speed: v } }))
                }
              />
            </div>

            <button
              onClick={runSimulation}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {loading ? (
                <Gear className="animate-spin" size={20} />
              ) : (
                <Flask size={20} weight="fill" />
              )}
              RUN SIMULATION
            </button>
          </motion.div>

          <div className="space-y-6 lg:col-span-8">
            <ConsensusVisualizer result={result} loading={loading} />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <motion.div
                variants={fadeInVariants}
                className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm md:col-span-2"
              >
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
                  <Brain className="text-gray-400" /> Neural Logic Trace
                </h3>
                {result ? (
                  <div className="prose prose-sm">
                    <p className="mb-4 leading-relaxed text-gray-600">
                      {result.explanation.summary}
                    </p>
                    <div className="space-y-2">
                      {result.explanation.factors.slice(0, 3).map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 p-2"
                        >
                          <span className="text-gray-600">{f.name}</span>
                          <span
                            className={`font-mono font-bold ${f.impact === 'positive' ? 'text-emerald-500' : 'text-rose-500'}`}
                          >
                            {f.impact === 'positive' ? '+' : '-'}
                            {f.percentage}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="italic text-gray-400">Run simulation to see logic trace...</div>
                )}
              </motion.div>

              <div className="md:col-span-1">
                <DecisionReceipt result={result} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
