/**
 * AMAS 系统状态页面
 *
 * 展示 AMAS 系统的实时运行状态：
 * - Pipeline 各层运行状态
 * - 算法实时权重和调用统计
 * - 用户状态分布监控
 * - 记忆状态分布
 * - 功能开关状态
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Brain,
  Lightning,
  Eye,
  Target,
  Timer,
  Warning,
  TrendUp,
  Users,
  ChartBar,
  Gauge,
  Flask,
  ToggleLeft,
  ToggleRight,
} from '../../components/Icon';
import {
  getPipelineLayerStatus,
  getAlgorithmStatus,
  getUserStateStatus,
  getMemoryStatus,
  getFeatureFlags,
  PipelineStatusResponse,
  AlgorithmStatusResponse,
  UserStateStatusResponse,
  MemoryStatusResponse,
  FeatureFlagsStatus,
} from '../../services/aboutApi';
import { fadeInVariants, staggerContainerVariants } from '../../utils/animations';
import { amasLogger } from '../../utils/logger';

// ==================== 类型定义 ====================

interface StatusIndicatorProps {
  status: 'healthy' | 'degraded' | 'error';
  size?: 'sm' | 'md';
}

// ==================== 子组件 ====================

/** 状态指示器 */
function StatusIndicator({ status, size = 'md' }: StatusIndicatorProps) {
  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const colorClass = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    error: 'bg-red-500',
  }[status];

  return (
    <span className={`${sizeClass} ${colorClass} rounded-full inline-block ${status !== 'error' ? 'animate-pulse' : ''}`} />
  );
}

/** Pipeline 层卡片 */
function PipelineLayerCard({
  layer,
}: {
  layer: {
    id: string;
    name: string;
    nameCn: string;
    processedCount: number;
    avgLatencyMs: number;
    successRate: number;
    status: 'healthy' | 'degraded' | 'error';
  };
}) {
  const iconMap: Record<string, React.ReactNode> = {
    PERCEPTION: <Eye size={20} />,
    MODELING: <Brain size={20} />,
    LEARNING: <Lightning size={20} />,
    DECISION: <Target size={20} />,
    EVALUATION: <ChartBar size={20} />,
    OPTIMIZATION: <Flask size={20} />,
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            {iconMap[layer.id] || <Activity size={20} />}
          </div>
          <div>
            <div className="font-medium text-gray-800">{layer.nameCn}</div>
            <div className="text-xs text-gray-400">{layer.name}</div>
          </div>
        </div>
        <StatusIndicator status={layer.status} />
      </div>

      <div className="flex justify-between text-center mt-2">
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">{layer.processedCount}</div>
          <div className="text-xs text-gray-500">处理数</div>
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">{layer.avgLatencyMs}<span className="text-sm font-medium">ms</span></div>
          <div className="text-xs text-gray-500">延迟</div>
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-emerald-600">{(layer.successRate * 100).toFixed(1)}<span className="text-sm font-medium">%</span></div>
          <div className="text-xs text-gray-500">成功率</div>
        </div>
      </div>
    </div>
  );
}

/** Pipeline 状态面板 */
function PipelineStatusPanel({ data }: { data: PipelineStatusResponse | null }) {
  if (!data) {
    return (
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
        <div className="text-center text-gray-400 py-8">加载中...</div>
      </div>
    );
  }

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Activity className="text-blue-500" />
          Pipeline 实时状态
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <StatusIndicator status={data.systemHealth} size="sm" />
          <span className="text-gray-600">
            {data.systemHealth === 'healthy' ? '系统健康' : data.systemHealth === 'degraded' ? '部分降级' : '异常'}
          </span>
          <span className="text-gray-400 ml-2">|</span>
          <span className="text-gray-500">吞吐量: {data.totalThroughput}/s</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {data.layers.map((layer) => (
          <PipelineLayerCard key={layer.id} layer={layer} />
        ))}
      </div>
    </motion.div>
  );
}

