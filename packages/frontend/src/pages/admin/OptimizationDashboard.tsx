import { useState, useEffect } from 'react';
import type { Icon } from '../../components/Icon';
import {
  Activity,
  ArrowsClockwise,
  Gear,
  TrendUp,
  WarningCircle,
  CheckCircle,
  ChartBar,
  Target,
  Play,
  ArrowCounterClockwise,
  Lightning,
  Clock,
  Database,
  Info,
  ArrowUp,
  ArrowDown,
  Minus,
  CaretDown,
  CaretUp,
  Lightbulb,
  Trophy,
} from '../../components/Icon';
import apiClient from '../../services/client';
import { adminLogger } from '../../utils/logger';
import { useToast, ConfirmModal, Spinner } from '../../components/ui';

// ==================== Types ====================

interface OptimizationParams {
  [key: string]: number;
}

interface ParamSpace {
  [key: string]: {
    min: number;
    max: number;
    step: number;
  };
}

interface OptimizationSuggestion {
  params: OptimizationParams;
  paramSpace: ParamSpace;
}

interface OptimizationHistory {
  params: OptimizationParams;
  value: number;
  timestamp: string;
}

interface BestParams {
  params: OptimizationParams | null;
  value: number | null;
}

interface OptimizationDiagnostics {
  [key: string]: unknown;
}

// ==================== Sub Components ====================

const LoadingSpinner = () => (
  <div className="flex min-h-[400px] items-center justify-center">
    <Spinner size="lg" color="primary" />
  </div>
);

const ErrorDisplay = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center p-8">
    <div className="max-w-md text-center" role="alert" aria-live="assertive">
      <WarningCircle size={64} className="mx-auto mb-4 text-red-500" />
      <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">加载失败</h2>
      <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
      <button
        onClick={onRetry}
        className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
      >
        重试
      </button>
    </div>
  </div>
);

