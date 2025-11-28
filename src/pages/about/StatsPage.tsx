/**
 * AMAS 公开展示 - 聚合统计大屏
 *
 * 功能：
 * - 浅色简洁设计，与其他页面风格一致
 * - 全平台统计数据展示
 * - 算法贡献分布环形图
 * - 实时时钟显示
 * - 系统状态指示
 * - 60 秒自动刷新
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Pulse,
  Target,
  Brain,
  Lightning,
  UsersThree,
  TrendUp,
  Globe,
} from '../../components/Icon';
import {
  getOverviewStats,
  getAlgorithmDistribution,
  getRecentDecisions,
  OverviewStats,
  AlgorithmDistribution,
  RecentDecision,
} from '../../services/aboutApi';
import { fadeInVariants, staggerContainerVariants } from '../../utils/animations';

// ==================== 常量配置 ====================

const REFRESH_INTERVAL = 60000; // 60 秒刷新

const ALGO_COLORS: Record<string, string> = {
  thompson: '#3B82F6',
  linucb: '#8B5CF6',
  actr: '#F59E0B',
  heuristic: '#10B981',
  coldstart: '#64748B',
};

const ALGO_NAMES: Record<string, string> = {
  thompson: 'Thompson 采样',
  linucb: 'LinUCB 上下文臂',
  actr: 'ACT-R 记忆模型',
  heuristic: '启发式规则',
  coldstart: '冷启动策略',
};

// ==================== 子组件 ====================

interface StatBoxProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  delta?: string;
}

function StatBox({ label, value, icon, delta }: StatBoxProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div className="p-3 bg-slate-50 rounded-xl">{icon}</div>
        {delta && (
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            {delta}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

interface StatusItemProps {
  label: string;
  status: string;
  color: string;
}

function StatusItem({ label, status, color }: StatusItemProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-slate-700">{status}</span>
      </div>
    </div>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
  value: string;
}

function LegendItem({ color, label, value }: LegendItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${color}`} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <span className="text-lg font-bold text-slate-800 pl-5">{value}</span>
    </div>
  );
}

// ==================== 主组件 ====================

export default function StatsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [algoDist, setAlgoDist] = useState<AlgorithmDistribution | null>(null);
  const [decisions, setDecisions] = useState<RecentDecision[]>([]);
  const [time, setTime] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [ov, ad, rd] = await Promise.all([
        getOverviewStats(),
        getAlgorithmDistribution(),
        getRecentDecisions(),
      ]);
      setOverview(ov);
      setAlgoDist(ad);
      setDecisions(rd);
    } catch (e) {
      console.error('获取统计数据失败', e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const dataTimer = setInterval(fetchData, REFRESH_INTERVAL);
    const clockTimer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [fetchData]);

  // 生成环形图样式
  const getRingGradient = useCallback((dist: AlgorithmDistribution | null): string => {
    if (!dist) return 'conic-gradient(#e2e8f0 0% 100%)';

    const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
    let current = 0;

    const segments = Object.entries(dist).map(([key, value]) => {
      const start = current;
      const percentage = (value / total) * 100;
      current += percentage;
      return `${ALGO_COLORS[key] || '#64748B'} ${start}% ${current}%`;
    });

    return `conic-gradient(${segments.join(', ')})`;
  }, []);

  // 计算主导算法
  const dominantAlgo = algoDist
    ? Object.entries(algoDist).reduce((a, b) => (a[1] > b[1] ? a : b))[0]
    : 'thompson';
  const dominantValue = algoDist ? (algoDist[dominantAlgo as keyof AlgorithmDistribution] * 100).toFixed(0) : '0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-8 overflow-hidden relative font-sans">
      {/* 背景装饰效果 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-purple-100/50 rounded-full blur-[100px]" />
      </div>

      <motion.div
        className="relative z-10 max-w-[1600px] mx-auto flex flex-col h-full"
        initial="hidden"
        animate="visible"
        variants={staggerContainerVariants}
      >
        {/* 页面头部 */}
        <header className="flex justify-between items-end mb-12 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3 text-slate-900">
              <Globe className="text-blue-500" size={40} />
              AMAS{' '}
              <span className="text-slate-400 font-light">全局智能</span>
            </h1>
            <p className="text-slate-500 text-lg">自适应学习引擎实时分析面板</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-light text-slate-800">
              {time.toLocaleTimeString('zh-CN', { hour12: false })}
            </div>
            <div className="text-slate-500 text-sm">{time.toLocaleDateString('zh-CN')}</div>
          </div>
        </header>

        {/* 主要内容网格 */}
        <div className="grid grid-cols-12 gap-8 flex-1">
          {/* 左侧：统计卡片 */}
          <div className="col-span-3 space-y-6">
            <StatBox
              label="今日决策总数"
              value={overview?.todayDecisions.toLocaleString() ?? '-'}
              icon={<Lightning className="text-amber-500" size={24} />}
            />
            <StatBox
              label="活跃学习者"
              value={overview?.activeUsers.toLocaleString() ?? '-'}
              icon={<UsersThree className="text-blue-500" size={24} />}
            />
            <StatBox
              label="平均效率提升"
              value={`${(overview?.avgEfficiencyGain ?? 0).toFixed(1)}%`}
              icon={<TrendUp className="text-emerald-500" size={24} />}
            />

            {/* 系统状态 */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mt-8">
              <h3 className="text-slate-600 mb-4 text-sm uppercase tracking-wider font-medium">
                系统状态
              </h3>
              <div className="space-y-4">
                <StatusItem label="推理引擎" status="运行中" color="bg-emerald-500" />
                <StatusItem label="记忆流" status="处理中" color="bg-blue-500" />
                <StatusItem label="模型训练" status="空闲" color="bg-slate-400" />
              </div>
            </div>
          </div>

          {/* 中部：可视化 */}
          <div className="col-span-6 flex flex-col gap-8">
            {/* 算法环形图 */}
            <motion.div
              variants={fadeInVariants}
              className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex-1 flex flex-col items-center justify-center relative overflow-hidden"
            >
              <h3 className="text-xl font-medium text-slate-700 absolute top-8 left-8 flex items-center gap-2">
                <Brain className="text-purple-500" />
                算法贡献分布
              </h3>

              <div className="relative w-80 h-80">
                {/* CSS 环形图 */}
                <div
                  className="absolute inset-0 rounded-full shadow-inner"
                  style={{
                    background: getRingGradient(algoDist),
                    maskImage: 'radial-gradient(transparent 60%, black 61%)',
                    WebkitMaskImage: 'radial-gradient(transparent 60%, black 61%)',
                  }}
                />
                {/* 中心内容 */}
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-5xl font-bold text-slate-800 tracking-tighter">
                    {dominantValue}%
                  </span>
                  <span className="text-blue-500 text-sm uppercase tracking-widest mt-2">
                    {ALGO_NAMES[dominantAlgo] || dominantAlgo}
                  </span>
                </div>
              </div>

              {/* 图例 */}
              <div className="flex gap-8 mt-12">
                <LegendItem
                  color="bg-blue-500"
                  label="Thompson"
                  value={`${((algoDist?.thompson ?? 0) * 100).toFixed(0)}%`}
                />
                <LegendItem
                  color="bg-purple-500"
                  label="LinUCB"
                  value={`${((algoDist?.linucb ?? 0) * 100).toFixed(0)}%`}
                />
                <LegendItem
                  color="bg-amber-500"
                  label="ACT-R"
                  value={`${((algoDist?.actr ?? 0) * 100).toFixed(0)}%`}
                />
                <LegendItem
                  color="bg-emerald-500"
                  label="启发式"
                  value={`${((algoDist?.heuristic ?? 0) * 100).toFixed(0)}%`}
                />
              </div>
            </motion.div>

            {/* 活动热力图 */}
            <div className="h-48 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between">
              <h3 className="text-sm text-slate-500 uppercase tracking-wider flex items-center gap-2 font-medium">
                <Pulse className="text-slate-400" />
                全局请求量 (24小时)
              </h3>
              <div className="flex items-end justify-between gap-1 h-24">
                {Array.from({ length: 40 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 bg-blue-200 rounded-sm hover:bg-blue-400 transition-colors"
                    initial={{ height: '10%' }}
                    animate={{ height: `${20 + Math.random() * 80}%` }}
                    transition={{ duration: 1, delay: i * 0.02 }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：实时决策流 */}
          <div className="col-span-3 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm overflow-hidden">
            <h3 className="text-lg font-medium text-slate-800 mb-6 flex items-center gap-2">
              <Target className="text-rose-500" />
              实时决策流
            </h3>
            <div className="space-y-4 relative max-h-[500px] overflow-hidden">
              {/* 底部渐隐效果 */}
              <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />

              {decisions.length === 0 ? (
                <div className="text-center text-slate-400 py-8">暂无实时决策数据</div>
              ) : (
                decisions.slice(0, 8).map((d, i) => (
                  <motion.div
                    key={`${d.pseudoId}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:shadow-sm transition-shadow"
                  >
                    <div>
                      <div className="text-sm text-slate-600 font-mono mb-1">
                        ID: {d.pseudoId.toUpperCase()}
                      </div>
                      <div className="text-xs text-slate-400">
                        来源: {d.decisionSource === 'ensemble' ? '集成决策' : '冷启动'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-600">
                        {d.strategy.difficulty}
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(d.timestamp).toLocaleTimeString('zh-CN')}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
