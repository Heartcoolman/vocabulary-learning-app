import { useCallback } from 'react';
import type { OnlineUserDetail } from '../../../services/client';
import { Users, User, Circle, Eye, CaretLeft, CaretRight } from '../../../components/Icon';

interface OnlineUserListProps {
  users: OnlineUserDetail[];
  selectedUserIds: string[];
  onSelectUser: (user: OnlineUserDetail) => void;
  onDeselectUser: (userId: string) => void;
  maxSelections?: number;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  isLoading?: boolean;
  error?: Error | null;
}

export default function OnlineUserList({
  users,
  selectedUserIds,
  onSelectUser,
  onDeselectUser,
  maxSelections = 4,
  pagination,
  isLoading,
  error,
}: OnlineUserListProps) {
  const handleUserClick = useCallback(
    (user: OnlineUserDetail) => {
      const isSelected = selectedUserIds.includes(user.userId);
      if (isSelected) {
        onDeselectUser(user.userId);
      } else if (selectedUserIds.length < maxSelections) {
        onSelectUser(user);
      }
    },
    [selectedUserIds, maxSelections, onSelectUser, onDeselectUser],
  );

  const isSelectionDisabled = (userId: string) => {
    return !selectedUserIds.includes(userId) && selectedUserIds.length >= maxSelections;
  };

  return (
    <div className="rounded-card border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-blue-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">在线用户</h2>
          {pagination && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {pagination.total} 人在线
            </span>
          )}
        </div>
        {selectedUserIds.length > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            已选 {selectedUserIds.length}/{maxSelections}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-card bg-red-50 p-4 text-center text-red-600 dark:bg-red-900/20 dark:text-red-400">
          加载失败: {error.message}
        </div>
      )}

      {!isLoading && !error && users.length === 0 && (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>当前没有在线用户</p>
        </div>
      )}

      {!isLoading && !error && users.length > 0 && (
        <>
          <div className="space-y-2">
            {users.map((user) => {
              const isSelected = selectedUserIds.includes(user.userId);
              const isDisabled = isSelectionDisabled(user.userId);

              return (
                <button
                  key={user.userId}
                  onClick={() => handleUserClick(user)}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center justify-between rounded-card border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                      : isDisabled
                        ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50 dark:border-slate-700 dark:bg-slate-700/30'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-700/50 dark:hover:border-slate-600 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${
                        isSelected
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                          : 'bg-gradient-to-br from-gray-400 to-gray-500'
                      }`}
                    >
                      <User size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {user.name || '未设置昵称'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Circle size={8} weight="fill" className="animate-pulse text-green-500" />
                    <Eye size={18} className={isSelected ? 'text-blue-500' : 'text-gray-400'} />
                  </div>
                </button>
              );
            })}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-slate-700">
              <button
                onClick={() => pagination.onPageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="flex items-center gap-1 rounded-button px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-slate-700"
              >
                <CaretLeft size={16} />
                上一页
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => pagination.onPageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="flex items-center gap-1 rounded-button px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-slate-700"
              >
                下一页
                <CaretRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
