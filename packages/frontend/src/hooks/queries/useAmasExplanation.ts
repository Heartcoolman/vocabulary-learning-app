import { useQuery, useMutation } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_PRESETS } from '../../lib/cacheConfig';
import { apiClient } from '../../services/client';
import type { CounterfactualInput } from '../../types/explainability';

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
      return await apiClient.getAmasDecisionExplanation(decisionId);
    },
    // 决策解释是历史数据，可以缓存较长时间
    ...QUERY_PRESETS.standard,
    enabled: options?.enabled ?? true,
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
      return await apiClient.getAmasLearningCurve(days);
    },
    ...QUERY_PRESETS.standard,
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
      return await apiClient.getDecisionTimeline(limit, cursor);
    },
    ...QUERY_PRESETS.standard,
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
      return await apiClient.runCounterfactualAnalysis(input);
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
