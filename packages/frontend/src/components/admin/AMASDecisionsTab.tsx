/**
 * AMAS Decisions Tab Component
 * 管理员查看用户 AMAS 决策记录的完整功能组件
 */

import React, { useState, useEffect, useRef } from 'react';
import ApiClient from '../../services/ApiClient';
import { adminLogger } from '../../utils/logger';

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
  inputSummary?: any;
  outputSummary?: any;
  errorMessage?: string | null;
}

interface DecisionDetail {
  decision: any;
  insight?: any;
  pipeline: PipelineStage[];
  context?: any;
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
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
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
    sortOrder: 'desc' as 'asc' | 'desc'
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
  }, [userId, pagination.page, filters.startDate, filters.endDate, filters.decisionSource, filters.sortBy, filters.sortOrder]);

  const loadDecisions = async () => {
    // 空值保护：确保 userId 有效
    if (!userId) {
      setError('用户ID为空');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await ApiClient.adminGetUserDecisions(userId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        decisionSource: filters.decisionSource || undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      }) as DecisionsApiResponse;

      setDecisions(response.data.decisions || []);

      // 只在分页数据有实际变化时才更新 pagination，避免无限循环
      const newPagination = response.data.pagination;
      if (newPagination && (
        newPagination.total !== pagination.total ||
        newPagination.totalPages !== pagination.totalPages ||
        newPagination.pageSize !== pagination.pageSize
      )) {
        setPagination(prev => ({
          ...prev,
          total: newPagination.total,
          totalPages: newPagination.totalPages,
          pageSize: newPagination.pageSize
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
      const response = await ApiClient.adminGetDecisionDetail(userId, decisionId) as DecisionDetailApiResponse;
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
    return <div style={styles.container}>加载中...</div>;
  }

  if (error && decisions.length === 0) {
    return <div style={styles.container}><div style={styles.error}>{error}</div></div>;
  }

  return (
    <div style={styles.container}>
      {/* 统计面板 */}
      {statistics && (
        <div style={styles.statsPanel}>
          <h3 style={styles.statsTitle}>决策统计</h3>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>总决策数</div>
              <div style={styles.statValue}>{statistics.totalDecisions}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>平均置信度</div>
              <div style={styles.statValue}>{(statistics.averageConfidence * 100).toFixed(1)}%</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>平均奖励</div>
              <div style={styles.statValue}>{statistics.averageReward.toFixed(3)}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>决策来源</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                {Object.entries(statistics.decisionSourceDistribution).map(([source, count]) => (
                  <div key={source}>{source}: {count}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 筛选栏 */}
      <div style={styles.filterBar}>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          placeholder="开始日期"
          style={styles.filterInput}
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          placeholder="结束日期"
          style={styles.filterInput}
        />
        <select
          value={filters.decisionSource}
          onChange={(e) => setFilters({ ...filters, decisionSource: e.target.value })}
          style={styles.filterInput}
        >
          <option value="">所有来源</option>
          <option value="coldstart">冷启动</option>
          <option value="ensemble">集成学习</option>
        </select>
        <button onClick={() => loadDecisions()} style={styles.refreshButton}>
          刷新
        </button>
      </div>

      {/* 决策列表 */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>时间</th>
              <th style={styles.th}>来源</th>
              <th style={styles.th}>策略</th>
              <th style={styles.th}>置信度</th>
              <th style={styles.th}>奖励</th>
              <th style={styles.th}>耗时</th>
              <th style={styles.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.decisionId} style={styles.tr}>
                <td style={styles.td}>{new Date(d.timestamp).toLocaleString('zh-CN')}</td>
                <td style={styles.td}>
                  <span style={{
                    ...styles.badge,
                    ...(d.decisionSource === 'ensemble' ? styles.badgeEnsemble : styles.badgeColdstart)
                  }}>
                    {d.decisionSource}
                  </span>
                </td>
                <td style={styles.td}>{d.strategy.difficulty}, {d.strategy.batch_size}词</td>
                <td style={styles.td}>
                  <div style={styles.progressBarContainer}>
                    <div style={{ ...styles.progressBar, width: `${d.confidence * 100}%` }} />
                  </div>
                  <span style={{ fontSize: '12px' }}>{(d.confidence * 100).toFixed(0)}%</span>
                </td>
                <td style={styles.td}>{d.reward !== null && d.reward !== undefined ? d.reward.toFixed(3) : '-'}</td>
                <td style={styles.td}>{d.totalDurationMs ? `${d.totalDurationMs}ms` : '-'}</td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleViewDetail(d.decisionId)}
                    style={styles.detailButton}
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {decisions.length === 0 && (
          <div style={styles.emptyState}>暂无决策记录</div>
        )}
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            disabled={pagination.page === 1}
            onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
            style={styles.paginationButton}
          >
            上一页
          </button>
          <span style={styles.paginationInfo}>
            第 {pagination.page} / {pagination.totalPages} 页（共 {pagination.total} 条）
          </span>
          <button
            disabled={pagination.page === pagination.totalPages}
            onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
            style={styles.paginationButton}
          >
            下一页
          </button>
        </div>
      )}

      {/* 决策详情模态框 */}
      {selectedDecisionId && (
        <div style={styles.modalOverlay} onClick={closeDetail}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>决策详情</h3>
              <button onClick={closeDetail} style={styles.closeButton}>×</button>
            </div>

            {detailLoading ? (
              <div style={styles.modalBody}>加载中...</div>
            ) : decisionDetail ? (
              <div style={styles.modalBody}>
                {/* 基本信息 */}
                <div style={styles.section}>
                  <h4 style={styles.sectionTitle}>基本信息</h4>
                  <div style={styles.infoGrid}>
                    <div><strong>决策ID:</strong> {decisionDetail.decision.decisionId}</div>
                    <div><strong>时间:</strong> {new Date(decisionDetail.decision.timestamp).toLocaleString('zh-CN')}</div>
                    <div><strong>来源:</strong> {decisionDetail.decision.decisionSource}</div>
                    <div><strong>置信度:</strong> {(decisionDetail.decision.confidence * 100).toFixed(1)}%</div>
                    {decisionDetail.decision.coldstartPhase && (
                      <div><strong>冷启动阶段:</strong> {decisionDetail.decision.coldstartPhase}</div>
                    )}
                    {decisionDetail.decision.reward !== null && decisionDetail.decision.reward !== undefined && (
                      <div><strong>奖励:</strong> {decisionDetail.decision.reward.toFixed(3)}</div>
                    )}
                  </div>
                </div>

                {/* 状态快照 */}
                {decisionDetail.insight?.stateSnapshot && (
                  <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>用户状态快照</h4>
                    <div style={styles.stateGrid}>
                      {Object.entries(decisionDetail.insight.stateSnapshot).map(([key, value]: [string, any]) => (
                        <div key={key} style={styles.stateItem}>
                          <span style={styles.stateLabel}>{key}:</span>
                          <span style={styles.stateValue}>
                            {typeof value === 'number' ? value.toFixed(2) : JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 流水线执行 */}
                {decisionDetail.pipeline && decisionDetail.pipeline.length > 0 && (
                  <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>流水线执行（六层架构）</h4>
                    <div style={styles.pipelineContainer}>
                      {decisionDetail.pipeline.map((stage: PipelineStage, index: number) => (
                        <div key={index} style={styles.pipelineStage}>
                          <div style={styles.stageHeader}>
                            <span style={styles.stageIcon}>
                              {stage.status === 'SUCCESS' ? '✓' :
                               stage.status === 'FAILED' ? '✗' :
                               stage.status === 'STARTED' ? '⏳' : '─'}
                            </span>
                            <span style={styles.stageName}>{stage.stageName || stage.stage}</span>
                            <span style={{ ...styles.stageStatus, color: stage.status === 'SUCCESS' ? '#22c55e' : '#ef4444' }}>
                              {stage.status}
                            </span>
                            <span style={styles.stageDuration}>
                              {stage.durationMs !== null && stage.durationMs !== undefined ? `${stage.durationMs}ms` : '-'}
                            </span>
                          </div>
                          {stage.outputSummary && (
                            <div style={styles.stageSummary}>
                              输出: {JSON.stringify(stage.outputSummary).substring(0, 100)}...
                            </div>
                          )}
                          {stage.errorMessage && (
                            <div style={styles.stageError}>错误: {stage.errorMessage}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 选择的动作 */}
                <div style={styles.section}>
                  <h4 style={styles.sectionTitle}>选择的动作</h4>
                  <pre style={styles.jsonBlock}>
                    {JSON.stringify(decisionDetail.decision.selectedAction, null, 2)}
                  </pre>
                </div>

                {/* 上下文信息 */}
                {decisionDetail.context && (
                  <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>上下文</h4>
                    <div style={styles.infoGrid}>
                      <div><strong>单词:</strong> {decisionDetail.context.answerRecord.wordSpelling}</div>
                      <div><strong>正确:</strong> {decisionDetail.context.answerRecord.isCorrect ? '是' : '否'}</div>
                      {decisionDetail.context.answerRecord.responseTime && (
                        <div><strong>反应时间:</strong> {decisionDetail.context.answerRecord.responseTime}ms</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.modalBody}>加载失败</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px'
  },
  statsPanel: {
    backgroundColor: '#f9fafb',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  statsTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px'
  },
  statCard: {
    backgroundColor: '#fff',
    padding: '16px',
    borderRadius: '6px',
    border: '1px solid #e5e7eb'
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '8px'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#111827'
  },
  filterBar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap' as any
  },
  filterInput: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px'
  },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  tableContainer: {
    overflowX: 'auto' as any,
    border: '1px solid #e5e7eb',
    borderRadius: '8px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as any
  },
  th: {
    backgroundColor: '#f9fafb',
    padding: '12px',
    textAlign: 'left' as any,
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#374151',
    borderBottom: '2px solid #e5e7eb'
  },
  tr: {
    borderBottom: '1px solid #f3f4f6'
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#111827'
  },
  badge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  badgeEnsemble: {
    backgroundColor: '#dbeafe',
    color: '#1e40af'
  },
  badgeColdstart: {
    backgroundColor: '#fef3c7',
    color: '#92400e'
  },
  progressBarContainer: {
    width: '80px',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    display: 'inline-block',
    marginRight: '8px'
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: '4px'
  },
  detailButton: {
    padding: '6px 12px',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px'
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as any,
    color: '#6b7280'
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    marginTop: '20px'
  },
  paginationButton: {
    padding: '8px 16px',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  paginationInfo: {
    fontSize: '14px',
    color: '#6b7280'
  },
  modalOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    maxWidth: '900px',
    maxHeight: '90vh',
    width: '90%',
    overflow: 'auto' as any
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e5e7eb'
  },
  closeButton: {
    fontSize: '28px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    lineHeight: 1
  },
  modalBody: {
    padding: '20px'
  },
  section: {
    marginBottom: '24px'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#111827'
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    fontSize: '14px'
  },
  stateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '8px'
  },
  stateItem: {
    padding: '8px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
    fontSize: '13px'
  },
  stateLabel: {
    fontWeight: 'bold',
    marginRight: '4px'
  },
  stateValue: {
    color: '#6b7280'
  },
  pipelineContainer: {
    display: 'flex',
    flexDirection: 'column' as any,
    gap: '12px'
  },
  pipelineStage: {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    borderLeft: '4px solid #3b82f6'
  },
  stageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px'
  },
  stageIcon: {
    fontSize: '18px',
    fontWeight: 'bold'
  },
  stageName: {
    fontSize: '14px',
    fontWeight: 'bold',
    flex: 1
  },
  stageStatus: {
    fontSize: '12px',
    fontWeight: 'bold'
  },
  stageDuration: {
    fontSize: '12px',
    color: '#6b7280'
  },
  stageSummary: {
    fontSize: '12px',
    color: '#6b7280',
    marginLeft: '30px'
  },
  stageError: {
    fontSize: '12px',
    color: '#ef4444',
    marginLeft: '30px',
    marginTop: '4px'
  },
  jsonBlock: {
    backgroundColor: '#f3f4f6',
    padding: '12px',
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto' as any,
    maxHeight: '300px'
  },
  error: {
    padding: '12px',
    backgroundColor: '#fee',
    color: '#c33',
    borderRadius: '4px'
  }
};

export default AMASDecisionsTab;
