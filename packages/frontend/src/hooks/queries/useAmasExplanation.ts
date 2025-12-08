import { useQuery, useMutation } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import ApiClient from '../../services/client';
import type {
  DecisionExplanation,
  CounterfactualInput,
  CounterfactualResult,
  LearningCurveData,
  DecisionTimelineResponse,
} from '../../types/explainability';

/**
 * 获取AMAS决策解释的Query Hook
 *
 * 用于展示算法决策的原因和影响因素
 *
 * @param decisionId - 决策ID，不传则使用最近一次决策
 * @param options - 查询配置选项
 *
 * @example
 * ```tsx
 * const { data: explanation } = useAmasDecisionExplanation('decision-123');
 * ```
 */
export function useAmasDecisionExplanation(
  decisionId?: string,
  options?: {
    enabled?: boolean;
  },
) {
  return useQuery({
    queryKey: queryKeys.amas.explanation(decisionId),
    queryFn: async () => {
      return await ApiClient.getAmasDecisionExplanation(decisionId);
    },
    // 决策解释是历史数据，可以缓存较长时间
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 30 * 60 * 1000, // 30分钟
    enabled: options?.enabled ?? true,
    retry: 1,
  });
}

/**
 * 获取学习曲线数据的Query Hook
 *
 * 展示用户的学习进度和状态变化趋势
 *
 * @param days - 查询天数，默认30天
 *
 * @example
 * ```tsx
 * const { data: curve } = useAmasLearningCurve(30);
 * ```
 */
export function useAmasLearningCurve(days: number = 30) {
  return useQuery({
    queryKey: queryKeys.amas.learningCurve(days),
    queryFn: async () => {
      return await ApiClient.getAmasLearningCurve(days);
    },
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 30 * 60 * 1000, // 30分钟
    retry: 1,
  });
}

/**
 * 获取决策时间线的Query Hook
 *
 * 展示历史决策记录和详情
 *
 * @param limit - 返回数量限制
 * @param cursor - 分页游标
 *
 * @example
 * ```tsx
 * const { data: timeline } = useDecisionTimeline(50);
 * ```
 */
export function useDecisionTimeline(limit: number = 50, cursor?: string) {
  return useQuery({
    queryKey: queryKeys.amas.decisionTimeline(limit, cursor),
    queryFn: async () => {
      return await ApiClient.getDecisionTimeline(limit, cursor);
    },
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 30 * 60 * 1000, // 30分钟
    retry: 1,
  });
}

/**
 * 运行反事实分析的Mutation Hook
 *
 * 用于"如果...会怎样"的场景分析
 *
 * @example
 * ```tsx
 * const { mutate: runAnalysis, isPending } = useCounterfactualAnalysis();
 *
 * runAnalysis({
 *   decisionId: 'decision-123',
 *   overrides: {
 *     fatigue: 0.8,
 *     attention: 0.3,
 *   }
 * });
 * ```
 */
export function useCounterfactualAnalysis() {
  return useMutation({
    mutationFn: async (input: CounterfactualInput) => {
      return await ApiClient.runCounterfactualAnalysis(input);
    },
  });
}

/**
 * 组合Hook：完整的决策解释功能
 *
 * 同时提供决策解释和反事实分析功能
 *
 * @param decisionId - 决策ID
 *
 * @example
 * ```tsx
 * const {
 *   explanation,
 *   isLoading,
 *   runCounterfactual,
 *   counterfactualResult
 * } = useFullExplanation('decision-123');
 *
 * // 查看原始解释
 * console.log(explanation);
 *
 * // 运行反事实分析
 * runCounterfactual({ overrides: { fatigue: 0.8 } });
 * ```
 */
export function useFullExplanation(decisionId?: string) {
  const {
    data: explanation,
    isLoading: isLoadingExplanation,
    error: explanationError,
  } = useAmasDecisionExplanation(decisionId);

  const {
    mutate: runCounterfactual,
    data: counterfactualResult,
    isPending: isRunningCounterfactual,
    error: counterfactualError,
  } = useCounterfactualAnalysis();

  return {
    explanation,
    isLoading: isLoadingExplanation,
    error: explanationError,
    runCounterfactual,
    counterfactualResult,
    isRunningCounterfactual,
    counterfactualError,
  };
}
