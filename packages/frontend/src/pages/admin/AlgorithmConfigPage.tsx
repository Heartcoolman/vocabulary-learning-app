import { useState, useEffect, useMemo } from 'react';
import { AlgorithmConfig } from '../../types/models';
import { AlgorithmConfigService } from '../../services/algorithms/AlgorithmConfigService';
import {
  Gear,
  ArrowCounterClockwise,
  FloppyDisk,
  Warning,
  CheckCircle,
  Plus,
  Trash,
  CircleNotch,
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import { useAlgorithmConfig } from '../../hooks/queries';
import { useUpdateAlgorithmConfig, useResetAlgorithmConfig } from '../../hooks/mutations';

/**
 * 算法配置页面（管理员）
 * 允许管理员查看和修改所有学习算法参数
 */
export default function AlgorithmConfigPage() {
  const toast = useToast();
  const [config, setConfig] = useState<AlgorithmConfig | null>(null);
  const [defaultConfig, setDefaultConfig] = useState<AlgorithmConfig | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 使用 React Query hooks
  const { data: serverConfig, isLoading, error } = useAlgorithmConfig();
  const updateConfigMutation = useUpdateAlgorithmConfig();
  const resetConfigMutation = useResetAlgorithmConfig();

  // 使用 useMemo 避免每次渲染都创建新实例（用于获取默认配置和验证）
  const configService = useMemo(() => new AlgorithmConfigService(), []);

  // 当从服务器加载配置后，初始化本地状态
  useEffect(() => {
    if (serverConfig) {
      setConfig(serverConfig);
      // 获取默认配置用于对比
      const defaultCfg = configService.getDefaultConfig();
      setDefaultConfig(defaultCfg);
    }
  }, [serverConfig, configService]);

  // 显示加载错误
  useEffect(() => {
    if (error) {
      adminLogger.error({ err: error }, '加载算法配置失败');
      toast.error('加载算法配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }, [error, toast]);

  // 验证配置
  const validateAndUpdate = (newConfig: AlgorithmConfig) => {
    const validation = configService.validateConfig(newConfig);
    setValidationErrors(validation.errors);
    setConfig(newConfig);
  };

  // 保存配置
  const handleSave = async () => {
    if (!config) return;

    const validation = configService.validateConfig(config);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    try {
      await updateConfigMutation.mutateAsync({
        configId: config.id,
        config,
        changeReason: '管理员手动更新',
      });
      setSaveSuccess(true);
      toast.success('配置已保存');
    } catch (error) {
      adminLogger.error({ err: error, config }, '保存算法配置失败');
      toast.error('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 重置为默认值
  const handleReset = async () => {
    if (!config) return;

    try {
      const resetConfig = await resetConfigMutation.mutateAsync(config.id);
      setConfig(resetConfig);
      setValidationErrors([]);
      setShowResetConfirm(false);
      setSaveSuccess(true);
      toast.success('配置已重置为默认值');
    } catch (error) {
      adminLogger.error({ err: error }, '重置算法配置失败');
      toast.error('重置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 使用 useEffect 管理 saveSuccess 的自动清理
  useEffect(() => {
    if (saveSuccess) {
      const timeoutId = setTimeout(() => setSaveSuccess(false), 3000);
      return () => clearTimeout(timeoutId);
    }
  }, [saveSuccess]);

  // 合并 loading 状态
  const isSaving = updateConfigMutation.isPending || resetConfigMutation.isPending;

  if (isLoading || !config || !defaultConfig) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600" role="status" aria-live="polite">
            加载配置中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-g3-fade-in p-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <Gear size={32} weight="duotone" className="text-blue-500" />
          <h1 className="text-3xl font-bold text-gray-900">算法配置</h1>
        </div>
        <p className="text-gray-600">配置学习算法的各项参数，影响单词学习和复习的调度策略</p>
      </div>

      {/* 验证错误提示 */}
      {validationErrors.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <Warning size={20} weight="bold" className="mt-0.5 flex-shrink-0 text-red-500" />
            <div className="flex-1">
              <h3 className="mb-2 font-semibold text-red-900">配置验证失败</h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-red-700">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 保存成功提示 */}
      {saveSuccess && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} weight="bold" className="text-green-500" />
            <span className="font-medium text-green-900">配置已成功保存</span>
          </div>
        </div>
      )}

      {/* 配置表单 */}
      <div className="space-y-6">
        {/* 1. 遗忘曲线参数 */}
        <ReviewIntervalsSection
          intervals={config.reviewIntervals}
          defaultIntervals={defaultConfig.reviewIntervals}
          onChange={(intervals) => validateAndUpdate({ ...config, reviewIntervals: intervals })}
        />

        {/* 2. 难度调整参数 */}
        <DifficultyAdjustmentSection
          consecutiveCorrect={config.consecutiveCorrectThreshold}
          consecutiveWrong={config.consecutiveWrongThreshold}
          adjustmentInterval={config.difficultyAdjustmentInterval}
          defaultConsecutiveCorrect={defaultConfig.consecutiveCorrectThreshold}
          defaultConsecutiveWrong={defaultConfig.consecutiveWrongThreshold}
          defaultAdjustmentInterval={defaultConfig.difficultyAdjustmentInterval}
          onChange={(updates) => validateAndUpdate({ ...config, ...updates })}
        />

        {/* 3. 优先级权重 */}
        <PriorityWeightsSection
          weights={config.priorityWeights}
          defaultWeights={defaultConfig.priorityWeights}
          onChange={(weights) => validateAndUpdate({ ...config, priorityWeights: weights })}
        />

        {/* 4. 掌握程度阈值 */}
        <MasteryThresholdsSection
          thresholds={config.masteryThresholds}
          defaultThresholds={defaultConfig.masteryThresholds}
          onChange={(thresholds) => validateAndUpdate({ ...config, masteryThresholds: thresholds })}
        />

        {/* 5. 单词得分权重 */}
        <ScoreWeightsSection
          weights={config.scoreWeights}
          defaultWeights={defaultConfig.scoreWeights}
          onChange={(weights) => validateAndUpdate({ ...config, scoreWeights: weights })}
        />

        {/* 6. 答题速度评分标准 */}
        <SpeedThresholdsSection
          thresholds={config.speedThresholds}
          defaultThresholds={defaultConfig.speedThresholds}
          onChange={(thresholds) => validateAndUpdate({ ...config, speedThresholds: thresholds })}
        />
      </div>

      {/* 操作按钮 */}
      <div className="sticky bottom-4 mt-8 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-200 hover:scale-105 hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowCounterClockwise size={18} weight="bold" />
          恢复默认值
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving || validationErrors.length > 0}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-8 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FloppyDisk size={18} weight="bold" />
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {/* 重置确认对话框 */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-6">
          <div className="w-full max-w-md animate-g3-slide-up rounded-3xl bg-white p-8 shadow-xl">
            <div className="mb-6 text-center">
              <Warning size={64} weight="duotone" className="mx-auto mb-4 text-yellow-500" />
              <h3 className="mb-2 text-2xl font-bold text-gray-900">确认重置</h3>
              <p className="text-gray-600">确定要将所有配置恢复为默认值吗？此操作不可撤销。</p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-200 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleReset}
                className="flex-1 rounded-xl bg-yellow-500 px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:bg-yellow-600"
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 遗忘曲线参数编辑区块
 */
interface ReviewIntervalsSectionProps {
  intervals: number[];
  defaultIntervals: number[];
  onChange: (intervals: number[]) => void;
}

function ReviewIntervalsSection({
  intervals,
  defaultIntervals,
  onChange,
}: ReviewIntervalsSectionProps) {
  const addInterval = () => {
    const lastInterval = intervals[intervals.length - 1] || 0;
    onChange([...intervals, lastInterval + 7]);
  };

  const removeInterval = (index: number) => {
    if (intervals.length <= 1) {
      return;
    }
    onChange(intervals.filter((_, i) => i !== index));
  };

  const updateInterval = (index: number, value: number) => {
    const newIntervals = [...intervals];
    newIntervals[index] = value;
    onChange(newIntervals);
  };

  const isDefault = JSON.stringify(intervals) === JSON.stringify(defaultIntervals);

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">遗忘曲线参数</h2>
          <p className="mt-1 text-sm text-gray-600">
            配置复习间隔序列（单位：天）
            {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
          </p>
        </div>
        <button
          onClick={addInterval}
          className="flex items-center gap-1 rounded-lg bg-blue-50 px-4 py-2 text-blue-600 transition-all hover:bg-blue-100"
        >
          <Plus size={16} weight="bold" />
          添加间隔
        </button>
      </div>

      <div className="space-y-3">
        {intervals.map((interval, index) => (
          <div key={index} className="flex items-center gap-4">
            <span className="w-20 text-sm font-medium text-gray-700">第 {index + 1} 次</span>
            <input
              type="number"
              value={interval}
              onChange={(e) => updateInterval(index, parseInt(e.target.value) || 0)}
              min="1"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
            <span className="w-12 text-sm text-gray-600">天后</span>
            {intervals.length > 1 && (
              <button
                onClick={() => removeInterval(index)}
                className="rounded-lg p-2 text-red-500 transition-all hover:bg-red-50"
              >
                <Trash size={18} weight="bold" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>默认值：</strong>
          {defaultIntervals.join(', ')} 天
        </p>
      </div>
    </div>
  );
}

/**
 * 难度调整参数区块
 */
interface DifficultyAdjustmentSectionProps {
  consecutiveCorrect: number;
  consecutiveWrong: number;
  adjustmentInterval: number;
  defaultConsecutiveCorrect: number;
  defaultConsecutiveWrong: number;
  defaultAdjustmentInterval: number;
  onChange: (updates: Partial<AlgorithmConfig>) => void;
}

function DifficultyAdjustmentSection({
  consecutiveCorrect,
  consecutiveWrong,
  adjustmentInterval,
  defaultConsecutiveCorrect,
  defaultConsecutiveWrong,
  defaultAdjustmentInterval,
  onChange,
}: DifficultyAdjustmentSectionProps) {
  const isDefault =
    consecutiveCorrect === defaultConsecutiveCorrect &&
    consecutiveWrong === defaultConsecutiveWrong &&
    adjustmentInterval === defaultAdjustmentInterval;

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">难度调整参数</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置自适应难度调整的触发条件
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-6">
        {/* 连续答对阈值 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">连续答对阈值（增加难度）</label>
            <span className="text-lg font-bold text-blue-600">{consecutiveCorrect} 次</span>
          </div>
          <input
            type="range"
            min="3"
            max="10"
            value={consecutiveCorrect}
            onChange={(e) => onChange({ consecutiveCorrectThreshold: parseInt(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>3 次</span>
            <span>10 次</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">默认值：{defaultConsecutiveCorrect} 次</p>
        </div>

        {/* 连续答错阈值 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">连续答错阈值（降低难度）</label>
            <span className="text-lg font-bold text-red-600">{consecutiveWrong} 次</span>
          </div>
          <input
            type="range"
            min="2"
            max="5"
            value={consecutiveWrong}
            onChange={(e) => onChange({ consecutiveWrongThreshold: parseInt(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-red-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>2 次</span>
            <span>5 次</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">默认值：{defaultConsecutiveWrong} 次</p>
        </div>

        {/* 调整间隔 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">最小调整间隔</label>
            <span className="text-lg font-bold text-gray-900">{adjustmentInterval} 个会话</span>
          </div>
          <input
            type="number"
            min="1"
            value={adjustmentInterval}
            onChange={(e) =>
              onChange({ difficultyAdjustmentInterval: parseInt(e.target.value) || 1 })
            }
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-2 text-xs text-gray-500">默认值：{defaultAdjustmentInterval} 个会话</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 优先级权重区块
 */
interface PriorityWeightsSectionProps {
  weights: AlgorithmConfig['priorityWeights'];
  defaultWeights: AlgorithmConfig['priorityWeights'];
  onChange: (weights: AlgorithmConfig['priorityWeights']) => void;
}

function PriorityWeightsSection({
  weights,
  defaultWeights,
  onChange,
}: PriorityWeightsSectionProps) {
  const total = weights.newWord + weights.errorRate + weights.overdueTime + weights.wordScore;
  const isValid = Math.abs(total - 100) < 0.01;
  const isDefault = JSON.stringify(weights) === JSON.stringify(defaultWeights);

  const updateWeight = (key: keyof typeof weights, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">优先级权重</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置学习队列优先级计算的各项权重（总和必须为 100%）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-6">
        {/* 新单词权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">新单词权重</label>
            <span className="text-lg font-bold text-blue-600">{weights.newWord}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.newWord}
            onChange={(e) => updateWeight('newWord', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-500"
          />
        </div>

        {/* 错误率权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">错误率权重</label>
            <span className="text-lg font-bold text-red-600">{weights.errorRate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.errorRate}
            onChange={(e) => updateWeight('errorRate', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-red-500"
          />
        </div>

        {/* 逾期时间权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">逾期时间权重</label>
            <span className="text-lg font-bold text-yellow-600">{weights.overdueTime}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.overdueTime}
            onChange={(e) => updateWeight('overdueTime', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-yellow-500"
          />
        </div>

        {/* 单词得分权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">单词得分权重</label>
            <span className="text-lg font-bold text-purple-600">{weights.wordScore}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.wordScore}
            onChange={(e) => updateWeight('wordScore', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-purple-500"
          />
        </div>
      </div>

      {/* 总和显示 */}
      <div className={`mt-4 rounded-lg p-3 ${isValid ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">权重总和</span>
          <span className={`text-lg font-bold ${isValid ? 'text-green-600' : 'text-red-600'}`}>
            {total.toFixed(1)}%
          </span>
        </div>
        {!isValid && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <Warning size={12} weight="bold" /> 权重总和必须等于 100%
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>默认值：</strong>
          新单词 {defaultWeights.newWord}%、 错误率 {defaultWeights.errorRate}%、 逾期时间{' '}
          {defaultWeights.overdueTime}%、 单词得分 {defaultWeights.wordScore}%
        </p>
      </div>
    </div>
  );
}

/**
 * 掌握程度阈值区块
 */
interface MasteryThresholdsSectionProps {
  thresholds: AlgorithmConfig['masteryThresholds'];
  defaultThresholds: AlgorithmConfig['masteryThresholds'];
  onChange: (thresholds: AlgorithmConfig['masteryThresholds']) => void;
}

function MasteryThresholdsSection({
  thresholds,
  defaultThresholds,
  onChange,
}: MasteryThresholdsSectionProps) {
  // 防御性检查：确保 thresholds 是数组
  const safeThresholds = Array.isArray(thresholds)
    ? thresholds
    : Array.isArray(defaultThresholds)
      ? defaultThresholds
      : [];
  const safeDefaultThresholds = Array.isArray(defaultThresholds) ? defaultThresholds : [];

  const isDefault = JSON.stringify(safeThresholds) === JSON.stringify(safeDefaultThresholds);

  const updateThreshold = (
    level: number,
    field: keyof (typeof safeThresholds)[0],
    value: number,
  ) => {
    const newThresholds = safeThresholds.map((t) =>
      t.level === level ? { ...t, [field]: value } : t,
    );
    onChange(newThresholds);
  };

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">掌握程度阈值</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置各级别的晋升条件（1-5级）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">级别</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                连续答对次数
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                最低正确率
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">最低得分</th>
            </tr>
          </thead>
          <tbody>
            {safeThresholds.map((threshold) => (
              <tr key={threshold.level} className="border-b border-gray-100">
                <td className="px-4 py-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">
                    {threshold.level}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="1"
                    value={threshold.requiredCorrectStreak}
                    onChange={(e) =>
                      updateThreshold(
                        threshold.level,
                        'requiredCorrectStreak',
                        parseInt(e.target.value) || 1,
                      )
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">次</span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={threshold.minAccuracy}
                    onChange={(e) =>
                      updateThreshold(
                        threshold.level,
                        'minAccuracy',
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">
                    ({(threshold.minAccuracy * 100).toFixed(0)}%)
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={threshold.minScore}
                    onChange={(e) =>
                      updateThreshold(threshold.level, 'minScore', parseInt(e.target.value) || 0)
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">分</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>说明：</strong>单词需要同时满足所有条件才能晋升到对应级别
        </p>
      </div>
    </div>
  );
}

/**
 * 单词得分权重区块
 */
interface ScoreWeightsSectionProps {
  weights: AlgorithmConfig['scoreWeights'];
  defaultWeights: AlgorithmConfig['scoreWeights'];
  onChange: (weights: AlgorithmConfig['scoreWeights']) => void;
}

function ScoreWeightsSection({ weights, defaultWeights, onChange }: ScoreWeightsSectionProps) {
  const total = weights.accuracy + weights.speed + weights.stability + weights.proficiency;
  const isValid = Math.abs(total - 100) < 0.01;
  const isDefault = JSON.stringify(weights) === JSON.stringify(defaultWeights);

  const updateWeight = (key: keyof typeof weights, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">单词得分权重</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置单词综合得分计算的各维度权重（总和必须为 100%）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-6">
        {/* 正确率权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">正确率权重</label>
            <span className="text-lg font-bold text-green-600">{weights.accuracy}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.accuracy}
            onChange={(e) => updateWeight('accuracy', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-green-500"
          />
        </div>

        {/* 答题速度权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">答题速度权重</label>
            <span className="text-lg font-bold text-blue-600">{weights.speed}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.speed}
            onChange={(e) => updateWeight('speed', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-500"
          />
        </div>

        {/* 稳定性权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">稳定性权重</label>
            <span className="text-lg font-bold text-purple-600">{weights.stability}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.stability}
            onChange={(e) => updateWeight('stability', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-purple-500"
          />
        </div>

        {/* 熟练度权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">熟练度权重</label>
            <span className="text-lg font-bold text-yellow-600">{weights.proficiency}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.proficiency}
            onChange={(e) => updateWeight('proficiency', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-yellow-500"
          />
        </div>
      </div>

      {/* 总和显示 */}
      <div className={`mt-4 rounded-lg p-3 ${isValid ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">权重总和</span>
          <span className={`text-lg font-bold ${isValid ? 'text-green-600' : 'text-red-600'}`}>
            {total.toFixed(1)}%
          </span>
        </div>
        {!isValid && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <Warning size={12} weight="bold" /> 权重总和必须等于 100%
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>默认值：</strong>
          正确率 {defaultWeights.accuracy}%、 速度 {defaultWeights.speed}%、 稳定性{' '}
          {defaultWeights.stability}%、 熟练度 {defaultWeights.proficiency}%
        </p>
      </div>
    </div>
  );
}

/**
 * 答题速度评分标准区块
 */
interface SpeedThresholdsSectionProps {
  thresholds: AlgorithmConfig['speedThresholds'];
  defaultThresholds: AlgorithmConfig['speedThresholds'];
  onChange: (thresholds: AlgorithmConfig['speedThresholds']) => void;
}

function SpeedThresholdsSection({
  thresholds,
  defaultThresholds,
  onChange,
}: SpeedThresholdsSectionProps) {
  const isDefault = JSON.stringify(thresholds) === JSON.stringify(defaultThresholds);

  const updateThreshold = (key: keyof typeof thresholds, value: number) => {
    onChange({ ...thresholds, [key]: value });
  };

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">答题速度评分标准</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置不同速度等级的时间阈值（单位：毫秒）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-4">
        {/* 优秀 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
              优秀
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600">&lt;</span>
          <input
            type="number"
            value={thresholds.excellent}
            onChange={(e) => updateThreshold('excellent', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <span className="w-16 text-sm text-gray-600">毫秒</span>
          <span className="w-24 text-sm text-gray-500">
            ({(thresholds.excellent / 1000).toFixed(1)} 秒)
          </span>
        </div>

        {/* 良好 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              良好
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600">&lt;</span>
          <input
            type="number"
            value={thresholds.good}
            onChange={(e) => updateThreshold('good', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <span className="w-16 text-sm text-gray-600">毫秒</span>
          <span className="w-24 text-sm text-gray-500">
            ({(thresholds.good / 1000).toFixed(1)} 秒)
          </span>
        </div>

        {/* 一般 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
              一般
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600">&lt;</span>
          <input
            type="number"
            value={thresholds.average}
            onChange={(e) => updateThreshold('average', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <span className="w-16 text-sm text-gray-600">毫秒</span>
          <span className="w-24 text-sm text-gray-500">
            ({(thresholds.average / 1000).toFixed(1)} 秒)
          </span>
        </div>

        {/* 较慢 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              较慢
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600">≥</span>
          <input
            type="number"
            value={thresholds.slow}
            onChange={(e) => updateThreshold('slow', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <span className="w-16 text-sm text-gray-600">毫秒</span>
          <span className="w-24 text-sm text-gray-500">
            ({(thresholds.slow / 1000).toFixed(1)} 秒)
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>默认值：</strong>
          优秀 &lt; {defaultThresholds.excellent}ms、 良好 &lt; {defaultThresholds.good}ms、 一般
          &lt; {defaultThresholds.average}ms、 较慢 ≥ {defaultThresholds.slow}ms
        </p>
      </div>
    </div>
  );
}
