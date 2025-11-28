/**
 * AMAS 公开展示 - 交互模拟演示页
 *
 * 允许用户调整学习者状态参数，实时观察 AMAS 决策引擎的响应。
 *
 * 功能：
 * - 参数滑块控制（注意力、疲劳度、动机、认知能力）
 * - 场景预设快速切换
 * - 决策结果可视化
 * - 算法投票权重展示
 * - 决策解释生成
 */

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Target,
  Gear,
  ChartBar,
  Info,
  Sparkle,
  Lightning,
} from '../../components/Icon';
import {
  simulate,
  SimulateRequest,
  SimulateResponse,
} from '../../services/aboutApi';
import {
  g3SpringStandard,
  fadeInVariants,
  staggerContainerVariants,
} from '../../utils/animations';

// ==================== 类型定义 ====================

interface SliderProps {
  label: string;
  sublabel?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

interface ScenarioOption {
  id: SimulateRequest['scenario'];
  name: string;
  description: string;
}

// ==================== 常量配置 ====================

const SCENARIOS: ScenarioOption[] = [
  { id: 'newUser', name: '新手起步', description: '低置信度，探索性策略' },
  { id: 'tired', name: '疲劳状态', description: '高疲劳，保守决策' },
  { id: 'motivated', name: '精力充沛', description: '高动机，挑战性任务' },
  { id: 'struggling', name: '遇到困难', description: '低动机，需要鼓励' },
];

const PHASE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  classify: { bg: 'bg-blue-100', text: 'text-blue-700', label: '分类阶段' },
  explore: { bg: 'bg-amber-100', text: 'text-amber-700', label: '探索阶段' },
  normal: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '常规阶段' },
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '简单',
  mid: '中等',
  hard: '困难',
};

// ==================== 子组件 ====================

