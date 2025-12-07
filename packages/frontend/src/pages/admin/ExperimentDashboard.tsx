import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  UsersThree,
  Scales,
  Target,
  CheckCircle,
  WarningCircle,
  XCircle,
  ArrowsClockwise,
  Trophy,
  ArrowRight,
  TrendUp,
  Flask,
  Plus,
  ChartBar,
  Gear,
} from '../../components/Icon';
import apiClient from '../../services/ApiClient';
import { adminLogger } from '../../utils/logger';

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

interface VariantData {
  id: string;
  name: string;
  weight: number;
  isControl: boolean;
  parameters: Record<string, unknown>;
}

interface CreateExperimentForm {
  name: string;
  description: string;
  trafficAllocation: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
  minSampleSize: number;
  significanceLevel: number;
  minimumDetectableEffect: number;
  autoDecision: boolean;
  variants: VariantData[];
}

// --- Sub-Components ---

const StatusBadge = ({ status }: { status: ExperimentStatus['status'] }) => {
  const config = {
    running: {
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: Activity,
      label: '运行中 (Running)',
    },
    completed: {
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: CheckCircle,
      label: '已完成 (Completed)',
    },
    stopped: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: XCircle,
      label: '已停止 (Stopped)',
    },
  };
  const { color, icon: Icon, label } = config[status];

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${color}`}
    >
      <Icon size={14} weight="bold" />
      {label}
    </span>
  );
};

const MetricCard = ({ label, value, subtext, icon: Icon, trend }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl border border-gray-200 bg-white/90 p-5 shadow-sm backdrop-blur"
  >
    <div className="mb-2 flex items-start justify-between">
      <div className="rounded-lg bg-gray-50 p-2 text-gray-500">
        <Icon size={20} weight="duotone" />
      </div>
      {trend && (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            trend === 'positive'
              ? 'bg-green-100 text-green-700'
              : trend === 'negative'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
          }`}
        >
          {trend === 'positive' ? '优异' : '一般'}
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    <div className="mt-1 text-sm text-gray-500">{label}</div>
    {subtext && (
      <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-400">{subtext}</div>
    )}
  </motion.div>
);

const ConfidenceIntervalChart = ({
  ci,
  effectSize,
}: {
  ci: { lower: number; upper: number };
  effectSize: number;
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
    <div className="relative mt-4 h-24 w-full">
      {/* Baseline (0) */}
      <div
        className="absolute bottom-0 top-0 z-0 w-px border-r border-dashed border-gray-400 bg-gray-300"
        style={{ left: `${zeroPos}%` }}
      >
        <span className="absolute top-full mt-2 -translate-x-1/2 font-mono text-xs text-gray-400">
          0% (基准)
        </span>
      </div>

      {/* Range Bar (CI) */}
      <div
        className="absolute top-1/2 z-10 h-2 -translate-y-1/2 rounded-full bg-blue-200 opacity-50"
        style={{ left: `${lowerPos}%`, width: `${upperPos - lowerPos}%` }}
      />

      {/* Whiskers */}
      <div
        className="absolute top-1/2 z-20 h-4 w-px -translate-y-1/2 bg-blue-600"
        style={{ left: `${lowerPos}%` }}
      />
      <div
        className="absolute top-1/2 z-20 h-4 w-px -translate-y-1/2 bg-blue-600"
        style={{ left: `${upperPos}%` }}
      />
      <div
        className="absolute top-1/2 z-20 h-px -translate-y-1/2 bg-blue-600"
        style={{ left: `${lowerPos}%`, width: `${upperPos - lowerPos}%` }}
      />

      {/* Effect Size Dot */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5 }}
        className="group absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 transform cursor-help rounded-full border-2 border-white bg-blue-600 shadow-md"
        style={{ left: `${effectPos}%` }}
      >
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 mb-2 hidden w-max -translate-x-1/2 group-hover:block">
          <div className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg">
            Effect: +{(effectSize * 100).toFixed(1)}%
          </div>
        </div>
      </motion.div>

      {/* Labels */}
      <div
        className="absolute top-full mt-2 -translate-x-1/2 text-xs font-medium text-blue-600"
        style={{ left: `${lowerPos}%` }}
      >
        {(ci.lower * 100).toFixed(1)}%
      </div>
      <div
        className="absolute top-full mt-2 -translate-x-1/2 text-xs font-medium text-blue-600"
        style={{ left: `${upperPos}%` }}
      >
        {(ci.upper * 100).toFixed(1)}%
      </div>
    </div>
  );
};

