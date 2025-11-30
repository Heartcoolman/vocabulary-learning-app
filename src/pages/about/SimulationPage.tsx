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

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  simulate,
  SimulateRequest,
  SimulateResponse,
} from '../../services/aboutApi';
import {
  fadeInVariants,
  staggerContainerVariants,
} from '../../utils/animations';

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
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 text-gray-600 font-medium text-sm">
          <Icon size={16} className="text-gray-400" />
          {label}
        </div>
        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
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
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
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

    const difficulty = result.outputStrategy.difficulty === 'hard' ? 0.8 :
                       result.outputStrategy.difficulty === 'mid' ? 0.5 : 0.2;

    const weights = result.decisionProcess.weights;
    const members = Object.keys(weights);

    return members.map(id => {
      let bias = 0;
      if (id === 'actr') bias = -0.1;
      if (id === 'thompson') bias = 0.15;
      if (id === 'linucb') bias = 0.05;

      const weight = weights[id as keyof typeof weights];
      const position = Math.max(0.1, Math.min(0.9, difficulty + bias + (Math.random() * 0.1 - 0.05)));

      return {
        id,
        weight,
        position,
        label: id.toUpperCase(),
      };
    });
  }, [result]);

  const finalPosition = result
    ? (result.outputStrategy.difficulty === 'hard' ? 0.8 :
       result.outputStrategy.difficulty === 'mid' ? 0.5 : 0.2)
    : 0.5;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/60 shadow-sm relative overflow-hidden min-h-[240px]">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-20" />

      <div className="flex justify-between items-center mb-8">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Target className="text-rose-500" />
          决策共识 (The Neural Tug-of-War)
        </h3>
        {result?.decisionProcess.phase && (
           <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
             ${result.decisionProcess.phase === 'explore' ? 'bg-blue-100 text-blue-700' :
               result.decisionProcess.phase === 'classify' ? 'bg-amber-100 text-amber-700' :
               'bg-emerald-100 text-emerald-700'}`}>
             Phase: {result.decisionProcess.phase}
           </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400 gap-2">
          <Gear className="animate-spin" size={24} /> 计算神经网络权重...
        </div>
      ) : !result ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm italic">
          Waiting for input parameters...
        </div>
      ) : (
        <div className="relative pt-8 pb-12 px-4">
          <div className="h-2 bg-gray-100 rounded-full w-full relative mb-2">
             <div className="absolute left-0 -bottom-6 text-xs text-gray-400">简单</div>
             <div className="absolute left-1/2 -translate-x-1/2 -bottom-6 text-xs text-gray-400">中等</div>
             <div className="absolute right-0 -bottom-6 text-xs text-gray-400">困难</div>
          </div>

          <AnimatePresence>
            {voteData.map((vote) => (
              <motion.div
                key={vote.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1, left: `${vote.position * 100}%` }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="absolute top-0 -mt-1.5 -ml-2 cursor-help group z-10"
                style={{ left: `${vote.position * 100}%` }}
              >
                <div className={`w-4 h-4 rounded-full border-2 border-white shadow-sm ${ALGO_BG[vote.id] || 'bg-gray-400'}`} />

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                  {vote.label}: {(vote.weight * 100).toFixed(0)}% 权重
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <motion.div
            layoutId="decision-marker"
            initial={{ scale: 0 }}
            animate={{ scale: 1, left: `${finalPosition * 100}%` }}
            className="absolute top-[-8px] -ml-4 z-20 flex flex-col items-center"
            style={{ left: `${finalPosition * 100}%` }}
          >
            <div className="w-8 h-8 rounded-full bg-white border-4 border-rose-500 shadow-lg flex items-center justify-center">
               <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            </div>
            <div className="mt-2 bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
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

  const winner = Object.entries(result.decisionProcess.weights)
    .sort(([,a], [,b]) => b - a)[0];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/80 backdrop-blur-sm p-0 rounded-xl border-2 border-gray-200/60 overflow-hidden relative shadow-sm"
    >
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-500 to-rose-500 opacity-10" />

      <div className="p-6 border-b border-gray-100 border-dashed">
        <div className="text-center mb-4">
          <h4 className="text-gray-400 text-xs uppercase tracking-widest mb-1">决策凭证 (Decision Receipt)</h4>
          <div className="text-3xl font-mono font-bold text-gray-800">
            {result.outputStrategy.difficulty.toUpperCase()}
          </div>
          <div className="text-emerald-500 text-sm font-medium mt-1">
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
             <span>New Words Ratio</span>
             <span>{(result.outputStrategy.new_ratio * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 text-xs text-gray-500 font-mono leading-relaxed">
         ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}<br/>
         TS: {new Date().toISOString()}<br/>
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

  const handleScenarioChange = (id: string) => {
    setSelectedScenario(id);
    let preset: Partial<SimulateRequest> = {};

    if (id === 'newUser') {
      preset = { attention: 0.5, fatigue: 0.1, motivation: 0.8, cognitive: { memory: 0.3, speed: 0.4, stability: 0.2 } };
    } else if (id === 'motivated') {
      preset = { attention: 0.9, fatigue: 0.1, motivation: 0.9, cognitive: { memory: 0.8, speed: 0.9, stability: 0.8 } };
    } else if (id === 'tired') {
      preset = { attention: 0.4, fatigue: 0.9, motivation: 0.2, cognitive: { memory: 0.5, speed: 0.3, stability: 0.4 } };
    } else if (id === 'graduation') {
      preset = { attention: 0.8, fatigue: 0.3, motivation: 0.7, cognitive: { memory: 0.7, speed: 0.6, stability: 0.7 } };
    }

    setParams(prev => ({
      ...prev,
      ...preset,
      scenario: id === 'graduation' ? 'newUser' : id as any,
      cognitive: { ...prev.cognitive, ...(preset.cognitive || {}) }
    }));
  };

  const runSimulation = useCallback(async () => {
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 600));

      const noisyParams = injectNoise ? {
        ...params,
        attention: Math.max(0, Math.min(1, params.attention + (Math.random() * 0.4 - 0.2)))
      } : params;

      const data = await simulate(noisyParams);

      if (selectedScenario === 'graduation') {
         (data.decisionProcess as any).decisionSource = 'ensemble';
         (data.decisionProcess as any).phase = 'normal';
      }

      setResult(data as ExtendedSimulateResponse);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [params, injectNoise, selectedScenario]);

  useEffect(() => { runSimulation(); }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 md:p-8 font-sans transition-colors">
      <div className="max-w-6xl mx-auto">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Flask className="text-indigo-500" weight="duotone" />
              The Decision Lab
            </h1>
            <p className="text-gray-500 mt-1">
              Interactive Neural Ensemble Simulator
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-gray-200/60 shadow-sm">
            <Robot size={20} className={result?.decisionProcess.decisionSource === 'ensemble' ? "text-emerald-500" : "text-gray-400"} />
            <span className="text-sm font-medium text-gray-600">
              Active Core: {result?.decisionProcess.decisionSource === 'ensemble' ? 'Ensemble Council' : 'ColdStart Engine'}
            </span>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="lg:col-span-4 space-y-6"
          >
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-gray-200/60">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Shuffle /> Simulation Context
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {SCENARIOS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleScenarioChange(s.id)}
                    className={`p-3 rounded-xl text-left transition-all border ${
                      selectedScenario === s.id
                        ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                        : 'bg-gray-50 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <div className={`mb-2 ${selectedScenario === s.id ? 'text-indigo-600' : 'text-gray-500'}`}>
                      <s.icon size={24} weight={selectedScenario === s.id ? 'fill' : 'regular'} />
                    </div>
                    <div className="font-bold text-gray-700 text-sm">{s.name}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{s.desc}</div>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-100">
                 <span className="text-sm font-medium text-gray-600 flex items-center gap-2">
                   <Warning className="text-amber-500" />
                   Inject Random Noise
                 </span>
                 <button
                   onClick={() => setInjectNoise(!injectNoise)}
                   className={`w-11 h-6 rounded-full transition-colors relative ${injectNoise ? 'bg-indigo-500' : 'bg-gray-300'}`}
                 >
                   <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${injectNoise ? 'left-6' : 'left-1'}`} />
                 </button>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-gray-200/60">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Sliders /> User State Vectors
              </h2>

              <ControlSlider label="Attention Span" icon={UserFocus} value={params.attention} onChange={v => setParams(p => ({...p, attention: v}))} />
              <ControlSlider label="Fatigue Level" icon={Pulse} value={params.fatigue} onChange={v => setParams(p => ({...p, fatigue: v}))} />
              <ControlSlider label="Motivation" icon={Lightning} value={params.motivation} onChange={v => setParams(p => ({...p, motivation: v}))} min={-1} max={1} />

              <div className="h-px bg-gray-100 my-6" />

              <ControlSlider label="Memory Strength" icon={Brain} value={params.cognitive.memory} onChange={v => setParams(p => ({...p, cognitive: {...p.cognitive, memory: v}}))} />
              <ControlSlider label="Processing Speed" icon={Gear} value={params.cognitive.speed} onChange={v => setParams(p => ({...p, cognitive: {...p.cognitive, speed: v}}))} />
            </div>

            <button
              onClick={runSimulation}
              disabled={loading}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Gear className="animate-spin" size={20} /> : <Flask size={20} weight="fill" />}
              RUN SIMULATION
            </button>
          </motion.div>

          <div className="lg:col-span-8 space-y-6">
             <ConsensusVisualizer result={result} loading={loading} />

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div
                  variants={fadeInVariants}
                  className="md:col-span-2 bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/60 shadow-sm"
                >
                   <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                     <Brain className="text-gray-400" /> Neural Logic Trace
                   </h3>
                   {result ? (
                     <div className="prose prose-sm">
                       <p className="text-gray-600 leading-relaxed mb-4">
                         {result.explanation.summary}
                       </p>
                       <div className="space-y-2">
                         {result.explanation.factors.slice(0, 3).map((f, i) => (
                           <div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                             <span className="text-gray-600">{f.name}</span>
                             <span className={`font-mono font-bold ${f.impact === 'positive' ? 'text-emerald-500' : 'text-rose-500'}`}>
                               {f.impact === 'positive' ? '+' : '-'}{f.percentage}%
                             </span>
                           </div>
                         ))}
                       </div>
                     </div>
                   ) : (
                     <div className="text-gray-400 italic">Run simulation to see logic trace...</div>
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
