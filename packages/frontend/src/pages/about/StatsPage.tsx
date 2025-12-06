/**
 * AMAS 公开展示 - 聚合统计大屏
 *
 * 功能：
 * - 展示 Ensemble Learning Framework 架构
 * - 成员贡献排行榜
 * - 系统生命力指标
 * - 优化事件时间轴
 * - 单词掌握度雷达图
 * - 60 秒自动刷新
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ElementType } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Lightning,
  TrendUp,
  ChartBar,
  Timer,
  CheckCircle,
  Atom,
  Target,
  ShareNetwork,
  Flask,
  Graph,
} from '../../components/Icon';
import {
  getOverviewStats,
  getAlgorithmDistribution,
  getPerformanceMetrics,
  getOptimizationEvents,
  getMasteryRadar,
  OverviewStats,
  AlgorithmDistribution,
  PerformanceMetrics,
  OptimizationEvent,
  MasteryRadarData,
} from '../../services/aboutApi';
import { fadeInVariants, staggerContainerVariants } from '../../utils/animations';
import { amasLogger } from '../../utils/logger';

// ==================== 配置 ====================

const ALGO_CONFIG: Record<string, { name: string; color: string; icon: ElementType }> = {
  thompson: { name: 'Thompson Sampling', color: 'text-blue-500', icon: ChartBar },
  linucb: { name: 'LinUCB Contextual', color: 'text-purple-500', icon: Graph },
  actr: { name: 'ACT-R Memory', color: 'text-amber-500', icon: Brain },
  heuristic: { name: 'Heuristic Rules', color: 'text-emerald-500', icon: CheckCircle },
  coldstart: { name: 'ColdStart Manager', color: 'text-slate-500', icon: Lightning },
};

// ==================== 子组件 ====================

// 1. 系统生命力看板 (SystemVitality)
function SystemVitality({
  overview,
  performance
}: {
  overview: OverviewStats | null;
  performance: PerformanceMetrics | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Target size={80} weight="fill" className="text-emerald-500" />
        </div>
        <div className="relative z-10">
          <p className="text-gray-600 text-sm font-medium mb-1 flex items-center gap-2">
            <TrendUp className="text-emerald-500" /> 全局准确率 (vs Baseline)
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {performance ? `${performance.globalAccuracy.toFixed(1)}%` : '-'}
          </div>
          <div className="text-emerald-500 text-xs mt-2 font-mono">
            {performance && performance.accuracyImprovement > 0
              ? `+${performance.accuracyImprovement.toFixed(1)}% 提升`
              : '暂无数据'}
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Atom size={80} weight="fill" className="text-blue-500" />
        </div>
        <div className="relative z-10">
          <p className="text-gray-600 text-sm font-medium mb-1 flex items-center gap-2">
            <Atom className="text-blue-500" /> 集成因果效应 (ATE)
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {performance ? `+${performance.causalATE.toFixed(2)}` : '-'}
          </div>
          <div className="text-blue-400 text-xs mt-2 font-mono">
            {performance ? `置信度 ${Math.round(performance.causalConfidence * 100)}%` : '暂无数据'}
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Lightning size={80} weight="fill" className="text-amber-500" />
        </div>
        <div className="relative z-10">
          <p className="text-gray-600 text-sm font-medium mb-1 flex items-center gap-2">
            <Lightning className="text-amber-500" /> 今日决策总量
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {overview?.todayDecisions.toLocaleString() ?? '0'}
          </div>
          <div className="text-gray-500 text-xs mt-2 font-mono">
            活跃用户: {overview?.activeUsers ?? 0}
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 p-6 rounded-2xl relative overflow-hidden group shadow-sm">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Timer size={80} weight="fill" className="text-purple-500" />
        </div>
        <div className="relative z-10">
          <p className="text-gray-600 text-sm font-medium mb-1 flex items-center gap-2">
             <Timer className="text-purple-500" /> 平均推理耗时
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {performance?.avgInferenceMs ?? 0}<span className="text-lg font-normal text-gray-500">ms</span>
          </div>
          <div className="text-purple-400 text-xs mt-2 font-mono">
            P99 &lt; {performance?.p99InferenceMs ?? 0}ms
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// 2. 成员排行榜卡片 (MemberCard)
function MemberCard({
  id,
  percentage,
  totalDecisions
}: {
  id: string;
  percentage: number;
  totalDecisions: number
}) {
  const config = ALGO_CONFIG[id] || { name: id, color: 'text-gray-500', icon: CheckCircle };
  const Icon = config.icon;
  const decisions = Math.floor(totalDecisions * percentage);

  // 模拟趋势数据
  const trend = useMemo(() => Array.from({ length: 10 }, () => 40 + Math.random() * 40), []);

  return (
    <motion.div
      variants={fadeInVariants}
      className="bg-white/80 backdrop-blur-sm p-5 rounded-xl border border-gray-200/60 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2.5 rounded-lg bg-opacity-10 bg-current ${config.color.replace('text-', 'bg-')}`}>
          <Icon size={24} className={config.color} />
        </div>
        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
          {(percentage * 100).toFixed(1)}% 权重
        </span>
      </div>

      <h3 className="font-bold text-gray-800 mb-1 truncate">{config.name}</h3>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-2xl font-bold text-gray-900">{decisions.toLocaleString()}</span>
        <span className="text-xs text-gray-500">决策</span>
      </div>

      {/* Sparkline Visualization */}
      <div className="h-8 flex items-end gap-1 opacity-50">
        {trend.map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            className={`flex-1 rounded-t-sm ${config.color.replace('text-', 'bg-')}`}
          />
        ))}
      </div>
    </motion.div>
  );
}

