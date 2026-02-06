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
  Lightning,
  Shield,
  Scales,
  Eye,
} from '../../components/Icon';
import { useToast, Modal } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import { useAlgorithmConfig } from '../../hooks/queries/useAlgorithmConfig';
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

// 预设模板类型
type PresetKey = 'conservative' | 'balanced' | 'aggressive';

interface PresetTemplate {
  key: PresetKey;
  name: string;
  description: string;
  icon: typeof Shield;
  color: string;
  values: Partial<AlgorithmConfig>;
}

// 预设模板配置
const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    key: 'conservative',
    name: '保守',
    description: '复习间隔长，新词比例低，适合稳扎稳打',
    icon: Shield,
    color: 'green',
    values: {
      reviewIntervals: [0, 1, 3, 7, 15, 30, 60, 120],
      consecutiveCorrectThreshold: 4,
      consecutiveWrongThreshold: 2,
      priorityWeights: { newWord: 0.15, errorRate: 0.35, overdueTime: 0.3, wordScore: 0.2 },
      newWordRatio: {
        default: 0.2,
        highAccuracy: 0.25,
        lowAccuracy: 0.1,
        highAccuracyThreshold: 85,
        lowAccuracyThreshold: 60,
      },
    },
  },
  {
    key: 'balanced',
    name: '平衡',
    description: '默认设置，学习与复习兼顾',
    icon: Scales,
    color: 'blue',
    values: {
      reviewIntervals: [0, 1, 2, 4, 7, 15, 30, 60],
      consecutiveCorrectThreshold: 3,
      consecutiveWrongThreshold: 2,
      priorityWeights: { newWord: 0.25, errorRate: 0.3, overdueTime: 0.25, wordScore: 0.2 },
      newWordRatio: {
        default: 0.3,
        highAccuracy: 0.4,
        lowAccuracy: 0.15,
        highAccuracyThreshold: 80,
        lowAccuracyThreshold: 50,
      },
    },
  },
  {
    key: 'aggressive',
    name: '激进',
    description: '复习间隔短，新词比例高，适合快速突破',
    icon: Lightning,
    color: 'orange',
    values: {
      reviewIntervals: [0, 1, 1, 2, 4, 7, 14, 30],
      consecutiveCorrectThreshold: 2,
      consecutiveWrongThreshold: 1,
      priorityWeights: { newWord: 0.4, errorRate: 0.25, overdueTime: 0.2, wordScore: 0.15 },
      newWordRatio: {
        default: 0.45,
        highAccuracy: 0.55,
        lowAccuracy: 0.25,
        highAccuracyThreshold: 75,
        lowAccuracyThreshold: 45,
      },
    },
  },
];

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
  const [showPreview, setShowPreview] = useState(false);
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

  // 应用预设模板
  const applyPreset = (preset: PresetTemplate) => {
    if (!config) return;
    const newConfig = { ...config, ...preset.values };
    validateAndUpdate(newConfig);
    toast.success(`已应用「${preset.name}」预设模板`);
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

  // 计算配置变更
  const configChanges = useMemo(() => {
    if (!config || !serverConfig) return [];

    const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];

    const compareValues = (path: string, oldVal: unknown, newVal: unknown) => {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          field: path,
          oldValue: typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal),
          newValue: typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal),
        });
      }
    };

    // 比较各个配置项
    compareValues('复习间隔', serverConfig.reviewIntervals, config.reviewIntervals);
    compareValues(
      '连续正确阈值',
      serverConfig.consecutiveCorrectThreshold,
      config.consecutiveCorrectThreshold,
    );
    compareValues(
      '连续错误阈值',
      serverConfig.consecutiveWrongThreshold,
      config.consecutiveWrongThreshold,
    );
    compareValues(
      '难度调整间隔',
      serverConfig.difficultyAdjustmentInterval,
      config.difficultyAdjustmentInterval,
    );
    compareValues('优先级权重', serverConfig.priorityWeights, config.priorityWeights);
    compareValues('掌握度阈值', serverConfig.masteryThresholds, config.masteryThresholds);
    compareValues('得分权重', serverConfig.scoreWeights, config.scoreWeights);
    compareValues('速度阈值', serverConfig.speedThresholds, config.speedThresholds);
    if (config.newWordRatio && serverConfig.newWordRatio) {
      compareValues('新词比例', serverConfig.newWordRatio, config.newWordRatio);
    }

    return changes;
  }, [config, serverConfig]);

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
          <p className="text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
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
          <Gear size={32} className="text-blue-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">算法配置</h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          配置学习算法的各项参数，影响单词学习和复习的调度策略
        </p>
      </div>

      {/* 预设模板选择 */}
      <div className="mb-6 rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">快速预设</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PRESET_TEMPLATES.map((preset) => {
            const IconComponent = preset.icon;
            const colorClasses: Record<string, string> = {
              green:
                'border-green-200 hover:border-green-400 dark:border-green-800 dark:hover:border-green-600',
              blue: 'border-blue-200 hover:border-blue-400 dark:border-blue-800 dark:hover:border-blue-600',
              orange:
                'border-orange-200 hover:border-orange-400 dark:border-orange-800 dark:hover:border-orange-600',
            };
            const iconColorClasses: Record<string, string> = {
              green: 'text-green-500',
              blue: 'text-blue-500',
              orange: 'text-orange-500',
            };
            return (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset)}
                className={`rounded-card border-2 bg-white p-4 text-left transition-all duration-g3-fast hover:scale-[1.02] hover:shadow-elevated active:scale-[0.98] dark:bg-slate-800 ${colorClasses[preset.color]}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <IconComponent size={24} className={iconColorClasses[preset.color]} />
                  <span className="font-semibold text-gray-900 dark:text-white">{preset.name}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 验证错误提示 */}
      {validationErrors.length > 0 && (
        <div className="mb-6 rounded-button border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
          <div className="flex items-start gap-2">
            <Warning size={20} weight="bold" className="mt-0.5 flex-shrink-0 text-red-500" />
            <div className="flex-1">
              <h3 className="mb-2 font-semibold text-red-900 dark:text-red-300">配置验证失败</h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-red-700 dark:text-red-400">
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
        <div className="mb-6 rounded-button border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/30">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} weight="bold" className="text-green-500" />
            <span className="font-medium text-green-900 dark:text-green-300">配置已成功保存</span>
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
      <div className="sticky bottom-4 mt-8 flex items-center justify-between rounded-card border border-gray-200 bg-white p-6 shadow-elevated dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-button bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
        >
          <ArrowCounterClockwise size={18} />
          恢复默认值
        </button>

        <div className="flex items-center gap-3">
          {configChanges.length > 0 && (
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 rounded-button border border-blue-300 px-6 py-3 font-medium text-blue-600 transition-all duration-g3-fast hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              <Eye size={18} />
              预览变更 ({configChanges.length})
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || validationErrors.length > 0}
            className="flex items-center gap-2 rounded-button bg-blue-500 px-8 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FloppyDisk size={18} />
            {isSaving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {/* 重置确认对话框 */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-6">
          <div className="w-full max-w-md animate-g3-slide-up rounded-card bg-white p-8 shadow-floating dark:bg-slate-800">
            <div className="mb-6 text-center">
              <Warning size={64} className="mx-auto mb-4 text-yellow-500" />
              <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">确认重置</h3>
              <p className="text-gray-600 dark:text-gray-400">
                确定要将所有配置恢复为默认值吗？此操作不可撤销。
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:bg-gray-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                取消
              </button>
              <button
                onClick={handleReset}
                className="flex-1 rounded-card bg-yellow-500 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:bg-yellow-600"
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 变更预览对话框 */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="配置变更预览">
        <div className="p-6">
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">以下配置将在保存后生效：</p>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {configChanges.map((change, index) => (
              <div
                key={index}
                className="rounded-button border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-2 font-medium text-gray-900 dark:text-white">{change.field}</div>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div>
                    <span className="text-gray-500">原值：</span>
                    <code className="ml-1 rounded bg-red-100 px-1 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {change.oldValue.length > 50
                        ? change.oldValue.slice(0, 50) + '...'
                        : change.oldValue}
                    </code>
                  </div>
                  <div>
                    <span className="text-gray-500">新值：</span>
                    <code className="ml-1 rounded bg-green-100 px-1 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {change.newValue.length > 50
                        ? change.newValue.slice(0, 50) + '...'
                        : change.newValue}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setShowPreview(false)}
              className="flex-1 rounded-button bg-gray-100 px-4 py-2 font-medium text-gray-900 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            >
              关闭
            </button>
            <button
              onClick={() => {
                setShowPreview(false);
                handleSave();
              }}
              disabled={isSaving || validationErrors.length > 0}
              className="flex-1 rounded-button bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              确认保存
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
