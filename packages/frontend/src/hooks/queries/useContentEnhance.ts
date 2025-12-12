/**
 * useContentEnhance - 内容增强相关 Hooks
 *
 * 封装 ContentEnhanceClient 中的方法，提供 React Query 集成
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentEnhanceClient } from '../../services/client';
import type { CheckType, IssueSeverity, EnhanceType } from '../../services/client';

// ==================== Query Keys ====================

export const contentEnhanceKeys = {
  all: ['contentEnhance'] as const,
  qualityChecks: (wordBookId: string) =>
    [...contentEnhanceKeys.all, 'qualityChecks', wordBookId] as const,
  checkDetail: (checkId: string) => [...contentEnhanceKeys.all, 'checkDetail', checkId] as const,
  openIssues: (wordBookId: string) =>
    [...contentEnhanceKeys.all, 'openIssues', wordBookId] as const,
  qualityStats: (wordBookId: string) =>
    [...contentEnhanceKeys.all, 'qualityStats', wordBookId] as const,
  pendingVariants: () => [...contentEnhanceKeys.all, 'pendingVariants'] as const,
  enhanceTaskHistory: () => [...contentEnhanceKeys.all, 'enhanceTaskHistory'] as const,
};

// ==================== 词库质量检查 Hooks ====================

/**
 * 获取词库质量检查历史
 */
export function useQualityCheckHistory(
  wordBookId: string,
  options?: { limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: [...contentEnhanceKeys.qualityChecks(wordBookId), options],
    queryFn: () => contentEnhanceClient.getCheckHistory(wordBookId, options),
    enabled: !!wordBookId,
    staleTime: 60 * 1000,
  });
}

/**
 * 获取质量检查详情
 */
export function useQualityCheckDetail(checkId: string) {
  return useQuery({
    queryKey: contentEnhanceKeys.checkDetail(checkId),
    queryFn: () => contentEnhanceClient.getCheckDetail(checkId),
    enabled: !!checkId,
    staleTime: 30 * 1000,
  });
}

/**
 * 获取未解决的问题列表
 */
export function useOpenIssues(
  wordBookId: string,
  options?: { severity?: IssueSeverity; limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: [...contentEnhanceKeys.openIssues(wordBookId), options],
    queryFn: () => contentEnhanceClient.getOpenIssues(wordBookId, options),
    enabled: !!wordBookId,
    staleTime: 30 * 1000,
  });
}

/**
 * 获取词库质量统计
 */
export function useQualityStats(wordBookId: string) {
  return useQuery({
    queryKey: contentEnhanceKeys.qualityStats(wordBookId),
    queryFn: () => contentEnhanceClient.getQualityStats(wordBookId),
    enabled: !!wordBookId,
    staleTime: 60 * 1000,
  });
}

/**
 * 启动质量检查 mutation
 */
export function useStartQualityCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      wordBookId,
      options,
    }: {
      wordBookId: string;
      options?: { checkType?: CheckType; batchSize?: number; maxIssues?: number };
    }) => contentEnhanceClient.startQualityCheck(wordBookId, options),
    onSuccess: (_, variables) => {
      // 刷新相关查询
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.qualityChecks(variables.wordBookId),
      });
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.qualityStats(variables.wordBookId),
      });
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.openIssues(variables.wordBookId),
      });
    },
  });
}

/**
 * 标记问题已修复 mutation
 */
export function useMarkIssueFix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (issueId: string) => contentEnhanceClient.markIssueFix(issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.all,
      });
    },
  });
}

/**
 * 忽略问题 mutation
 */
export function useIgnoreIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (issueId: string) => contentEnhanceClient.ignoreIssue(issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.all,
      });
    },
  });
}

/**
 * 批量应用修复 mutation
 */
export function useBatchApplyFixes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (issueIds: string[]) => contentEnhanceClient.batchApplyFixes(issueIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.all,
      });
    },
  });
}

// ==================== 内容增强 Hooks ====================

/**
 * 获取待审核的内容变体
 */
export function usePendingVariants(options?: {
  wordBookId?: string;
  field?: EnhanceType;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: [...contentEnhanceKeys.pendingVariants(), options],
    queryFn: () => contentEnhanceClient.getPendingVariants(options),
    staleTime: 30 * 1000,
  });
}

/**
 * 获取增强任务历史
 */
export function useEnhanceTaskHistory(options?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: [...contentEnhanceKeys.enhanceTaskHistory(), options],
    queryFn: () => contentEnhanceClient.getEnhanceTaskHistory(options),
    staleTime: 60 * 1000,
  });
}

/**
 * 批量内容增强 mutation
 */
export function useEnhanceWords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      wordBookId,
      options,
    }: {
      wordBookId: string;
      options: {
        enhanceType: EnhanceType;
        batchSize?: number;
        maxWords?: number;
        overwrite?: boolean;
      };
    }) => contentEnhanceClient.enhanceWords(wordBookId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.pendingVariants(),
      });
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.enhanceTaskHistory(),
      });
    },
  });
}

/**
 * 预览单词增强 mutation
 */
export function usePreviewEnhance() {
  return useMutation({
    mutationFn: ({ wordId, enhanceType }: { wordId: string; enhanceType: EnhanceType }) =>
      contentEnhanceClient.previewEnhance(wordId, enhanceType),
  });
}

/**
 * 审批内容变体 mutation
 */
export function useApproveVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      variantId,
      applyToWord = false,
    }: {
      variantId: string;
      applyToWord?: boolean;
    }) => contentEnhanceClient.approveVariant(variantId, applyToWord),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.pendingVariants(),
      });
    },
  });
}

/**
 * 拒绝内容变体 mutation
 */
export function useRejectVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variantId: string) => contentEnhanceClient.rejectVariant(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.pendingVariants(),
      });
    },
  });
}

/**
 * 批量审批内容变体 mutation
 */
export function useBatchApproveVariants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      variantIds,
      applyToWord = false,
    }: {
      variantIds: string[];
      applyToWord?: boolean;
    }) => contentEnhanceClient.batchApproveVariants(variantIds, applyToWord),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contentEnhanceKeys.pendingVariants(),
      });
    },
  });
}
