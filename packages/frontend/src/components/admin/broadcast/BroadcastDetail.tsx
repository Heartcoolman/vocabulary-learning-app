import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowClockwise, CircleNotch, Warning } from '../../Icon';
import { adminClient } from '../../../services/client';
import type { Broadcast } from './BroadcastList';

interface BroadcastAuditLog {
  id: string;
  broadcastId: string;
  adminId: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface DetailResponse {
  success: boolean;
  data: Broadcast;
}

interface AuditResponse {
  success: boolean;
  data: BroadcastAuditLog[];
}

interface BroadcastDetailProps {
  broadcastId?: string | null;
}

export default function BroadcastDetail({ broadcastId }: BroadcastDetailProps) {
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 10;

  useEffect(() => {
    setAuditPage(1);
  }, [broadcastId]);

  const {
    data: broadcastData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-broadcasts', 'detail', broadcastId],
    queryFn: () =>
      adminClient.requestAdminFull<DetailResponse>(`/api/admin/broadcasts/${broadcastId}`),
    enabled: !!broadcastId,
    staleTime: 30 * 1000,
  });

  const { data: auditData } = useQuery({
    queryKey: ['admin-broadcasts', 'audit', broadcastId, auditPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('broadcastId', broadcastId!);
      params.append('page', auditPage.toString());
      params.append('pageSize', auditPageSize.toString());
      return adminClient.requestAdminFull<AuditResponse>(`/api/admin/broadcasts/audit?${params}`);
    },
    enabled: !!broadcastId,
    placeholderData: keepPreviousData,
  });

  const broadcast = broadcastData?.data;
  const auditLogs = auditData?.data ?? [];

  if (!broadcastId) {
    return (
      <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        选择一条广播查看详情
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <CircleNotch className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-red-600 dark:text-red-400">
        <Warning size={16} />
        加载详情失败
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 广播详情 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">广播详情</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              状态: {broadcast.status} · 优先级: {broadcast.priority}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded-button border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-all hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <ArrowClockwise className={isFetching ? 'animate-spin' : undefined} size={14} />
            刷新
          </button>
        </div>
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
          <div>
            <div className="text-xs text-gray-400">标题</div>
            <div className="mt-0.5 text-base font-semibold text-gray-900 dark:text-white">
              {broadcast.title}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">内容</div>
            <p className="mt-0.5 whitespace-pre-wrap">{broadcast.content}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-gray-400">目标</div>
              <div className="mt-0.5 text-gray-900 dark:text-white">{broadcast.target}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">投递</div>
              <div className="mt-0.5 text-gray-900 dark:text-white">
                {broadcast.deliveredCount}/{broadcast.targetCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">创建时间</div>
              <div className="mt-0.5 text-gray-900 dark:text-white">
                {new Date(broadcast.createdAt).toLocaleString('zh-CN')}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">过期时间</div>
              <div className="mt-0.5 text-gray-900 dark:text-white">
                {broadcast.expiresAt ? new Date(broadcast.expiresAt).toLocaleString('zh-CN') : '无'}
              </div>
            </div>
          </div>
          {broadcast.targetFilter && (
            <div>
              <div className="text-xs text-gray-400">目标筛选条件</div>
              <pre className="mt-1 max-h-32 overflow-auto rounded-button bg-gray-50 p-3 text-xs text-gray-700 dark:bg-slate-900 dark:text-slate-200">
                {JSON.stringify(broadcast.targetFilter, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* 分隔线 */}
      <div className="border-t border-gray-200 dark:border-slate-700" />

      {/* 审计日志 */}
      <div>
        <div className="mb-3">
          <h4 className="font-semibold text-gray-900 dark:text-white">审计日志</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">此广播的操作记录</p>
        </div>
        {auditLogs.length > 0 ? (
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-button border border-gray-200 p-3 text-xs dark:border-slate-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-gray-900 dark:text-white">{log.action}</div>
                  <div className="text-gray-500 dark:text-gray-400">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                {log.details && (
                  <pre className="mt-2 max-h-20 overflow-auto rounded bg-gray-50 p-2 text-[11px] text-gray-600 dark:bg-slate-900 dark:text-slate-300">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">暂无审计日志</div>
        )}

        {auditLogs.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">第 {auditPage} 页</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={auditPage === 1}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                className="rounded-button border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={auditLogs.length < auditPageSize}
                onClick={() => setAuditPage((p) => p + 1)}
                className="rounded-button border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
