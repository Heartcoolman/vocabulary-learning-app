import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../services/client';
import {
  CircleNotch,
  Warning,
  CheckCircle,
  ChartBar,
  Brain,
  Lightbulb,
  ArrowClockwise,
  FileText,
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';

interface CausalEstimate {
  ate: number;
  standardError: number;
  confidenceInterval: [number, number];
  sampleSize: number;
  effectiveSampleSize: number;
  pValue: number;
  significant: boolean;
}

interface CausalDiagnostics {
  observationCount: number;
  treatmentDistribution: Record<number, number>;
  latestEstimate: CausalEstimate | null;
}

interface StrategyComparison {
  diff: number;
  standardError: number;
  confidenceInterval: [number, number];
  pValue: number;
  significant: boolean;
  sampleSize: number;
}

export default function CausalInferencePage() {
  const toast = useToast();

  // 表单状态
  const [features, setFeatures] = useState<string>('');
  const [treatment, setTreatment] = useState<'0' | '1'>('0');
  const [outcome, setOutcome] = useState<string>('');

  // 数据加载状态
  const [isLoadingATE, setIsLoadingATE] = useState(false);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // 数据
  const [ate, setAte] = useState<CausalEstimate | null>(null);
  const [diagnostics, setDiagnostics] = useState<CausalDiagnostics | null>(null);
  const [comparison, setComparison] = useState<StrategyComparison | null>(null);

  // 错误状态
  const [ateError, setAteError] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // AbortController 引用
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadATE = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoadingATE(true);
        setAteError(null);
        const response = await apiClient.getCausalATE();
        if (signal?.aborted) return;
        setAte(response);
      } catch (err) {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        const message = err instanceof Error ? err.message : '加载失败';
        adminLogger.error({ err }, '加载因果ATE失败');
        setAteError(message);
        toast.error('加载因果效应估计失败');
      } finally {
        if (!signal?.aborted) {
          setIsLoadingATE(false);
        }
      }
    },
    [], // 移除 toast 依赖，防止无限循环
  );

  const loadDiagnostics = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoadingDiagnostics(true);
      setDiagnosticsError(null);
      const response = await apiClient.getCausalDiagnostics();
      if (signal?.aborted) return;
      setDiagnostics(response);
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      const message = err instanceof Error ? err.message : '加载失败';
      adminLogger.error({ err }, '加载诊断信息失败');
      setDiagnosticsError(message);
    } finally {
      if (!signal?.aborted) {
        setIsLoadingDiagnostics(false);
      }
    }
  }, []);

  const loadAllData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    await Promise.all([loadATE(controller.signal), loadDiagnostics(controller.signal)]);
  }, [loadATE, loadDiagnostics]);

  useEffect(() => {
    loadAllData();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadAllData]);

  const handleRecordObservation = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // 验证输入
      if (!features.trim()) {
        toast.error('请输入特征向量');
        return;
      }

      if (outcome === '' || isNaN(parseFloat(outcome))) {
        toast.error('请输入有效的奖励值');
        return;
      }

      const outcomeNum = parseFloat(outcome);
      if (outcomeNum < -1 || outcomeNum > 1) {
        toast.error('奖励值必须在 [-1, 1] 范围内');
        return;
      }

      // 解析特征向量
      let featureArray: number[];
      try {
        featureArray = features
          .trim()
          .split(',')
          .map((s) => {
            const num = parseFloat(s.trim());
            if (isNaN(num)) throw new Error('非法数字');
            return num;
          });
      } catch {
        toast.error('特征向量格式不正确，请用逗号分隔数字');
        return;
      }

      if (featureArray.length === 0) {
        toast.error('特征向量不能为空');
        return;
      }

      setIsRecording(true);

      await apiClient.recordCausalObservation({
        features: featureArray,
        treatment: treatment === '1' ? 1 : 0,
        outcome: outcomeNum,
      });

      toast.success('观测记录已保存');
      // 清空表单
      setFeatures('');
      setTreatment('0');
      setOutcome('');
      // 重新加载数据
      await loadAllData();
    } catch (err) {
      adminLogger.error({ err }, '记录观测失败');
      toast.error(err instanceof Error ? err.message : '记录失败');
    } finally {
      setIsRecording(false);
    }
  };

  const handleCompareStrategies = async () => {
    try {
      setIsLoadingComparison(true);
      setComparisonError(null);

      const response = await apiClient.compareStrategies(1, 0);
      if (response) {
        // 后端已返回标准格式，直接使用
        setComparison(response);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '比较失败';
      adminLogger.error({ err }, '策略比较失败');
      setComparisonError(message);
      toast.error('策略比较失败');
    } finally {
      setIsLoadingComparison(false);
    }
  };

  const handleExportData = () => {
    try {
      const data = {
        ate,
        diagnostics,
        comparison,
        exportTime: new Date().toISOString(),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `causal-analysis-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('数据已导出');
    } catch (err) {
      adminLogger.error({ err }, '导出数据失败');
      toast.error('导出失败');
    }
  };

  return (
    <div className="animate-g3-fade-in p-8">
      <div className="mb-8">
        <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Brain size={36} weight="duotone" className="text-purple-500" />
          因果分析
        </h1>
        <p className="text-gray-600">记录和分析学习策略的因果效应</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* 左侧：观测记录表单 */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
              <Lightbulb size={24} weight="duotone" className="text-yellow-500" />
              记录观测
            </h2>

            <form onSubmit={handleRecordObservation} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  特征向量 (逗号分隔)
                </label>
                <textarea
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  placeholder="例如: 0.5, 0.8, 0.3"
                  className="w-full resize-none rounded-button border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  disabled={isRecording}
                />
                <p className="mt-1 text-xs text-gray-500">用户特征向量，用逗号分隔各维度</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">策略选择</label>
                <select
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value as '0' | '1')}
                  className="w-full rounded-button border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isRecording}
                >
                  <option value="0">策略 A (对照组)</option>
                  <option value="1">策略 B (处理组)</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  奖励值 [-1 到 1]
                </label>
                <input
                  type="number"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="例如: 0.5"
                  min="-1"
                  max="1"
                  step="0.01"
                  className="w-full rounded-button border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isRecording}
                />
                <p className="mt-1 text-xs text-gray-500">观测到的学习效果或奖励</p>
              </div>

              <button
                type="submit"
                disabled={isRecording}
                className="flex w-full items-center justify-center gap-2 rounded-button bg-blue-500 px-4 py-2 font-medium text-white transition-all duration-g3-fast hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRecording ? (
                  <>
                    <CircleNotch className="animate-spin" size={18} weight="bold" />
                    记录中...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} weight="bold" />
                    记录观测
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* 右侧：分析展示 */}
        <div className="space-y-6 lg:col-span-2">
          {/* ATE分析 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
                <ChartBar size={24} weight="duotone" className="text-blue-500" />
                平均处理效应 (ATE)
              </h2>
              <button
                onClick={() => loadATE()}
                disabled={isLoadingATE}
                className="rounded-button p-2 transition-all hover:bg-gray-100 disabled:opacity-50"
                title="刷新"
              >
                <ArrowClockwise size={20} weight="bold" />
              </button>
            </div>

            {isLoadingATE ? (
              <div className="flex items-center justify-center py-8">
                <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
              </div>
            ) : ateError ? (
              <div className="py-8 text-center text-gray-500">
                <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
                <p>{ateError}</p>
              </div>
            ) : ate ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-button bg-blue-50 p-4">
                    <p className="mb-1 text-sm text-gray-600">平均处理效应</p>
                    <p className="text-3xl font-bold text-gray-900">{ate.ate.toFixed(4)}</p>
                  </div>
                  <div className="rounded-button bg-green-50 p-4">
                    <p className="mb-1 text-sm text-gray-600">标准误</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {ate.standardError.toFixed(4)}
                    </p>
                  </div>
                </div>

                <div className="rounded-button bg-purple-50 p-4">
                  <p className="mb-2 text-sm text-gray-600">95% 置信区间</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        {(() => {
                          const left = Math.max(
                            0,
                            Math.min(100, (ate.confidenceInterval[0] + 1) * 50),
                          );
                          const right = Math.max(
                            0,
                            Math.min(100, (ate.confidenceInterval[1] + 1) * 50),
                          );
                          const width = Math.max(0, right - left);
                          return (
                            <div
                              className="absolute h-full bg-purple-500"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                              }}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    [{ate.confidenceInterval[0].toFixed(4)}, {ate.confidenceInterval[1].toFixed(4)}]
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-button bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-600">样本量</p>
                    <p className="text-xl font-bold text-gray-900">{ate.sampleSize}</p>
                  </div>
                  <div className="rounded-button bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-600">有效样本</p>
                    <p className="text-xl font-bold text-gray-900">{ate.effectiveSampleSize}</p>
                  </div>
                  <div className="rounded-button bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-600">P 值</p>
                    <p className="text-xl font-bold text-gray-900">{ate.pValue.toFixed(4)}</p>
                  </div>
                </div>

                <div
                  className={`rounded-button p-4 ${
                    ate.significant
                      ? 'border border-green-200 bg-green-50'
                      : 'border border-yellow-200 bg-yellow-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {ate.significant ? (
                      <CheckCircle size={20} weight="bold" className="text-green-600" />
                    ) : (
                      <Warning size={20} weight="bold" className="text-yellow-600" />
                    )}
                    <span
                      className={`font-medium ${
                        ate.significant ? 'text-green-700' : 'text-yellow-700'
                      }`}
                    >
                      {ate.significant ? '效应显著 (α=0.05)' : '效应不显著'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-button border border-yellow-200 bg-yellow-50 p-6 text-center">
                <Warning size={32} weight="duotone" className="mx-auto mb-2 text-yellow-500" />
                <p className="font-medium text-yellow-700">样本数据不足</p>
                <p className="mt-1 text-sm text-yellow-600">
                  至少需要10个观测数据，且处理组和对照组各需至少5个样本才能计算因果效应。
                </p>
              </div>
            )}
          </div>

          {/* 倾向得分诊断 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
                <Lightbulb size={24} weight="duotone" className="text-yellow-500" />
                倾向得分诊断
              </h2>
              <button
                onClick={() => loadDiagnostics()}
                disabled={isLoadingDiagnostics}
                className="rounded-button p-2 transition-all hover:bg-gray-100 disabled:opacity-50"
                title="刷新"
              >
                <ArrowClockwise size={20} weight="bold" />
              </button>
            </div>

            {isLoadingDiagnostics ? (
              <div className="flex items-center justify-center py-8">
                <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
              </div>
            ) : diagnosticsError ? (
              <div className="py-8 text-center text-gray-500">
                <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
                <p>{diagnosticsError}</p>
              </div>
            ) : diagnostics ? (
              <div className="space-y-4">
                {/* 观测统计 */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-button bg-blue-50 p-4">
                    <p className="mb-1 text-sm text-gray-600">总观测数量</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {diagnostics.observationCount}
                    </p>
                  </div>
                  <div className="rounded-button bg-green-50 p-4">
                    <p className="mb-1 text-sm text-gray-600">处理组分布</p>
                    <div className="flex gap-4">
                      <div>
                        <span className="text-xs text-gray-500">对照组(0):</span>
                        <span className="ml-1 font-bold">
                          {diagnostics.treatmentDistribution[0] ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">处理组(1):</span>
                        <span className="ml-1 font-bold">
                          {diagnostics.treatmentDistribution[1] ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 最新估计（如果有） */}
                {diagnostics.latestEstimate ? (
                  <div className="rounded-button border border-purple-200 bg-purple-50 p-4">
                    <p className="mb-2 text-sm font-medium text-purple-700">最新因果效应估计</p>
                    <div className="grid gap-2 text-sm md:grid-cols-3">
                      <div>
                        <span className="text-gray-600">ATE:</span>
                        <span className="ml-1 font-bold">
                          {diagnostics.latestEstimate.ate.toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">样本量:</span>
                        <span className="ml-1 font-bold">
                          {diagnostics.latestEstimate.sampleSize}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">显著性:</span>
                        <span
                          className={`ml-1 font-bold ${diagnostics.latestEstimate.significant ? 'text-green-600' : 'text-yellow-600'}`}
                        >
                          {diagnostics.latestEstimate.significant ? '显著' : '不显著'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-button border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
                    <Warning size={16} weight="bold" className="mb-1 inline" />
                    <span className="ml-1">
                      样本不足，无法计算因果效应。至少需要10个观测数据，且处理组和对照组各需至少5个样本。
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">暂无数据</div>
            )}
          </div>

          {/* 策略对比 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
                <ChartBar size={24} weight="duotone" className="text-indigo-500" />
                策略对比 (策略B vs 策略A)
              </h2>
            </div>

            {comparison ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-button bg-indigo-50 p-4">
                    <p className="mb-1 text-sm text-gray-600">效应差异</p>
                    <p className="text-3xl font-bold text-gray-900">{comparison.diff.toFixed(4)}</p>
                  </div>
                  <div className="rounded-button bg-indigo-50 p-4">
                    <p className="mb-1 text-sm text-gray-600">标准误</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {comparison.standardError.toFixed(4)}
                    </p>
                  </div>
                </div>

                <div className="rounded-button bg-pink-50 p-4">
                  <p className="mb-2 text-sm text-gray-600">95% 置信区间</p>
                  <p className="text-sm text-gray-700">
                    [{comparison.confidenceInterval[0].toFixed(4)},{' '}
                    {comparison.confidenceInterval[1].toFixed(4)}]
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-button bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-600">P 值</p>
                    <p className="text-xl font-bold text-gray-900">
                      {comparison.pValue.toFixed(4)}
                    </p>
                  </div>
                  <div className="rounded-button bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-600">样本量</p>
                    <p className="text-xl font-bold text-gray-900">{comparison.sampleSize}</p>
                  </div>
                </div>

                <div
                  className={`rounded-button p-4 ${
                    comparison.significant
                      ? 'border border-green-200 bg-green-50'
                      : 'border border-yellow-200 bg-yellow-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {comparison.significant ? (
                      <CheckCircle size={20} weight="bold" className="text-green-600" />
                    ) : (
                      <Warning size={20} weight="bold" className="text-yellow-600" />
                    )}
                    <span
                      className={`font-medium ${
                        comparison.significant ? 'text-green-700' : 'text-yellow-700'
                      }`}
                    >
                      {comparison.significant ? '差异显著 (α=0.05)' : '差异不显著'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={handleCompareStrategies}
                disabled={isLoadingComparison}
                className="flex w-full items-center justify-center gap-2 rounded-button bg-indigo-500 px-4 py-3 font-medium text-white transition-all duration-g3-fast hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingComparison ? (
                  <>
                    <CircleNotch className="animate-spin" size={18} weight="bold" />
                    分析中...
                  </>
                ) : (
                  <>
                    <ChartBar size={18} weight="bold" />
                    执行对比分析
                  </>
                )}
              </button>
            )}

            {comparisonError && (
              <div className="mt-4 rounded-button border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {comparisonError}
              </div>
            )}
          </div>

          {/* 导出按钮 */}
          <button
            onClick={handleExportData}
            className="flex w-full items-center justify-center gap-2 rounded-button bg-green-500 px-4 py-3 font-medium text-white transition-all duration-g3-fast hover:bg-green-600"
          >
            <FileText size={20} weight="bold" />
            导出分析数据
          </button>
        </div>
      </div>

      {/* 说明信息 */}
      <div className="mt-8 rounded-card border border-blue-200 bg-blue-50 p-6">
        <h3 className="mb-3 text-lg font-semibold text-blue-900">因果分析说明</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>
            <strong>特征向量：</strong>用户特征的数值表示，如学习进度、学习时间等
          </li>
          <li>
            <strong>策略选择：</strong>A 为对照组（旧策略），B 为处理组（新策略）
          </li>
          <li>
            <strong>奖励值：</strong>观测到的学习效果，范围为 [-1, 1]，正值表示正效果
          </li>
          <li>
            <strong>ATE：</strong>平均处理效应，表示策略B相比策略A的平均效果差异
          </li>
          <li>
            <strong>倾向得分：</strong>根据特征估计用户被分配到各策略的概率
          </li>
          <li>
            <strong>显著性：</strong>p值 &lt; 0.05 表示结果在统计上显著
          </li>
        </ul>
      </div>
    </div>
  );
}
