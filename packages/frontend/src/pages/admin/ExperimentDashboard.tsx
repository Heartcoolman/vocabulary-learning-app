import { useState, useEffect } from 'react';
import type { Icon } from '@phosphor-icons/react';
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
  ArrowLeft,
  Play,
  Stop,
  Trash,
  Eye,
} from '../../components/Icon';
import apiClient from '../../services/client';
import { adminLogger } from '../../utils/logger';
import { useToastStore } from '../../stores/toastStore';

// --- Types (Matching Backend) ---

interface ExperimentStatus {
  status: 'running' | 'completed' | 'stopped' | 'draft' | 'aborted';
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

interface ExperimentListItem {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'ABORTED';
  trafficAllocation: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
  minSampleSize: number;
  significanceLevel: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  variantCount: number;
  totalSamples: number;
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

const StatusBadge = ({
  status,
}: {
  status: ExperimentStatus['status'] | ExperimentListItem['status'];
}) => {
  const config: Record<string, { color: string; icon: Icon; label: string }> = {
    running: {
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: Activity,
      label: '运行中',
    },
    RUNNING: {
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: Activity,
      label: '运行中',
    },
    completed: {
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: CheckCircle,
      label: '已完成',
    },
    COMPLETED: {
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: CheckCircle,
      label: '已完成',
    },
    stopped: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: XCircle,
      label: '已停止',
    },
    aborted: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: XCircle,
      label: '已中止',
    },
    ABORTED: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: XCircle,
      label: '已中止',
    },
    draft: {
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: Gear,
      label: '草稿',
    },
    DRAFT: {
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: Gear,
      label: '草稿',
    },
  };
  const { color, icon: Icon, label } = config[status] || config.DRAFT;

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${color}`}
    >
      <Icon size={14} weight="bold" />
      {label}
    </span>
  );
};

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string | React.ReactNode;
  icon: Icon;
  trend?: 'positive' | 'negative' | null;
}

const MetricCard = ({ label, value, subtext, icon: Icon, trend }: MetricCardProps) => (
  <div className="animate-g3-fade-in rounded-card border border-gray-200 bg-white/90 p-5 shadow-soft backdrop-blur dark:border-slate-700 dark:bg-slate-800/90">
    <div className="mb-2 flex items-start justify-between">
      <div className="rounded-button bg-gray-50 p-2 text-gray-500 dark:bg-slate-700 dark:text-gray-400">
        <Icon size={20} weight="duotone" />
      </div>
      {trend && (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            trend === 'positive'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : trend === 'negative'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400'
          }`}
        >
          {trend === 'positive' ? '优异' : '一般'}
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
      <div
        className="group absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 transform cursor-help rounded-full border-2 border-white bg-blue-600 shadow-elevated transition-transform duration-g3-slow"
        style={{ left: `${effectPos}%` }}
      >
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 mb-2 hidden w-max -translate-x-1/2 group-hover:block">
          <div className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-elevated">
            Effect: +{(effectSize * 100).toFixed(1)}%
          </div>
        </div>
      </div>

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
    } catch (error) {
      const err = error as Error;
      const message = err?.message || '创建实验失败';
      adminLogger.error({ err: error }, '创建实验失败');
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl animate-g3-scale-in overflow-y-auto rounded-card bg-white shadow-2xl">
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
              className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder="例如: Thompson vs LinUCB 优化测试"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">实验描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
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
                className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
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
                className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                min="0.01"
                max="0.1"
              />
            </div>
          </div>

          {/* 最小可检测效应 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              最小可检测效应 (MDE)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.minimumDetectableEffect}
              onChange={(e) =>
                setForm({ ...form, minimumDetectableEffect: parseFloat(e.target.value) })
              }
              className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              min="0.01"
              max="0.5"
            />
            <p className="mt-1 text-xs text-gray-500">
              希望能检测到的最小提升幅度，范围 0.01 - 0.5（即 1% - 50%）
            </p>
          </div>

          {/* 流量分配 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">流量分配策略</label>
            <select
              value={form.trafficAllocation}
              onChange={(e) =>
                setForm({
                  ...form,
                  trafficAllocation: e.target.value as CreateExperimentForm['trafficAllocation'],
                })
              }
              className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="EVEN">均匀分配</option>
              <option value="WEIGHTED">权重分配</option>
              <option value="DYNAMIC">动态分配</option>
            </select>
          </div>

          {/* 错误提示 */}
          {errorMessage && (
            <div className="rounded-button border border-red-200 bg-red-50 p-4">
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
              className="flex-1 rounded-button border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-button bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '创建中...' : '创建实验'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- 实验列表组件 ---
const ExperimentList = ({
  experiments,
  loading,
  onRefresh,
  onSelect,
  onStart,
  onStop,
  onDelete,
  onCreate,
}: {
  experiments: ExperimentListItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) => {
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <ArrowsClockwise className="animate-spin text-blue-500" size={32} weight="bold" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 bg-gray-50 px-4 py-8 dark:bg-slate-900">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
            <Flask className="text-indigo-600" weight="duotone" />
            A/B 测试实验管理
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">创建和管理算法对比实验</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onCreate}
            className="flex items-center gap-2 rounded-button bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={18} weight="bold" />
            创建实验
          </button>
          <button
            onClick={onRefresh}
            className="rounded-button border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700"
            title="刷新"
          >
            <ArrowsClockwise size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* 实验列表 */}
      {!experiments || experiments.length === 0 ? (
        <div className="flex min-h-[400px] animate-g3-fade-in flex-col items-center justify-center rounded-card border border-gray-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-800">
          <Flask size={64} className="mb-4 text-gray-300 dark:text-gray-600" weight="duotone" />
          <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">暂无实验</h2>
          <p className="mb-6 text-gray-500 dark:text-gray-400">创建您的第一个 A/B 测试实验</p>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 rounded-button bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={18} weight="bold" />
            创建实验
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {experiments.map((exp) => (
            <div
              key={exp.id}
              className="animate-g3-fade-in rounded-card border border-gray-200 bg-white p-6 shadow-soft transition-shadow hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{exp.name}</h3>
                    <StatusBadge status={exp.status} />
                  </div>
                  {exp.description && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {exp.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <UsersThree size={16} />
                      {exp.totalSamples} 样本
                    </span>
                    <span className="flex items-center gap-1">
                      <ChartBar size={16} />
                      {exp.variantCount} 变体
                    </span>
                    <span>显著性水平: {exp.significanceLevel}</span>
                    <span>创建于: {new Date(exp.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {exp.status === 'DRAFT' && (
                    <button
                      onClick={() => onStart(exp.id)}
                      className="flex items-center gap-1 rounded-button bg-green-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600"
                      title="启动实验"
                    >
                      <Play size={16} weight="bold" />
                      启动
                    </button>
                  )}
                  {exp.status === 'RUNNING' && (
                    <button
                      onClick={() => onStop(exp.id)}
                      className="flex items-center gap-1 rounded-button bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                      title="停止实验"
                    >
                      <Stop size={16} weight="bold" />
                      停止
                    </button>
                  )}
                  <button
                    onClick={() => onSelect(exp.id)}
                    className="flex items-center gap-1 rounded-button bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                    title="查看详情"
                  >
                    <Eye size={16} weight="bold" />
                    详情
                  </button>
                  {exp.status !== 'RUNNING' && (
                    <button
                      onClick={() => onDelete(exp.id)}
                      className="flex items-center gap-1 rounded-button bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                      title="删除实验"
                    >
                      <Trash size={16} weight="bold" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- 实验详情组件 ---
const ExperimentDetail = ({
  experimentId,
  onBack,
}: {
  experimentId: string;
  onBack: () => void;
}) => {
  const [data, setData] = useState<ExperimentStatus | null>(null);
  const [variants, setVariants] = useState<VariantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResult, detailResult] = await Promise.all([
        apiClient.getExperimentStatus(experimentId),
        apiClient.getExperiment(experimentId),
      ]);
      setData(statusResult);
      setVariants(detailResult?.variants || []);
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '加载实验数据失败');
      setError(err?.message || '加载实验数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [experimentId]);

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
          <div className="flex justify-center gap-3">
            <button
              onClick={onBack}
              className="rounded-button border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              返回列表
            </button>
            <button
              onClick={loadData}
              className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalSamples = data.sampleSizes.reduce((acc, curr) => acc + curr.sampleCount, 0);

  // 使用 isControl 标志查找变体，而不是字符串匹配
  const controlVariant = variants.find((v) => v.isControl);
  const treatmentVariant = variants.find((v) => !v.isControl);

  const controlSamples = controlVariant
    ? (data.sampleSizes.find((s) => s.variantId === controlVariant.id)?.sampleCount ?? 0)
    : (data.sampleSizes[0]?.sampleCount ?? 0);
  const treatmentSamples = treatmentVariant
    ? (data.sampleSizes.find((s) => s.variantId === treatmentVariant.id)?.sampleCount ?? 0)
    : (data.sampleSizes[1]?.sampleCount ?? 0);

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 bg-gray-50 px-4 py-8 dark:bg-slate-900">
      {/* Header Section */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <button
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <ArrowLeft size={16} />
            返回列表
          </button>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
            <Flask className="text-indigo-600" weight="duotone" />
            实验详情
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">ID: {experimentId}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={data.status} />
          <button
            onClick={loadData}
            className="rounded-button border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700"
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
          subtext={data.isSignificant ? '结果具有统计显著性' : '结果尚未显著'}
          trend={data.isSignificant ? 'positive' : null}
        />
        <MetricCard
          label="Effect Size (提升幅度)"
          value={`${(data.effectSize * 100).toFixed(1)}%`}
          icon={TrendUp}
          subtext="相对于基准的提升"
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
          <section className="overflow-hidden rounded-card border border-gray-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-slate-700 dark:bg-slate-900/50">
              <h3 className="font-semibold text-gray-800 dark:text-slate-200">
                变体对比 (Variants)
              </h3>
            </div>
            <div className="space-y-6 p-6">
              {/* Control Group */}
              <div className="relative border-l-4 border-blue-500 pl-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      Control Group
                    </span>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">对照组</h4>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      {controlSamples}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">Samples</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center text-gray-300 dark:text-gray-600">
                <span className="rounded bg-gray-50 px-2 text-xs dark:bg-slate-700">VS</span>
              </div>

              {/* Treatment Group */}
              <div className="relative border-l-4 border-green-500 pl-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-green-600">
                      Treatment Group
                    </span>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">实验组</h4>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      {treatmentSamples}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">Samples</div>
                  </div>
                </div>
                {data.effectSize > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs font-bold text-green-700">
                    <TrendUp size={12} weight="bold" />
                    领先 {(data.effectSize * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 3. Statistical Analysis & Decision (Right Column - 2/3 width) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Analysis Chart */}
          <section className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-slate-200">
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

            <div className="rounded-button border border-gray-100 bg-gray-50 p-8 pb-12">
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
          <section
            className={`relative animate-g3-fade-in overflow-hidden rounded-card border-2 p-6 shadow-soft ${
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
                <div className="flex items-start gap-4 rounded-button border border-green-100 bg-green-50 p-4">
                  <div className="shrink-0 rounded-full bg-green-100 p-2 text-green-600">
                    <Trophy size={24} weight="fill" />
                  </div>
                  <div>
                    <h4 className="font-bold text-green-900">Winner: {data.winner}</h4>
                    <p className="mt-1 text-sm text-green-800">{data.reason}</p>
                  </div>
                </div>
              )}

              <div className="rounded-button border border-gray-100 bg-white/60 p-4 backdrop-blur">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Recommendation
                </span>
                <p className="mt-1 text-lg font-medium text-gray-800">{data.recommendation}</p>
              </div>

              {/* Action Buttons (Only if completed) */}
              {data.status === 'completed' && (
                <div className="mt-6 flex gap-3 border-t border-indigo-100/50 pt-4">
                  <button className="flex items-center gap-2 rounded-button bg-indigo-600 px-4 py-2 font-medium text-white shadow-soft transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow">
                    采用获胜方案
                    <ArrowRight size={16} weight="bold" />
                  </button>
                  <button className="rounded-button border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50">
                    归档报告
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function ExperimentDashboard() {
  const [experiments, setExperiments] = useState<ExperimentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const toast = useToastStore();

  const loadExperiments = async () => {
    setLoading(true);
    try {
      const result = await apiClient.getExperiments();
      setExperiments(result?.experiments || []);
    } catch (e) {
      adminLogger.error({ err: e }, '加载实验列表失败');
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExperiments();
  }, []);

  const handleStartExperiment = async (id: string) => {
    try {
      await apiClient.startExperiment(id);
      toast.success('实验启动成功');
      await loadExperiments();
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '启动实验失败');
      toast.error('启动失败: ' + (err?.message || '未知错误'));
    }
  };

  const handleStopExperiment = async (id: string) => {
    try {
      await apiClient.stopExperiment(id);
      toast.success('实验已停止');
      await loadExperiments();
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '停止实验失败');
      toast.error('停止失败: ' + (err?.message || '未知错误'));
    }
  };

  const handleDeleteExperiment = async (id: string) => {
    if (!confirm('确定要删除此实验吗？此操作不可撤销。')) {
      return;
    }
    try {
      await apiClient.deleteExperiment(id);
      toast.success('实验已删除');
      await loadExperiments();
    } catch (e) {
      const err = e as Error;
      adminLogger.error({ err: e }, '删除实验失败');
      toast.error('删除失败: ' + (err?.message || '未知错误'));
    }
  };

  // 如果选中了实验，显示详情
  if (selectedExperiment) {
    return (
      <>
        {showCreateModal && (
          <CreateExperimentModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              loadExperiments();
            }}
          />
        )}
        <ExperimentDetail
          experimentId={selectedExperiment}
          onBack={() => setSelectedExperiment(null)}
        />
      </>
    );
  }

  // 否则显示列表
  return (
    <>
      {showCreateModal && (
        <CreateExperimentModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadExperiments();
          }}
        />
      )}
      <ExperimentList
        experiments={experiments}
        loading={loading}
        onRefresh={loadExperiments}
        onSelect={setSelectedExperiment}
        onStart={handleStartExperiment}
        onStop={handleStopExperiment}
        onDelete={handleDeleteExperiment}
        onCreate={() => setShowCreateModal(true)}
      />
    </>
  );
}
