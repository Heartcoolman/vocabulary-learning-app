import { useState, useEffect, useCallback } from 'react';
import {
  Robot,
  Lightning,
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  Eye,
  CaretDown,
  CaretUp,
  Lightbulb,
  Gear,
  ChartLine,
  Brain,
  Shield,
  CircleNotch,
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import {
  getLLMConfig,
  checkLLMHealth,
  getSuggestions,
  approveSuggestion,
  rejectSuggestion,
  triggerAnalysis,
  StoredSuggestion,
  LLMConfig,
  WorkerStatus,
} from '../../services/llmAdvisorApi';

/**
 * LLM 顾问管理页面
 */
export default function LLMAdvisorPage() {
  const toast = useToast();
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [health, setHealth] = useState<{ status: string; message: string } | null>(null);
  const [suggestions, setSuggestions] = useState<StoredSuggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<StoredSuggestion | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 加载配置和建议（快速加载）
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [configData, suggestionsData] = await Promise.all([
        getLLMConfig(),
        getSuggestions({
          status:
            statusFilter === 'all'
              ? undefined
              : (statusFilter as 'pending' | 'approved' | 'rejected' | 'partial'),
          limit: 20,
        }),
      ]);

      setConfig(configData.config);
      setWorkerStatus(configData.worker);
      setSuggestions(suggestionsData.items);
      setTotal(suggestionsData.total);
    } catch (error) {
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // 单独加载健康检查（避免阻塞页面）
  const loadHealth = useCallback(async () => {
    try {
      const healthData = await checkLLMHealth();
      setHealth(healthData);
    } catch {
      setHealth({ status: 'unknown', message: '无法检查' });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 延迟加载健康检查，不阻塞主页面
  useEffect(() => {
    if (config?.enabled) {
      loadHealth();
    } else if (config) {
      setHealth({ status: 'disabled', message: 'LLM 顾问未启用' });
    }
  }, [config, loadHealth]);

  // 手动触发分析
  const handleTrigger = async () => {
    try {
      setTriggering(true);
      const result = await triggerAnalysis();
      toast.success(`分析完成，建议ID: ${result.suggestionId}`);
      loadData();
    } catch (error) {
      toast.error('触发分析失败');
    } finally {
      setTriggering(false);
    }
  };

  // 审批建议
  const handleApprove = async () => {
    if (!selectedSuggestion || approving) return;
    if (selectedItems.size === 0) {
      toast.error('请至少选择一项建议');
      return;
    }
    setApproving(true);
    try {
      await approveSuggestion(selectedSuggestion.id, Array.from(selectedItems));
      toast.success('建议已审批');
      setSelectedSuggestion(null);
      setSelectedItems(new Set());
      loadData();
    } catch (error) {
      toast.error('审批失败');
    } finally {
      setApproving(false);
    }
  };

  // 拒绝建议
  const handleReject = async () => {
    if (!selectedSuggestion || rejecting) return;
    setRejecting(true);
    try {
      await rejectSuggestion(selectedSuggestion.id);
      toast.success('建议已拒绝');
      setSelectedSuggestion(null);
      loadData();
    } catch (error) {
      toast.error('拒绝失败');
    } finally {
      setRejecting(false);
    }
  };

  // 切换选中项
  const toggleItem = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (!selectedSuggestion) return;
    const allIds = selectedSuggestion.parsedSuggestion.suggestions.map((s) => s.id);
    if (selectedItems.size === allIds.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allIds));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircleNotch className="animate-spin" size={48} weight="bold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Robot size={32} className="text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">LLM 顾问</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">AI 驱动的参数优化建议</p>
          </div>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering || !config?.enabled}
          className="flex items-center gap-2 rounded-button bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triggering ? (
            <CircleNotch className="animate-spin" size={18} />
          ) : (
            <Lightning size={18} />
          )}
          {triggering ? '分析中...' : '立即分析'}
        </button>
      </div>

      {/* 状态卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 配置状态 */}
        <div className="rounded-card border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <Gear size={20} className="text-gray-500 dark:text-gray-400" />
            <span className="font-medium dark:text-white">配置状态</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">状态</span>
              <span className={config?.enabled ? 'text-green-600' : 'text-gray-400'}>
                {config?.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">提供者</span>
              <span className="dark:text-gray-300">{config?.provider || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">模型</span>
              <span className="dark:text-gray-300">{config?.model || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">API Key</span>
              <span className="dark:text-gray-300">{config?.apiKeySet ? '已设置' : '未设置'}</span>
            </div>
          </div>
        </div>

        {/* Worker 状态 */}
        <div className="rounded-card border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <ArrowsClockwise size={20} className="text-gray-500 dark:text-gray-400" />
            <span className="font-medium dark:text-white">Worker 状态</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">自动分析</span>
              <span
                className={workerStatus?.autoAnalysisEnabled ? 'text-green-600' : 'text-gray-400'}
              >
                {workerStatus?.autoAnalysisEnabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">调度</span>
              <span className="dark:text-gray-300">{workerStatus?.schedule || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">运行中</span>
              <span className="dark:text-gray-300">{workerStatus?.isRunning ? '是' : '否'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">待审核</span>
              <span className="font-medium text-orange-600">{workerStatus?.pendingCount || 0}</span>
            </div>
          </div>
        </div>

        {/* 健康状态 */}
        <div className="rounded-card border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <Brain size={20} className="text-gray-500 dark:text-gray-400" />
            <span className="font-medium dark:text-white">LLM 服务</span>
          </div>
          <div className="flex items-center gap-2">
            {!health ? (
              <CircleNotch size={24} className="animate-spin text-gray-400" />
            ) : health.status === 'healthy' ? (
              <CheckCircle size={24} className="text-green-500" />
            ) : health.status === 'disabled' ? (
              <XCircle size={24} className="text-gray-400" />
            ) : (
              <Warning size={24} className="text-yellow-500" />
            )}
            <span
              className={
                !health
                  ? 'text-gray-400'
                  : health.status === 'healthy'
                    ? 'text-green-600'
                    : health.status === 'disabled'
                      ? 'text-gray-500'
                      : 'text-yellow-600'
              }
            >
              {!health ? '检查中...' : health.message || '未知'}
            </span>
          </div>
        </div>
      </div>

      {/* 建议列表 */}
      <div className="rounded-card border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-slate-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            建议列表{' '}
            {total > 0 && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({total})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-button border border-gray-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-gray-300"
            >
              <option value="all">全部</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
              <option value="partial">部分采纳</option>
            </select>
            <button
              onClick={loadData}
              className="rounded-button p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <ArrowsClockwise size={18} />
            </button>
          </div>
        </div>

        {suggestions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <Robot size={48} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            <p>暂无建议记录</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestion.id}
                suggestion={suggestion}
                onView={() => {
                  setSelectedSuggestion(suggestion);
                  setSelectedItems(new Set());
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 建议详情弹窗 */}
      {selectedSuggestion && (
        <SuggestionDetail
          suggestion={selectedSuggestion}
          selectedItems={selectedItems}
          onToggleItem={toggleItem}
          onToggleSelectAll={toggleSelectAll}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => {
            setSelectedSuggestion(null);
            setSelectedItems(new Set());
          }}
          approving={approving}
          rejecting={rejecting}
        />
      )}
    </div>
  );
}

// 建议行组件
function SuggestionRow({
  suggestion,
  onView,
}: {
  suggestion: StoredSuggestion;
  onView: () => void;
}) {
  const statusColors = {
    pending: 'bg-orange-100 text-orange-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    partial: 'bg-blue-100 text-blue-700',
  };

  const statusLabels = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    partial: '部分采纳',
  };

  return (
    <div className="p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-3">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[suggestion.status]}`}
            >
              {statusLabels[suggestion.status]}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(suggestion.weekStart).toLocaleDateString()} -{' '}
              {new Date(suggestion.weekEnd).toLocaleDateString()}
            </span>
          </div>
          <p className="font-medium text-gray-900 dark:text-white">
            {suggestion.parsedSuggestion.analysis.summary}
          </p>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>建议项: {suggestion.parsedSuggestion.suggestions.length}</span>
            <span>置信度: {(suggestion.parsedSuggestion.confidence * 100).toFixed(0)}%</span>
            <span>数据质量: {suggestion.parsedSuggestion.dataQuality}</span>
          </div>
        </div>
        <button
          onClick={onView}
          className="rounded-button p-2 hover:bg-gray-100 dark:hover:bg-slate-600"
        >
          <Eye size={20} />
        </button>
      </div>
    </div>
  );
}

// 建议详情弹窗
function SuggestionDetail({
  suggestion,
  selectedItems,
  onToggleItem,
  onToggleSelectAll,
  onApprove,
  onReject,
  onClose,
  approving,
  rejecting,
}: {
  suggestion: StoredSuggestion;
  selectedItems: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleSelectAll: () => void;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const isPending = suggestion.status === 'pending';

  const riskColors = {
    low: 'text-green-600 bg-green-50',
    medium: 'text-yellow-600 bg-yellow-50',
    high: 'text-red-600 bg-red-50',
  };

  const typeIcons = {
    param_bound: <ChartLine size={16} />,
    threshold: <Gear size={16} />,
    reward_weight: <Lightbulb size={16} />,
    safety_threshold: <Shield size={16} />,
  };

  const typeLabels = {
    param_bound: '参数边界',
    threshold: '阈值',
    reward_weight: '奖励权重',
    safety_threshold: '安全阈值',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-card bg-white dark:bg-slate-800">
        {/* 头部 */}
        <div className="border-b border-gray-200 p-6 dark:border-slate-700">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">建议详情</h2>
            <button
              onClick={onClose}
              className="rounded-button p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <XCircle size={24} />
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {suggestion.parsedSuggestion.analysis.summary}
          </p>
        </div>

        {/* 内容 */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* 分析结果 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-button bg-green-50 p-4">
              <h3 className="mb-2 font-medium text-green-800">关键发现</h3>
              <ul className="space-y-1 text-sm text-green-700">
                {suggestion.parsedSuggestion.analysis.keyFindings.map((finding, i) => (
                  <li key={i}>• {finding}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-button bg-orange-50 p-4">
              <h3 className="mb-2 font-medium text-orange-800">需关注问题</h3>
              <ul className="space-y-1 text-sm text-orange-700">
                {suggestion.parsedSuggestion.analysis.concerns.map((concern, i) => (
                  <li key={i}>• {concern}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 建议项列表 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-gray-900 dark:text-white">
                建议项 ({suggestion.parsedSuggestion.suggestions.length})
              </h3>
              {isPending && (
                <button
                  onClick={onToggleSelectAll}
                  className="text-sm text-purple-600 hover:underline"
                >
                  {selectedItems.size === suggestion.parsedSuggestion.suggestions.length
                    ? '取消全选'
                    : '全选'}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {suggestion.parsedSuggestion.suggestions.map((item) => (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-button border ${
                    isPending && selectedItems.has(item.id)
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div
                    className="flex cursor-pointer items-center gap-4 p-4"
                    onClick={() => isPending && onToggleItem(item.id)}
                  >
                    {isPending && (
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => onToggleItem(item.id)}
                        className="h-4 w-4 text-purple-600"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="flex items-center gap-2">
                      {typeIcons[item.type]}
                      <span className="text-sm text-gray-500">{typeLabels[item.type]}</span>
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{item.target}</span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="font-medium text-purple-600">
                        {item.currentValue} → {item.suggestedValue}
                      </span>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${riskColors[item.risk]}`}
                    >
                      风险: {item.risk}
                    </span>
                    <span className="text-sm text-gray-500">优先级: {item.priority}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(expanded === item.id ? null : item.id);
                      }}
                      className="rounded p-1 hover:bg-gray-100"
                    >
                      {expanded === item.id ? <CaretUp size={16} /> : <CaretDown size={16} />}
                    </button>
                  </div>
                  {expanded === item.id && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-2 dark:border-slate-700 dark:bg-slate-700/50">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="mb-1 text-gray-500 dark:text-gray-400">调整原因</p>
                          <p className="text-gray-900 dark:text-gray-200">{item.reason}</p>
                        </div>
                        <div>
                          <p className="mb-1 text-gray-500 dark:text-gray-400">预期影响</p>
                          <p className="text-gray-900 dark:text-gray-200">{item.expectedImpact}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 被跳过的建议项 */}
          {suggestion.skippedItems && suggestion.skippedItems.length > 0 && (
            <div className="rounded-button bg-yellow-50 p-4">
              <h3 className="mb-2 flex items-center gap-2 font-medium text-yellow-800">
                <Warning size={16} />
                以下建议项未能应用（{suggestion.skippedItems.length}项）
              </h3>
              <ul className="space-y-1 text-sm text-yellow-700">
                {suggestion.skippedItems.map((item, i) => (
                  <li key={i}>
                    <span className="font-mono">{item.target}</span>: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 下周关注 */}
          <div className="rounded-button bg-blue-50 p-4">
            <h3 className="mb-1 font-medium text-blue-800">下周关注重点</h3>
            <p className="text-sm text-blue-700">{suggestion.parsedSuggestion.nextReviewFocus}</p>
          </div>
        </div>

        {/* 底部操作 */}
        {isPending && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 p-6 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              已选择 {selectedItems.size} / {suggestion.parsedSuggestion.suggestions.length} 项
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={onReject}
                disabled={rejecting || approving}
                className="rounded-button border border-gray-300 px-4 py-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rejecting ? '拒绝中...' : '全部拒绝'}
              </button>
              <button
                onClick={onApprove}
                disabled={selectedItems.size === 0 || approving || rejecting}
                className="rounded-button bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approving ? '应用中...' : `应用选中项 (${selectedItems.size})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