// 3. 单词掌握度雷达 (WordMasteryRadar)
function WordMasteryRadar({ radarData }: { radarData: MasteryRadarData | null }) {
  // 使用真实数据或默认值
  const data = radarData ?? { speed: 0, stability: 0, complexity: 0, consistency: 0 };
  const values = [data.speed, data.stability, data.complexity, data.consistency];

  const points = values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
    const r = v * 80; // radius 80
    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
  }).join(' ');

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-gray-200/60 shadow-sm">
      <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Brain className="text-rose-500" />
        群体掌握度评估
      </h3>
      <div className="relative w-full aspect-square max-w-[280px] mx-auto">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {/* Grid Circles */}
          {[20, 40, 60, 80].map(r => (
            <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#94a3b8" strokeOpacity="0.2" />
          ))}
          {/* Axes */}
          {[0, 90, 180, 270].map(deg => (
            <line
              key={deg}
              x1="100" y1="100"
              x2={100 + 100 * Math.cos((deg - 90) * Math.PI / 180)}
              y2={100 + 100 * Math.sin((deg - 90) * Math.PI / 180)}
              stroke="#94a3b8" strokeOpacity="0.2"
            />
          ))}
          {/* Data Polygon */}
          <polygon points={points} fill="rgba(244, 63, 94, 0.2)" stroke="#fb7185" strokeWidth="2" />

          {/* Labels with values */}
          <text x="100" y="10" textAnchor="middle" className="text-[10px] fill-gray-500">
            速度 ({(data.speed * 100).toFixed(0)}%)
          </text>
          <text x="190" y="100" textAnchor="middle" className="text-[10px] fill-gray-500">
            稳定性 ({(data.stability * 100).toFixed(0)}%)
          </text>
          <text x="100" y="195" textAnchor="middle" className="text-[10px] fill-gray-500">
            复杂度 ({(data.complexity * 100).toFixed(0)}%)
          </text>
          <text x="10" y="100" textAnchor="middle" className="text-[10px] fill-gray-500">
            一致性 ({(data.consistency * 100).toFixed(0)}%)
          </text>
        </svg>
      </div>
    </motion.div>
  );
}

