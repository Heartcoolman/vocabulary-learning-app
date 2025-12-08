import { useState, useEffect, useMemo } from 'react';
import { AlgorithmConfig } from '../../types/models';
import { AlgorithmConfigService } from '../../services/algorithms/AlgorithmConfigService';
import {
  Gear,
  ArrowCounterClockwise,
  FloppyDisk,
  Warning,
  CheckCircle,
  CircleNotch,
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import { useAlgorithmConfig } from '../../hooks/queries';
import { useUpdateAlgorithmConfig, useResetAlgorithmConfig } from '../../hooks/mutations';

// 导入拆分后的 Section 组件
import {
  ReviewIntervalsSection,
  DifficultyAdjustmentSection,
  PriorityWeightsSection,
  MasteryThresholdsSection,
  ScoreWeightsSection,
  SpeedThresholdsSection,
} from './sections';

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

  // 当从服务器加载配置后，初始化本地状态并进行初始验证
  useEffect(() => {
    if (serverConfig) {
      setConfig(serverConfig);
      // 获取默认配置用于对比
      const defaultCfg = configService.getDefaultConfig();
      setDefaultConfig(defaultCfg);
      // 初始验证，显示配置数据的问题
      const validation = configService.validateConfig(serverConfig);
      setValidationErrors(validation.errors);
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

      {/* 配置表单 - 使用拆分后的 Section 组件 */}
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
