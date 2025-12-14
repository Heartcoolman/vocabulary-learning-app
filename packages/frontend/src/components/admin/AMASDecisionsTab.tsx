/**
 * AMAS Decisions Tab Component
 * 管理员查看用户 AMAS 决策记录的完整功能组件
 */

import React, { useState, useEffect, useRef } from 'react';
import ApiClient from '../../services/client';
import { adminLogger } from '../../utils/logger';
import { LearningStrategy, DifficultyLevel } from '@danci/shared';
import { PAGINATION_CONFIG } from '../../constants/pagination';

// ============================================
// 类型定义
// ============================================

/**
 * Pipeline 阶段的输入/输出摘要类型
 */
type PipelineSummary = Record<string, unknown>;

/**
 * 用户状态快照类型（用于 insight.stateSnapshot）
 */
type StateSnapshotValue = string | number | boolean | null | Record<string, unknown>;

/**
 * 决策中的选中动作类型
 */
interface SelectedAction {
  difficulty: DifficultyLevel;
  batch_size: number;
  interval_scale?: number;
  new_ratio?: number;
  hint_level?: number;
}

/**
 * 决策详情中的 Decision 数据
 */
interface DecisionData {
  decisionId: string;
  timestamp: string;
  decisionSource: string;
  confidence: number;
  coldstartPhase?: string;
  reward?: number | null;
  selectedAction?: SelectedAction;
}

/**
 * 决策详情中的 Insight 数据（用户洞察）
 */
interface DecisionInsight {
  stateSnapshot?: Record<string, StateSnapshotValue>;
}

/**
 * 决策详情中的上下文数据
 */
interface DecisionContext {
  answerRecord: {
    wordSpelling: string;
    isCorrect: boolean;
    responseTime?: number;
  };
}

interface DecisionListItem {
  decisionId: string;
  timestamp: string;
  decisionSource: string;
  confidence: number;
  reward?: number | null;
  totalDurationMs?: number | null;
  strategy: {
    difficulty: string;
    batch_size: number;
    interval_scale?: number;
    new_ratio?: number;
    hint_level?: number;
  };
}

interface DecisionStatistics {
  totalDecisions: number;
  averageConfidence: number;
  averageReward: number;
  decisionSourceDistribution: Record<string, number>;
}

interface PipelineStage {
  stage: string;
  stageName: string;
  status: string;
  durationMs?: number | null;
  startedAt: string;
  endedAt?: string | null;
  inputSummary?: PipelineSummary;
  outputSummary?: PipelineSummary;
  errorMessage?: string | null;
}

interface DecisionDetail {
  decision: DecisionData;
  insight?: DecisionInsight;
  pipeline: PipelineStage[];
  context?: DecisionContext;
}