const MetricCard = ({
  label,
  value,
  icon: IconComponent,
  trend,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: Icon;
  trend?: 'positive' | 'negative' | 'neutral';
  subtext?: string;
}) => (
  <div className="animate-g3-fade-in rounded-card border border-gray-200 bg-white/90 p-5 shadow-soft backdrop-blur dark:border-slate-700 dark:bg-slate-800/90">
    <div className="mb-2 flex items-start justify-between">
      <div className="rounded-button bg-gray-50 p-2 text-gray-500 dark:bg-slate-700 dark:text-gray-400">
        <IconComponent size={20} />
      </div>
      {trend && (
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
            trend === 'positive'
              ? 'bg-green-100 text-green-700'
              : trend === 'negative'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
          }`}
        >
          {trend === 'positive' ? (
            <ArrowUp size={12} weight="bold" />
          ) : trend === 'negative' ? (
            <ArrowDown size={12} weight="bold" />
          ) : (
            <Minus size={12} weight="bold" />
          )}
          {trend === 'positive' ? '优化中' : trend === 'negative' ? '需调整' : '稳定'}
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{label}</div>
    {subtext && (
      <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-400 dark:border-slate-700 dark:text-gray-500">
        {subtext}
      </div>
    )}
  </div>
);

const ParamCard = ({
  name,
  value,
  space,
}: {
  name: string;
  value: number;
  space: { min: number; max: number; step: number };
}) => {
  const percentage = ((value - space.min) / (space.max - space.min)) * 100;

  return (
    <div className="rounded-button border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-start justify-between">
        <span className="text-sm font-medium text-gray-700">{name}</span>
        <span className="font-mono text-sm font-bold text-blue-600">{value.toFixed(4)}</span>
      </div>

      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-g3-slow"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>min: {space.min}</span>
        <span>max: {space.max}</span>
      </div>
    </div>
  );
};

const HistoryChart = ({ history }: { history: OptimizationHistory[] }) => {
  // 防御性检查：确保 history 是数组
  const safeHistory = Array.isArray(history) ? history : [];

  if (safeHistory.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        <Database size={48} className="mx-auto mb-4 opacity-50" weight="thin" />
        <p>暂无历史数据</p>
      </div>
    );
  }

  const maxValue = Math.max(...safeHistory.map((h) => h.value));
  const minValue = Math.min(...safeHistory.map((h) => h.value));
  const range = maxValue - minValue;

  return (
    <div className="space-y-3">
      {safeHistory.slice(-10).map((item, index) => {
        const height = range > 0 ? ((item.value - minValue) / range) * 100 : 50;
        const date = new Date(item.timestamp).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div key={index} className="group flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-gray-500 dark:text-gray-400">{date}</span>
            <div className="relative h-8 flex-1 overflow-hidden rounded-button bg-gray-100 dark:bg-slate-700">
              <div
                style={{ width: `${height}%`, transitionDelay: `${index * 50}ms` }}
                className="h-full rounded-button bg-gradient-to-r from-green-400 to-green-600 transition-all duration-g3-slow"
              />
            </div>
            <span className="w-20 text-right font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
              {item.value.toFixed(4)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ==================== Main Component ====================

export default function OptimizationDashboard() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<
    'suggestion' | 'history' | 'best' | 'control' | 'diagnostics'
  >('suggestion');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for each module
  const [suggestion, setSuggestion] = useState<OptimizationSuggestion | null>(null);
  const [history, setHistory] = useState<OptimizationHistory[]>([]);
  const [bestParams, setBestParams] = useState<BestParams | null>(null);
  const [diagnostics, setDiagnostics] = useState<OptimizationDiagnostics | null>(null);

  // Control state
  const [triggering, setTriggering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationValue, setEvaluationValue] = useState('0.85');

  // Diagnostics expand state
  const [expandedDiagnostics, setExpandedDiagnostics] = useState(false);

  // 重置确认对话框状态
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [suggestionData, historyData, bestData, diagnosticsData] = await Promise.all([
        apiClient.getOptimizationSuggestion(),
        apiClient.getOptimizationHistory(),
        apiClient.getBestOptimizationParams(),
        apiClient.getOptimizationDiagnostics(),
      ]);

      setSuggestion(suggestionData);
      setHistory(historyData);
      setBestParams(bestData);
      setDiagnostics(diagnosticsData);
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '加载优化数据失败');
      setError(err?.message || '加载优化数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleTriggerOptimization = async () => {
    setTriggering(true);
    try {
      const result = await apiClient.triggerOptimization();
      adminLogger.info({ result }, '优化触发成功');
      toast.success('优化已触发');
      await loadAllData();
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '触发优化失败');
      toast.error('触发优化失败：' + err.message);
    } finally {
      setTriggering(false);
    }
  };

  const handleResetOptimizer = async () => {
    setShowResetConfirm(false);
    setResetting(true);
    try {
      const result = await apiClient.resetOptimizer();
      adminLogger.info({ result }, '优化器重置成功');
      toast.success('优化器已重置');
      await loadAllData();
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '重置优化器失败');
      toast.error('重置优化器失败：' + err.message);
    } finally {
      setResetting(false);
    }
  };

  const handleRecordEvaluation = async () => {
    if (!suggestion?.params) {
      toast.error('没有可评估的参数建议');
      return;
    }

    const value = parseFloat(evaluationValue);
    if (isNaN(value) || value < 0 || value > 1) {
      toast.error('请输入 0-1 之间的有效数值');
      return;
    }

    setEvaluating(true);
    try {
      await apiClient.recordOptimizationEvaluation(suggestion.params, value);
      adminLogger.info({ params: suggestion.params, value }, '评估记录成功');
      toast.success('评估已记录');
      await loadAllData();
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '记录评估失败');
      toast.error('记录评估失败：' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={loadAllData} />;
  }

  const tabs = [
    { id: 'suggestion', label: '优化建议', icon: Lightbulb },
    { id: 'history', label: '优化历史', icon: Clock },
    { id: 'best', label: '最佳参数', icon: Target },
    { id: 'control', label: '优化控制', icon: Gear },
    { id: 'diagnostics', label: '诊断信息', icon: Activity },
  ] as const;

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 bg-gray-50 px-4 py-8 dark:bg-slate-900">
      {/* Header Section */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
            <Lightning className="text-amber-500" />
            优化分析仪表盘
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            贝叶斯优化 - 自适应参数调优与性能追踪
          </p>
        </div>
        <button
          onClick={loadAllData}
          className="rounded-button border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700"
          title="刷新数据"
        >
          <ArrowsClockwise size={18} weight="bold" />
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="历史评估次数"
          value={history.length}
          icon={Database}
          subtext={`最近评估: ${Array.isArray(history) && history.length > 0 ? new Date(history[history.length - 1].timestamp).toLocaleString('zh-CN') : '无'}`}
        />
        <MetricCard
          label="最佳性能值"
          value={
            bestParams?.value !== null && bestParams?.value !== undefined
              ? bestParams.value.toFixed(4)
              : 'N/A'
          }
          icon={Trophy}
          trend={
            bestParams?.value && bestParams.value > 0.8
              ? 'positive'
              : bestParams?.value && bestParams.value > 0.6
                ? 'neutral'
                : 'negative'
          }
          subtext="目标：最大化学习效果"
        />
        <MetricCard
          label="参数空间维度"
          value={suggestion ? Object.keys(suggestion.paramSpace).length : 0}
          icon={ChartBar}
          subtext="贝叶斯优化探索的参数数量"
        />
        <MetricCard
          label="优化状态"
          value={history.length >= 10 ? '收敛中' : '探索中'}
          icon={TrendUp}
          trend={history.length >= 10 ? 'positive' : 'neutral'}
          subtext={`建议至少 20 次评估`}
        />
      </div>

      {/* Tab Navigation */}
      <div className="overflow-hidden rounded-card border border-gray-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
        <div className="flex overflow-x-auto border-b border-gray-200 dark:border-slate-700">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap px-6 py-4 font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-blue-600 bg-blue-50/50 text-blue-600 dark:bg-blue-900/30'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white'
                }`}
              >
                <Icon size={18} weight={isActive ? 'bold' : 'regular'} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Tab 1: Optimization Suggestion */}
          {activeTab === 'suggestion' && (
            <div className="animate-g3-fade-in space-y-6">
              <div className="flex items-start gap-3 rounded-button border border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/30">
                <Info size={20} className="mt-0.5 shrink-0 text-blue-600" weight="bold" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="mb-1 font-medium">下一个推荐参数组合</p>
                  <p className="text-blue-700 dark:text-blue-300">
                    基于贝叶斯优化算法，根据历史评估结果推荐下一组最有潜力的参数配置。
                  </p>
                </div>
              </div>

              {suggestion && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Object.entries(suggestion.params).map(([name, value]) => (
                      <ParamCard
                        key={name}
                        name={name}
                        value={value}
                        space={suggestion.paramSpace[name]}
                      />
                    ))}
                  </div>

                  {/* Evaluation Input */}
                  <div className="mt-6 rounded-button border border-gray-200 bg-gray-50 p-6 dark:border-slate-700 dark:bg-slate-700">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                      <CheckCircle size={20} className="text-green-600" weight="bold" />
                      记录评估结果
                    </h3>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                      应用上述推荐参数后，请输入观察到的性能值（0-1之间，越大越好）：
                    </p>
                    <div className="flex gap-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={evaluationValue}
                        onChange={(e) => setEvaluationValue(e.target.value)}
                        className="flex-1 rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-600 dark:text-white"
                        placeholder="例如: 0.85"
                      />
                      <button
                        onClick={handleRecordEvaluation}
                        disabled={evaluating}
                        className="rounded-button bg-green-600 px-6 py-2 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {evaluating ? '记录中...' : '提交评估'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {!suggestion && (
                <div className="py-12 text-center text-gray-400">
                  <WarningCircle size={48} className="mx-auto mb-4 opacity-50" weight="thin" />
                  <p>暂无优化建议</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Optimization History */}
          {activeTab === 'history' && (
            <div className="animate-g3-fade-in space-y-6">
              <div className="flex items-start gap-3 rounded-button border border-amber-100 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/30">
                <Clock size={20} className="mt-0.5 shrink-0 text-amber-600" weight="bold" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="mb-1 font-medium">历史评估记录</p>
                  <p className="text-amber-700 dark:text-amber-300">
                    显示过去所有参数评估的性能值，帮助追踪优化进度。
                  </p>
                </div>
              </div>

              <HistoryChart history={history} />

              {history.length > 0 && (
                <div className="mt-6 rounded-button bg-gray-50 p-4 dark:bg-slate-700">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {Math.max(...history.map((h) => h.value)).toFixed(4)}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">最高值</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {(history.reduce((sum, h) => sum + h.value, 0) / history.length).toFixed(4)}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">平均值</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {Math.min(...history.map((h) => h.value)).toFixed(4)}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">最低值</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Best Parameters */}
          {activeTab === 'best' && (
            <div className="animate-g3-fade-in space-y-6">
              <div className="flex items-start gap-3 rounded-button border border-green-100 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/30">
                <Target size={20} className="mt-0.5 shrink-0 text-green-600" weight="bold" />
                <div className="text-sm text-green-800 dark:text-green-200">
                  <p className="mb-1 font-medium">当前最佳参数配置</p>
                  <p className="text-green-700 dark:text-green-300">
                    在所有评估中表现最好的参数组合，建议应用到生产环境。
                  </p>
                </div>
              </div>

              {bestParams?.params && bestParams.value !== null && (
                <>
                  <div className="rounded-button border border-green-100 bg-gradient-to-br from-green-50 to-white p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        最佳性能值
                      </h3>
                      <span className="text-3xl font-bold text-green-600">
                        {bestParams.value?.toFixed(4)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Object.entries(bestParams.params).map(([name, value]) => (
                      <div
                        key={name}
                        className="rounded-button border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-700"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {name}
                          </span>
                          <span className="font-mono text-lg font-bold text-gray-900 dark:text-white">
                            {value.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!bestParams?.params && (
                <div className="py-12 text-center text-gray-400">
                  <Target size={48} className="mx-auto mb-4 opacity-50" weight="thin" />
                  <p>暂无最佳参数</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Control Panel */}
          {activeTab === 'control' && (
            <div className="animate-g3-fade-in space-y-6">
              <div className="flex items-start gap-3 rounded-button border border-purple-100 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/30">
                <Gear size={20} className="mt-0.5 shrink-0 text-purple-600" weight="bold" />
                <div className="text-sm text-purple-800 dark:text-purple-200">
                  <p className="mb-1 font-medium">优化器控制面板</p>
                  <p className="text-purple-700 dark:text-purple-300">
                    手动触发优化周期或重置优化器状态。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Trigger Optimization */}
                <div className="space-y-4 rounded-button border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="rounded-button bg-blue-50 p-3 text-blue-600">
                      <Play size={24} weight="fill" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">触发优化</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        立即运行一次优化周期
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleTriggerOptimization}
                    disabled={triggering}
                    className="w-full rounded-button bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {triggering ? '触发中...' : '触发优化'}
                  </button>
                </div>

                {/* Reset Optimizer */}
                <div className="space-y-4 rounded-button border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="rounded-button bg-red-50 p-3 text-red-600">
                      <ArrowCounterClockwise size={24} weight="bold" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">重置优化器</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        清除所有历史数据并重新开始
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={resetting}
                    className="w-full rounded-button bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resetting ? '重置中...' : '重置优化器'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Diagnostics */}
          {activeTab === 'diagnostics' && (
            <div className="animate-g3-fade-in space-y-6">
              <div className="flex items-start gap-3 rounded-button border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-700">
                <Activity size={20} className="mt-0.5 shrink-0 text-gray-600" weight="bold" />
                <div className="text-sm text-gray-800 dark:text-gray-200">
                  <p className="mb-1 font-medium">优化器诊断信息</p>
                  <p className="text-gray-600 dark:text-gray-400">
                    查看优化器内部状态和详细配置信息。
                  </p>
                </div>
              </div>

              {diagnostics && (
                <div className="overflow-hidden rounded-button border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-700">
                  <button
                    onClick={() => setExpandedDiagnostics(!expandedDiagnostics)}
                    className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-600"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">查看详细信息</span>
                    {expandedDiagnostics ? (
                      <CaretUp size={20} weight="bold" />
                    ) : (
                      <CaretDown size={20} weight="bold" />
                    )}
                  </button>

                  {expandedDiagnostics && (
                    <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-800">
                      <pre className="overflow-x-auto rounded border border-gray-200 bg-white p-4 font-mono text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300">
                        {JSON.stringify(diagnostics, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {!diagnostics && (
                <div className="py-12 text-center text-gray-400">
                  <Activity size={48} className="mx-auto mb-4 opacity-50" weight="thin" />
                  <p>暂无诊断信息</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 重置确认对话框 */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetOptimizer}
        title="确认重置优化器"
        message="确定要重置优化器吗？这将清除所有历史数据，此操作不可撤销。"
        confirmText="确认重置"
        cancelText="取消"
        variant="danger"
      />
    </div>
  );
}