function Slider({
  label,
  sublabel,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  format,
}: SliderProps) {
  const displayValue = format ? format(value) : value.toFixed(1);

  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5">
        <span className="text-sm font-medium text-slate-700">
          {label}
          {sublabel && (
            <span className="ml-1.5 text-xs text-slate-400">{sublabel}</span>
          )}
        </span>
        <span className="text-sm font-mono text-slate-500">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="
          w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer
          accent-blue-600
          [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600
          [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
        "
      />
    </div>
  );
}

function WeightBar({ label, value }: { label: string; value: number }) {
  const percentage = value * 100;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="capitalize text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={g3SpringStandard}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

// ==================== 主组件 ====================

export default function SimulationPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulateResponse | null>(null);

  const [params, setParams] = useState<SimulateRequest>({
    attention: 0.7,
    fatigue: 0.3,
    motivation: 0.5,
    cognitive: {
      memory: 0.7,
      speed: 0.7,
      stability: 0.8,
    },
    scenario: 'newUser',
  });

  // 执行模拟
  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await simulate(params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '模拟请求失败');
    } finally {
      setLoading(false);
    }
  }, [params]);

  // 场景切换时应用预设值
  const handleScenarioChange = useCallback((scenarioId: string) => {
    const scenario = scenarioId as SimulateRequest['scenario'];

    // 基于场景预设调整参数
    const presets: Record<string, Partial<SimulateRequest>> = {
      newUser: {
        attention: 0.6,
        fatigue: 0.2,
        motivation: 0.3,
        cognitive: { memory: 0.5, speed: 0.5, stability: 0.5 },
      },
      tired: {
        attention: 0.3,
        fatigue: 0.8,
        motivation: 0.0,
        cognitive: { memory: 0.6, speed: 0.4, stability: 0.5 },
      },
      motivated: {
        attention: 0.9,
        fatigue: 0.1,
        motivation: 0.8,
        cognitive: { memory: 0.8, speed: 0.8, stability: 0.9 },
      },
      struggling: {
        attention: 0.5,
        fatigue: 0.5,
        motivation: -0.4,
        cognitive: { memory: 0.4, speed: 0.6, stability: 0.4 },
      },
    };

    const preset = presets[scenario] ?? {};
    setParams((prev) => ({
      ...prev,
      ...preset,
      cognitive: {
        ...prev.cognitive,
        ...(preset.cognitive ?? {}),
      },
      scenario,
    }));
  }, []);

  // 初次加载执行模拟
  useEffect(() => {
    runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 获取阶段样式
  const phaseStyle = result
    ? PHASE_STYLES[result.decisionProcess.phase] ?? PHASE_STYLES.normal
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题 */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Gear className="text-blue-600" size={32} />
            决策引擎模拟
          </h1>
          <p className="text-slate-500 mt-2">
            调整输入参数，实时观察 AMAS 系统的决策逻辑
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左侧控制面板 */}
          <div className="lg:col-span-4 space-y-6">
            {/* 场景预设 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Sparkle size={20} className="text-amber-500" />
                场景预设
              </h2>
              <select
                value={params.scenario}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="
                  w-full p-3 rounded-xl border border-slate-200 bg-slate-50
                  text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  outline-none transition-all
                "
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} - {s.description}
                  </option>
                ))}
              </select>
            </div>

            {/* 状态参数 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Info size={20} className="text-blue-500" />
                状态参数
              </h2>
              <Slider
                label="注意力"
                sublabel="Attention"
                value={params.attention}
                onChange={(v) => setParams((p) => ({ ...p, attention: v }))}
                min={0}
                max={1}
              />
              <Slider
                label="疲劳度"
                sublabel="Fatigue"
                value={params.fatigue}
                onChange={(v) => setParams((p) => ({ ...p, fatigue: v }))}
                min={0}
                max={1}
              />
              <Slider
                label="动机"
                sublabel="Motivation"
                value={params.motivation}
                onChange={(v) => setParams((p) => ({ ...p, motivation: v }))}
                min={-1}
                max={1}
                format={(v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
              />
            </div>

            {/* 认知能力 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Brain size={20} className="text-purple-500" />
                认知能力
              </h2>
              <Slider
                label="记忆力"
                sublabel="Memory"
                value={params.cognitive.memory}
                onChange={(v) =>
                  setParams((p) => ({
                    ...p,
                    cognitive: { ...p.cognitive, memory: v },
                  }))
                }
                min={0}
                max={1}
              />
              <Slider
                label="处理速度"
                sublabel="Speed"
                value={params.cognitive.speed}
                onChange={(v) =>
                  setParams((p) => ({
                    ...p,
                    cognitive: { ...p.cognitive, speed: v },
                  }))
                }
                min={0}
                max={1}
              />
              <Slider
                label="稳定性"
                sublabel="Stability"
                value={params.cognitive.stability}
                onChange={(v) =>
                  setParams((p) => ({
                    ...p,
                    cognitive: { ...p.cognitive, stability: v },
                  }))
                }
                min={0}
                max={1}
              />
            </div>

            {/* 执行按钮 */}
            <button
              onClick={runSimulation}
              disabled={loading}
              className="
                w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600
                hover:from-blue-700 hover:to-indigo-700
                disabled:from-slate-400 disabled:to-slate-500
                text-white rounded-xl font-semibold
                transition-all duration-200
                flex items-center justify-center gap-2
                shadow-lg shadow-blue-600/20
              "
            >
              {loading ? (
                <Gear className="animate-spin" size={20} />
              ) : (
                <Lightning size={20} />
              )}
              {loading ? '计算中...' : '执行模拟'}
            </button>
          </div>

          {/* 右侧结果展示 */}
          <div className="lg:col-span-8">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">
                {error}
              </div>
            )}

            {result ? (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={staggerContainerVariants}
                className="space-y-6"
              >
                {/* 决策阶段头部 */}
                <motion.div
                  variants={fadeInVariants}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-slate-500 mb-1">当前决策阶段</p>
                    <h3 className="text-2xl font-bold text-slate-800">
                      {phaseStyle?.label ?? '未知'}{' '}
                      <span className="text-lg font-normal text-slate-400">
                        ({result.decisionProcess.phase})
                      </span>
                    </h3>
                  </div>
                  <div
                    className={`px-4 py-2 rounded-lg font-bold ${phaseStyle?.bg} ${phaseStyle?.text}`}
                  >
                    {result.decisionProcess.decisionSource === 'coldstart'
                      ? '冷启动'
                      : '集成决策'}
                  </div>
                </motion.div>

                {/* 策略输出统计 */}
                <motion.div
                  variants={fadeInVariants}
                  className="grid grid-cols-2 md:grid-cols-5 gap-4"
                >
                  <StatCard
                    label="复习间隔缩放"
                    value={`${result.outputStrategy.interval_scale.toFixed(1)}x`}
                  />
                  <StatCard
                    label="新词比例"
                    value={`${(result.outputStrategy.new_ratio * 100).toFixed(0)}%`}
                  />
                  <StatCard
                    label="难度"
                    value={DIFFICULTY_LABELS[result.outputStrategy.difficulty] ?? '中等'}
                  />
                  <StatCard
                    label="批次大小"
                    value={`${result.outputStrategy.batch_size} 词`}
                  />
                  <StatCard
                    label="提示等级"
                    value={`Lv.${result.outputStrategy.hint_level}`}
                  />
                </motion.div>

                {/* 算法投票权重 */}
                <motion.div
                  variants={fadeInVariants}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100"
                >
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <ChartBar size={20} className="text-indigo-500" />
                    算法投票权重
                  </h3>
                  <div className="space-y-4">
                    <WeightBar
                      label="Thompson Sampling"
                      value={result.decisionProcess.weights.thompson}
                    />
                    <WeightBar
                      label="LinUCB"
                      value={result.decisionProcess.weights.linucb}
                    />
                    <WeightBar
                      label="ACT-R"
                      value={result.decisionProcess.weights.actr}
                    />
                    <WeightBar
                      label="Heuristic"
                      value={result.decisionProcess.weights.heuristic}
                    />
                  </div>
                </motion.div>

                {/* 决策解释 */}
                <motion.div
                  variants={fadeInVariants}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100"
                >
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Target size={20} className="text-emerald-500" />
                    决策解释
                  </h3>
                  <div className="bg-slate-50 rounded-xl p-4 mb-4">
                    <p className="text-slate-700 leading-relaxed">
                      {result.explanation.summary}
                    </p>
                  </div>
                  {result.explanation.factors.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {result.explanation.factors.map((factor, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100"
                        >
                          <span className="text-sm text-slate-600">{factor.name}</span>
                          <span
                            className={`text-sm font-bold ${
                              factor.impact === 'positive'
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {factor.impact === 'positive' ? '+' : '-'}
                            {factor.percentage}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            ) : (
              !loading && (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 p-12 border-2 border-dashed border-slate-200 rounded-2xl">
                  <Gear size={48} className="mb-4 opacity-30" />
                  <p>点击左侧「执行模拟」查看决策结果</p>
                </div>
              )
            )}

            {loading && !result && (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 p-12 border-2 border-dashed border-slate-200 rounded-2xl">
                <Gear size={48} className="mb-4 animate-spin opacity-50" />
                <p>正在计算决策...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
