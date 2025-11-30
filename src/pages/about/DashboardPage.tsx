/**
 * AMAS Neural Orchestra - Ensemble Learning Dashboard
 *
 * 实时展示 Ensemble Learning Framework 的协作决策过程
 * - OrchestraCanvas: 旋转的成员节点围绕核心
 * - SystemHealthHUD: 系统状态监控
 * - LiveWeightVisualization: 实时权重变化
 * - EventLogTicker: 决策事件流
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ElementType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu,
  Brain,
  Lightning,
  Clock,
  ChartBar,
  Target,
  CircleNotch,
  Pulse,
} from '../../components/Icon';
import {
  getOverviewStats,
  getAlgorithmDistribution,
  getRecentDecisions,
  OverviewStats,
  AlgorithmDistribution,
  RecentDecision,
} from '../../services/aboutApi';

// ==================== 类型定义 ====================

interface MemberConfig {
  color: string;
  label: string;
  icon: ElementType;
}

// ==================== 常量配置 ====================

const MEMBER_CONFIG: Record<string, MemberConfig> = {
  coldstart: { color: '#64748b', label: 'ColdStart', icon: Clock },
  thompson: { color: '#3b82f6', label: 'Thompson', icon: ChartBar },
  linucb: { color: '#a855f7', label: 'LinUCB', icon: Target },
  actr: { color: '#f59e0b', label: 'ACT-R', icon: Brain },
  heuristic: { color: '#10b981', label: 'Heuristic', icon: Lightning },
};

const ORBIT_DURATION = 60;
const REFRESH_INTERVAL = 3000;

// ==================== 子组件 ====================

function OrchestraCanvas({
  activeMember,
  weights,
}: {
  activeMember: string | null;
  weights: AlgorithmDistribution | null;
}) {
  const members = Object.entries(MEMBER_CONFIG);
  const radius = 140;

  return (
    <div className="relative w-[500px] h-[500px] flex items-center justify-center">
      {/* 背景轨道 */}
      <div className="absolute inset-0 border border-slate-800/50 rounded-full opacity-20" />
      <div className="absolute inset-16 border border-slate-800/30 rounded-full" />

      {/* 中央核心 */}
      <div className="relative z-10 flex flex-col items-center justify-center w-28 h-28 bg-slate-900/80 backdrop-blur-sm rounded-full border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
        <motion.div
          animate={{ scale: activeMember ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 0.5 }}
        >
          <Cpu
            size={40}
            className={`text-cyan-400 ${activeMember ? 'drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]' : ''}`}
          />
        </motion.div>
        <div className="text-[10px] text-cyan-200 mt-2 font-mono tracking-widest">
          ENSEMBLE
        </div>
      </div>

      {/* 旋转的成员节点容器 */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: ORBIT_DURATION, repeat: Infinity, ease: 'linear' }}
      >
        {members.map(([key, config], index) => {
          const angle = (index / members.length) * 2 * Math.PI;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const isActive = activeMember === key;
          const weight = weights?.[key as keyof AlgorithmDistribution] ?? 0.2;
          const size = 50 + weight * 60;
          const Icon = config.icon;

          return (
            <motion.div
              key={key}
              className="absolute top-1/2 left-1/2 flex flex-col items-center justify-center"
              style={{
                x,
                y,
                marginLeft: -size / 2,
                marginTop: -size / 2,
                width: size,
                height: size,
              }}
            >
              {/* 反向旋转保持图标正向 */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: ORBIT_DURATION, repeat: Infinity, ease: 'linear' }}
                className={`
                  relative w-full h-full rounded-full flex items-center justify-center
                  border-2 transition-all duration-300 backdrop-blur-md
                  ${isActive
                    ? 'border-white bg-slate-800/90 z-20 scale-110 shadow-xl'
                    : 'border-slate-700 bg-slate-900/60 z-10'
                  }
                `}
                style={{ borderColor: isActive ? config.color : undefined }}
              >
                <Icon
                  size={20}
                  color={isActive ? config.color : '#94a3b8'}
                  weight={isActive ? 'fill' : 'regular'}
                />

                {/* 权重环 */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="46%"
                    fill="none"
                    stroke={config.color}
                    strokeWidth="2"
                    strokeDasharray="100 100"
                    strokeDashoffset={100 - weight * 100 * 3}
                    strokeLinecap="round"
                    className="opacity-50"
                  />
                </svg>
              </motion.div>

              {/* 标签 */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: ORBIT_DURATION, repeat: Infinity, ease: 'linear' }}
                className="absolute -bottom-5 whitespace-nowrap text-[9px] font-bold text-slate-400 tracking-wider uppercase bg-slate-950/80 px-1.5 rounded"
              >
                {config.label}
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function SystemHealthHUD({ stats }: { stats: OverviewStats | null }) {
  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 p-4 rounded-lg w-64 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="text-xs text-slate-400 uppercase font-bold">System Status</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-emerald-400 font-mono">ONLINE</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] text-slate-500 mb-1">TODAY DECISIONS</div>
          <div className="text-xl font-mono text-white">
            {stats?.todayDecisions?.toLocaleString() ?? '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-1">EFFICIENCY</div>
          <div className="text-xl font-mono text-emerald-400">
            +{stats?.avgEfficiencyGain?.toFixed(1) ?? '0'}%
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] text-slate-500 mb-1">ACTIVE USERS</div>
        <div className="text-lg font-mono text-white">
          {stats?.activeUsers?.toLocaleString() ?? '-'}
        </div>
      </div>
    </div>
  );
}

function LiveWeightVisualization({ weights }: { weights: AlgorithmDistribution | null }) {
  if (!weights) return null;

  const sortedMembers = Object.entries(weights).sort(([, a], [, b]) => b - a);

  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 p-4 rounded-lg w-64">
      <div className="text-xs text-slate-400 uppercase font-bold mb-4 flex items-center gap-2">
        <Pulse size={14} />
        Live Contribution Weights
      </div>
      <div className="space-y-3">
        {sortedMembers.map(([key, value]) => {
          const config = MEMBER_CONFIG[key];
          if (!config) return null;

          return (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">{config.label}</span>
                <span className="font-mono text-slate-500">
                  {(value * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: config.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${value * 100}%` }}
                  transition={{ type: 'spring', stiffness: 50 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventLogTicker({ events }: { events: RecentDecision[] }) {
  return (
    <div className="flex-1 bg-slate-900/50 backdrop-blur border-t border-slate-800 overflow-hidden flex flex-col">
      <div className="p-2 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/50 flex items-center gap-2">
        <Pulse size={12} />
        Decision Stream
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <AnimatePresence initial={false}>
          {events.map((event) => {
            const config =
              MEMBER_CONFIG[event.dominantFactor] || MEMBER_CONFIG.coldstart;

            return (
              <motion.div
                key={event.pseudoId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 text-sm border-l-2 border-slate-800 pl-3 py-1 hover:bg-slate-800/30 transition-colors"
                style={{ borderLeftColor: config.color }}
              >
                <span className="font-mono text-slate-600 text-xs">
                  {new Date(event.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                  {event.decisionSource}
                </span>
                <span className="text-slate-400 flex items-center gap-1">
                  via{' '}
                  <span style={{ color: config.color }}>{config.label}</span>
                </span>
                <span className="ml-auto text-[10px] text-slate-600 font-mono">
                  {event.strategy.difficulty}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {events.length === 0 && (
          <div className="text-slate-600 text-sm italic text-center py-8">
            Waiting for decisions...
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 主组件 ====================

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [weights, setWeights] = useState<AlgorithmDistribution | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentDecision[]>([]);
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, weightsData, decisionsData] = await Promise.all([
        getOverviewStats(),
        getAlgorithmDistribution(),
        getRecentDecisions(),
      ]);

      setStats(statsData);
      setWeights(weightsData);

      if (decisionsData.length > 0) {
        setRecentEvents(decisionsData.slice(0, 20));

        const latestDecision = decisionsData[0];
        if (latestDecision) {
          setActiveMember(latestDecision.dominantFactor);
          if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
          pulseTimeoutRef.current = setTimeout(() => setActiveMember(null), 800);
        }
      }
    } catch (err) {
      console.error('Dashboard data fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => {
      clearInterval(interval);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <CircleNotch className="animate-spin text-cyan-500" size={48} />
          <p className="text-slate-400 text-sm">Loading Neural Orchestra...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* 背景网格 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.1]" />
      <div className="absolute inset-0 bg-gradient-radial from-slate-900/0 via-slate-950/80 to-slate-950 pointer-events-none" />

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-start pointer-events-none">
        <div>
          <h1 className="text-2xl font-light text-white tracking-tight flex items-center gap-3">
            <Cpu size={28} className="text-cyan-500" />
            Neural Orchestra{' '}
            <span className="text-slate-600">/</span> Real-time
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-md">
            Ensemble Learning Framework Arbitration Console
          </p>
        </div>
        <div className="text-right text-xs text-slate-600 font-mono">
          <div className="flex items-center gap-2 justify-end">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            {REFRESH_INTERVAL / 1000}s refresh
          </div>
        </div>
      </header>

      {/* 主内容布局 */}
      <div className="relative z-10 h-full flex">
        {/* 左侧: 可视化画布 */}
        <div className="flex-1 flex items-center justify-center relative">
          <OrchestraCanvas activeMember={activeMember} weights={weights} />

          {/* 浮动统计 */}
          <div className="absolute bottom-8 left-8">
            <div className="text-4xl font-light text-white mb-1">
              {stats?.todayDecisions?.toLocaleString() ?? '0'}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">
              Total Decisions Today
            </div>
          </div>
        </div>

        {/* 右侧: 数据面板 */}
        <div className="w-80 h-full bg-slate-950/50 border-l border-slate-900 flex flex-col backdrop-blur-sm z-20">
          <div className="p-6 space-y-6 flex-shrink-0">
            <SystemHealthHUD stats={stats} />
            <LiveWeightVisualization weights={weights} />
          </div>

          <EventLogTicker events={recentEvents} />
        </div>
      </div>
    </div>
  );
}