// API 响应类型定义
interface DecisionsApiResponse {
  data: {
    decisions: DecisionListItem[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    statistics: DecisionStatistics | null;
  };
}

interface DecisionDetailApiResponse {
  data: DecisionDetail | null;
}

interface Props {
  userId: string;
}

export const AMASDecisionsTab: React.FC<Props> = ({ userId }) => {
  const [decisions, setDecisions] = useState<DecisionListItem[]>([]);
  const [statistics, setStatistics] = useState<DecisionStatistics | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGINATION_CONFIG.ADMIN_LIST,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [decisionDetail, setDecisionDetail] = useState<DecisionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 用于取消正在进行的详情请求
  const detailRequestCancelledRef = useRef(false);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    decisionSource: '',
    sortBy: 'timestamp' as 'timestamp' | 'confidence' | 'duration',
    sortOrder: 'desc' as 'asc' | 'desc',
  });

  // 修复：将 filters 对象的各个属性作为独立依赖项，避免对象引用变化导致的不必要重新渲染
  useEffect(() => {
    // 空值保护：如果 userId 为空，不发起请求
    if (!userId) {
      setLoading(false);
      setError('用户ID为空');
      return;
    }
    loadDecisions();
  }, [
    userId,
    pagination.page,
    filters.startDate,
    filters.endDate,
    filters.decisionSource,
    filters.sortBy,
    filters.sortOrder,
  ]);

  const loadDecisions = async () => {
    // 空值保护：确保 userId 有效
    if (!userId) {
      setError('用户ID为空');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = (await ApiClient.adminGetUserDecisions(userId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        decisionSource: filters.decisionSource || undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      })) as DecisionsApiResponse;

      setDecisions(response.data.decisions || []);

      // 只在分页数据有实际变化时才更新 pagination，避免无限循环
      const newPagination = response.data.pagination;
      if (
        newPagination &&
        (newPagination.total !== pagination.total ||
          newPagination.totalPages !== pagination.totalPages ||
          newPagination.pageSize !== pagination.pageSize)
      ) {
        setPagination((prev) => ({
          ...prev,
          total: newPagination.total,
          totalPages: newPagination.totalPages,
          pageSize: newPagination.pageSize,
        }));
      }

      setStatistics(response.data.statistics || null);
      setError(null);
    } catch (err: unknown) {
      setError('加载决策记录失败');
      adminLogger.error({ err, userId, page: pagination.page }, '加载决策记录失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDecisionDetail = async (decisionId: string) => {
    // 重置取消标志
    detailRequestCancelledRef.current = false;
    try {
      setDetailLoading(true);
      const response = (await ApiClient.adminGetDecisionDetail(
        userId,
        decisionId,
      )) as DecisionDetailApiResponse;
      // 如果请求被取消，不更新状态
      if (detailRequestCancelledRef.current) return;
      setDecisionDetail(response.data || null);
    } catch (err) {
      // 如果请求被取消，不显示错误
      if (detailRequestCancelledRef.current) return;
      adminLogger.error({ err, userId, decisionId }, '加载决策详情失败');
      setDecisionDetail(null);
    } finally {
      // 如果请求被取消，不更新 loading 状态
      if (!detailRequestCancelledRef.current) {
        setDetailLoading(false);
      }
    }
  };

  const handleViewDetail = (decisionId: string) => {
    setSelectedDecisionId(decisionId);
    loadDecisionDetail(decisionId);
  };

  const closeDetail = () => {
    // 取消正在进行的请求
    detailRequestCancelledRef.current = true;
    setSelectedDecisionId(null);
    setDecisionDetail(null);
    setDetailLoading(false);
  };

  if (loading && decisions.length === 0) {
    return <div className="p-5">加载中...</div>;
  }

  if (error && decisions.length === 0) {
    return (
      <div className="p-5">
        <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* 统计面板 */}
      {statistics && (
        <div className="mb-5 rounded-button bg-gray-50 p-5">
          <h3 className="mb-4 text-lg font-bold">决策统计</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm text-gray-500">总决策数</div>
              <div className="text-2xl font-bold text-gray-900">{statistics.totalDecisions}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm text-gray-500">平均置信度</div>
              <div className="text-2xl font-bold text-gray-900">
                {(statistics.averageConfidence * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm text-gray-500">平均奖励</div>
              <div className="text-2xl font-bold text-gray-900">
                {statistics.averageReward.toFixed(3)}
              </div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm text-gray-500">决策来源</div>
              <div className="mt-1 text-xs">
                {Object.entries(statistics.decisionSourceDistribution).map(([source, count]) => (
                  <div key={source}>
                    {source}: {count}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          placeholder="开始日期"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          placeholder="结束日期"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={filters.decisionSource}
          onChange={(e) => setFilters({ ...filters, decisionSource: e.target.value })}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">所有来源</option>
          <option value="coldstart">冷启动</option>
          <option value="ensemble">集成学习</option>
        </select>
        <button
          onClick={() => loadDecisions()}
          className="cursor-pointer rounded border-none bg-blue-500 px-4 py-2 text-sm text-white"
        >
          刷新
        </button>
      </div>

      {/* 决策列表 */}
      <div className="overflow-x-auto rounded-button border border-gray-200">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b-2 border-gray-200 bg-gray-50 p-3 text-left text-sm font-bold text-gray-700">
                时间
              </th>
              <th className="border-b-2 border-gray-200 bg-gray-50 p-3 text-left text-sm font-bold text-gray-700">
                来源
              </th>
              <th className="border-b-2 border-gray-200 bg-gray-50 p-3 text-left text-sm font-bold text-gray-700">
                策略
              </th>
              <th className="border-b-2 border-gray-200 bg-gray-50 p-3 text-left text-sm font-bold text-gray-700">
                置信度
              </th>
              <th className="border-b-2 border-gray-200 bg-gray-50 p-3 text-left text-sm font-bold text-gray-700">
                奖励
              </th>
              <th className="border-b-2 border-gray-200 bg-gray-50 p-3 text-left text-sm font-bold text-gray-700">
                耗时
              </th>
              <th className="border-b-2 border-gray-200 bg-gray-50 p-3 text-left text-sm font-bold text-gray-700">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.decisionId} className="border-b border-gray-100">
                <td className="p-3 text-sm text-gray-900">
                  {new Date(d.timestamp).toLocaleString('zh-CN')}
                </td>
                <td className="p-3 text-sm text-gray-900">
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      d.decisionSource === 'ensemble'
                        ? 'bg-blue-50 text-blue-800'
                        : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    {d.decisionSource}
                  </span>
                </td>
                <td className="p-3 text-sm text-gray-900">
                  {d.strategy.difficulty}, {d.strategy.batch_size}词
                </td>
                <td className="p-3 text-sm text-gray-900">
                  <div className="mr-2 inline-block h-2 w-20 rounded bg-gray-200">
                    <div
                      className="h-full rounded bg-blue-500"
                      style={{ width: `${d.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs">{(d.confidence * 100).toFixed(0)}%</span>
                </td>
                <td className="p-3 text-sm text-gray-900">
                  {d.reward !== null && d.reward !== undefined ? d.reward.toFixed(3) : '-'}
                </td>
                <td className="p-3 text-sm text-gray-900">
                  {d.totalDurationMs ? `${d.totalDurationMs}ms` : '-'}
                </td>
                <td className="p-3 text-sm text-gray-900">
                  <button
                    onClick={() => handleViewDetail(d.decisionId)}
                    className="cursor-pointer rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-[13px]"
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {decisions.length === 0 && (
          <div className="py-10 text-center text-gray-500">暂无决策记录</div>
        )}
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            disabled={pagination.page === 1}
            onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
            className="cursor-pointer rounded border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            上一页
          </button>
          <span className="text-sm text-gray-500">
            第 {pagination.page} / {pagination.totalPages} 页（共 {pagination.total} 条）
          </span>
          <button
            disabled={pagination.page === pagination.totalPages}
            onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
            className="cursor-pointer rounded border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            下一页
          </button>
        </div>
      )}

      {/* 决策详情模态框 */}
      {selectedDecisionId && (
        <div
          className="fixed bottom-0 left-0 right-0 top-0 z-[1000] flex items-center justify-center bg-black/50"
          onClick={closeDetail}
        >
          <div
            className="max-h-[90vh] w-[90%] max-w-[900px] overflow-auto rounded-card bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-5">
              <h3>决策详情</h3>
              <button
                onClick={closeDetail}
                className="cursor-pointer border-none bg-none text-[28px] leading-none text-gray-500"
              >
                ×
              </button>
            </div>

            {detailLoading ? (
              <div className="p-5">加载中...</div>
            ) : decisionDetail ? (
              <div className="p-5">
                {/* 基本信息 */}
                <div className="mb-6">
                  <h4 className="mb-3 text-base font-bold text-gray-900">基本信息</h4>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 text-sm">
                    <div>
                      <strong>决策ID:</strong> {decisionDetail.decision.decisionId}
                    </div>
                    <div>
                      <strong>时间:</strong>{' '}
                      {new Date(decisionDetail.decision.timestamp).toLocaleString('zh-CN')}
                    </div>
                    <div>
                      <strong>来源:</strong> {decisionDetail.decision.decisionSource}
                    </div>
                    <div>
                      <strong>置信度:</strong>{' '}
                      {(decisionDetail.decision.confidence * 100).toFixed(1)}%
                    </div>
                    {decisionDetail.decision.coldstartPhase && (
                      <div>
                        <strong>冷启动阶段:</strong> {decisionDetail.decision.coldstartPhase}
                      </div>
                    )}
                    {decisionDetail.decision.reward !== null &&
                      decisionDetail.decision.reward !== undefined && (
                        <div>
                          <strong>奖励:</strong> {decisionDetail.decision.reward.toFixed(3)}
                        </div>
                      )}
                  </div>
                </div>

                {/* 状态快照 */}
                {decisionDetail.insight?.stateSnapshot && (
                  <div className="mb-6">
                    <h4 className="mb-3 text-base font-bold text-gray-900">用户状态快照</h4>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                      {Object.entries(decisionDetail.insight.stateSnapshot).map(
                        ([key, value]: [string, StateSnapshotValue]) => (
                          <div key={key} className="rounded bg-gray-50 p-2 text-[13px]">
                            <span className="mr-1 font-bold">{key}:</span>
                            <span className="text-gray-500">
                              {typeof value === 'number' ? value.toFixed(2) : JSON.stringify(value)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* 流水线执行 */}
                {decisionDetail.pipeline && decisionDetail.pipeline.length > 0 && (
                  <div className="mb-6">
                    <h4 className="mb-3 text-base font-bold text-gray-900">
                      流水线执行（六层架构）
                    </h4>
                    <div className="flex flex-col gap-3">
                      {decisionDetail.pipeline.map((stage: PipelineStage, index: number) => (
                        <div
                          key={index}
                          className="rounded-md border-l-4 border-blue-500 bg-gray-50 p-3"
                        >
                          <div className="mb-2 flex items-center gap-3">
                            <span className="text-lg font-bold">
                              {stage.status === 'SUCCESS'
                                ? '✓'
                                : stage.status === 'FAILED'
                                  ? '✗'
                                  : stage.status === 'STARTED'
                                    ? '⏳'
                                    : '─'}
                            </span>
                            <span className="flex-1 text-sm font-bold">
                              {stage.stageName || stage.stage}
                            </span>
                            <span
                              className="text-xs font-bold"
                              style={{
                                color: stage.status === 'SUCCESS' ? '#22c55e' : '#ef4444',
                              }}
                            >
                              {stage.status}
                            </span>
                            <span className="text-xs text-gray-500">
                              {stage.durationMs !== null && stage.durationMs !== undefined
                                ? `${stage.durationMs}ms`
                                : '-'}
                            </span>
                          </div>
                          {stage.outputSummary && (
                            <div className="ml-[30px] text-xs text-gray-500">
                              输出: {JSON.stringify(stage.outputSummary).substring(0, 100)}...
                            </div>
                          )}
                          {stage.errorMessage && (
                            <div className="ml-[30px] mt-1 text-xs text-red-500">
                              错误: {stage.errorMessage}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 选择的动作 */}
                <div className="mb-6">
                  <h4 className="mb-3 text-base font-bold text-gray-900">选择的动作</h4>
                  <pre className="max-h-[300px] overflow-auto rounded bg-gray-100 p-3 text-xs">
                    {JSON.stringify(decisionDetail.decision.selectedAction, null, 2)}
                  </pre>
                </div>

                {/* 上下文信息 */}
                {decisionDetail.context && (
                  <div className="mb-6">
                    <h4 className="mb-3 text-base font-bold text-gray-900">上下文</h4>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 text-sm">
                      <div>
                        <strong>单词:</strong> {decisionDetail.context.answerRecord.wordSpelling}
                      </div>
                      <div>
                        <strong>正确:</strong>{' '}
                        {decisionDetail.context.answerRecord.isCorrect ? '是' : '否'}
                      </div>
                      {decisionDetail.context.answerRecord.responseTime && (
                        <div>
                          <strong>反应时间:</strong>{' '}
                          {decisionDetail.context.answerRecord.responseTime}ms
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5">加载失败</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AMASDecisionsTab;
