import { useState, useEffect, useCallback } from 'react';
import { explainabilityApi } from '../../services/explainabilityApi';
import { Brain } from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import type {
  DecisionExplanation,
  CounterfactualInput,
  CounterfactualResult,
  LearningCurveData,
  DecisionTimelineItem,
} from '../../types/explainability';

// 导入拆分后的子组件
import {
  AMASOverview,
  AMASMetrics,
  AMASVisualization,
  AMASDetailPanel,
  AMASControls,
} from './components/AMAS';

// ==================== 主页面组件 ====================

/**
 * AMAS 可解释性页面
 *
 * 深入了解 AMAS 自适应学习系统的决策过程和学习效果。
 *
 * 功能模块：
 * - 决策解释：展示系统最新的决策过程
 * - 学习曲线：追踪用户的掌握度变化趋势
 * - 决策时间线：按时间顺序展示决策记录
 * - 反事实分析：模拟不同状态下的系统响应
 */
export default function AMASExplainabilityPage() {
  const toast = useToast();

  // ==================== 状态管理 ====================

  // 决策解释状态
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  // 学习曲线状态
  const [learningCurve, setLearningCurve] = useState<LearningCurveData | null>(null);
  const [isLoadingCurve, setIsLoadingCurve] = useState(false);
  const [curveError, setCurveError] = useState<string | null>(null);
  const [curveDays, setCurveDays] = useState<number>(30);

  // 决策时间线状态
  const [timeline, setTimeline] = useState<DecisionTimelineItem[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(true);

  // 反事实分析状态
  const [counterfactualResult, setCounterfactualResult] = useState<CounterfactualResult | null>(
    null,
  );
  const [isLoadingCounterfactual, setIsLoadingCounterfactual] = useState(false);
  const [counterfactualError, setCounterfactualError] = useState<string | null>(null);

  // ==================== 数据加载函数 ====================

  /**
   * 加载决策解释
   */
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

  /**
   * 加载学习曲线
   */
  const loadLearningCurve = useCallback(
    async (days: number = curveDays) => {
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
    },
    [curveDays, toast],
  );

  /**
   * 加载决策时间线
   */
  const loadTimeline = useCallback(
    async (reset: boolean = false) => {
      try {
        setIsLoadingTimeline(true);
        setTimelineError(null);

        const cursor = reset ? undefined : (timelineCursor ?? undefined);
        const data = await explainabilityApi.getDecisionTimeline(20, cursor);

        if (reset) {
          setTimeline(data.items);
        } else {
          setTimeline((prev) => [...prev, ...data.items]);
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
    },
    [timelineCursor, toast],
  );

  /**
   * 运行反事实分析
   */
  const runCounterfactual = useCallback(
    async (input: CounterfactualInput) => {
      try {
        setIsLoadingCounterfactual(true);
        setCounterfactualError(null);
        const result = await explainabilityApi.runCounterfactual(input);

        // 处理没有决策记录的情况
        if (!result) {
          setCounterfactualResult(null);
          setCounterfactualError('暂无决策记录，请先进行一些学习后再运行反事实分析');
          return;
        }

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
    },
    [toast],
  );

  // ==================== 事件处理函数 ====================

  /**
   * 处理天数变化
   */
  const handleDaysChange = useCallback(
    (days: number) => {
      setCurveDays(days);
      loadLearningCurve(days);
    },
    [loadLearningCurve],
  );

  /**
   * 刷新学习曲线
   */
  const handleRefreshCurve = useCallback(() => {
    loadLearningCurve();
  }, [loadLearningCurve]);

  /**
   * 刷新时间线
   */
  const handleRefreshTimeline = useCallback(() => {
    loadTimeline(true);
  }, [loadTimeline]);

  /**
   * 加载更多时间线
   */
  const handleLoadMoreTimeline = useCallback(() => {
    loadTimeline(false);
  }, [loadTimeline]);

  // ==================== 生命周期 ====================

  /**
   * 初始加载数据
   */
  useEffect(() => {
    loadExplanation();
    loadLearningCurve();
    loadTimeline(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================== 渲染 ====================

  return (
    <div className="animate-g3-fade-in p-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Brain size={36} weight="duotone" className="text-purple-500" />
          AMAS 可解释性
        </h1>
        <p className="text-gray-600">深入了解 AMAS 自适应学习系统的决策过程和学习效果</p>
      </div>

      {/* 主要内容区域 */}
      <div className="space-y-8">
        {/* 第一行：决策解释和反事实分析 */}
        <div className="grid gap-8 lg:grid-cols-2">
          <AMASOverview
            explanation={explanation}
            isLoading={isLoadingExplanation}
            error={explanationError}
            onRefresh={loadExplanation}
          />

          <AMASDetailPanel
            result={counterfactualResult}
            isLoading={isLoadingCounterfactual}
            error={counterfactualError}
            onSubmit={runCounterfactual}
          />
        </div>

        {/* 第二行：学习曲线 */}
        <AMASMetrics
          data={learningCurve}
          isLoading={isLoadingCurve}
          error={curveError}
          onRefresh={handleRefreshCurve}
          days={curveDays}
          onDaysChange={handleDaysChange}
        />

        {/* 第三行：决策时间线 */}
        <AMASVisualization
          data={timeline}
          isLoading={isLoadingTimeline}
          error={timelineError}
          onRefresh={handleRefreshTimeline}
          onLoadMore={handleLoadMoreTimeline}
          hasMore={hasMoreTimeline}
        />
      </div>

      {/* 说明信息 */}
      <AMASControls className="mt-8" />
    </div>
  );
}
