/**
 * AMAS 系统状态页面
 *
 * 展示 AMAS 系统的实时运行状态：
 * - Pipeline 各层运行状态
 * - 算法实时权重和调用统计
 * - 用户状态分布监控
 * - 记忆状态分布
 * - 功能运行状态
 */

import { useState, useEffect, useCallback } from 'react';
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
    <span
      className={`${sizeClass} ${colorClass} inline-block rounded-full ${status !== 'error' ? 'animate-pulse' : ''}`}
    />
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
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-4 backdrop-blur-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
            {iconMap[layer.id] || <Activity size={20} />}
          </div>
          <div>
            <div className="font-medium text-gray-800">{layer.nameCn}</div>
            <div className="text-xs text-gray-400">{layer.name}</div>
          </div>
        </div>
        <StatusIndicator status={layer.status} />
      </div>

      <div className="mt-2 flex justify-between text-center">
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">{layer.processedCount}</div>
          <div className="text-xs text-gray-500">处理数</div>
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">
            {layer.avgLatencyMs}
            <span className="text-sm font-medium">ms</span>
          </div>
          <div className="text-xs text-gray-500">延迟</div>
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-emerald-600">
            {(layer.successRate * 100).toFixed(1)}
            <span className="text-sm font-medium">%</span>
          </div>
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
      <div className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
        <div className="py-8 text-center text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
          <Activity className="text-blue-500" />
          Pipeline 实时状态
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <StatusIndicator status={data.systemHealth} size="sm" />
          <span className="text-gray-600">
            {data.systemHealth === 'healthy'
              ? '系统健康'
              : data.systemHealth === 'degraded'
                ? '部分降级'
                : '异常'}
          </span>
          <span className="ml-2 text-gray-400">|</span>
          <span className="text-gray-500">吞吐量: {data.totalThroughput}/s</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {data.layers.map((layer) => (
          <PipelineLayerCard key={layer.id} layer={layer} />
        ))}
      </div>
    </div>
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
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium text-gray-800">{algo.name}</h4>
        <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">
          {(algo.weight * 100).toFixed(1)}%
        </span>
      </div>

      {/* 权重进度条 */}
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-200">
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
      <div className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
        <div className="py-8 text-center text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
          <Brain className="text-purple-500" />
          算法运行状态
        </h2>
        <div className="text-sm text-gray-500">
          集成共识率:{' '}
          <span className="font-bold text-purple-600">
            {(data.ensembleConsensusRate * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {data.algorithms.map((algo) => (
          <AlgorithmCard key={algo.id} algo={algo} />
        ))}
      </div>

      {/* 冷启动统计 */}
      <div className="rounded-xl bg-gray-50 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-medium text-gray-700">
          <Lightning className="text-amber-500" size={18} />
          冷启动管理器
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">
              {data.coldstartStats.classifyCount}
            </div>
            <div className="text-xs text-gray-500">分类阶段</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">
              {data.coldstartStats.exploreCount}
            </div>
            <div className="text-xs text-gray-500">探索阶段</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">
              {data.coldstartStats.normalCount}
            </div>
            <div className="text-xs text-gray-500">正常阶段</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">用户类型分布</div>
            <div className="flex gap-1">
              <div
                className="h-3 rounded-l bg-blue-500"
                style={{ width: `${data.coldstartStats.userTypeDistribution.fast * 100}%` }}
                title={`快速型 ${(data.coldstartStats.userTypeDistribution.fast * 100).toFixed(0)}%`}
              />
              <div
                className="h-3 bg-emerald-500"
                style={{ width: `${data.coldstartStats.userTypeDistribution.stable * 100}%` }}
                title={`稳定型 ${(data.coldstartStats.userTypeDistribution.stable * 100).toFixed(0)}%`}
              />
              <div
                className="h-3 rounded-r bg-amber-500"
                style={{ width: `${data.coldstartStats.userTypeDistribution.cautious * 100}%` }}
                title={`谨慎型 ${(data.coldstartStats.userTypeDistribution.cautious * 100).toFixed(0)}%`}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>快速</span>
              <span>稳定</span>
              <span>谨慎</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 用户状态监控面板 */
function UserStatePanel({ data }: { data: UserStateStatusResponse | null }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
        <div className="py-8 text-center text-gray-400">加载中...</div>
      </div>
    );
  }

  const { distributions } = data;

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
          <Users className="text-emerald-500" />
          用户状态监控
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* 注意力 */}
        <div className="rounded-xl bg-blue-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 font-medium text-blue-800">
              <Eye size={18} />
              注意力
            </h4>
            {distributions.attention.lowAlertCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                <Warning size={12} />
                {distributions.attention.lowAlertCount}
              </span>
            )}
          </div>
          <div className="mb-2 text-3xl font-bold text-blue-600">
            {(distributions.attention.avg * 100).toFixed(0)}%
          </div>
          <div className="flex h-2 gap-1 overflow-hidden rounded-full">
            <div
              className="bg-red-400"
              style={{ width: `${distributions.attention.low * 100}%` }}
              title="低"
            />
            <div
              className="bg-amber-400"
              style={{ width: `${distributions.attention.medium * 100}%` }}
              title="中"
            />
            <div
              className="bg-emerald-400"
              style={{ width: `${distributions.attention.high * 100}%` }}
              title="高"
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>低 {(distributions.attention.low * 100).toFixed(0)}%</span>
            <span>中 {(distributions.attention.medium * 100).toFixed(0)}%</span>
            <span>高 {(distributions.attention.high * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* 疲劳度 */}
        <div className="rounded-xl bg-amber-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 font-medium text-amber-800">
              <Gauge size={18} />
              疲劳度
            </h4>
            {distributions.fatigue.highAlertCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                <Warning size={12} />
                {distributions.fatigue.highAlertCount}
              </span>
            )}
          </div>
          <div className="mb-2 text-3xl font-bold text-amber-600">
            {(distributions.fatigue.avg * 100).toFixed(0)}%
          </div>
          <div className="flex h-2 gap-1 overflow-hidden rounded-full">
            <div
              className="bg-emerald-400"
              style={{ width: `${distributions.fatigue.fresh * 100}%` }}
              title="清醒"
            />
            <div
              className="bg-amber-400"
              style={{ width: `${distributions.fatigue.normal * 100}%` }}
              title="正常"
            />
            <div
              className="bg-red-400"
              style={{ width: `${distributions.fatigue.tired * 100}%` }}
              title="疲劳"
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>清醒 {(distributions.fatigue.fresh * 100).toFixed(0)}%</span>
            <span>正常 {(distributions.fatigue.normal * 100).toFixed(0)}%</span>
            <span>疲劳 {(distributions.fatigue.tired * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* 动机 */}
        <div className="rounded-xl bg-emerald-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 font-medium text-emerald-800">
              <TrendUp size={18} />
              学习动机
            </h4>
            {distributions.motivation.lowAlertCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                <Warning size={12} />
                {distributions.motivation.lowAlertCount}
              </span>
            )}
          </div>
          <div className="mb-2 text-3xl font-bold text-emerald-600">
            {distributions.motivation.avg > 0 ? '+' : ''}
            {(distributions.motivation.avg * 100).toFixed(0)}%
          </div>
          <div className="flex h-2 gap-1 overflow-hidden rounded-full">
            <div
              className="bg-red-400"
              style={{ width: `${distributions.motivation.frustrated * 100}%` }}
              title="受挫"
            />
            <div
              className="bg-gray-400"
              style={{ width: `${distributions.motivation.neutral * 100}%` }}
              title="中性"
            />
            <div
              className="bg-emerald-400"
              style={{ width: `${distributions.motivation.motivated * 100}%` }}
              title="积极"
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>受挫 {(distributions.motivation.frustrated * 100).toFixed(0)}%</span>
            <span>中性 {(distributions.motivation.neutral * 100).toFixed(0)}%</span>
            <span>积极 {(distributions.motivation.motivated * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* 最近推断记录 */}
      {data.recentInferences.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-3 font-medium text-gray-700">最近状态推断</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
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
                      {new Date(inf.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-2">{(inf.attention * 100).toFixed(0)}%</td>
                    <td className="py-2">{(inf.fatigue * 100).toFixed(0)}%</td>
                    <td className="py-2">
                      {inf.motivation > 0 ? '+' : ''}
                      {(inf.motivation * 100).toFixed(0)}%
                    </td>
                    <td className="py-2">{(inf.confidence * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** 记忆状态面板 */
function MemoryStatusPanel({ data }: { data: MemoryStatusResponse | null }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
        <div className="py-8 text-center text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-800">
        <Brain className="text-rose-500" />
        记忆状态分布
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 强度分布直方图 */}
        <div>
          <h4 className="mb-3 font-medium text-gray-700">记忆强度分布</h4>
          <div className="space-y-2">
            {data.strengthDistribution.map((range) => (
              <div key={range.range} className="flex items-center gap-2">
                <span className="w-16 text-xs text-gray-500">{range.range}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 to-rose-500"
                    style={{ width: `${range.percentage}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs text-gray-600">
                  {range.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 复习状态 */}
        <div>
          <h4 className="mb-3 font-medium text-gray-700">复习状态</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{data.urgentReviewCount}</div>
              <div className="text-xs text-gray-500">急需复习</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{data.soonReviewCount}</div>
              <div className="text-xs text-gray-500">即将复习</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">{data.stableCount}</div>
              <div className="text-xs text-gray-500">状态稳定</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {data.avgHalfLifeDays.toFixed(1)}天
              </div>
              <div className="text-xs text-gray-500">平均半衰期</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">今日巩固率</span>
              <span className="text-lg font-bold text-emerald-600">
                {data.todayConsolidationRate.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${data.todayConsolidationRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ACT-R 记忆追踪 */}
      <div className="mt-6 border-t border-gray-100 pt-6">
        <h4 className="mb-3 flex items-center gap-2 font-medium text-gray-700">
          <Brain className="text-purple-500" size={18} />
          ACT-R 记忆追踪
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-purple-50 p-3 text-center">
            <div className="text-xl font-bold text-purple-600">20</div>
            <div className="text-xs text-gray-500">最大追踪记录</div>
          </div>
          <div className="rounded-lg bg-indigo-50 p-3 text-center">
            <div className="text-xl font-bold text-indigo-600">0.3</div>
            <div className="text-xs text-gray-500">错误惩罚因子</div>
          </div>
          <div className="rounded-lg bg-rose-50 p-3 text-center">
            <div className="text-xl font-bold text-rose-600">0.5</div>
            <div className="text-xs text-gray-500">默认衰减率</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 功能运行状态面板 */
function FeatureFlagsPanel({ data }: { data: FeatureFlagsStatus | null }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
        <div className="py-8 text-center text-gray-400">加载中...</div>
      </div>
    );
  }

  // 功能开关分组配置
  const flagGroups = [
    {
      title: '学习算法',
      icon: <Brain size={16} className="text-purple-500" />,
      gradient: 'from-purple-500/10 to-indigo-500/10',
      borderColor: 'border-purple-200/60',
      keys: ['ensemble', 'thompsonSampling', 'heuristicBaseline', 'actrMemory'],
    },
    {
      title: '决策管理',
      icon: <Target size={16} className="text-blue-500" />,
      gradient: 'from-blue-500/10 to-cyan-500/10',
      borderColor: 'border-blue-200/60',
      keys: ['coldStartManager', 'userParamsManager', 'trendAnalyzer'],
    },
    {
      title: '优化引擎',
      icon: <Flask size={16} className="text-amber-500" />,
      gradient: 'from-amber-500/10 to-orange-500/10',
      borderColor: 'border-amber-200/60',
      keys: ['bayesianOptimizer', 'causalInference', 'delayedReward'],
    },
    {
      title: '数据流水线',
      icon: <Activity size={16} className="text-emerald-500" />,
      gradient: 'from-emerald-500/10 to-teal-500/10',
      borderColor: 'border-emerald-200/60',
      keys: ['realDataWrite', 'realDataRead', 'visualization'],
    },
  ];

  const flagNames: Record<string, string> = {
    trendAnalyzer: '趋势分析',
    heuristicBaseline: '启发式基准',
    thompsonSampling: 'Thompson采样',
    actrMemory: 'ACT-R记忆',
    coldStartManager: '冷启动管理',
    ensemble: '集成学习',
    userParamsManager: '参数管理',
    delayedReward: '延迟奖励',
    causalInference: '因果推断',
    bayesianOptimizer: '贝叶斯优化',
    realDataWrite: '数据写入',
    realDataRead: '数据读取',
    visualization: '可视化',
  };

  // 状态颜色映射
  const statusStyles: Record<string, { dot: string; text: string; bg: string }> = {
    healthy: {
      dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]',
      text: 'text-gray-800',
      bg: '',
    },
    warning: {
      dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)] animate-pulse',
      text: 'text-amber-800',
      bg: 'bg-amber-50/50',
    },
    error: {
      dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse',
      text: 'text-red-700',
      bg: 'bg-red-50/50',
    },
    disabled: {
      dot: 'bg-gray-300',
      text: 'text-gray-500',
      bg: 'opacity-50',
    },
  };

  // 统计各状态数量
  const statusCounts = Object.values(data.flags || {}).reduce(
    (acc, m) => {
      acc[m.status] = (acc[m.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const healthyCount = statusCounts['healthy'] || 0;
  const totalCount = Object.keys(data.flags || {}).length;

  return (
    <div className="animate-g3-fade-in rounded-2xl border border-gray-200/60 bg-gradient-to-br from-white via-white to-indigo-50/30 p-6 shadow-sm backdrop-blur-sm">
      {/* 标题栏 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
          <div className="rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 p-2 text-white shadow-md">
            <Timer size={18} />
          </div>
          功能运行状态
        </h2>
        <div className="flex items-center gap-2">
          {(statusCounts['error'] || 0) > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
              {statusCounts['error']} 异常
            </span>
          )}
          {(statusCounts['warning'] || 0) > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {statusCounts['warning']} 警告
            </span>
          )}
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {healthyCount}/{totalCount} 正常
          </span>
        </div>
      </div>

      {/* 分组展示 */}
      <div className="space-y-4">
        {flagGroups.map((group) => {
          const groupFlags = group.keys
            .filter((key) => key in (data.flags || {}))
            .map((key) => ({ key, module: data.flags[key] }));

          if (groupFlags.length === 0) return null;

          const groupHealthyCount = groupFlags.filter((f) => f.module.status === 'healthy').length;
          const hasIssue = groupFlags.some(
            (f) => f.module.status === 'error' || f.module.status === 'warning',
          );

          return (
            <div
              key={group.title}
              className={`overflow-hidden rounded-xl border bg-gradient-to-r ${group.gradient} ${group.borderColor}`}
            >
              {/* 分组标题 */}
              <div className="flex items-center justify-between border-b border-gray-100/50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {group.icon}
                  <span className="text-sm font-semibold text-gray-700">{group.title}</span>
                  {hasIssue && <Warning size={14} className="text-amber-500" />}
                </div>
                <span className="text-xs text-gray-500">
                  {groupHealthyCount}/{groupFlags.length} 正常
                </span>
              </div>

              {/* 功能列表 */}
              <div className="grid grid-cols-3 gap-px bg-gray-100/30 p-0.5">
                {groupFlags.map(({ key, module }) => {
                  const styles = statusStyles[module.status] || statusStyles.disabled;

                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between bg-white/80 px-3 py-2.5 ${styles.bg}`}
                      title={
                        module.latencyMs || module.callCount || module.errorRate
                          ? `延迟: ${module.latencyMs ?? '-'}ms | 调用: ${module.callCount ?? '-'} | 错误率: ${module.errorRate ? (module.errorRate * 100).toFixed(1) + '%' : '-'}`
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        {/* 状态指示器 */}
                        <div className={`h-2 w-2 flex-shrink-0 rounded-full ${styles.dot}`} />
                        <span className={`text-sm ${styles.text}`}>{flagNames[key] || key}</span>
                      </div>
                      {/* 指标显示 */}
                      {module.latencyMs !== undefined && module.latencyMs > 0 && (
                        <span
                          className={`text-[10px] ${module.latencyMs > 500 ? 'text-amber-600' : 'text-gray-400'}`}
                        >
                          {module.latencyMs}ms
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部说明 */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span>正常</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span>警告</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span>异常</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span>禁用</span>
        </div>
      </div>
    </div>
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
      <div className="mx-auto max-w-7xl space-y-6">
        {/* 页面标题 */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
              <Activity className="text-blue-600" weight="duotone" />
              AMAS 系统状态
            </h1>
            <p className="mt-1 text-gray-500">实时监控系统运行状态和性能指标</p>
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 记忆状态 */}
          <MemoryStatusPanel data={memoryData} />

          {/* 功能开关 */}
          <FeatureFlagsPanel data={featureFlags} />
        </div>
      </div>
    </div>
  );
}