// --- 实验创建表单组件 ---
const CreateExperimentModal = ({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [form, setForm] = useState<CreateExperimentForm>({
    name: '',
    description: '',
    trafficAllocation: 'EVEN',
    minSampleSize: 100,
    significanceLevel: 0.05,
    minimumDetectableEffect: 0.05,
    autoDecision: false,
    variants: [
      {
        id: 'control',
        name: 'Control (LinUCB)',
        weight: 0.5,
        isControl: true,
        parameters: { algorithm: 'linucb' },
      },
      {
        id: 'treatment',
        name: 'Treatment (Thompson)',
        weight: 0.5,
        isControl: false,
        parameters: { algorithm: 'thompson' },
      },
    ],
  });

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      // 验证表单
      if (!form.name.trim()) {
        throw new Error('实验名称不能为空');
      }

      if (form.minSampleSize < 10) {
        throw new Error('最小样本数必须至少为10');
      }

      if (form.significanceLevel <= 0 || form.significanceLevel >= 1) {
        throw new Error('显著性水平必须在 0 和 1 之间');
      }

      // 验证变体权重总和
      const totalWeight = form.variants.reduce((sum, v) => sum + v.weight, 0);
      if (Math.abs(totalWeight - 1) > 0.01) {
        throw new Error('变体权重总和必须为 1');
      }

      adminLogger.info({ form }, '创建实验表单提交');

      // 调用 API 创建实验
      const result = await apiClient.createExperiment({
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        trafficAllocation: form.trafficAllocation,
        minSampleSize: form.minSampleSize,
        significanceLevel: form.significanceLevel,
        minimumDetectableEffect: form.minimumDetectableEffect,
        autoDecision: form.autoDecision,
        variants: form.variants,
      });

      adminLogger.info({ experimentId: result.id }, '实验创建成功');
      onSuccess();
    } catch (error: any) {
      const message = error?.message || '创建实验失败';
      adminLogger.error({ err: error }, '创建实验失败');
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
      >
        <div className="border-b border-gray-200 p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Plus className="text-blue-600" weight="bold" />
            创建新实验
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {/* 基本信息 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">实验名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder="例如: Thompson vs LinUCB 优化测试"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">实验描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="描述实验目的和预期结果..."
            />
          </div>

          {/* 参数配置 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">最小样本数</label>
              <input
                type="number"
                value={form.minSampleSize}
                onChange={(e) => setForm({ ...form, minSampleSize: parseInt(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                min="10"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">显著性水平 (α)</label>
              <input
                type="number"
                step="0.01"
                value={form.significanceLevel}
                onChange={(e) =>
                  setForm({ ...form, significanceLevel: parseFloat(e.target.value) })
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                min="0.01"
                max="0.1"
              />
            </div>
          </div>

          {/* 流量分配 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">流量分配策略</label>
            <select
              value={form.trafficAllocation}
              onChange={(e) => setForm({ ...form, trafficAllocation: e.target.value as any })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="EVEN">均匀分配</option>
              <option value="WEIGHTED">权重分配</option>
              <option value="DYNAMIC">动态分配</option>
            </select>
          </div>

          {/* 错误提示 */}
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-red-700">
                <WarningCircle size={20} weight="bold" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '创建中...' : '创建实验'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// --- Main Component ---

export default function ExperimentDashboard() {
  const [data, setData] = useState<ExperimentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getExperimentStatus('thompson-vs-linucb');
      setData(result);
    } catch (e: any) {
      adminLogger.error({ err: e }, '加载实验数据失败');
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
      <div className="flex min-h-[400px] items-center justify-center">
        <ArrowsClockwise className="animate-spin text-blue-500" size={32} weight="bold" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center p-8">
        <div className="max-w-md text-center" role="alert" aria-live="assertive">
          <WarningCircle size={64} className="mx-auto mb-4 text-red-500" weight="duotone" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">加载失败</h2>
          <p className="mb-6 text-gray-600">{error || '无法加载实验数据'}</p>
          <button
            onClick={loadData}
            className="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const totalSamples = data.sampleSizes.reduce((acc, curr) => acc + curr.sampleCount, 0);
  const controlSamples =
    data.sampleSizes.find((s) => s.variantId.includes('linucb'))?.sampleCount || 0;
  const treatmentSamples =
    data.sampleSizes.find((s) => s.variantId.includes('thompson'))?.sampleCount || 0;

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 bg-gray-50 px-4 py-8">
      {/* 创建实验模态框 */}
      {showCreateModal && (
        <CreateExperimentModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}

      {/* Header Section */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900">
            <Flask className="text-indigo-600" weight="duotone" />
            A/B 测试仪表盘: Bandit 算法优化
          </h1>
          <p className="mt-1 text-gray-500">
            对比 Control (LinUCB) 与 Treatment (Thompson Sampling) 的性能表现
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={18} weight="bold" />
            创建实验
          </button>
          <StatusBadge status={data.status} />
          <button
            onClick={loadData}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50"
            title="刷新数据"
          >
            <ArrowsClockwise size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* 1. Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="P-Value (显著性)"
          value={data.pValue.toFixed(4)}
          icon={Scales}
          subtext={
            data.isSignificant
              ? 'Result is statistically significant'
              : 'Result is NOT significant yet'
          }
          trend={data.isSignificant ? 'positive' : 'neutral'}
        />
        <MetricCard
          label="Effect Size (提升幅度)"
          value={`${(data.effectSize * 100).toFixed(1)}%`}
          icon={TrendUp}
          subtext="Relative improvement over baseline"
          trend={data.effectSize > 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Statistical Power (功效)"
          value={`${(data.statisticalPower * 100).toFixed(0)}%`}
          icon={Target}
          subtext={
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-purple-500"
                style={{ width: `${data.statisticalPower * 100}%` }}
              />
            </div>
          }
        />
        <MetricCard
          label="Total Samples (总样本)"
          value={totalSamples.toLocaleString()}
          icon={UsersThree}
          subtext={`${controlSamples} (C) vs ${treatmentSamples} (T)`}
        />
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* 2. Variant Comparison (Left Column - 1/3 width) */}
        <div className="space-y-6 lg:col-span-1">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <h3 className="font-semibold text-gray-800">变体对比 (Variants)</h3>
            </div>
            <div className="space-y-6 p-6">
              {/* Control Group */}
              <div className="relative border-l-4 border-blue-500 pl-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      Control Group
                    </span>
                    <h4 className="text-lg font-bold text-gray-900">LinUCB</h4>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-2xl font-semibold text-gray-700">
                      {controlSamples}
                    </div>
                    <div className="text-xs text-gray-400">Samples</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Baseline algorithm utilizing Upper Confidence Bound logic.
                </div>
              </div>

              <div className="flex items-center justify-center text-gray-300">
                <span className="rounded bg-gray-50 px-2 text-xs">VS</span>
              </div>

              {/* Treatment Group */}
              <div className="relative border-l-4 border-green-500 pl-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-green-600">
                      Treatment Group
                    </span>
                    <h4 className="text-lg font-bold text-gray-900">Thompson Sampling</h4>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-2xl font-semibold text-gray-700">
                      {treatmentSamples}
                    </div>
                    <div className="text-xs text-gray-400">Samples</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Probabilistic algorithm using Bayesian posterior distributions.
                </div>
                {data.effectSize > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs font-bold text-green-700">
                    <TrendUp size={12} weight="bold" />
                    Leading by {(data.effectSize * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 3. Statistical Analysis & Decision (Right Column - 2/3 width) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Analysis Chart */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                置信区间分析 (95% Confidence Interval)
              </h3>
              {data.isSignificant ? (
                <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                  <CheckCircle size={14} weight="bold" /> 统计显著
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                  <WarningCircle size={14} weight="bold" /> 尚未显著
                </span>
              )}
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-8 pb-12">
              <ConfidenceIntervalChart ci={data.confidenceInterval} effectSize={data.effectSize} />
            </div>

            <p className="mt-4 text-sm leading-relaxed text-gray-500">
              图表展示了实验组相对于对照组的提升幅度区间。如果区间横跨 0%
              线（虚线），则说明目前的差异可能是由随机误差引起的。 当前区间范围:{' '}
              <span className="font-mono font-medium text-gray-700">
                [{(data.confidenceInterval.lower * 100).toFixed(2)}%,{' '}
                {(data.confidenceInterval.upper * 100).toFixed(2)}%]
              </span>
            </p>
          </section>

          {/* 4. Recommendation / Decision Engine */}
          <motion.section
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative overflow-hidden rounded-xl border-2 p-6 shadow-sm ${
              data.status === 'completed'
                ? 'border-indigo-100 bg-gradient-to-br from-indigo-50 to-white'
                : 'border-gray-200 bg-white'
            }`}
          >
            {data.status === 'completed' && (
              <div className="absolute right-0 top-0 p-4 opacity-10">
                <Trophy size={120} className="text-indigo-600" />
              </div>
            )}

            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              {data.status === 'completed' ? '实验结论 (Final Verdict)' : '实时洞察 (Insights)'}
            </h3>

            <div className="relative z-10 space-y-4">
              {data.winner && (
                <div className="flex items-start gap-4 rounded-lg border border-green-100 bg-green-50 p-4">
                  <div className="shrink-0 rounded-full bg-green-100 p-2 text-green-600">
                    <Trophy size={24} weight="fill" />
                  </div>
                  <div>
                    <h4 className="font-bold text-green-900">
                      Winner:{' '}
                      {data.winner === 'treatment_thompson' ? 'Thompson Sampling' : 'LinUCB'}
                    </h4>
                    <p className="mt-1 text-sm text-green-800">{data.reason}</p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-gray-100 bg-white/60 p-4 backdrop-blur">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Recommendation
                </span>
                <p className="mt-1 text-lg font-medium text-gray-800">{data.recommendation}</p>
              </div>

              {/* Action Buttons (Only if completed) */}
              {data.status === 'completed' && (
                <div className="mt-6 flex gap-3 border-t border-indigo-100/50 pt-4">
                  <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow">
                    Adopt Winner
                    <ArrowRight size={16} weight="bold" />
                  </button>
                  <button className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50">
                    Archive Report
                  </button>
                </div>
              )}
            </div>
          </motion.section>

          {/* 5. 数据收集状态与实时追踪 */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
              <ChartBar size={20} weight="bold" />
              数据收集状态
            </h3>

            <div className="space-y-4">
              {/* 总体进度 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-600">总样本收集进度</span>
                  <span className="text-sm font-medium text-gray-900">
                    {totalSamples} / {data.isSignificant ? totalSamples : totalSamples * 2} (目标)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{
                      width: `${Math.min((totalSamples / (totalSamples * 2)) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* 各变体样本数 */}
              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-700">Control (LinUCB)</span>
                    <span className="text-sm text-gray-600">{controlSamples}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${(controlSamples / totalSamples) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-700">Treatment (Thompson)</span>
                    <span className="text-sm text-gray-600">{treatmentSamples}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-green-100">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${(treatmentSamples / totalSamples) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 实时指标 */}
              <div className="border-t border-gray-100 pt-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="mb-1 text-xs text-gray-500">数据质量</div>
                    <div className="text-lg font-bold text-green-600">
                      {totalSamples > 100 ? '良好' : '收集中'}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">样本均衡度</div>
                    <div className="text-lg font-bold text-blue-600">
                      {Math.abs(controlSamples - treatmentSamples) < totalSamples * 0.1
                        ? '均衡'
                        : '偏斜'}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">实验状态</div>
                    <div
                      className={`text-lg font-bold ${data.isSignificant ? 'text-green-600' : 'text-amber-600'}`}
                    >
                      {data.isSignificant ? '已达标' : '进行中'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 6. 统计分析详情面板 */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-gray-800">
            <Gear size={20} weight="bold" />
            统计分析参数
          </h3>
          <span className="text-xs text-gray-500">基于贝叶斯统计与频率派方法</span>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* P-Value 解释 */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">P-Value (显著性)</h4>
              <div className="font-mono text-2xl font-bold text-indigo-600">
                {data.pValue.toFixed(4)}
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                P值 {data.pValue < 0.05 ? '<' : '≥'} 0.05，表示
                {data.isSignificant ? '差异显著' : '差异不显著'}。
                较小的P值表示观察到的差异不太可能是由随机误差引起的。
              </p>
            </div>

            {/* Effect Size 解释 */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Effect Size (效应量)</h4>
              <div className="font-mono text-2xl font-bold text-green-600">
                {data.effectSize > 0 ? '+' : ''}
                {(data.effectSize * 100).toFixed(1)}%
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                实验组相对于对照组的提升幅度。
                {Math.abs(data.effectSize) < 0.02 && '效应较小，实际意义有限。'}
                {Math.abs(data.effectSize) >= 0.02 &&
                  Math.abs(data.effectSize) < 0.08 &&
                  '效应中等，值得关注。'}
                {Math.abs(data.effectSize) >= 0.08 && '效应较大，建议采用。'}
              </p>
            </div>

            {/* Statistical Power 解释 */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Statistical Power (统计功效)</h4>
              <div className="font-mono text-2xl font-bold text-purple-600">
                {(data.statisticalPower * 100).toFixed(0)}%
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                检测到真实效应的概率。通常要求≥80%。 当前功效
                {data.statisticalPower >= 0.8 ? '充足' : '不足'}，
                {data.statisticalPower < 0.8 && '建议继续收集数据或增加样本量。'}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
