import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, StatCard } from '../../ui';
import { ArrowClockwise, CircleNotch, Warning } from '../../Icon';
import { adminClient } from '../../../services/client';

interface OnlineStatsResponse {
  success: boolean;
  data: {
    onlineCount: number;
    onlineUserIds: string[];
  };
}

export default function OnlineStats() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-broadcasts', 'online-stats'],
    queryFn: () =>
      adminClient.requestAdminFull<OnlineStatsResponse>('/api/admin/broadcasts/online-stats'),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });

  if (isLoading) {
    return (
      <Card variant="outlined">
        <CardContent className="flex h-40 items-center justify-center">
          <CircleNotch className="h-6 w-6 animate-spin text-blue-500" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.data) {
    return (
      <Card variant="outlined">
        <CardContent className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <Warning size={16} />
          加载在线统计失败
        </CardContent>
      </Card>
    );
  }

  const stats = data.data;
  const visibleUsers = stats.onlineUserIds.slice(0, 10);

  return (
    <Card variant="outlined">
      <CardHeader
        title="在线统计"
        subtitle="实时用户在线状态，用于广播目标定向"
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded-button border border-gray-200 px-3 py-1 text-xs text-gray-600 transition-all hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <ArrowClockwise className={isFetching ? 'animate-spin' : undefined} size={14} />
            刷新
          </button>
        }
      />
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="在线用户数" value={stats.onlineCount} helpText="当前 SSE 连接数" />
          <StatCard
            label="追踪用户 ID"
            value={stats.onlineUserIds.length}
            helpText="已识别的用户连接"
          />
        </div>

        <div>
          <div className="text-xs uppercase text-gray-400">在线用户 ID</div>
          {visibleUsers.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {visibleUsers.map((id) => (
                <span
                  key={id}
                  className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  {id.slice(0, 8)}...
                </span>
              ))}
              {stats.onlineUserIds.length > visibleUsers.length && (
                <span className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-400 dark:bg-slate-800 dark:text-slate-400">
                  +{stats.onlineUserIds.length - visibleUsers.length} 更多
                </span>
              )}
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">当前无在线用户</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