/** 算法卡片 */
function AlgorithmCard({
  algo,
}: {
  algo: {
    id: string;
    name: string;
    weight: number;
    callCount: number;
    avgLatencyMs: number;
    explorationRate: number;
  };
}) {
  const colorMap: Record<string, string> = {
    thompson: 'from-blue-500 to-blue-600',
    linucb: 'from-purple-500 to-purple-600',
    actr: 'from-amber-500 to-amber-600',
    heuristic: 'from-emerald-500 to-emerald-600',
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-800">{algo.name}</h4>
        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
          {(algo.weight * 100).toFixed(1)}%
        </span>
      </div>

      {/* 权重进度条 */}
      <div className="h-2 bg-gray-200 rounded-full mb-3 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${colorMap[algo.id] || 'from-gray-400 to-gray-500'} transition-all duration-500`}
          style={{ width: `${algo.weight * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <div className="font-bold text-gray-800">{algo.callCount}</div>
          <div className="text-xs text-gray-500">调用</div>
        </div>
        <div>
          <div className="font-bold text-gray-800">{algo.avgLatencyMs}ms</div>
          <div className="text-xs text-gray-500">延迟</div>
        </div>
        <div>
          <div className="font-bold text-gray-800">{(algo.explorationRate * 100).toFixed(0)}%</div>
          <div className="text-xs text-gray-500">探索率</div>
        </div>
      </div>
    </div>
  );
}

/** 算法状态面板 */
function AlgorithmStatusPanel({ data }: { data: AlgorithmStatusResponse | null }) {
  if (!data) {
    return (
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
        <div className="text-center text-gray-400 py-8">加载中...</div>
      </div>
    );
  }

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Brain className="text-purple-500" />
          算法运行状态
        </h2>
        <div className="text-sm text-gray-500">
          集成共识率: <span className="font-bold text-purple-600">{(data.ensembleConsensusRate * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {data.algorithms.map((algo) => (
          <AlgorithmCard key={algo.id} algo={algo} />
        ))}
      </div>

      {/* 冷启动统计 */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Lightning className="text-amber-500" size={18} />
          冷启动管理器
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{data.coldstartStats.classifyCount}</div>
            <div className="text-xs text-gray-500">分类阶段</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{data.coldstartStats.exploreCount}</div>
            <div className="text-xs text-gray-500">探索阶段</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{data.coldstartStats.normalCount}</div>
            <div className="text-xs text-gray-500">正常阶段</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">用户类型分布</div>
            <div className="flex gap-1">
              <div
                className="h-3 bg-blue-500 rounded-l"
                style={{ width: `${data.coldstartStats.userTypeDistribution.fast * 100}%` }}
                title={`快速型 ${(data.coldstartStats.userTypeDistribution.fast * 100).toFixed(0)}%`}
              />
              <div
                className="h-3 bg-emerald-500"
                style={{ width: `${data.coldstartStats.userTypeDistribution.stable * 100}%` }}
                title={`稳定型 ${(data.coldstartStats.userTypeDistribution.stable * 100).toFixed(0)}%`}
              />
              <div
                className="h-3 bg-amber-500 rounded-r"
                style={{ width: `${data.coldstartStats.userTypeDistribution.cautious * 100}%` }}
                title={`谨慎型 ${(data.coldstartStats.userTypeDistribution.cautious * 100).toFixed(0)}%`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>快速</span>
              <span>稳定</span>
              <span>谨慎</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** 用户状态监控面板 */
function UserStatePanel({ data }: { data: UserStateStatusResponse | null }) {
  if (!data) {
    return (
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
        <div className="text-center text-gray-400 py-8">加载中...</div>
      </div>
    );
  }

  const { distributions } = data;

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="text-emerald-500" />
          用户状态监控
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 注意力 */}
        <div className="bg-blue-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-blue-800 flex items-center gap-2">
              <Eye size={18} />
              注意力
            </h4>
            {distributions.attention.lowAlertCount > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Warning size={12} />
                {distributions.attention.lowAlertCount}
              </span>
            )}
          </div>
          <div className="text-3xl font-bold text-blue-600 mb-2">
            {(distributions.attention.avg * 100).toFixed(0)}%
          </div>
          <div className="flex gap-1 h-2 rounded-full overflow-hidden">
            <div className="bg-red-400" style={{ width: `${distributions.attention.low * 100}%` }} title="低" />
            <div className="bg-amber-400" style={{ width: `${distributions.attention.medium * 100}%` }} title="中" />
            <div className="bg-emerald-400" style={{ width: `${distributions.attention.high * 100}%` }} title="高" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>低 {(distributions.attention.low * 100).toFixed(0)}%</span>
            <span>中 {(distributions.attention.medium * 100).toFixed(0)}%</span>
            <span>高 {(distributions.attention.high * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* 疲劳度 */}
        <div className="bg-amber-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-amber-800 flex items-center gap-2">
              <Gauge size={18} />
              疲劳度
            </h4>
            {distributions.fatigue.highAlertCount > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Warning size={12} />
                {distributions.fatigue.highAlertCount}
              </span>
            )}
          </div>
          <div className="text-3xl font-bold text-amber-600 mb-2">
            {(distributions.fatigue.avg * 100).toFixed(0)}%
          </div>
          <div className="flex gap-1 h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-400" style={{ width: `${distributions.fatigue.fresh * 100}%` }} title="清醒" />
            <div className="bg-amber-400" style={{ width: `${distributions.fatigue.normal * 100}%` }} title="正常" />
            <div className="bg-red-400" style={{ width: `${distributions.fatigue.tired * 100}%` }} title="疲劳" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>清醒 {(distributions.fatigue.fresh * 100).toFixed(0)}%</span>
            <span>正常 {(distributions.fatigue.normal * 100).toFixed(0)}%</span>
            <span>疲劳 {(distributions.fatigue.tired * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* 动机 */}
        <div className="bg-emerald-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-emerald-800 flex items-center gap-2">
              <TrendUp size={18} />
              学习动机
            </h4>
            {distributions.motivation.lowAlertCount > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Warning size={12} />
                {distributions.motivation.lowAlertCount}
              </span>
            )}
          </div>
          <div className="text-3xl font-bold text-emerald-600 mb-2">
            {distributions.motivation.avg > 0 ? '+' : ''}{(distributions.motivation.avg * 100).toFixed(0)}%
          </div>
          <div className="flex gap-1 h-2 rounded-full overflow-hidden">
            <div className="bg-red-400" style={{ width: `${distributions.motivation.frustrated * 100}%` }} title="受挫" />
            <div className="bg-gray-400" style={{ width: `${distributions.motivation.neutral * 100}%` }} title="中性" />
            <div className="bg-emerald-400" style={{ width: `${distributions.motivation.motivated * 100}%` }} title="积极" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>受挫 {(distributions.motivation.frustrated * 100).toFixed(0)}%</span>
            <span>中性 {(distributions.motivation.neutral * 100).toFixed(0)}%</span>
            <span>积极 {(distributions.motivation.motivated * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* 最近推断记录 */}
      {data.recentInferences.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium text-gray-700 mb-3">最近状态推断</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="pb-2 font-medium">用户ID</th>
                  <th className="pb-2 font-medium">时间</th>
                  <th className="pb-2 font-medium">注意力</th>
                  <th className="pb-2 font-medium">疲劳度</th>
                  <th className="pb-2 font-medium">动机</th>
                  <th className="pb-2 font-medium">置信度</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInferences.slice(0, 5).map((inf) => (
                  <tr key={inf.id} className="border-t border-gray-100">
                    <td className="py-2 font-mono text-gray-600">{inf.id}</td>
                    <td className="py-2 text-gray-500">
                      {new Date(inf.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2">{(inf.attention * 100).toFixed(0)}%</td>
                    <td className="py-2">{(inf.fatigue * 100).toFixed(0)}%</td>
                    <td className="py-2">{inf.motivation > 0 ? '+' : ''}{(inf.motivation * 100).toFixed(0)}%</td>
                    <td className="py-2">{(inf.confidence * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/** 记忆状态面板 */
function MemoryStatusPanel({ data }: { data: MemoryStatusResponse | null }) {
  if (!data) {
    return (
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
        <div className="text-center text-gray-400 py-8">加载中...</div>
      </div>
    );
  }

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-6">
        <Brain className="text-rose-500" />
        记忆状态分布
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 强度分布直方图 */}
        <div>
          <h4 className="font-medium text-gray-700 mb-3">记忆强度分布</h4>
          <div className="space-y-2">
            {data.strengthDistribution.map((range) => (
              <div key={range.range} className="flex items-center gap-2">
                <span className="w-16 text-xs text-gray-500">{range.range}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 to-rose-500"
                    style={{ width: `${range.percentage}%` }}
                  />
                </div>
                <span className="w-12 text-xs text-gray-600 text-right">{range.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 复习状态 */}
        <div>
          <h4 className="font-medium text-gray-700 mb-3">复习状态</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{data.urgentReviewCount}</div>
              <div className="text-xs text-gray-500">急需复习</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{data.soonReviewCount}</div>
              <div className="text-xs text-gray-500">即将复习</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">{data.stableCount}</div>
              <div className="text-xs text-gray-500">状态稳定</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{data.avgHalfLifeDays.toFixed(1)}天</div>
              <div className="text-xs text-gray-500">平均半衰期</div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">今日巩固率</span>
              <span className="text-lg font-bold text-emerald-600">{data.todayConsolidationRate.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${data.todayConsolidationRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** 功能开关面板 */
function FeatureFlagsPanel({ data }: { data: FeatureFlagsStatus | null }) {
  if (!data) {
    return (
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
        <div className="text-center text-gray-400 py-8">加载中...</div>
      </div>
    );
  }

  const flagNames: Record<string, string> = {
    trendAnalyzer: '趋势分析器',
    heuristicBaseline: '启发式基准',
    thompsonSampling: 'Thompson 采样',
    linucb: 'LinUCB 算法',
    actrMemory: 'ACT-R 记忆',
    coldStartManager: '冷启动管理器',
    ensemble: '集成学习',
    bayesianOptimizer: '贝叶斯优化器',
    causalInference: '因果推断',
    abTestEngine: 'A/B 测试引擎',
    offlineReplay: '离线回放',
    delayedReward: '延迟奖励',
  };

  return (
    <motion.div variants={fadeInVariants} className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-6">
      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-6">
        <Timer className="text-indigo-500" />
        功能开关状态
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Object.entries(data.flags || {}).map(([key, enabled]) => (
          <div
            key={key}
            className={`flex items-center justify-between p-3 rounded-lg ${
              enabled ? 'bg-emerald-50' : 'bg-gray-50'
            }`}
          >
            <span className="text-sm text-gray-700">{flagNames[key] || key}</span>
            {enabled ? (
              <ToggleRight className="text-emerald-500" size={20} />
            ) : (
              <ToggleLeft className="text-gray-400" size={20} />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ==================== 主组件 ====================

export default function SystemStatusPage() {
  const [pipelineData, setPipelineData] = useState<PipelineStatusResponse | null>(null);
  const [algorithmData, setAlgorithmData] = useState<AlgorithmStatusResponse | null>(null);
  const [userStateData, setUserStateData] = useState<UserStateStatusResponse | null>(null);
  const [memoryData, setMemoryData] = useState<MemoryStatusResponse | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsStatus | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [pipeline, algo, userState, memory, flags] = await Promise.all([
        getPipelineLayerStatus(),
        getAlgorithmStatus(),
        getUserStateStatus(),
        getMemoryStatus(),
        getFeatureFlags(),
      ]);

      setPipelineData(pipeline);
      setAlgorithmData(algo);
      setUserStateData(userState);
      setMemoryData(memory);
      setFeatureFlags(flags);
      setLastUpdated(new Date());
    } catch (error) {
      amasLogger.error({ err: error }, '获取系统状态数据失败');
    }
  }, []);

  useEffect(() => {
    fetchData();

    // 设置不同的刷新间隔
    const pipelineTimer = setInterval(async () => {
      try {
        const data = await getPipelineLayerStatus();
        setPipelineData(data);
        setLastUpdated(new Date());
      } catch (e) {
        amasLogger.error({ err: e }, 'Pipeline 状态刷新失败');
      }
    }, 5000); // 5秒

    const algoTimer = setInterval(async () => {
      try {
        const data = await getAlgorithmStatus();
        setAlgorithmData(data);
      } catch (e) {
        amasLogger.error({ err: e }, '算法状态刷新失败');
      }
    }, 10000); // 10秒

    const userStateTimer = setInterval(async () => {
      try {
        const data = await getUserStateStatus();
        setUserStateData(data);
      } catch (e) {
        amasLogger.error({ err: e }, '用户状态刷新失败');
      }
    }, 30000); // 30秒

    return () => {
      clearInterval(pipelineTimer);
      clearInterval(algoTimer);
      clearInterval(userStateTimer);
    };
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6 md:p-10">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainerVariants}
        className="max-w-7xl mx-auto space-y-6"
      >
        {/* 页面标题 */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Activity className="text-blue-600" weight="duotone" />
              AMAS 系统状态
            </h1>
            <p className="text-gray-500 mt-1">实时监控系统运行状态和性能指标</p>
          </div>
          <div className="text-right text-sm text-gray-400">
            <div>最后更新</div>
            <div className="font-mono">{lastUpdated.toLocaleTimeString('zh-CN')}</div>
          </div>
        </header>

        {/* Pipeline 状态 */}
        <PipelineStatusPanel data={pipelineData} />

        {/* 算法状态 */}
        <AlgorithmStatusPanel data={algorithmData} />

        {/* 用户状态监控 */}
        <UserStatePanel data={userStateData} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 记忆状态 */}
          <MemoryStatusPanel data={memoryData} />

          {/* 功能开关 */}
          <FeatureFlagsPanel data={featureFlags} />
        </div>
      </motion.div>
    </div>
  );
}