// 4. 学习模式分布 (LearningModeDistribution)
function LearningModeDistribution() {
  // 模拟数据 - 实际应从 API 获取
  const modeData = useMemo(() => ({
    standard: 0.65,
    cram: 0.20,
    relaxed: 0.15
  }), []);

  const modeConfig = {
    standard: { name: '标准模式', color: 'bg-blue-500', desc: '平衡长期记忆' },
    cram: { name: '突击模式', color: 'bg-amber-500', desc: '考前冲刺' },
    relaxed: { name: '轻松模式', color: 'bg-emerald-500', desc: '降低压力' }
  };

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-gray-200/60 shadow-sm">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Target className="text-blue-500" />
        学习模式分布
      </h3>
      <div className="space-y-4">
        {Object.entries(modeData).map(([id, value]) => {
          const config = modeConfig[id as keyof typeof modeConfig];
          return (
            <div key={id}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700">{config.name}</span>
                <span className="text-sm font-mono text-gray-500">{(value * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${value * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full ${config.color} rounded-full`}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{config.desc}</p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// 5. 半衰期分布 (HalfLifeDistribution)
function HalfLifeDistribution() {
  // 模拟数据 - 实际应从 API 获取
  const halfLifeData = useMemo(() => [
    { range: '0-1天', count: 120, percentage: 15 },
    { range: '1-3天', count: 280, percentage: 35 },
    { range: '3-7天', count: 200, percentage: 25 },
    { range: '7-14天', count: 120, percentage: 15 },
    { range: '14+天', count: 80, percentage: 10 }
  ], []);

  const avgHalfLife = 4.2;

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-gray-200/60 shadow-sm">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Timer className="text-purple-500" />
        半衰期分布
      </h3>
      <div className="text-center mb-4">
        <div className="text-3xl font-bold text-purple-600">{avgHalfLife}</div>
        <div className="text-sm text-gray-500">平均半衰期（天）</div>
      </div>
      <div className="space-y-2">
        {halfLifeData.map((item) => (
          <div key={item.range} className="flex items-center gap-2">
            <span className="w-16 text-xs text-gray-500">{item.range}</span>
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${item.percentage}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full"
              />
            </div>
            <span className="w-10 text-xs text-gray-600 text-right">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// 6. 优化事件时间轴 (OptimizationTimeline)
function OptimizationTimeline({ events }: { events: OptimizationEvent[] }) {
  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-gray-200/60 shadow-sm col-span-1 md:col-span-2">
      <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Flask className="text-amber-500" />
        自进化事件日志
      </h3>
      {events.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Flask size={32} className="mx-auto mb-2 opacity-50" />
          <p>暂无优化事件</p>
        </div>
      ) : (
        <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
          {events.map((event) => (
            <div key={event.id} className="relative pl-12">
              <div className={`absolute left-2 -translate-x-1/2 w-4 h-4 rounded-full border-4 border-white ${
                event.type === 'bayesian' ? 'bg-blue-500' : event.type === 'ab_test' ? 'bg-purple-500' : 'bg-emerald-500'
              }`} />
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">{event.title}</h4>
                  <p className="text-xs text-gray-500 mt-1">{event.description}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-gray-400 block">
                    {new Date(event.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                    {event.impact}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ==================== 主组件 ====================

export default function StatsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [algoDist, setAlgoDist] = useState<AlgorithmDistribution | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [events, setEvents] = useState<OptimizationEvent[]>([]);
  const [radarData, setRadarData] = useState<MasteryRadarData | null>(null);
  const [time, setTime] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [ov, ad, perf, evts, radar] = await Promise.all([
        getOverviewStats(),
        getAlgorithmDistribution(),
        getPerformanceMetrics(),
        getOptimizationEvents(),
        getMasteryRadar(),
      ]);
      setOverview(ov);
      setAlgoDist(ad);
      setPerformance(perf);
      setEvents(evts);
      setRadarData(radar);
    } catch (e) {
      amasLogger.error({ err: e }, '获取统计数据失败');
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => {
      fetchData();
      setTime(new Date());
    }, 60000); // 60s refresh

    // Separate timer for clock only
    const clockTimer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(timer);
      clearInterval(clockTimer);
    };
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 md:p-10 font-sans transition-colors">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainerVariants}
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <header className="flex justify-between items-end mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 flex items-center gap-3 mb-2">
              <ShareNetwork className="text-blue-600" weight="duotone" />
              AMAS 神经网络监控
            </h1>
            <p className="text-gray-500">
              Ensemble Learning Framework 实时性能遥测
            </p>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-3xl font-mono font-light text-gray-800">
              {time.toLocaleTimeString('zh-CN', { hour12: false })}
            </div>
            <div className="text-xs text-gray-400 flex items-center justify-end gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
              系统在线
            </div>
          </div>
        </header>

        {/* 1. System Vitality Big Numbers */}
        <SystemVitality overview={overview} performance={performance} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 2. Member Leaderboard (Takes up full width of its row) */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Brain className="text-indigo-500" />
                专家成员贡献榜 (Expert Members)
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Object.entries(algoDist || {}).map(([id, val]) => (
                <MemberCard
                  key={id}
                  id={id}
                  percentage={val}
                  totalDecisions={overview?.todayDecisions || 0}
                />
              ))}
            </div>
          </div>

          {/* 3. Word Mastery Radar */}
          <div className="lg:col-span-1">
            <WordMasteryRadar radarData={radarData} />
          </div>

          {/* 4. Optimization Timeline */}
          <div className="lg:col-span-2">
            <OptimizationTimeline events={events} />
          </div>

          {/* 5. Learning Mode Distribution */}
          <div className="lg:col-span-1">
            <LearningModeDistribution />
          </div>

          {/* 6. Half-Life Distribution */}
          <div className="lg:col-span-1">
            <HalfLifeDistribution />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
