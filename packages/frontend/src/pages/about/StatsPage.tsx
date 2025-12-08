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
  performance,
}: {
  overview: OverviewStats | null;
  performance: PerformanceMetrics | null;
}) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
      <div className="group relative animate-g3-fade-in overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
          <Target size={80} weight="fill" className="text-emerald-500" />
        </div>
        <div className="relative z-10">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-600">
            <TrendUp className="text-emerald-500" /> 全局准确率 (vs Baseline)
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {performance ? `${performance.globalAccuracy.toFixed(1)}%` : '-'}
          </div>
          <div className="mt-2 font-mono text-xs text-emerald-500">
            {performance && performance.accuracyImprovement > 0
              ? `+${performance.accuracyImprovement.toFixed(1)}% 提升`
              : '暂无数据'}
          </div>
        </div>
      </div>

      <div className="group relative animate-g3-fade-in overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
          <Atom size={80} weight="fill" className="text-blue-500" />
        </div>
        <div className="relative z-10">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-600">
            <Atom className="text-blue-500" /> 集成因果效应 (ATE)
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {performance ? `+${performance.causalATE.toFixed(2)}` : '-'}
          </div>
          <div className="mt-2 font-mono text-xs text-blue-400">
            {performance ? `置信度 ${Math.round(performance.causalConfidence * 100)}%` : '暂无数据'}
          </div>
        </div>
      </div>

      <div className="group relative animate-g3-fade-in overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
          <Lightning size={80} weight="fill" className="text-amber-500" />
        </div>
        <div className="relative z-10">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-600">
            <Lightning className="text-amber-500" /> 今日决策总量
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {overview?.todayDecisions.toLocaleString() ?? '0'}
          </div>
          <div className="mt-2 font-mono text-xs text-gray-500">
            活跃用户: {overview?.activeUsers ?? 0}
          </div>
        </div>
      </div>

      <div className="group relative animate-g3-fade-in overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
          <Timer size={80} weight="fill" className="text-purple-500" />
        </div>
        <div className="relative z-10">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-600">
            <Timer className="text-purple-500" /> 平均推理耗时
          </p>
          <div className="text-3xl font-bold text-gray-900">
            {performance?.avgInferenceMs ?? 0}
            <span className="text-lg font-normal text-gray-500">ms</span>
          </div>
          <div className="mt-2 font-mono text-xs text-purple-400">
            P99 &lt; {performance?.p99InferenceMs ?? 0}ms
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. 成员排行榜卡片 (MemberCard)
function MemberCard({
  id,
  percentage,
  totalDecisions,
}: {
  id: string;
  percentage: number;
  totalDecisions: number;
}) {
  const config = ALGO_CONFIG[id] || { name: id, color: 'text-gray-500', icon: CheckCircle };
  const Icon = config.icon;
  const decisions = Math.floor(totalDecisions * percentage);

  // 模拟趋势数据
  const trend = useMemo(() => Array.from({ length: 10 }, () => 40 + Math.random() * 40), []);

  return (
    <div className="animate-g3-fade-in rounded-xl border border-gray-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
      <div className="mb-4 flex items-start justify-between">
        <div
          className={`rounded-lg bg-current bg-opacity-10 p-2.5 ${config.color.replace('text-', 'bg-')}`}
        >
          <Icon size={24} className={config.color} />
        </div>
        <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-400">
          {(percentage * 100).toFixed(1)}% 权重
        </span>
      </div>

      <h3 className="mb-1 truncate font-bold text-gray-800">{config.name}</h3>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">{decisions.toLocaleString()}</span>
        <span className="text-xs text-gray-500">决策</span>
      </div>

      {/* Sparkline Visualization */}
      <div className="flex h-8 items-end gap-1 opacity-50">
        {trend.map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}%`, transitionDelay: `${i * 50}ms` }}
            className={`flex-1 rounded-t-sm transition-all duration-500 ${config.color.replace('text-', 'bg-')}`}
          />
        ))}
      </div>
    </div>
  );
}

// 3. 单词掌握度雷达 (WordMasteryRadar)
function WordMasteryRadar({ radarData }: { radarData: MasteryRadarData | null }) {
  // 使用真实数据或默认值
  const data = radarData ?? { speed: 0, stability: 0, complexity: 0, consistency: 0 };
  const values = [data.speed, data.stability, data.complexity, data.consistency];

  const points = values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
      const r = v * 80; // radius 80
      return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
    })
    .join(' ');

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
      <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-gray-800">
        <Brain className="text-rose-500" />
        群体掌握度评估
      </h3>
      <div className="relative mx-auto aspect-square w-full max-w-[280px]">
        <svg viewBox="0 0 200 200" className="h-full w-full">
          {/* Grid Circles */}
          {[20, 40, 60, 80].map((r) => (
            <circle
              key={r}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="#94a3b8"
              strokeOpacity="0.2"
            />
          ))}
          {/* Axes */}
          {[0, 90, 180, 270].map((deg) => (
            <line
              key={deg}
              x1="100"
              y1="100"
              x2={100 + 100 * Math.cos(((deg - 90) * Math.PI) / 180)}
              y2={100 + 100 * Math.sin(((deg - 90) * Math.PI) / 180)}
              stroke="#94a3b8"
              strokeOpacity="0.2"
            />
          ))}
          {/* Data Polygon */}
          <polygon points={points} fill="rgba(244, 63, 94, 0.2)" stroke="#fb7185" strokeWidth="2" />

          {/* Labels with values */}
          <text x="100" y="10" textAnchor="middle" className="fill-gray-500 text-[10px]">
            速度 ({(data.speed * 100).toFixed(0)}%)
          </text>
          <text x="190" y="100" textAnchor="middle" className="fill-gray-500 text-[10px]">
            稳定性 ({(data.stability * 100).toFixed(0)}%)
          </text>
          <text x="100" y="195" textAnchor="middle" className="fill-gray-500 text-[10px]">
            复杂度 ({(data.complexity * 100).toFixed(0)}%)
          </text>
          <text x="10" y="100" textAnchor="middle" className="fill-gray-500 text-[10px]">
            一致性 ({(data.consistency * 100).toFixed(0)}%)
          </text>
        </svg>
      </div>
    </div>
  );
}

// 4. 学习模式分布 (LearningModeDistribution)
function LearningModeDistribution() {
  // 模拟数据 - 实际应从 API 获取
  const modeData = useMemo(
    () => ({
      standard: 0.65,
      cram: 0.2,
      relaxed: 0.15,
    }),
    [],
  );

  const modeConfig = {
    standard: { name: '标准模式', color: 'bg-blue-500', desc: '平衡长期记忆' },
    cram: { name: '突击模式', color: 'bg-amber-500', desc: '考前冲刺' },
    relaxed: { name: '轻松模式', color: 'bg-emerald-500', desc: '降低压力' },
  };

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
        <Target className="text-blue-500" />
        学习模式分布
      </h3>
      <div className="space-y-4">
        {Object.entries(modeData).map(([id, value], idx) => {
          const config = modeConfig[id as keyof typeof modeConfig];
          return (
            <div key={id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{config.name}</span>
                <span className="font-mono text-sm text-gray-500">{(value * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  style={{ width: `${value * 100}%`, transitionDelay: `${idx * 100}ms` }}
                  className={`h-full ${config.color} rounded-full transition-all duration-700 ease-out`}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">{config.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 5. 半衰期分布 (HalfLifeDistribution)
function HalfLifeDistribution() {
  // 模拟数据 - 实际应从 API 获取
  const halfLifeData = useMemo(
    () => [
      { range: '0-1天', count: 120, percentage: 15 },
      { range: '1-3天', count: 280, percentage: 35 },
      { range: '3-7天', count: 200, percentage: 25 },
      { range: '7-14天', count: 120, percentage: 15 },
      { range: '14+天', count: 80, percentage: 10 },
    ],
    [],
  );

  const avgHalfLife = 4.2;

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
        <Timer className="text-purple-500" />
        半衰期分布
      </h3>
      <div className="mb-4 text-center">
        <div className="text-3xl font-bold text-purple-600">{avgHalfLife}</div>
        <div className="text-sm text-gray-500">平均半衰期（天）</div>
      </div>
      <div className="space-y-2">
        {halfLifeData.map((item, idx) => (
          <div key={item.range} className="flex items-center gap-2">
            <span className="w-16 text-xs text-gray-500">{item.range}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                style={{ width: `${item.percentage}%`, transitionDelay: `${idx * 100}ms` }}
                className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-500 transition-all duration-700 ease-out"
              />
            </div>
            <span className="w-10 text-right text-xs text-gray-600">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 6. 优化事件时间轴 (OptimizationTimeline)
function OptimizationTimeline({ events }: { events: OptimizationEvent[] }) {
  return (
    <div className="col-span-1 animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm md:col-span-2">
      <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-gray-800">
        <Flask className="text-amber-500" />
        自进化事件日志
      </h3>
      {events.length === 0 ? (
        <div className="py-8 text-center text-gray-400">
          <Flask size={32} className="mx-auto mb-2 opacity-50" />
          <p>暂无优化事件</p>
        </div>
      ) : (
        <div className="relative space-y-6 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-0.5 before:bg-gray-200">
          {events.map((event) => (
            <div key={event.id} className="relative pl-12">
              <div
                className={`absolute left-2 h-4 w-4 -translate-x-1/2 rounded-full border-4 border-white ${
                  event.type === 'bayesian'
                    ? 'bg-blue-500'
                    : event.type === 'ab_test'
                      ? 'bg-purple-500'
                      : 'bg-emerald-500'
                }`}
              />
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-800">{event.title}</h4>
                  <p className="mt-1 text-xs text-gray-500">{event.description}</p>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-xs text-gray-400">
                    {new Date(event.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="mt-1 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-600">
                    {event.impact}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 font-sans transition-colors md:p-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-10 flex items-end justify-between">
          <div>
            <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold text-gray-900 md:text-4xl">
              <ShareNetwork className="text-blue-600" weight="duotone" />
              AMAS 神经网络监控
            </h1>
            <p className="text-gray-500">Ensemble Learning Framework 实时性能遥测</p>
          </div>
          <div className="hidden text-right md:block">
            <div className="font-mono text-3xl font-light text-gray-800">
              {time.toLocaleTimeString('zh-CN', { hour12: false })}
            </div>
            <div className="flex items-center justify-end gap-2 text-xs text-gray-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              系统在线
            </div>
          </div>
        </header>

        {/* 1. System Vitality Big Numbers */}
        <SystemVitality overview={overview} performance={performance} />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* 2. Member Leaderboard (Takes up full width of its row) */}
          <div className="lg:col-span-3">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
                <Brain className="text-indigo-500" />
                专家成员贡献榜 (Expert Members)
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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
      </div>
    </div>
  );
}
