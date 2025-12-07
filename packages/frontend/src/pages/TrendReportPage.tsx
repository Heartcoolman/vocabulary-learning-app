import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiClient from '../services/ApiClient';
import { handleError } from '../utils/errorHandler';
import {
  TrendReport,
  TrendInfo,
  TrendHistoryItem,
  InterventionResult,
  TrendState,
} from '../types/amas-enhanced';
import {
  ChartLine,
  TrendUp,
  TrendDown,
  Warning,
  CircleNotch,
  Lightning,
  Brain,
  Target,
  Lightbulb,
  Info,
  ArrowRight,
  Calendar,
} from '../components/Icon';
import LineChart from '../components/LineChart';

/**
 * TrendReportPage - Trend Analysis Report Page
 * Shows accuracy trend, response time trend, motivation trend, intervention suggestions
 * Requirements: 2.1, 2.3, 2.5
 */
export default function TrendReportPage() {
  const navigate = useNavigate();
  const [trendInfo, setTrendInfo] = useState<(TrendInfo & { stateDescription: string }) | null>(
    null,
  );
  const [trendReport, setTrendReport] = useState<TrendReport | null>(null);
  const [trendHistory, setTrendHistory] = useState<TrendHistoryItem[]>([]);
  const [intervention, setIntervention] = useState<InterventionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<7 | 28 | 90>(28);

  useEffect(() => {
    loadData();
  }, [selectedDays]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [infoRes, reportRes, historyRes, interventionRes] = await Promise.all([
        ApiClient.getCurrentTrend(),
        ApiClient.getTrendReport(),
        ApiClient.getTrendHistory(selectedDays),
        ApiClient.getIntervention(),
      ]);

      setTrendInfo(infoRes);
      setTrendReport(reportRes);
      setTrendHistory(historyRes.daily || []);
      setIntervention(interventionRes);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendIcon = (state: TrendState) => {
    switch (state) {
      case 'up':
        return TrendUp;
      case 'down':
        return TrendDown;
      default:
        return ChartLine;
    }
  };

  const getTrendColor = (state: TrendState) => {
    switch (state) {
      case 'up':
        return { bg: 'bg-green-100', text: 'text-green-700', icon: '#16a34a' };
      case 'down':
        return { bg: 'bg-red-100', text: 'text-red-700', icon: '#dc2626' };
      case 'stuck':
        return { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '#ca8a04' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', icon: '#6b7280' };
    }
  };

  const getTrendName = (state: TrendState) => {
    switch (state) {
      case 'up':
        return '上升';
      case 'down':
        return '下降';
      case 'stuck':
        return '停滞';
      default:
        return '稳定';
    }
  };

  const getInterventionColor = (type?: string) => {
    switch (type) {
      case 'warning':
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '#dc2626' };
      case 'suggestion':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: '#2563eb',
        };
      case 'encouragement':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: '#16a34a',
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          icon: '#6b7280',
        };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderTrendChart = (
    points: { date: string; value: number }[],
    _direction: 'up' | 'down' | 'flat',
    _color: string,
    _label: string,
    _unit: string = '%',
  ) => {
    if (!points || points.length === 0) {
      return <div className="py-8 text-center text-gray-500">暂无数据</div>;
    }

    const chartData = points.slice(-14).map((p) => ({
      date: formatDate(p.date),
      value: p.value,
    }));

    return <LineChart data={chartData} height={160} />;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600">正在分析学习趋势...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">错误</h2>
          <p className="mb-6 text-gray-600">{error}</p>
          <button
            onClick={loadData}
            className="rounded-lg bg-blue-500 px-6 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="mx-auto max-w-6xl animate-g3-fade-in px-4 py-8">
        <header className="mb-8">
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold text-gray-900">
            <ChartLine size={32} weight="duotone" color="#3b82f6" />
            趋势分析
          </h1>
          <p className="text-gray-600">追踪你的学习进度，发现改进机会</p>
        </header>

        <div className="mb-6 flex gap-2">
          {([7, 28, 90] as const).map((days) => (
            <button
              key={days}
              onClick={() => setSelectedDays(days)}
              className={`rounded-lg px-4 py-2 font-medium transition-all duration-200 ${
                selectedDays === days
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {days === 7 ? '最近 7 天' : days === 28 ? '最近 28 天' : '最近 90 天'}
            </button>
          ))}
        </div>

        {trendInfo && (
          <div
            className={`mb-8 rounded-2xl border-2 p-6 transition-all duration-300 ${getTrendColor(trendInfo.state).bg} border-${getTrendColor(trendInfo.state).text.replace('text-', '')} `}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full ${
                  trendInfo.state === 'up'
                    ? 'bg-green-500'
                    : trendInfo.state === 'down'
                      ? 'bg-red-500'
                      : trendInfo.state === 'stuck'
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                } `}
              >
                {(() => {
                  const TrendIcon = getTrendIcon(trendInfo.state);
                  return <TrendIcon size={32} weight="bold" color="#ffffff" />;
                })()}
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${getTrendColor(trendInfo.state).text}`}>
                  {getTrendName(trendInfo.state)}
                </h2>
                <p className={getTrendColor(trendInfo.state).text}>{trendInfo.stateDescription}</p>
                <p className="mt-1 text-sm text-gray-500">连续 {trendInfo.consecutiveDays} 天</p>
              </div>
            </div>
          </div>
        )}

        {intervention && intervention.needsIntervention && (
          <div
            className={`mb-8 rounded-2xl border-2 p-6 ${getInterventionColor(intervention.type).bg} ${getInterventionColor(intervention.type).border} `}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white">
                <Lightbulb
                  size={24}
                  weight="duotone"
                  color={getInterventionColor(intervention.type).icon}
                />
              </div>
              <div className="flex-1">
                <h3
                  className={`mb-2 text-lg font-bold ${getInterventionColor(intervention.type).text}`}
                >
                  {intervention.type === 'warning'
                    ? '需要注意'
                    : intervention.type === 'encouragement'
                      ? '表现出色！'
                      : '建议'}
                </h3>
                <p className={getInterventionColor(intervention.type).text}>
                  {intervention.message}
                </p>
                {intervention.actions && intervention.actions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {intervention.actions.map((action, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <ArrowRight
                          size={16}
                          color={getInterventionColor(intervention.type).icon}
                        />
                        <span className={getInterventionColor(intervention.type).text}>
                          {action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {trendReport && (
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <Target size={20} weight="duotone" color="#16a34a" />
                  准确率趋势
                </h3>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    trendReport.accuracyTrend.direction === 'up'
                      ? 'bg-green-100 text-green-700'
                      : trendReport.accuracyTrend.direction === 'down'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                  } `}
                >
                  {trendReport.accuracyTrend.direction === 'up'
                    ? '+'
                    : trendReport.accuracyTrend.direction === 'down'
                      ? ''
                      : ''}
                  {trendReport.accuracyTrend.changePercent.toFixed(1)}%
                </span>
              </div>
              {renderTrendChart(
                trendReport.accuracyTrend.points,
                trendReport.accuracyTrend.direction,
                'bg-green-500',
                'Accuracy',
                '%',
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <Lightning size={20} weight="duotone" color="#f59e0b" />
                  响应时间
                </h3>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    trendReport.responseTimeTrend.direction === 'down'
                      ? 'bg-green-100 text-green-700'
                      : trendReport.responseTimeTrend.direction === 'up'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                  } `}
                >
                  {trendReport.responseTimeTrend.direction === 'up'
                    ? '+'
                    : trendReport.responseTimeTrend.direction === 'down'
                      ? ''
                      : ''}
                  {trendReport.responseTimeTrend.changePercent.toFixed(1)}%
                </span>
              </div>
              {renderTrendChart(
                trendReport.responseTimeTrend.points,
                trendReport.responseTimeTrend.direction,
                'bg-yellow-500',
                'Response Time',
                'ms',
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <Brain size={20} weight="duotone" color="#a855f7" />
                  学习动力
                </h3>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    trendReport.motivationTrend.direction === 'up'
                      ? 'bg-green-100 text-green-700'
                      : trendReport.motivationTrend.direction === 'down'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                  } `}
                >
                  {trendReport.motivationTrend.direction === 'up'
                    ? '+'
                    : trendReport.motivationTrend.direction === 'down'
                      ? ''
                      : ''}
                  {trendReport.motivationTrend.changePercent.toFixed(1)}%
                </span>
              </div>
              {renderTrendChart(
                trendReport.motivationTrend.points,
                trendReport.motivationTrend.direction,
                'bg-purple-500',
                'Motivation',
                '',
              )}
            </div>
          </div>
        )}

        {trendReport && (
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
                <Info size={24} weight="duotone" color="#3b82f6" />
                总结
              </h3>
              <p className="leading-relaxed text-gray-700">
                {trendReport.summary || '继续学习，我们将提供更准确的分析。'}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
                <Lightbulb size={24} weight="duotone" color="#f59e0b" />
                建议
              </h3>
              {trendReport.recommendations && trendReport.recommendations.length > 0 ? (
                <ul className="space-y-3">
                  {trendReport.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                        <span className="text-xs font-bold text-blue-700">{index + 1}</span>
                      </div>
                      <span className="text-gray-700">{rec}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">暂无建议，继续保持！</p>
              )}
            </div>
          </div>
        )}

        {trendHistory.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
            <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
              <Calendar size={24} weight="duotone" color="#6b7280" />
              历史记录
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">日期</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                      趋势
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                      准确率
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                      响应时间
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                      学习动力
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trendHistory.slice(0, 10).map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-gray-100 transition-colors hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDate(item.date)}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getTrendColor(item.state).bg} ${getTrendColor(item.state).text} `}
                        >
                          {(() => {
                            const TrendIcon = getTrendIcon(item.state);
                            return <TrendIcon size={12} weight="bold" />;
                          })()}
                          {getTrendName(item.state)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        {(item.accuracy * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        {item.avgResponseTime.toFixed(0)}ms
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`text-sm font-medium ${
                            item.motivation > 0
                              ? 'text-green-600'
                              : item.motivation < 0
                                ? 'text-red-600'
                                : 'text-gray-600'
                          }`}
                        >
                          {item.motivation > 0 ? '+' : ''}
                          {(item.motivation * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {trendHistory.length > 10 && (
              <p className="mt-4 text-center text-sm text-gray-500">
                显示最近 10 条记录，共 {trendHistory.length} 条
              </p>
            )}
          </div>
        )}

        {!trendReport && !trendInfo && trendHistory.length === 0 && (
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-8 text-center">
            <ChartLine size={64} weight="duotone" color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="mb-2 text-xl font-bold text-blue-800">收集数据中</h2>
            <p className="mb-4 text-blue-600">需要更多学习数据才能生成趋势分析</p>
            <button
              onClick={() => navigate('/learning')}
              className="rounded-lg bg-blue-500 px-6 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              开始学习
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
