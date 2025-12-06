import { useState, useEffect, useCallback } from 'react';
import { explainabilityApi } from '../../services/explainabilityApi';
import {
  CircleNotch,
  Warning,
  CheckCircle,
  Brain,
  Lightbulb,
  ArrowClockwise,
  Clock,
  TrendUp,
  TrendDown,
  Minus,
  Info,
  Lightning,
  Target,
  ChartLine,
  Question
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import type {
  DecisionExplanation,
  CounterfactualInput,
  CounterfactualResult,
  LearningCurveData,
  DecisionTimelineItem
} from '../../types/explainability';

// ==================== 子组件 ====================

/**
 * 决策解释卡片组件
 */
function DecisionExplanationCard({
  explanation,
  isLoading,
  error,
  onRefresh
}: {
  explanation: DecisionExplanation | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const getStateColor = (value: number | undefined) => {
    if (value === undefined) return 'text-gray-500';
    if (value >= 0.7) return 'text-green-600';
    if (value >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStateLabel = (value: number | undefined) => {
    if (value === undefined) return '未知';
    if (value >= 0.7) return '良好';
    if (value >= 0.4) return '一般';
    return '较低';
  };

  return (
    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Brain size={24} weight="duotone" className="text-purple-500" />
          决策解释
        </h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
          title="刷新"
        >
          <ArrowClockwise size={20} weight="bold" className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-gray-500">
          <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      ) : explanation ? (
        <div className="space-y-6">
          {/* 决策 ID 和时间 */}
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Info size={16} />
              ID: {explanation.decisionId.slice(0, 8)}...
            </span>
            <span className="flex items-center gap-1">
              <Clock size={16} />
              {new Date(explanation.timestamp).toLocaleString('zh-CN')}
            </span>
          </div>

          {/* 推理说明 */}
          {explanation.reasoning && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm text-blue-800">
                <strong>推理说明：</strong> {explanation.reasoning}
              </p>
            </div>
          )}

          {/* 学习状态 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">学习状态</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">注意力</p>
                <div className="flex items-center justify-between">
                  <p className={`text-xl font-bold ${getStateColor(explanation.state.attention)}`}>
                    {explanation.state.attention !== undefined
                      ? `${(explanation.state.attention * 100).toFixed(0)}%`
                      : '-'}
                  </p>
                  <span className={`text-xs px-2 py-1 rounded ${getStateColor(explanation.state.attention)} bg-opacity-10`}>
                    {getStateLabel(explanation.state.attention)}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">疲劳度</p>
                <div className="flex items-center justify-between">
                  <p className={`text-xl font-bold ${getStateColor(explanation.state.fatigue !== undefined ? 1 - explanation.state.fatigue : undefined)}`}>
                    {explanation.state.fatigue !== undefined
                      ? `${(explanation.state.fatigue * 100).toFixed(0)}%`
                      : '-'}
                  </p>
                  <span className={`text-xs px-2 py-1 rounded ${getStateColor(explanation.state.fatigue !== undefined ? 1 - explanation.state.fatigue : undefined)} bg-opacity-10`}>
                    {explanation.state.fatigue !== undefined
                      ? (explanation.state.fatigue <= 0.3 ? '良好' : explanation.state.fatigue <= 0.6 ? '一般' : '较高')
                      : '未知'}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">动机</p>
                <div className="flex items-center justify-between">
                  <p className={`text-xl font-bold ${getStateColor(explanation.state.motivation)}`}>
                    {explanation.state.motivation !== undefined
                      ? `${(explanation.state.motivation * 100).toFixed(0)}%`
                      : '-'}
                  </p>
                  <span className={`text-xs px-2 py-1 rounded ${getStateColor(explanation.state.motivation)} bg-opacity-10`}>
                    {getStateLabel(explanation.state.motivation)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 难度因素 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">难度因素</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(explanation.difficultyFactors).map(([key, value]) => (
                <div key={key} className="p-3 bg-purple-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-600 capitalize">
                      {key === 'length' ? '长度' :
                        key === 'accuracy' ? '准确率' :
                        key === 'frequency' ? '频率' :
                        key === 'forgetting' ? '遗忘率' : key}
                    </p>
                    <p className="text-sm font-bold text-gray-900">{value.toFixed(2)}</p>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, value * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 算法权重 */}
          {explanation.weights && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">算法权重</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(explanation.weights).map(([algo, weight]) => (
                  <div
                    key={algo}
                    className="px-3 py-2 bg-indigo-50 rounded-lg flex items-center gap-2"
                  >
                    <span className="text-sm font-medium text-indigo-700 capitalize">{algo}</span>
                    <span className="text-sm font-bold text-indigo-900">
                      {((weight as number) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 决策因素详情 */}
          {explanation.factors && explanation.factors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">决策因素</h3>
              <div className="space-y-2">
                {explanation.factors.map((factor, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-800">{factor.name}</span>
                      <span className="text-sm text-gray-600">
                        权重: {(factor.weight * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{factor.explanation}</p>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{ width: `${factor.score * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 触发器 */}
          {explanation.triggers && explanation.triggers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">触发器</h3>
              <div className="flex flex-wrap gap-2">
                {explanation.triggers.map((trigger, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm"
                  >
                    {trigger}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          暂无决策解释数据
        </div>
      )}
    </div>
  );
}

/**
 * 学习曲线图表组件
 */
function LearningCurveChart({
  data,
  isLoading,
  error,
  onRefresh,
  days,
  onDaysChange
}: {
  data: LearningCurveData | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendUp size={20} weight="bold" className="text-green-500" />;
      case 'down':
        return <TrendDown size={20} weight="bold" className="text-red-500" />;
      default:
        return <Minus size={20} weight="bold" className="text-gray-500" />;
    }
  };

  const getTrendLabel = (trend: string) => {
    switch (trend) {
      case 'up':
        return '上升趋势';
      case 'down':
        return '下降趋势';
      default:
        return '平稳';
    }
  };

  return (
    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ChartLine size={24} weight="duotone" className="text-blue-500" />
          学习曲线
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => onDaysChange(Number(e.target.value))}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>最近 7 天</option>
            <option value={14}>最近 14 天</option>
            <option value={30}>最近 30 天</option>
            <option value={60}>最近 60 天</option>
          </select>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
            title="刷新"
          >
            <ArrowClockwise size={20} weight="bold" className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-gray-500">
          <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* 统计摘要 */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">当前掌握度</p>
              <p className="text-3xl font-bold text-blue-600">
                {(data.currentMastery * 100).toFixed(1)}%
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">平均注意力</p>
              <p className="text-3xl font-bold text-green-600">
                {(data.averageAttention * 100).toFixed(1)}%
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">趋势</p>
                <p className="text-lg font-bold text-purple-600">{getTrendLabel(data.trend)}</p>
              </div>
              {getTrendIcon(data.trend)}
            </div>
          </div>

          {/* 简易图表 - 使用 CSS 实现的条形图 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">掌握度变化</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.points.map((point, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 shrink-0">
                    {new Date(point.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300"
                      style={{ width: `${(point.mastery ?? point.masteredCount ?? 0) * 100}%` }}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-700">
                      {((point.mastery ?? point.masteredCount ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 状态趋势 */}
          {data.points.length > 0 && data.points[0].attention !== undefined && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">状态趋势</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-2">注意力趋势</p>
                  <div className="flex items-end gap-1 h-16">
                    {data.points.slice(-10).map((point, idx) => (
                      <div
                        key={idx}
                        className="flex-1 bg-green-400 rounded-t transition-all duration-300"
                        style={{ height: `${(point.attention ?? 0) * 100}%` }}
                        title={`${((point.attention ?? 0) * 100).toFixed(0)}%`}
                      />
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-2">疲劳度趋势</p>
                  <div className="flex items-end gap-1 h-16">
                    {data.points.slice(-10).map((point, idx) => (
                      <div
                        key={idx}
                        className="flex-1 bg-red-400 rounded-t transition-all duration-300"
                        style={{ height: `${(point.fatigue ?? 0) * 100}%` }}
                        title={`${((point.fatigue ?? 0) * 100).toFixed(0)}%`}
                      />
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-2">动机趋势</p>
                  <div className="flex items-end gap-1 h-16">
                    {data.points.slice(-10).map((point, idx) => (
                      <div
                        key={idx}
                        className="flex-1 bg-purple-400 rounded-t transition-all duration-300"
                        style={{ height: `${(point.motivation ?? 0) * 100}%` }}
                        title={`${((point.motivation ?? 0) * 100).toFixed(0)}%`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          暂无学习曲线数据
        </div>
      )}
    </div>
  );
}

/**
 * 决策时间线组件
 */
function DecisionTimeline({
  data,
  isLoading,
  error,
  onRefresh,
  onLoadMore,
  hasMore
}: {
  data: DecisionTimelineItem[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Clock size={24} weight="duotone" className="text-orange-500" />
          决策时间线
        </h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
          title="刷新"
        >
          <ArrowClockwise size={20} weight="bold" className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading && data.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-gray-500">
          <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      ) : data.length > 0 ? (
        <div className="space-y-4">
          <div className="relative">
            {/* 时间线竖线 */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

            {/* 时间线项目 */}
            <div className="space-y-4">
              {data.map((item) => (
                <div key={item.answerId} className="relative pl-10">
                  {/* 时间线节点 */}
                  <div className={`absolute left-2 top-3 w-4 h-4 rounded-full border-2 border-white ${getConfidenceColor(item.decision.confidence)}`} />

                  <div className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        单词 ID: {item.wordId.slice(0, 8)}...
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(item.timestamp).toLocaleString('zh-CN')}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Target size={14} className="text-blue-500" />
                        <span className="text-gray-600">置信度:</span>
                        <span className={`font-medium ${item.decision.confidence >= 0.8 ? 'text-green-600' : item.decision.confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {(item.decision.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Lightning size={14} className="text-purple-500" />
                        <span className="text-gray-600">决策 ID:</span>
                        <span className="font-mono text-xs text-gray-500">
                          {item.decision.decisionId.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 加载更多按钮 */}
          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="w-full py-3 text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <CircleNotch className="animate-spin" size={18} weight="bold" />
                  加载中...
                </>
              ) : (
                '加载更多'
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          暂无决策时间线数据
        </div>
      )}
    </div>
  );
}

/**
 * 反事实分析组件
 */
function CounterfactualAnalysis({
  result,
  isLoading,
  error,
  onSubmit
}: {
  result: CounterfactualResult | null;
  isLoading: boolean;
  error: string | null;
  onSubmit: (input: CounterfactualInput) => void;
}) {
  const [attention, setAttention] = useState<string>('0.7');
  const [fatigue, setFatigue] = useState<string>('0.3');
  const [motivation, setMotivation] = useState<string>('0.8');
  const [recentAccuracy, setRecentAccuracy] = useState<string>('0.75');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const input: CounterfactualInput = {
      overrides: {
        attention: parseFloat(attention),
        fatigue: parseFloat(fatigue),
        motivation: parseFloat(motivation),
        recentAccuracy: parseFloat(recentAccuracy)
      }
    };

    onSubmit(input);
  };

  return (
    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Question size={24} weight="duotone" className="text-teal-500" />
          反事实分析
        </h2>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        探索"如果...会怎样"的场景。调整学习状态参数，查看系统预测的结果变化。
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 输入表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              注意力 (0-1)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={attention}
              onChange={(e) => setAttention(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>低</span>
              <span className="font-medium text-gray-700">{attention}</span>
              <span>高</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              疲劳度 (0-1)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={fatigue}
              onChange={(e) => setFatigue(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>低</span>
              <span className="font-medium text-gray-700">{fatigue}</span>
              <span>高</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              动机 (0-1)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>低</span>
              <span className="font-medium text-gray-700">{motivation}</span>
              <span>高</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              近期准确率 (0-1)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={recentAccuracy}
              onChange={(e) => setRecentAccuracy(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>低</span>
              <span className="font-medium text-gray-700">{recentAccuracy}</span>
              <span>高</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 font-medium"
          >
            {isLoading ? (
              <>
                <CircleNotch className="animate-spin" size={18} weight="bold" />
                分析中...
              </>
            ) : (
              <>
                <Lightbulb size={18} weight="bold" />
                运行反事实分析
              </>
            )}
          </button>
        </form>

        {/* 结果展示 */}
        <div className="space-y-4">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* 预测结果 */}
              <div className={`p-4 rounded-lg border ${
                result.prediction.wouldTriggerAdjustment
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.prediction.wouldTriggerAdjustment ? (
                    <Warning size={20} weight="bold" className="text-yellow-600" />
                  ) : (
                    <CheckCircle size={20} weight="bold" className="text-green-600" />
                  )}
                  <span className={`font-medium ${
                    result.prediction.wouldTriggerAdjustment ? 'text-yellow-700' : 'text-green-700'
                  }`}>
                    {result.prediction.wouldTriggerAdjustment
                      ? '会触发难度调整'
                      : '不会触发难度调整'}
                  </span>
                </div>

                {result.prediction.suggestedDifficulty && (
                  <p className="text-sm text-gray-600">
                    建议难度调整: <span className="font-medium">
                      {result.prediction.suggestedDifficulty === 'easier' ? '降低难度' : '提高难度'}
                    </span>
                  </p>
                )}

                <p className="text-sm text-gray-600 mt-1">
                  预估准确率变化: <span className={`font-medium ${
                    result.prediction.estimatedAccuracyChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {result.prediction.estimatedAccuracyChange >= 0 ? '+' : ''}
                    {(result.prediction.estimatedAccuracyChange * 100).toFixed(1)}%
                  </span>
                </p>
              </div>

              {/* 状态对比 */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">状态对比</h4>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">注意力</span>
                    <span>
                      {result.baseState.attention !== undefined
                        ? `${(result.baseState.attention * 100).toFixed(0)}%`
                        : '-'}
                      {' '}&rarr;{' '}
                      <span className="font-medium">
                        {result.counterfactualState.attention !== undefined
                          ? `${(result.counterfactualState.attention * 100).toFixed(0)}%`
                          : '-'}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">疲劳度</span>
                    <span>
                      {result.baseState.fatigue !== undefined
                        ? `${(result.baseState.fatigue * 100).toFixed(0)}%`
                        : '-'}
                      {' '}&rarr;{' '}
                      <span className="font-medium">
                        {result.counterfactualState.fatigue !== undefined
                          ? `${(result.counterfactualState.fatigue * 100).toFixed(0)}%`
                          : '-'}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">动机</span>
                    <span>
                      {result.baseState.motivation !== undefined
                        ? `${(result.baseState.motivation * 100).toFixed(0)}%`
                        : '-'}
                      {' '}&rarr;{' '}
                      <span className="font-medium">
                        {result.counterfactualState.motivation !== undefined
                          ? `${(result.counterfactualState.motivation * 100).toFixed(0)}%`
                          : '-'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 解释说明 */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-800">
                  <strong>分析说明：</strong> {result.explanation}
                </p>
              </div>
            </div>
          )}

          {!result && !error && (
            <div className="flex items-center justify-center h-full min-h-[200px] text-gray-400">
              <div className="text-center">
                <Lightbulb size={48} weight="duotone" className="mx-auto mb-2" />
                <p>调整参数并运行分析</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 主页面组件 ====================

export default function AMASExplainabilityPage() {
  const toast = useToast();

  // 决策解释
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  // 学习曲线
  const [learningCurve, setLearningCurve] = useState<LearningCurveData | null>(null);
  const [isLoadingCurve, setIsLoadingCurve] = useState(false);
  const [curveError, setCurveError] = useState<string | null>(null);
  const [curveDays, setCurveDays] = useState<number>(30);

  // 决策时间线
  const [timeline, setTimeline] = useState<DecisionTimelineItem[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(true);

  // 反事实分析
  const [counterfactualResult, setCounterfactualResult] = useState<CounterfactualResult | null>(null);
  const [isLoadingCounterfactual, setIsLoadingCounterfactual] = useState(false);
  const [counterfactualError, setCounterfactualError] = useState<string | null>(null);

  // 加载决策解释
  const loadExplanation = useCallback(async () => {
    try {
      setIsLoadingExplanation(true);
      setExplanationError(null);
      const data = await explainabilityApi.getDecisionExplanation();
      setExplanation(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      adminLogger.error({ err }, '加载决策解释失败');
      setExplanationError(message);
      toast.error('加载决策解释失败');
    } finally {
      setIsLoadingExplanation(false);
    }
  }, [toast]);

  // 加载学习曲线
  const loadLearningCurve = useCallback(async (days: number = curveDays) => {
    try {
      setIsLoadingCurve(true);
      setCurveError(null);
      const data = await explainabilityApi.getLearningCurve(days);
      setLearningCurve(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      adminLogger.error({ err }, '加载学习曲线失败');
      setCurveError(message);
      toast.error('加载学习曲线失败');
    } finally {
      setIsLoadingCurve(false);
    }
  }, [curveDays, toast]);

  // 加载决策时间线
  const loadTimeline = useCallback(async (reset: boolean = false) => {
    try {
      setIsLoadingTimeline(true);
      setTimelineError(null);

      const cursor = reset ? undefined : timelineCursor ?? undefined;
      const data = await explainabilityApi.getDecisionTimeline(20, cursor);

      if (reset) {
        setTimeline(data.items);
      } else {
        setTimeline(prev => [...prev, ...data.items]);
      }

      setTimelineCursor(data.nextCursor);
      setHasMoreTimeline(data.nextCursor !== null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      adminLogger.error({ err }, '加载决策时间线失败');
      setTimelineError(message);
      toast.error('加载决策时间线失败');
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [timelineCursor, toast]);

  // 运行反事实分析
  const runCounterfactual = useCallback(async (input: CounterfactualInput) => {
    try {
      setIsLoadingCounterfactual(true);
      setCounterfactualError(null);
      const result = await explainabilityApi.runCounterfactual(input);
      setCounterfactualResult(result);
      toast.success('反事实分析完成');
    } catch (err) {
      const message = err instanceof Error ? err.message : '分析失败';
      adminLogger.error({ err }, '反事实分析失败');
      setCounterfactualError(message);
      toast.error('反事实分析失败');
    } finally {
      setIsLoadingCounterfactual(false);
    }
  }, [toast]);

  // 初始加载
  useEffect(() => {
    loadExplanation();
    loadLearningCurve();
    loadTimeline(true);
  }, []);

  // 天数变化时重新加载学习曲线
  const handleDaysChange = (days: number) => {
    setCurveDays(days);
    loadLearningCurve(days);
  };

  return (
    <div className="p-8 animate-g3-fade-in">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Brain size={36} weight="duotone" className="text-purple-500" />
          AMAS 可解释性
        </h1>
        <p className="text-gray-600">
          深入了解 AMAS 自适应学习系统的决策过程和学习效果
        </p>
      </div>

      {/* 主要内容区域 */}
      <div className="space-y-8">
        {/* 第一行：决策解释和反事实分析 */}
        <div className="grid gap-8 lg:grid-cols-2">
          <DecisionExplanationCard
            explanation={explanation}
            isLoading={isLoadingExplanation}
            error={explanationError}
            onRefresh={loadExplanation}
          />

          <CounterfactualAnalysis
            result={counterfactualResult}
            isLoading={isLoadingCounterfactual}
            error={counterfactualError}
            onSubmit={runCounterfactual}
          />
        </div>

        {/* 第二行：学习曲线 */}
        <LearningCurveChart
          data={learningCurve}
          isLoading={isLoadingCurve}
          error={curveError}
          onRefresh={() => loadLearningCurve()}
          days={curveDays}
          onDaysChange={handleDaysChange}
        />

        {/* 第三行：决策时间线 */}
        <DecisionTimeline
          data={timeline}
          isLoading={isLoadingTimeline}
          error={timelineError}
          onRefresh={() => loadTimeline(true)}
          onLoadMore={() => loadTimeline(false)}
          hasMore={hasMoreTimeline}
        />
      </div>

      {/* 说明信息 */}
      <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-xl">
        <h3 className="text-lg font-semibold text-purple-900 mb-3">AMAS 可解释性说明</h3>
        <ul className="space-y-2 text-sm text-purple-800">
          <li>
            <strong>决策解释：</strong>展示系统最新的决策过程，包括学习状态、难度因素和算法权重
          </li>
          <li>
            <strong>学习曲线：</strong>追踪用户的掌握度变化趋势，帮助了解学习进度
          </li>
          <li>
            <strong>决策时间线：</strong>按时间顺序展示系统的所有决策记录
          </li>
          <li>
            <strong>反事实分析：</strong>模拟不同学习状态下系统的响应，探索"如果...会怎样"的场景
          </li>
        </ul>
      </div>
    </div>
  );
}
