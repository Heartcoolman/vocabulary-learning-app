import { useState, useEffect, useCallback } from 'react';
import {
  Heartbeat,
  ArrowsClockwise,
  CheckCircle,
  Warning,
  XCircle,
  ChartLine,
  Clock,
  Lightning,
  CircleNotch,
  CaretDown,
  CaretUp,
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import apiClient from '../../services/client';
import type {
  AMASMonitoringOverview,
  AMASAggregatesResponse,
  AMASAggregate15m,
  AMASAggregateDaily,
  AMASHealthReport,
} from '../../services/client/admin/AdminClient';

type TabType = 'realtime' | 'daily' | 'reports';

export default function AMASMonitoringPage() {
  const toast = useToast();
  const [overview, setOverview] = useState<AMASMonitoringOverview | null>(null);
  const [aggregates, setAggregates] = useState<AMASAggregate15m[] | AMASAggregateDaily[]>([]);
  const [reports, setReports] = useState<AMASHealthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('realtime');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [overviewData, aggregatesData, reportsData] = await Promise.all([
        apiClient.admin.getAMASMonitoringOverview(),
        apiClient.admin.getAMASMonitoringAggregates({
          period: activeTab === 'daily' ? 'daily' : '15m',
          limit: 50,
        }),
        apiClient.admin.getAMASHealthReports(10),
      ]);
      setOverview(overviewData);
      setAggregates(aggregatesData.data);
      setReports(reportsData);
    } catch {
      toast.error('加载监控数据失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getHealthStatusColor = (status: string | null) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 dark:text-green-400';
      case 'degraded':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'unhealthy':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const getAlertLevelBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            严重
          </span>
        );
      case 'warn':
        return (
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            警告
          </span>
        );
      default:
        return (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            正常
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircleNotch className="animate-spin text-blue-500" size={48} weight="bold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heartbeat size={32} weight="bold" className="text-rose-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AMAS 系统监控</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowsClockwise size={18} weight="bold" className={refreshing ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>

        {/* Stats Cards */}
        {overview && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="健康评分"
              value={overview.latestHealthScore ?? '-'}
              suffix={overview.latestHealthScore !== null ? '/100' : ''}
              icon={<Heartbeat size={24} weight="bold" />}
              className={getHealthStatusColor(overview.latestHealthStatus)}
            />
            <StatCard
              title="24h 事件数"
              value={overview.eventsLast24h.toLocaleString()}
              icon={<ChartLine size={24} weight="bold" />}
              className="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              title="异常率"
              value={(overview.anomalyRate * 100).toFixed(2)}
              suffix="%"
              icon={
                overview.anomalyRate > 0.05 ? (
                  <Warning size={24} weight="bold" />
                ) : (
                  <CheckCircle size={24} weight="bold" />
                )
              }
              className={
                overview.anomalyRate > 0.05
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }
            />
            <StatCard
              title="平均延迟"
              value={overview.avgLatencyMs.toFixed(1)}
              suffix="ms"
              icon={<Lightning size={24} weight="bold" />}
              className={
                overview.avgLatencyMs > 200
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-green-600 dark:text-green-400'
              }
            />
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          {(['realtime', 'daily', 'reports'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
              }`}
            >
              {tab === 'realtime' && '实时 (15分钟)'}
              {tab === 'daily' && '每日趋势'}
              {tab === 'reports' && 'LLM 健康报告'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
          {activeTab === 'realtime' && (
            <RealtimeTable
              data={aggregates as AMASAggregate15m[]}
              getAlertBadge={getAlertLevelBadge}
            />
          )}
          {activeTab === 'daily' && (
            <DailyTable
              data={aggregates as AMASAggregateDaily[]}
              getAlertBadge={getAlertLevelBadge}
            />
          )}
          {activeTab === 'reports' && (
            <ReportsPanel
              reports={reports}
              expandedReport={expandedReport}
              setExpandedReport={setExpandedReport}
              getStatusColor={getHealthStatusColor}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  suffix = '',
  icon,
  className,
}: {
  title: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
        <span className={className}>{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${className}`}>
        {value}
        {suffix && <span className="text-base font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function RealtimeTable({
  data,
  getAlertBadge,
}: {
  data: AMASAggregate15m[];
  getAlertBadge: (level: string) => React.ReactNode;
}) {
  if (data.length === 0) {
    return <EmptyState message="暂无实时聚合数据" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left dark:border-slate-700">
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">时间段</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">事件数</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">异常</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">延迟 (ms)</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">注意力</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">疲劳度</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">约束满足率</th>
            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">状态</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 dark:border-slate-700/50">
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-gray-400" />
                  {new Date(row.periodStart).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </td>
              <td className="py-3 pr-4 text-gray-900 dark:text-white">{row.eventCount}</td>
              <td className="py-3 pr-4">
                <span className={row.anomalyCount > 0 ? 'text-red-600 dark:text-red-400' : ''}>
                  {row.anomalyCount}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className="text-gray-600 dark:text-gray-300">
                  {row.avgLatencyMs.toFixed(1)} / {row.p95LatencyMs.toFixed(1)}
                </span>
              </td>
              <td className="py-3 pr-4">{(row.avgAttention * 100).toFixed(0)}%</td>
              <td className="py-3 pr-4">{(row.avgFatigue * 100).toFixed(0)}%</td>
              <td className="py-3 pr-4">{(row.constraintsSatisfiedRate * 100).toFixed(0)}%</td>
              <td className="py-3">{getAlertBadge(row.alertLevel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyTable({
  data,
  getAlertBadge,
}: {
  data: AMASAggregateDaily[];
  getAlertBadge: (level: string) => React.ReactNode;
}) {
  if (data.length === 0) {
    return <EmptyState message="暂无每日聚合数据" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left dark:border-slate-700">
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">日期</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">总事件</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">异常</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">用户数</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">延迟 (ms)</th>
            <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">约束满足率</th>
            <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">状态</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 dark:border-slate-700/50">
              <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">
                {new Date(row.date).toLocaleDateString('zh-CN')}
              </td>
              <td className="py-3 pr-4">{row.totalEvents.toLocaleString()}</td>
              <td className="py-3 pr-4">
                <span className={row.anomalyCount > 0 ? 'text-red-600 dark:text-red-400' : ''}>
                  {row.anomalyCount}
                </span>
              </td>
              <td className="py-3 pr-4">{row.uniqueUsers}</td>
              <td className="py-3 pr-4">
                {row.avgLatencyMs.toFixed(1)} / {row.p95LatencyMs.toFixed(1)}
              </td>
              <td className="py-3 pr-4">{(row.constraintsSatisfiedRate * 100).toFixed(0)}%</td>
              <td className="py-3">{getAlertBadge(row.alertLevel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsPanel({
  reports,
  expandedReport,
  setExpandedReport,
  getStatusColor,
}: {
  reports: AMASHealthReport[];
  expandedReport: string | null;
  setExpandedReport: (id: string | null) => void;
  getStatusColor: (status: string) => string;
}) {
  if (reports.length === 0) {
    return <EmptyState message="暂无健康报告" />;
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <div key={report.id} className="rounded-lg border border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-4">
              <div className={`text-2xl font-bold ${getStatusColor(report.healthStatus)}`}>
                {report.healthScore}
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {new Date(report.periodStart).toLocaleDateString('zh-CN')} -{' '}
                  {new Date(report.periodEnd).toLocaleDateString('zh-CN')}
                </div>
                <div className={`text-sm ${getStatusColor(report.healthStatus)}`}>
                  {report.healthStatus === 'healthy' && '健康'}
                  {report.healthStatus === 'degraded' && '性能下降'}
                  {report.healthStatus === 'unhealthy' && '不健康'}
                </div>
              </div>
            </div>
            {expandedReport === report.id ? (
              <CaretUp size={20} className="text-gray-400" />
            ) : (
              <CaretDown size={20} className="text-gray-400" />
            )}
          </button>

          {expandedReport === report.id && (
            <div className="border-t border-gray-200 p-4 dark:border-slate-700">
              <div className="mb-4">
                <h4 className="mb-2 font-medium text-gray-900 dark:text-white">分析摘要</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {report.insights.summary}
                </p>
              </div>

              {report.insights.anomalyAnalysis && (
                <div className="mb-4">
                  <h4 className="mb-2 font-medium text-gray-900 dark:text-white">异常分析</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {report.insights.anomalyAnalysis}
                  </p>
                </div>
              )}

              {report.insights.performanceAnalysis && (
                <div className="mb-4">
                  <h4 className="mb-2 font-medium text-gray-900 dark:text-white">性能分析</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {report.insights.performanceAnalysis}
                  </p>
                </div>
              )}

              {report.recommendations.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium text-gray-900 dark:text-white">建议</h4>
                  <ul className="space-y-2">
                    {report.recommendations.map((rec, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-slate-700/50"
                      >
                        <span
                          className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            rec.priority === 'high'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : rec.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}
                        >
                          {rec.priority === 'high' ? '高' : rec.priority === 'medium' ? '中' : '低'}
                        </span>
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            [{rec.category}] {rec.action}
                          </span>
                          <p className="mt-1 text-gray-500 dark:text-gray-400">{rec.rationale}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
      <XCircle size={48} weight="light" className="mb-4" />
      <p>{message}</p>
    </div>
  );
}
