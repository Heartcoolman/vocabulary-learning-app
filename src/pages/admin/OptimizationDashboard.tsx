import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  RefreshCw,
  Settings,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Target,
  Play,
  RotateCcw,
  Zap,
  Clock,
  Database,
  Info,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import apiClient from '../../services/ApiClient';
import { adminLogger } from '../../utils/logger';

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
  <div className="min-h-[400px] flex items-center justify-center">
    <RefreshCw className="animate-spin text-blue-500" size={32} />
  </div>
);

const ErrorDisplay = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="p-8 min-h-[400px] flex items-center justify-center animate-g3-fade-in">
    <div className="text-center max-w-md" role="alert" aria-live="assertive">
      <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
      <p className="text-gray-600 mb-6">{error}</p>
      <button
        onClick={onRetry}
        className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
      >
        重试
      </button>
    </div>
  </div>
);

const MetricCard = ({ label, value, icon: Icon, trend, subtext }: {
  label: string;
  value: string | number;
  icon: any;
  trend?: 'positive' | 'negative' | 'neutral';
  subtext?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white/90 backdrop-blur rounded-xl border border-gray-200 p-5 shadow-sm"
  >
    <div className="flex justify-between items-start mb-2">
      <div className="p-2 bg-gray-50 rounded-lg text-gray-500">
        <Icon size={20} />
      </div>
      {trend && (
        <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${
          trend === 'positive' ? 'bg-green-100 text-green-700' :
          trend === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {trend === 'positive' ? <ArrowUp size={12} /> : trend === 'negative' ? <ArrowDown size={12} /> : <Minus size={12} />}
          {trend === 'positive' ? '优化中' : trend === 'negative' ? '需调整' : '稳定'}
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    <div className="text-sm text-gray-500 mt-1">{label}</div>
    {subtext && <div className="text-xs text-gray-400 mt-2 border-t border-gray-100 pt-2">{subtext}</div>}
  </motion.div>
);

const ParamCard = ({ name, value, space }: {
  name: string;
  value: number;
  space: { min: number; max: number; step: number };
}) => {
  const percentage = ((value - space.min) / (space.max - space.min)) * 100;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-2">
        <span className="text-sm font-medium text-gray-700">{name}</span>
        <span className="text-sm font-mono font-bold text-blue-600">{value.toFixed(4)}</span>
      </div>

      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        <span>min: {space.min}</span>
        <span>max: {space.max}</span>
      </div>
    </div>
  );
};

const HistoryChart = ({ history }: { history: OptimizationHistory[] }) => {
  if (history.length === 0) {
    return (
      <div className="text-center text-gray-400 py-12">
        <Database size={48} className="mx-auto mb-4 opacity-50" />
        <p>暂无历史数据</p>
      </div>
    );
  }

  const maxValue = Math.max(...history.map(h => h.value));
  const minValue = Math.min(...history.map(h => h.value));
  const range = maxValue - minValue;

  return (
    <div className="space-y-3">
      {history.slice(-10).map((item, index) => {
        const height = range > 0 ? ((item.value - minValue) / range) * 100 : 50;
        const date = new Date(item.timestamp).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        return (
          <div key={index} className="flex items-center gap-3 group">
            <span className="text-xs text-gray-500 w-24 shrink-0">{date}</span>
            <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${height}%` }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-lg"
              />
            </div>
            <span className="text-sm font-mono font-medium text-gray-700 w-20 text-right">
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
  const [activeTab, setActiveTab] = useState<'suggestion' | 'history' | 'best' | 'control' | 'diagnostics'>('suggestion');
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

  const loadAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [suggestionData, historyData, bestData, diagnosticsData] = await Promise.all([
        apiClient.getOptimizationSuggestion(),
        apiClient.getOptimizationHistory(),
        apiClient.getBestOptimizationParams(),
        apiClient.getOptimizationDiagnostics()
      ]);

      setSuggestion(suggestionData);
      setHistory(historyData);
      setBestParams(bestData);
      setDiagnostics(diagnosticsData);
    } catch (e: any) {
      adminLogger.error({ err: e }, '加载优化数据失败');
      setError(e?.message || '加载优化数据失败');
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
      alert('优化已触发：' + JSON.stringify(result));
      await loadAllData();
    } catch (e: any) {
      adminLogger.error({ err: e }, '触发优化失败');
      alert('触发优化失败：' + e.message);
    } finally {
      setTriggering(false);
    }
  };

  const handleResetOptimizer = async () => {
    if (!confirm('确定要重置优化器吗？这将清除所有历史数据。')) {
      return;
    }

    setResetting(true);
    try {
      const result = await apiClient.resetOptimizer();
      adminLogger.info({ result }, '优化器重置成功');
      alert('优化器已重置');
      await loadAllData();
    } catch (e: any) {
      adminLogger.error({ err: e }, '重置优化器失败');
      alert('重置优化器失败：' + e.message);
    } finally {
      setResetting(false);
    }
  };

  const handleRecordEvaluation = async () => {
    if (!suggestion?.params) {
      alert('没有可评估的参数建议');
      return;
    }

    const value = parseFloat(evaluationValue);
    if (isNaN(value) || value < 0 || value > 1) {
      alert('请输入 0-1 之间的有效数值');
      return;
    }

    setEvaluating(true);
    try {
      await apiClient.recordOptimizationEvaluation(suggestion.params, value);
      adminLogger.info({ params: suggestion.params, value }, '评估记录成功');
      alert('评估已记录');
      await loadAllData();
    } catch (e: any) {
      adminLogger.error({ err: e }, '记录评估失败');
      alert('记录评估失败：' + e.message);
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
    { id: 'control', label: '优化控制', icon: Settings },
    { id: 'diagnostics', label: '诊断信息', icon: Activity }
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 bg-gray-50 min-h-screen">

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Zap className="text-amber-500" />
            优化分析仪表盘
          </h1>
          <p className="text-gray-500 mt-1">
            贝叶斯优化 - 自适应参数调优与性能追踪
          </p>
        </div>
        <button
          onClick={loadAllData}
          className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          title="刷新数据"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="历史评估次数"
          value={history.length}
          icon={Database}
          subtext={`最近评估: ${history.length > 0 ? new Date(history[history.length - 1].timestamp).toLocaleString('zh-CN') : '无'}`}
        />
        <MetricCard
          label="最佳性能值"
          value={bestParams?.value !== null && bestParams?.value !== undefined ? bestParams.value.toFixed(4) : 'N/A'}
          icon={Trophy}
          trend={bestParams?.value && bestParams.value > 0.8 ? 'positive' : bestParams?.value && bestParams.value > 0.6 ? 'neutral' : 'negative'}
          subtext="目标：最大化学习效果"
        />
        <MetricCard
          label="参数空间维度"
          value={suggestion ? Object.keys(suggestion.paramSpace).length : 0}
          icon={BarChart3}
          subtext="贝叶斯优化探索的参数数量"
        />
        <MetricCard
          label="优化状态"
          value={history.length >= 10 ? "收敛中" : "探索中"}
          icon={TrendingUp}
          trend={history.length >= 10 ? 'positive' : 'neutral'}
          subtext={`建议至少 20 次评估`}
        />
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Tab 1: Optimization Suggestion */}
          {activeTab === 'suggestion' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <Info size={20} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">下一个推荐参数组合</p>
                  <p className="text-blue-700">
                    基于贝叶斯优化算法，根据历史评估结果推荐下一组最有潜力的参数配置。
                  </p>
                </div>
              </div>

              {suggestion && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="mt-6 p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <CheckCircle2 size={20} className="text-green-600" />
                      记录评估结果
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
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
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="例如: 0.85"
                      />
                      <button
                        onClick={handleRecordEvaluation}
                        disabled={evaluating}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {evaluating ? '记录中...' : '提交评估'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {!suggestion && (
                <div className="text-center text-gray-400 py-12">
                  <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                  <p>暂无优化建议</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Tab 2: Optimization History */}
          {activeTab === 'history' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-lg">
                <Clock size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">历史评估记录</p>
                  <p className="text-amber-700">
                    显示过去所有参数评估的性能值，帮助追踪优化进度。
                  </p>
                </div>
              </div>

              <HistoryChart history={history} />

              {history.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {Math.max(...history.map(h => h.value)).toFixed(4)}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">最高值</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {(history.reduce((sum, h) => sum + h.value, 0) / history.length).toFixed(4)}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">平均值</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {Math.min(...history.map(h => h.value)).toFixed(4)}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">最低值</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Tab 3: Best Parameters */}
          {activeTab === 'best' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-100 rounded-lg">
                <Target size={20} className="text-green-600 shrink-0 mt-0.5" />
                <div className="text-sm text-green-800">
                  <p className="font-medium mb-1">当前最佳参数配置</p>
                  <p className="text-green-700">
                    在所有评估中表现最好的参数组合，建议应用到生产环境。
                  </p>
                </div>
              </div>

              {bestParams?.params && bestParams.value !== null && (
                <>
                  <div className="p-6 bg-gradient-to-br from-green-50 to-white rounded-lg border border-green-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">最佳性能值</h3>
                      <span className="text-3xl font-bold text-green-600">
                        {bestParams.value?.toFixed(4)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(bestParams.params).map(([name, value]) => (
                      <div key={name} className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">{name}</span>
                          <span className="text-lg font-mono font-bold text-gray-900">{value.toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!bestParams?.params && (
                <div className="text-center text-gray-400 py-12">
                  <Target size={48} className="mx-auto mb-4 opacity-50" />
                  <p>暂无最佳参数</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Tab 4: Control Panel */}
          {activeTab === 'control' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-100 rounded-lg">
                <Settings size={20} className="text-purple-600 shrink-0 mt-0.5" />
                <div className="text-sm text-purple-800">
                  <p className="font-medium mb-1">优化器控制面板</p>
                  <p className="text-purple-700">
                    手动触发优化周期或重置优化器状态。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Trigger Optimization */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                      <Play size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">触发优化</h3>
                      <p className="text-sm text-gray-500">立即运行一次优化周期</p>
                    </div>
                  </div>
                  <button
                    onClick={handleTriggerOptimization}
                    disabled={triggering}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {triggering ? '触发中...' : '触发优化'}
                  </button>
                </div>

                {/* Reset Optimizer */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-50 rounded-lg text-red-600">
                      <RotateCcw size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">重置优化器</h3>
                      <p className="text-sm text-gray-500">清除所有历史数据并重新开始</p>
                    </div>
                  </div>
                  <button
                    onClick={handleResetOptimizer}
                    disabled={resetting}
                    className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {resetting ? '重置中...' : '重置优化器'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Tab 5: Diagnostics */}
          {activeTab === 'diagnostics' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <Activity size={20} className="text-gray-600 shrink-0 mt-0.5" />
                <div className="text-sm text-gray-800">
                  <p className="font-medium mb-1">优化器诊断信息</p>
                  <p className="text-gray-600">
                    查看优化器内部状态和详细配置信息。
                  </p>
                </div>
              </div>

              {diagnostics && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedDiagnostics(!expandedDiagnostics)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">查看详细信息</span>
                    {expandedDiagnostics ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>

                  {expandedDiagnostics && (
                    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                      <pre className="text-xs text-gray-700 overflow-x-auto p-4 bg-white rounded border border-gray-200 font-mono">
                        {JSON.stringify(diagnostics, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {!diagnostics && (
                <div className="text-center text-gray-400 py-12">
                  <Activity size={48} className="mx-auto mb-4 opacity-50" />
                  <p>暂无诊断信息</p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper icon component (if lucide-react doesn't have Lightbulb, fallback to Info)
const Lightbulb = Info;
const Trophy = Target;
