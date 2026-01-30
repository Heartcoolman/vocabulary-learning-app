import { useState, useCallback, useMemo } from 'react';
import { useOnlineUsersWithDetails } from '../../hooks/queries';
import { AMASFlowVisualization } from '../../components/amas';
import OnlineUserList from './components/OnlineUserList';
import type { OnlineUserDetail } from '../../services/client';
import { X, User, WifiHigh, WifiSlash } from '../../components/Icon';

const MAX_SELECTIONS = 4;

export default function WorkflowMonitorPage() {
  const [page, setPage] = useState(1);
  const [selectedUsers, setSelectedUsers] = useState<OnlineUserDetail[]>([]);
  const [connectionStates, setConnectionStates] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useOnlineUsersWithDetails({ page, limit: 20 });

  const selectedUserIds = useMemo(() => selectedUsers.map((u) => u.userId), [selectedUsers]);

  const handleSelectUser = useCallback((user: OnlineUserDetail) => {
    setSelectedUsers((prev) => {
      if (prev.length >= MAX_SELECTIONS) return prev;
      if (prev.some((u) => u.userId === user.userId)) return prev;
      return [...prev, user];
    });
  }, []);

  const handleDeselectUser = useCallback((userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.userId !== userId));
    setConnectionStates((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const handleConnectionChange = useCallback((userId: string, connected: boolean) => {
    setConnectionStates((prev) => ({ ...prev, [userId]: connected }));
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedUsers([]);
    setConnectionStates({});
  }, []);

  const gridCols = useMemo(() => {
    const count = selectedUsers.length;
    if (count === 0) return '';
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 lg:grid-cols-2';
    return 'grid-cols-1 lg:grid-cols-2';
  }, [selectedUsers.length]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">工作流监控</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              实时监控在线用户的 AMAS 学习工作流（最多同时监控 {MAX_SELECTIONS} 个用户）
            </p>
          </div>
          {selectedUsers.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 rounded-button border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              <X size={16} />
              清除全部
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          <div className="xl:col-span-1">
            <OnlineUserList
              users={data?.data ?? []}
              selectedUserIds={selectedUserIds}
              onSelectUser={handleSelectUser}
              onDeselectUser={handleDeselectUser}
              maxSelections={MAX_SELECTIONS}
              pagination={
                data
                  ? {
                      page,
                      totalPages: data.pagination.totalPages,
                      total: data.pagination.total,
                      onPageChange: setPage,
                    }
                  : undefined
              }
              isLoading={isLoading}
              error={error instanceof Error ? error : null}
            />
          </div>

          <div className="xl:col-span-3">
            {selectedUsers.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-card border border-dashed border-gray-300 bg-gray-50 dark:border-slate-600 dark:bg-slate-800/50">
                <div className="text-center">
                  <User size={48} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
                  <p className="text-gray-500 dark:text-gray-400">从左侧列表选择用户开始监控</p>
                  <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                    最多可同时监控 {MAX_SELECTIONS} 个用户
                  </p>
                </div>
              </div>
            ) : (
              <div className={`grid gap-4 ${gridCols}`}>
                {selectedUsers.map((user) => {
                  const isConnected = connectionStates[user.userId] ?? false;
                  return (
                    <div
                      key={user.userId}
                      className="rounded-card border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="flex items-center justify-between border-b border-gray-100 p-3 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-white">
                            <User size={16} />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {user.name || '未设置昵称'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                              isConnected
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400'
                            }`}
                          >
                            {isConnected ? <WifiHigh size={12} /> : <WifiSlash size={12} />}
                            {isConnected ? '已连接' : '等待'}
                          </div>
                          <button
                            onClick={() => handleDeselectUser(user.userId)}
                            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
                            aria-label={`移除 ${user.name || user.email}`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="p-4">
                        <AMASFlowVisualization
                          mode="live"
                          userId={user.userId}
                          showControls={false}
                          adminMode
                          onConnectionChange={(connected) =>
                            handleConnectionChange(user.userId, connected)
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
