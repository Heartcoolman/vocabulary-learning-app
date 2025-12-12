/**
 * 词库质量检查页面
 * 使用 LLM 批量检查词库内容质量，发现拼写、释义、例句等问题
 */

import { useState } from 'react';
import {
  MagnifyingGlass,
  CheckCircle,
  Warning,
  XCircle,
  ArrowsClockwise,
  Lightbulb,
  Eye,
  Check,
  X,
  CircleNotch,
  CaretDown,
  CaretUp,
  Books,
  Sparkle,
  Wrench,
} from '../../components/Icon';
import { useToast, Button, Skeleton } from '../../components/ui';
import { useSystemWordBooks } from '../../hooks/queries/useWordBooks';
import {
  useQualityCheckHistory,
  useOpenIssues,
  useQualityStats,
  useStartQualityCheck,
  useMarkIssueFix,
  useIgnoreIssue,
  useBatchApplyFixes,
  usePendingVariants,
  useEnhanceWords,
  useApproveVariant,
  useRejectVariant,
} from '../../hooks/queries';
import type { CheckType, EnhanceType, IssueSeverity } from '../../services/client';

/**
 * 问题严重程度标签
 */
function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const config = {
    error: { bg: 'bg-red-100', text: 'text-red-700', label: '错误' },
    warning: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '警告' },
    suggestion: { bg: 'bg-blue-100', text: 'text-blue-700', label: '建议' },
  };
  const c = config[severity];
  return <span className={`rounded px-2 py-0.5 text-xs ${c.bg} ${c.text}`}>{c.label}</span>;
}

/**
 * 质量检查面板
 */
