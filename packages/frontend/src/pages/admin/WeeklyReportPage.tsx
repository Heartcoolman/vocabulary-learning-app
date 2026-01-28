/**
 * 周报管理页面
 * 显示系统周报、健康度趋势和用户行为洞察
 */

import { useState } from 'react';
import {
  FileText,
  ChartLine,
  ArrowsClockwise,
  Calendar,
  CheckCircle,
  Warning,
  Lightning,
  Users,
  TrendUp,
  TrendDown,
  CircleNotch,
  CaretDown,
  CaretUp,
  Eye,
  Brain,
  X,
} from '../../components/Icon';
import { useToast, Button, Skeleton } from '../../components/ui';
import {
  useWeeklyReports,
  useLatestWeeklyReport,
  useHealthTrend,
  useGenerateWeeklyReport,
  useInsights,
  useSegments,
  useGenerateInsight,
} from '../../hooks/queries';
import type { WeeklyReportDetail, UserBehaviorInsight, UserSegment } from '../../services/client';

/**
 * 健康度评分颜色
 */
function getHealthColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * 健康度评分背景（浅色，用于标签）
 */
function getHealthBg(score: number): string {
  if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

/**
 * 健康度柱状图背景（深色）
 */
function getHealthBarBg(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * 周报卡片组件
 */
function ReportCard({ report, onClick }: { report: WeeklyReportDetail; onClick: () => void }) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      className="cursor-pointer rounded-button border border-gray-200 bg-white p-4 transition-shadow hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800"
      onClick={onClick}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" />
          <span className="text-sm text-gray-500 dark:text-slate-400">
            {formatDate(report.weekStart)} - {formatDate(report.weekEnd)}
          </span>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-sm font-medium ${getHealthBg(report.healthScore)} ${getHealthColor(report.healthScore)}`}
        >
          {report.healthScore.toFixed(0)}分
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-gray-700 dark:text-slate-300">{report.summary}</p>
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
        {report.highlights && (
          <span className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            {report.highlights.length} 亮点
          </span>
        )}
        {report.concerns && (
          <span className="flex items-center gap-1">
            <Warning className="h-4 w-4 text-yellow-500" />
            {report.concerns.length} 关注点
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 周报详情模态框
 */
function ReportDetailModal({
  report,
  onClose,
}: {
  report: WeeklyReportDetail;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'recommendations'>(
    'overview',
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-button bg-white dark:bg-slate-800">
        {/* 头部 */}
        <div className="border-b border-gray-200 p-6 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">系统周报</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {formatDate(report.weekStart)} - {formatDate(report.weekEnd)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={`rounded-button px-4 py-2 text-lg font-bold ${getHealthBg(report.healthScore)} ${getHealthColor(report.healthScore)}`}
              >
                健康度 {report.healthScore.toFixed(0)}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* 标签页 */}
          <div className="mt-4 flex gap-4">
            {(['overview', 'metrics', 'recommendations'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-button px-4 py-2 text-sm transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {tab === 'overview' && '概览'}
                {tab === 'metrics' && '指标'}
                {tab === 'recommendations' && '建议'}
              </button>
            ))}
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* 摘要 */}
              <div>
                <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">执行摘要</h3>
                <p className="text-gray-700 dark:text-slate-300">{report.summary}</p>
              </div>

              {/* 亮点 */}
              {report.highlights && report.highlights.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-white">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    亮点
                  </h3>
                  <div className="space-y-3">
                    {report.highlights.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-button bg-green-50 p-4 dark:bg-green-900/20"
                      >
                        <h4 className="font-medium text-green-800 dark:text-green-300">
                          {item.title}
                        </h4>
                        <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                          {item.description}
                        </p>
                        {item.change !== undefined && (
                          <div className="mt-2 flex items-center gap-1 text-sm">
                            {item.change >= 0 ? (
                              <TrendUp className="h-4 w-4 text-green-600" />
                            ) : (
                              <TrendDown className="h-4 w-4 text-red-600" />
                            )}
                            <span className={item.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {item.change >= 0 ? '+' : ''}
                              {item.change.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 关注点 */}
              {report.concerns && report.concerns.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-white">
                    <Warning className="h-5 w-5 text-yellow-500" />
                    关注点
                  </h3>
                  <div className="space-y-3">
                    {report.concerns.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-button p-4 ${
                          item.severity === 'high'
                            ? 'bg-red-50 dark:bg-red-900/20'
                            : item.severity === 'medium'
                              ? 'bg-yellow-50 dark:bg-yellow-900/20'
                              : 'bg-gray-50 dark:bg-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <h4
                            className={`font-medium ${
                              item.severity === 'high'
                                ? 'text-red-800 dark:text-red-300'
                                : item.severity === 'medium'
                                  ? 'text-yellow-800 dark:text-yellow-300'
                                  : 'text-gray-800 dark:text-slate-200'
                            }`}
                          >
                            {item.title}
                          </h4>
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              item.severity === 'high'
                                ? 'bg-red-200 text-red-700 dark:bg-red-800/50 dark:text-red-300'
                                : item.severity === 'medium'
                                  ? 'bg-yellow-200 text-yellow-700 dark:bg-yellow-800/50 dark:text-yellow-300'
                                  : 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {item.severity === 'high'
                              ? '高'
                              : item.severity === 'medium'
                                ? '中'
                                : '低'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
                          {item.description}
                        </p>
                        {item.suggestedAction && (
                          <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                            建议: {item.suggestedAction}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-button bg-blue-50 p-4 dark:bg-blue-900/20">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {report.keyMetrics?.users?.total?.toLocaleString() || '-'}
                </div>
                <div className="text-sm text-blue-600 dark:text-blue-400">总用户</div>
              </div>
              <div className="rounded-button bg-green-50 p-4 dark:bg-green-900/20">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {report.keyMetrics?.users?.active?.toLocaleString() || '-'}
                </div>
                <div className="text-sm text-green-600 dark:text-green-400">活跃用户</div>
              </div>
              <div className="rounded-button bg-purple-50 p-4 dark:bg-purple-900/20">
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                  {report.keyMetrics?.users?.new?.toLocaleString() || '-'}
                </div>
                <div className="text-sm text-purple-600 dark:text-purple-400">新用户</div>
              </div>
              <div className="rounded-button bg-yellow-50 p-4 dark:bg-yellow-900/20">
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                  {report.keyMetrics?.learning?.totalAnswers?.toLocaleString() || '-'}
                </div>
                <div className="text-sm text-yellow-600 dark:text-yellow-400">学习记录</div>
              </div>
              <div className="rounded-button bg-pink-50 p-4 dark:bg-pink-900/20">
                <div className="text-2xl font-bold text-pink-700 dark:text-pink-300">
                  {report.keyMetrics?.learning?.totalWordsLearned?.toLocaleString() || '-'}
                </div>
                <div className="text-sm text-pink-600 dark:text-pink-400">学习单词数</div>
              </div>
              <div className="rounded-button bg-blue-50 p-4 dark:bg-blue-900/20">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {report.keyMetrics?.learning?.avgAccuracy
                    ? `${(report.keyMetrics.learning.avgAccuracy * 100).toFixed(1)}%`
                    : '-'}
                </div>
                <div className="text-sm text-blue-600 dark:text-blue-400">平均正确率</div>
              </div>
              <div className="rounded-button bg-teal-50 p-4 dark:bg-teal-900/20">
                <div className="text-2xl font-bold text-teal-700 dark:text-teal-300">
                  {report.keyMetrics?.learning?.avgResponseTime
                    ? `${(report.keyMetrics.learning.avgResponseTime / 1000).toFixed(1)}秒`
                    : '-'}
                </div>
                <div className="text-sm text-teal-600 dark:text-teal-400">平均响应时间</div>
              </div>
            </div>
          )}

          {activeTab === 'recommendations' && (
            <div className="space-y-4">
              {report.recommendations && report.recommendations.length > 0 ? (
                report.recommendations.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-button border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-700"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Lightning
                        className={`h-5 w-5 ${
                          item.priority === 'high'
                            ? 'text-red-500'
                            : item.priority === 'medium'
                              ? 'text-yellow-500'
                              : 'text-gray-500'
                        }`}
                      />
                      <h4 className="font-medium text-gray-900 dark:text-white">{item.action}</h4>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-slate-600 dark:text-slate-300">
                        {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-slate-300">{item.reason}</p>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-500 dark:text-slate-400">暂无建议</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 洞察卡片组件
 */
function InsightCard({ insight }: { insight: UserBehaviorInsight }) {
  const [expanded, setExpanded] = useState(false);

  const segmentNames: Record<string, string> = {
    new_users: '新用户',
    active_learners: '活跃学习者',
    at_risk: '流失风险用户',
    high_performers: '高绩效用户',
    struggling: '困难用户',
    casual: '休闲用户',
    all: '全部用户',
  };

  return (
    <div className="rounded-button border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-purple-500" />
          <div>
            <span className="font-medium text-gray-900 dark:text-white">
              {segmentNames[insight.userSegment] || insight.userSegment}
            </span>
            <span className="ml-2 text-sm text-gray-500 dark:text-slate-400">
              {insight.userCount} 用户 · {insight.dataPoints} 数据点
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {expanded ? <CaretUp className="h-5 w-5" /> : <CaretDown className="h-5 w-5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* 行为模式 */}
          {insight.patterns && insight.patterns.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-slate-300">
                行为模式
              </h4>
              <div className="space-y-2">
                {insight.patterns.map((pattern, idx) => (
                  <div key={idx} className="rounded bg-gray-50 p-3 dark:bg-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium dark:text-slate-200">
                        {pattern.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {(pattern.prevalence * 100).toFixed(0)}% 用户
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                      {pattern.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 洞察 */}
          {insight.insights && insight.insights.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-slate-300">
                关键洞察
              </h4>
              <div className="space-y-2">
                {insight.insights.map((item, idx) => (
                  <div key={idx} className="rounded bg-purple-50 p-3 dark:bg-purple-900/20">
                    <h5 className="text-sm font-medium text-purple-800 dark:text-purple-300">
                      {item.title}
                    </h5>
                    <p className="mt-1 text-sm text-purple-700 dark:text-purple-400">
                      {item.description}
                    </p>
                    <p className="mt-1 text-xs text-purple-600 dark:text-purple-400">
                      数据支撑: {item.dataSupport}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 建议 */}
          {insight.recommendations && insight.recommendations.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-slate-300">
                运营建议
              </h4>
              <div className="space-y-2">
                {insight.recommendations.map((rec, idx) => (
                  <div key={idx} className="rounded bg-blue-50 p-3 dark:bg-blue-900/20">
                    <h5 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      {rec.title}
                    </h5>
                    <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
                      {rec.description}
                    </p>
                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                      预期影响: {rec.expectedImpact}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 周报管理页面主组件
 */
export default function WeeklyReportPage() {
  const toast = useToast();
  const [selectedReport, setSelectedReport] = useState<WeeklyReportDetail | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<UserSegment | undefined>(undefined);

  // 数据查询
  const { data: latestReport, isLoading: loadingLatest } = useLatestWeeklyReport();
  const { data: reportsData, isLoading: loadingReports } = useWeeklyReports({ limit: 10 });
  const { data: healthTrend, isLoading: loadingTrend } = useHealthTrend(8);
  const { data: segments } = useSegments();
  const { data: insightsData, isLoading: loadingInsights } = useInsights({
    segment: selectedSegment,
    limit: 10,
  });

  // Mutations
  const generateReportMutation = useGenerateWeeklyReport();
  const generateInsightMutation = useGenerateInsight();

  // 生成周报
  const handleGenerateReport = async () => {
    try {
      await generateReportMutation.mutateAsync({ includeDetailedMetrics: true });
      toast.success('周报生成成功');
    } catch {
      toast.error('周报生成失败');
    }
  };

  // 生成洞察
  const handleGenerateInsight = async () => {
    try {
      await generateInsightMutation.mutateAsync({ segment: selectedSegment, daysToAnalyze: 7 });
      toast.success('洞察生成成功');
    } catch {
      toast.error('洞察生成失败');
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">运营周报</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            系统运行状态、健康度趋势和用户行为洞察
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleGenerateReport}
            disabled={generateReportMutation.isPending}
            className="flex items-center gap-2"
          >
            {generateReportMutation.isPending ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowsClockwise className="h-4 w-4" />
            )}
            生成周报
          </Button>
        </div>
      </div>

      {/* 最新周报摘要 */}
      <div className="rounded-card bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-white">
        {loadingLatest ? (
          <div className="flex items-center gap-2">
            <CircleNotch className="h-5 w-5 animate-spin" />
            <span>加载最新周报...</span>
          </div>
        ) : latestReport ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-6 w-6" />
                <span className="text-lg font-medium">最新周报</span>
              </div>
              <div className="text-3xl font-bold">{latestReport.healthScore.toFixed(0)}</div>
            </div>
            <p className="mb-4 text-sm text-white/90">{latestReport.summary}</p>
            <button
              onClick={() => setSelectedReport(latestReport)}
              className="flex items-center gap-1 text-sm text-white/80 hover:text-white"
            >
              <Eye className="h-4 w-4" />
              查看详情
            </button>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-white/80">暂无周报数据</p>
            <p className="mt-1 text-sm text-white/60">点击"生成周报"按钮创建第一份周报</p>
          </div>
        )}
      </div>

      {/* 健康度趋势 */}
      <div className="rounded-button border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <ChartLine className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">健康度趋势</h2>
        </div>

        {loadingTrend ? (
          <div className="flex h-32 items-center justify-center">
            <CircleNotch className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : healthTrend && healthTrend.length > 0 ? (
          <div className="flex h-32 items-end gap-2">
            {healthTrend.map((point, idx) => {
              const barHeight = Math.max(point.healthScore, 5); // 最小5%保证可见
              return (
                <div
                  key={idx}
                  className="flex h-full flex-1 flex-col items-center justify-end"
                  title={`${new Date(point.weekStart).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}: ${point.healthScore.toFixed(0)}分`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${getHealthBarBg(point.healthScore)}`}
                    style={{ height: `${barHeight}%`, minHeight: '4px' }}
                  />
                  <span className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    {new Date(point.weekStart).toLocaleDateString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-gray-500 dark:text-slate-400">
            暂无趋势数据
          </div>
        )}
      </div>

      {/* 周报历史 */}
      <div className="rounded-button border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">历史周报</h2>
          {reportsData && (
            <span className="text-sm text-gray-500 dark:text-slate-400">
              共 {reportsData.total} 份
            </span>
          )}
        </div>

        {loadingReports ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-button" />
            ))}
          </div>
        ) : reportsData?.items && reportsData.items.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reportsData.items.map((report) => (
              <ReportCard
                key={report.id}
                report={report as WeeklyReportDetail}
                onClick={() => setSelectedReport(report as WeeklyReportDetail)}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500 dark:text-slate-400">暂无周报记录</div>
        )}
      </div>

      {/* 用户行为洞察 */}
      <div className="rounded-button border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">用户行为洞察</h2>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedSegment || ''}
              onChange={(e) => setSelectedSegment((e.target.value as UserSegment) || undefined)}
              className="rounded-button border border-gray-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="">全部分群</option>
              {segments?.map((seg) => (
                <option key={seg.id} value={seg.id}>
                  {seg.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateInsight}
              disabled={generateInsightMutation.isPending}
            >
              {generateInsightMutation.isPending ? (
                <CircleNotch className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              生成洞察
            </Button>
          </div>
        </div>

        {loadingInsights ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-button" />
            ))}
          </div>
        ) : insightsData?.items && insightsData.items.length > 0 ? (
          <div className="space-y-4">
            {insightsData.items.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500 dark:text-slate-400">
            <p>暂无洞察数据</p>
            <p className="mt-1 text-sm">点击"生成洞察"按钮创建用户行为分析</p>
          </div>
        )}
      </div>

      {/* 周报详情模态框 */}
      {selectedReport && (
        <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </div>
  );
}
