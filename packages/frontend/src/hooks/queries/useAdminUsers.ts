import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { apiClient, type AdminUsersResponse, type UserOverview } from '../../services/client';

/**
 * 管理员用户列表查询参数
 */
export interface AdminUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'createdAt' | 'username' | 'email' | 'totalWordsLearned' | 'averageScore';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 获取管理员用户列表的 Query Hook
 * 支持分页、搜索和排序
 */
export function useAdminUsers(params: AdminUsersParams = {}) {
  const { page = 1, pageSize = 20, search, sortBy, sortOrder } = params;

  return useQuery({
    queryKey: queryKeys.admin.users.list({ page, pageSize, search, sortBy, sortOrder }),
    queryFn: async () => {
      const response = await apiClient.adminGetUsers({
        page,
        pageSize,
        search: search || undefined,
      });

      // 客户端排序（如果后端不支持）
      let users = response.users;
      if (sortBy) {
        users = [...users].sort((a, b) => {
          const aValue = a[sortBy];
          const bValue = b[sortBy];

          if (typeof aValue === 'string' && typeof bValue === 'string') {
            const comparison = aValue.localeCompare(bValue);
            return sortOrder === 'desc' ? -comparison : comparison;
          }

          if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
          }

          return 0;
        });
      }

      return {
        ...response,
        users,
      };
    },
    // 配置 placeholderData 避免分页切换时的闪烁
    placeholderData: keepPreviousData,
    // 缓存时间5分钟
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 删除用户的 Mutation Hook
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.adminDeleteUser(userId);
      return userId;
    },
    onSuccess: () => {
      // 删除成功后，使所有用户列表查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.lists() });
    },
  });
}

/**
 * 更新用户角色的 Mutation Hook
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'USER' | 'ADMIN' }) => {
      await apiClient.adminUpdateUserRole(userId, role);
      return { userId, role };
    },
    onSuccess: () => {
      // 更新成功后，使所有用户列表查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.lists() });
    },
  });
}

/**
 * 批量操作用户的 Mutation Hook（未来扩展）
 */
/**
 * 管理员操作数据类型
 */
interface AdminActionData {
  role?: string;
  [key: string]: unknown;
}

export function useBatchUpdateUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      operations: Array<{ userId: string; action: string; data?: AdminActionData }>,
    ) => {
      // 这里可以实现批量操作逻辑
      // 示例：批量删除、批量更新角色等
      const results = await Promise.allSettled(
        operations.map(async (op) => {
          switch (op.action) {
            case 'delete':
              return apiClient.adminDeleteUser(op.userId);
            case 'updateRole': {
              const role = op.data?.role as 'USER' | 'ADMIN' | undefined;
              if (!role) throw new Error('Role is required for updateRole action');
              return apiClient.adminUpdateUserRole(op.userId, role);
            }
            default:
              throw new Error(`Unknown action: ${op.action}`);
          }
        }),
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.lists() });
    },
  });
}