function QualityCheckPanel({
  wordBookId,
  wordBookName,
}: {
  wordBookId: string;
  wordBookName: string;
}) {
  const toast = useToast();
  const [checkType, setCheckType] = useState<CheckType>('FULL');
  const [showHistory, setShowHistory] = useState(false);

  // 数据查询
  const { data: stats, isLoading: loadingStats } = useQualityStats(wordBookId);
  const { data: issues, isLoading: loadingIssues } = useOpenIssues(wordBookId, { limit: 20 });
  const { data: history, isLoading: loadingHistory } = useQualityCheckHistory(wordBookId, {
    limit: 5,
  });

  // Mutations
  const startCheckMutation = useStartQualityCheck();
  const markFixMutation = useMarkIssueFix();
  const ignoreMutation = useIgnoreIssue();
  const batchApplyFixesMutation = useBatchApplyFixes();

  // 开始检查
  const handleStartCheck = async () => {
    try {
      await startCheckMutation.mutateAsync({
        wordBookId,
        options: { checkType, batchSize: 10, maxIssues: 100 },
      });
      toast.success('质量检查已启动');
    } catch (error) {
      const message = error instanceof Error ? error.message : '启动检查失败';
      toast.error(message);
    }
  };

  // 标记已修复
  const handleMarkFix = async (issueId: string) => {
    try {
      await markFixMutation.mutateAsync(issueId);
      toast.success('已标记为已修复');
    } catch {
      toast.error('操作失败');
    }
  };

  // 忽略问题
  const handleIgnore = async (issueId: string) => {
    try {
      await ignoreMutation.mutateAsync(issueId);
      toast.success('已忽略该问题');
    } catch {
      toast.error('操作失败');
    }
  };

  // 一键修复所有有建议的问题
  const handleBatchApplyFixes = async () => {
    if (!issues?.items || issues.items.length === 0) {
      toast.error('没有可修复的问题');
      return;
    }

    // 筛选有修复建议的问题
    const fixableIssues = issues.items.filter((issue) => issue.suggestion);
    if (fixableIssues.length === 0) {
      toast.error('没有包含修复建议的问题');
      return;
    }

    const issueIds = fixableIssues.map((issue) => issue.id);

    try {
      const result = await batchApplyFixesMutation.mutateAsync(issueIds);
      if (result.applied > 0) {
        toast.success(`已成功修复 ${result.applied} 个问题`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} 个问题修复失败`);
      }
    } catch {
      toast.error('批量修复失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* 统计概览 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {loadingStats ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </>
        ) : stats ? (
          <>
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="text-2xl font-bold text-blue-700">{stats.totalChecks}</div>
              <div className="text-sm text-blue-600">累计检查</div>
            </div>
            <div className="rounded-lg bg-red-50 p-4">
              <div className="text-2xl font-bold text-red-700">{stats.openIssues}</div>
              <div className="text-sm text-red-600">待处理问题</div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="text-2xl font-bold text-green-700">{stats.fixedIssues}</div>
              <div className="text-sm text-green-600">已修复</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-2xl font-bold text-gray-700">
                {stats.lastCheckDate
                  ? new Date(stats.lastCheckDate).toLocaleDateString('zh-CN')
                  : '-'}
              </div>
              <div className="text-sm text-gray-600">最近检查</div>
            </div>
          </>
        ) : null}
      </div>

      {/* 启动检查 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-900">启动质量检查</h3>
        <div className="flex items-center gap-4">
          <select
            value={checkType}
            onChange={(e) => setCheckType(e.target.value as CheckType)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="FULL">全面检查</option>
            <option value="SPELLING">拼写检查</option>
            <option value="MEANING">释义检查</option>
            <option value="EXAMPLE">例句检查</option>
          </select>
          <Button
            onClick={handleStartCheck}
            disabled={startCheckMutation.isPending}
            className="flex items-center gap-2"
          >
            {startCheckMutation.isPending ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <MagnifyingGlass className="h-4 w-4" />
            )}
            开始检查
          </Button>
          <span className="text-sm text-gray-500">词库: {wordBookName}</span>
        </div>
      </div>

      {/* 待处理问题 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium text-gray-900">待处理问题</h3>
            {issues && <span className="text-sm text-gray-500">共 {issues.total} 个</span>}
          </div>
          {issues?.items && issues.items.some((issue) => issue.suggestion) && (
            <Button
              onClick={handleBatchApplyFixes}
              disabled={batchApplyFixesMutation.isPending}
              variant="outline"
              className="flex items-center gap-2 border-green-300 text-green-600 hover:bg-green-50"
            >
              {batchApplyFixesMutation.isPending ? (
                <CircleNotch className="h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
              一键修复
            </Button>
          )}
        </div>

        {loadingIssues ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : issues?.items && issues.items.length > 0 ? (
          <div className="space-y-3">
            {issues.items.map((issue) => (
              <div
                key={issue.id}
                className="flex items-start justify-between rounded-lg bg-gray-50 p-4"
              >
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-gray-900">{issue.spelling}</span>
                    <SeverityBadge severity={issue.severity} />
                    <span className="text-xs text-gray-500">{issue.field}</span>
                  </div>
                  <p className="text-sm text-gray-700">{issue.description}</p>
                  {issue.suggestion && (
                    <p className="mt-1 text-sm text-blue-600">
                      <Lightbulb className="mr-1 inline h-4 w-4" />
                      {issue.suggestion}
                    </p>
                  )}
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <button
                    onClick={() => handleMarkFix(issue.id)}
                    disabled={markFixMutation.isPending}
                    className="rounded p-2 text-green-600 hover:bg-green-100"
                    title="标记已修复"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleIgnore(issue.id)}
                    disabled={ignoreMutation.isPending}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100"
                    title="忽略"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">
            <CheckCircle className="mx-auto mb-2 h-12 w-12 text-green-400" />
            <p>暂无待处理问题</p>
          </div>
        )}
      </div>

      {/* 检查历史 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex w-full items-center justify-between"
        >
          <h3 className="text-lg font-medium text-gray-900">检查历史</h3>
          {showHistory ? (
            <CaretUp className="h-5 w-5 text-gray-400" />
          ) : (
            <CaretDown className="h-5 w-5 text-gray-400" />
          )}
        </button>

        {showHistory && (
          <div className="mt-4">
            {loadingHistory ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : history?.items && history.items.length > 0 ? (
              <div className="space-y-3">
                {history.items.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                  >
                    <div>
                      <span className="text-sm font-medium">{check.checkType}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(check.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-600">
                        检查 {check.checkedWords}/{check.totalWords}
                      </span>
                      <span className={check.issuesFound > 0 ? 'text-red-600' : 'text-green-600'}>
                        发现 {check.issuesFound} 问题
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          check.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : check.status === 'processing'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {check.status === 'completed'
                          ? '完成'
                          : check.status === 'processing'
                            ? '进行中'
                            : check.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-gray-500">暂无检查记录</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 内容增强面板
 */
function ContentEnhancePanel({ wordBookId }: { wordBookId: string }) {
  const toast = useToast();
  const [enhanceType, setEnhanceType] = useState<EnhanceType>('meanings');

  // 数据查询
  const { data: variants, isLoading: loadingVariants } = usePendingVariants({
    wordBookId,
    limit: 20,
  });

  // Mutations
  const enhanceMutation = useEnhanceWords();
  const approveMutation = useApproveVariant();
  const rejectMutation = useRejectVariant();

  // 批量增强
  const handleEnhance = async () => {
    try {
      const result = await enhanceMutation.mutateAsync({
        wordBookId,
        options: { enhanceType, batchSize: 5, maxWords: 20 },
      });
      toast.success(`已处理 ${result.processedWords} 个单词`);
    } catch {
      toast.error('增强失败');
    }
  };

  // 审批
  const handleApprove = async (variantId: string, applyToWord: boolean) => {
    try {
      await approveMutation.mutateAsync({ variantId, applyToWord });
      toast.success(applyToWord ? '已应用到单词' : '已通过');
    } catch {
      toast.error('操作失败');
    }
  };

  // 拒绝
  const handleReject = async (variantId: string) => {
    try {
      await rejectMutation.mutateAsync(variantId);
      toast.success('已拒绝');
    } catch {
      toast.error('操作失败');
    }
  };

  const enhanceTypeLabels: Record<EnhanceType, string> = {
    meanings: '释义',
    examples: '例句',
    mnemonics: '记忆技巧',
    usage_notes: '用法说明',
  };

  return (
    <div className="space-y-6">
      {/* 启动增强 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-900">批量内容增强</h3>
        <div className="flex items-center gap-4">
          <select
            value={enhanceType}
            onChange={(e) => setEnhanceType(e.target.value as EnhanceType)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="meanings">生成释义</option>
            <option value="examples">生成例句</option>
            <option value="mnemonics">生成记忆技巧</option>
            <option value="usage_notes">生成用法说明</option>
          </select>
          <Button
            onClick={handleEnhance}
            disabled={enhanceMutation.isPending}
            className="flex items-center gap-2"
          >
            {enhanceMutation.isPending ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkle className="h-4 w-4" />
            )}
            开始增强
          </Button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          使用 LLM 为缺少内容的单词批量生成{enhanceTypeLabels[enhanceType]}
        </p>
      </div>

      {/* 待审核内容 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">待审核内容</h3>
          {variants && <span className="text-sm text-gray-500">共 {variants.total} 个</span>}
        </div>

        {loadingVariants ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : variants?.items && variants.items.length > 0 ? (
          <div className="space-y-4">
            {variants.items.map((variant) => (
              <div key={variant.id} className="rounded-lg bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{variant.spelling}</span>
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                      {enhanceTypeLabels[variant.field as EnhanceType] || variant.field}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(variant.id, true)}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1 rounded bg-green-500 px-3 py-1 text-sm text-white hover:bg-green-600"
                    >
                      <Check className="h-3 w-3" />
                      应用
                    </button>
                    <button
                      onClick={() => handleApprove(variant.id, false)}
                      disabled={approveMutation.isPending}
                      className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
                    >
                      仅通过
                    </button>
                    <button
                      onClick={() => handleReject(variant.id)}
                      disabled={rejectMutation.isPending}
                      className="rounded bg-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-400"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="mb-1 text-xs text-gray-500">原内容</div>
                    <div className="text-gray-600">
                      {variant.originalValue ? JSON.stringify(variant.originalValue) : '(无)'}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">生成内容</div>
                    <div className="text-gray-900">
                      {Array.isArray(variant.generatedValue)
                        ? variant.generatedValue.join('; ')
                        : JSON.stringify(variant.generatedValue)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">
            <Sparkle className="mx-auto mb-2 h-12 w-12 text-purple-300" />
            <p>暂无待审核内容</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 词库质量检查页面主组件
 */
export default function WordQualityPage() {
  const [selectedWordBook, setSelectedWordBook] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'quality' | 'enhance'>('quality');

  // 获取系统词库列表
  const { data: wordBooks, isLoading: loadingWordBooks } = useSystemWordBooks();

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">词库质量管理</h1>
        <p className="mt-1 text-sm text-gray-500">使用 LLM 检查词库质量、批量增强内容</p>
      </div>

      {/* 词库选择 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Books className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-medium text-gray-900">选择词库</h2>
        </div>

        {loadingWordBooks ? (
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-32 rounded-lg" />
            ))}
          </div>
        ) : wordBooks && wordBooks.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {wordBooks.map((wb) => (
              <button
                key={wb.id}
                onClick={() => setSelectedWordBook({ id: wb.id, name: wb.name })}
                className={`rounded-lg border px-4 py-2 transition-colors ${
                  selectedWordBook?.id === wb.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {wb.name}
                <span className="ml-2 text-xs text-gray-500">({wb.wordCount || 0}词)</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">暂无系统词库</p>
        )}
      </div>

      {/* 功能标签页 */}
      {selectedWordBook && (
        <>
          <div className="flex gap-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('quality')}
              className={`border-b-2 px-1 pb-3 transition-colors ${
                activeTab === 'quality'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <MagnifyingGlass className="h-4 w-4" />
                质量检查
              </div>
            </button>
            <button
              onClick={() => setActiveTab('enhance')}
              className={`border-b-2 px-1 pb-3 transition-colors ${
                activeTab === 'enhance'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkle className="h-4 w-4" />
                内容增强
              </div>
            </button>
          </div>

          {/* 内容区域 */}
          {activeTab === 'quality' ? (
            <QualityCheckPanel
              wordBookId={selectedWordBook.id}
              wordBookName={selectedWordBook.name}
            />
          ) : (
            <ContentEnhancePanel wordBookId={selectedWordBook.id} />
          )}
        </>
      )}

      {/* 未选择词库提示 */}
      {!selectedWordBook && !loadingWordBooks && (
        <div className="py-12 text-center text-gray-500">
          <Books className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <p>请先选择一个词库进行质量检查或内容增强</p>
        </div>
      )}
    </div>
  );
}
