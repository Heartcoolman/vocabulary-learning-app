import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Users,
  Scale,
  Target,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Trophy,
  ArrowRight,
  TrendingUp,
  Beaker
} from 'lucide-react';
import apiClient from '../../services/ApiClient';

// --- Types (Matching Backend) ---

interface ExperimentStatus {
  status: 'running' | 'completed' | 'stopped';
  pValue: number;
  effectSize: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  isSignificant: boolean;
  statisticalPower: number;
  sampleSizes: Array<{
    variantId: string;
    sampleCount: number;
  }>;
  winner: string | null;
  recommendation: string;
  reason: string;
  isActive: boolean;
}

// --- Sub-Components ---

const StatusBadge = ({ status }: { status: ExperimentStatus['status'] }) => {
  const config = {
    running: { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Activity, label: '运行中 (Running)' },
    completed: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle2, label: '已完成 (Completed)' },
    stopped: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, label: '已停止 (Stopped)' },
  };
  const { color, icon: Icon, label } = config[status];

  return (
    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${color}`}>
      <Icon size={14} />
      {label}
    </span>
  );
};

const MetricCard = ({ label, value, subtext, icon: Icon, trend }: any) => (
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
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          trend === 'positive' ? 'bg-green-100 text-green-700' :
          trend === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {trend === 'positive' ? '优异' : '一般'}
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    <div className="text-sm text-gray-500 mt-1">{label}</div>
    {subtext && <div className="text-xs text-gray-400 mt-2 border-t border-gray-100 pt-2">{subtext}</div>}
  </motion.div>
);

const ConfidenceIntervalChart = ({
  ci,
  effectSize
}: {
  ci: { lower: number; upper: number },
  effectSize: number
}) => {
  // Scale logic: Map -0.1 to 0.3 (approx range) to 0-100% width
  const min = -0.1;
  const max = 0.3;
  const range = max - min;

  const getPos = (val: number) => ((val - min) / range) * 100;

  const zeroPos = getPos(0);
  const effectPos = getPos(effectSize);
  const lowerPos = getPos(ci.lower);
  const upperPos = getPos(ci.upper);

  return (
    <div className="relative w-full h-24 mt-4">
      {/* Baseline (0) */}
      <div className="absolute top-0 bottom-0 w-px bg-gray-300 border-r border-dashed border-gray-400 z-0"
           style={{ left: `${zeroPos}%` }}>
        <span className="absolute top-full -translate-x-1/2 mt-2 text-xs text-gray-400 font-mono">0% (基准)</span>
      </div>

      {/* Range Bar (CI) */}
      <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-200 rounded-full z-10 opacity-50"
           style={{ left: `${lowerPos}%`, width: `${upperPos - lowerPos}%` }} />

      {/* Whiskers */}
      <div className="absolute top-1/2 -translate-y-1/2 h-4 w-px bg-blue-600 z-20" style={{ left: `${lowerPos}%` }} />
      <div className="absolute top-1/2 -translate-y-1/2 h-4 w-px bg-blue-600 z-20" style={{ left: `${upperPos}%` }} />
      <div className="absolute top-1/2 -translate-y-1/2 h-px bg-blue-600 z-20"
           style={{ left: `${lowerPos}%`, width: `${upperPos - lowerPos}%` }} />

      {/* Effect Size Dot */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-md z-30 transform -translate-x-1/2 cursor-help group"
        style={{ left: `${effectPos}%` }}
      >
         {/* Tooltip */}
         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max">
            <div className="bg-gray-900 text-white text-xs py-1 px-2 rounded shadow-lg">
              Effect: +{(effectSize * 100).toFixed(1)}%
            </div>
         </div>
      </motion.div>

      {/* Labels */}
      <div className="absolute top-full mt-2 text-xs text-blue-600 font-medium -translate-x-1/2" style={{ left: `${lowerPos}%` }}>
        {(ci.lower * 100).toFixed(1)}%
      </div>
      <div className="absolute top-full mt-2 text-xs text-blue-600 font-medium -translate-x-1/2" style={{ left: `${upperPos}%` }}>
        {(ci.upper * 100).toFixed(1)}%
      </div>
    </div>
  );
};

// --- Main Component ---

export default function ExperimentDashboard() {
  const [data, setData] = useState<ExperimentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getExperimentStatus('thompson-vs-linucb');
      setData(result);
    } catch (e: any) {
      console.error("Failed to load experiment data", e);
      setError(e?.message || '加载实验数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 min-h-[400px] flex items-center justify-center animate-g3-fade-in">
        <div className="text-center max-w-md" role="alert" aria-live="assertive">
          <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
          <p className="text-gray-600 mb-6">{error || '无法加载实验数据'}</p>
          <button
            onClick={loadData}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const totalSamples = data.sampleSizes.reduce((acc, curr) => acc + curr.sampleCount, 0);
  const controlSamples = data.sampleSizes.find(s => s.variantId.includes('linucb'))?.sampleCount || 0;
  const treatmentSamples = data.sampleSizes.find(s => s.variantId.includes('thompson'))?.sampleCount || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 bg-gray-50 min-h-screen">

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Beaker className="text-indigo-600" />
            A/B 测试仪表盘: Bandit 算法优化
          </h1>
          <p className="text-gray-500 mt-1">
            对比 Control (LinUCB) 与 Treatment (Thompson Sampling) 的性能表现
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={data.status} />
          <button
            onClick={loadData}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
            title="刷新数据"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* 1. Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="P-Value (显著性)"
          value={data.pValue.toFixed(4)}
          icon={Scale}
          subtext={data.isSignificant ? "Result is statistically significant" : "Result is NOT significant yet"}
          trend={data.isSignificant ? 'positive' : 'neutral'}
        />
        <MetricCard
          label="Effect Size (提升幅度)"
          value={`${(data.effectSize * 100).toFixed(1)}%`}
          icon={TrendingUp}
          subtext="Relative improvement over baseline"
          trend={data.effectSize > 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Statistical Power (功效)"
          value={`${(data.statisticalPower * 100).toFixed(0)}%`}
          icon={Target}
          subtext={
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${data.statisticalPower * 100}%` }} />
            </div>
          }
        />
        <MetricCard
          label="Total Samples (总样本)"
          value={totalSamples.toLocaleString()}
          icon={Users}
          subtext={`${controlSamples} (C) vs ${treatmentSamples} (T)`}
        />
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* 2. Variant Comparison (Left Column - 1/3 width) */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-800">变体对比 (Variants)</h3>
            </div>
            <div className="p-6 space-y-6">

              {/* Control Group */}
              <div className="relative pl-4 border-l-4 border-blue-500">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold tracking-wider text-blue-600 uppercase">Control Group</span>
                    <h4 className="text-lg font-bold text-gray-900">LinUCB</h4>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-semibold text-gray-700">{controlSamples}</div>
                    <div className="text-xs text-gray-400">Samples</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Baseline algorithm utilizing Upper Confidence Bound logic.
                </div>
              </div>

              <div className="flex items-center justify-center text-gray-300">
                <span className="text-xs px-2 bg-gray-50 rounded">VS</span>
              </div>

              {/* Treatment Group */}
              <div className="relative pl-4 border-l-4 border-green-500">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold tracking-wider text-green-600 uppercase">Treatment Group</span>
                    <h4 className="text-lg font-bold text-gray-900">Thompson Sampling</h4>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-semibold text-gray-700">{treatmentSamples}</div>
                    <div className="text-xs text-gray-400">Samples</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Probabilistic algorithm using Bayesian posterior distributions.
                </div>
                {data.effectSize > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded">
                    <TrendingUp size={12} />
                    Leading by {(data.effectSize * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 3. Statistical Analysis & Decision (Right Column - 2/3 width) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Analysis Chart */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-gray-800">置信区间分析 (95% Confidence Interval)</h3>
              {data.isSignificant ? (
                <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full flex items-center gap-1">
                  <CheckCircle2 size={14} /> 统计显著
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full flex items-center gap-1">
                  <AlertCircle size={14} /> 尚未显著
                </span>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-8 pb-12 border border-gray-100">
              <ConfidenceIntervalChart ci={data.confidenceInterval} effectSize={data.effectSize} />
            </div>

            <p className="mt-4 text-sm text-gray-500 leading-relaxed">
              图表展示了实验组相对于对照组的提升幅度区间。如果区间横跨 0% 线（虚线），则说明目前的差异可能是由随机误差引起的。
              当前区间范围: <span className="font-mono font-medium text-gray-700">[{(data.confidenceInterval.lower * 100).toFixed(2)}%, {(data.confidenceInterval.upper * 100).toFixed(2)}%]</span>
            </p>
          </section>

          {/* 4. Recommendation / Decision Engine */}
          <motion.section
             initial={{ opacity: 0, scale: 0.98 }}
             animate={{ opacity: 1, scale: 1 }}
             className={`rounded-xl shadow-sm border-2 p-6 relative overflow-hidden ${
               data.status === 'completed' ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-100' : 'bg-white border-gray-200'
             }`}
          >
            {data.status === 'completed' && (
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Trophy size={120} className="text-indigo-600" />
              </div>
            )}

            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              {data.status === 'completed' ? '🚀 实验结论 (Final Verdict)' : '💡 实时洞察 (Insights)'}
            </h3>

            <div className="space-y-4 relative z-10">
              {data.winner && (
                <div className="p-4 bg-green-50 border border-green-100 rounded-lg flex gap-4 items-start">
                  <div className="p-2 bg-green-100 rounded-full text-green-600 shrink-0">
                    <Trophy size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-green-900">Winner: {data.winner === 'treatment_thompson' ? 'Thompson Sampling' : 'LinUCB'}</h4>
                    <p className="text-green-800 text-sm mt-1">{data.reason}</p>
                  </div>
                </div>
              )}

              <div className="bg-white/60 backdrop-blur p-4 rounded-lg border border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Recommendation</span>
                <p className="text-gray-800 font-medium text-lg mt-1">{data.recommendation}</p>
              </div>

              {/* Action Buttons (Only if completed) */}
              {data.status === 'completed' && (
                <div className="flex gap-3 mt-6 pt-4 border-t border-indigo-100/50">
                  <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-sm transition-all hover:shadow hover:-translate-y-0.5">
                    Adopt Winner
                    <ArrowRight size={16} />
                  </button>
                  <button className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                    Archive Report
                  </button>
                </div>
              )}
            </div>
          </motion.section>

        </div>
      </div>
    </div>
  );
}
