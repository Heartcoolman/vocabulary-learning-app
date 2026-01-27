import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Select, type SelectOption } from '../../ui';
import { CaretLeft, CaretRight, CircleNotch, Warning } from '../../Icon';
import { adminClient } from '../../../services/client';

export interface Broadcast {
  id: string;
  adminId: string;
  title: string;
  content: string;
  target: 'all' | 'online' | 'group' | 'user' | 'users';
  targetFilter: Record<string, unknown> | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  persistent: boolean;
  expiresAt: string | null;
  status: 'draft' | 'sent' | 'expired';
  targetCount: number;
  deliveredCount: number;
  createdAt: string;
}

interface ListResponse {
  success: boolean;
  data: Broadcast[];
  total: number;
  page: number;
  pageSize: number;
}

interface BroadcastListProps {
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

const statusOptions: SelectOption[] = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'sent', label: '已发送' },
  { value: 'expired', label: '已过期' },
];

const targetLabels: Record<Broadcast['target'], string> = {
  all: '全部',
  online: '在线',
  group: '分组',
  user: '用户',
  users: '多用户',
};

const priorityStyles: Record<Broadcast['priority'], string> = {
  LOW: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  NORMAL: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  HIGH: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  URGENT: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const statusStyles: Record<Broadcast['status'], string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  sent: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  expired: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function BroadcastList({ selectedId, onSelect }: BroadcastListProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const pageSize = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-broadcasts', 'list', { page, pageSize, statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      return adminClient.requestAdminFull<ListResponse>(`/api/admin/broadcasts?${params}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });

  const broadcasts = data?.data ?? [];
  const hasNextPage = broadcasts.length === pageSize;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-button border border-gray-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
        <CircleNotch className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-button border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/30">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <Warning size={20} />
          <span className="font-medium">加载广播列表失败</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">广播列表</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">查看历史广播和投递状态</p>
        </div>
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            options={statusOptions}
            fullWidth
          />
        </div>
      </div>

      {broadcasts.length === 0 ? (
        <div className="rounded-button border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-gray-400">
          暂无广播记录
        </div>
      ) : (
        <div className="overflow-hidden rounded-button border border-gray-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                    标题
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    目标
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    优先级
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    状态
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    投递
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    创建时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {broadcasts.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => onSelect?.(b.id)}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50 ${
                      selectedId === b.id ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">{b.title}</div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                        {b.content}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600 dark:text-gray-300">
                      {targetLabels[b.target]}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityStyles[b.priority]}`}
                      >
                        {b.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[b.status]}`}
                      >
                        {b.status === 'sent'
                          ? '已发送'
                          : b.status === 'expired'
                            ? '已过期'
                            : '草稿'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600 dark:text-gray-300">
                      {b.deliveredCount}/{b.targetCount}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600 dark:text-gray-300">
                      {new Date(b.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          第 {page} 页 {data?.total ? `· 共 ${data.total} 条记录` : ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-button border border-gray-300 px-4 py-2 text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <CaretLeft size={16} />
          </button>
          <span className="min-w-[3rem] text-center text-sm font-medium text-gray-900 dark:text-white">
            {page}
          </span>
          <button
            type="button"
            disabled={!hasNextPage}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-button border border-gray-300 px-4 py-2 text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <CaretRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
