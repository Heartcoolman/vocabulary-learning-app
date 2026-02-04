/**
 * 通知中心页面
 *
 * 遵循约束:
 * - C4: 分页 limit=20, offset=pageIndex*20
 * - C5: 批量选择仅当前页
 * - C6: 删除需确认弹窗
 * - C7: 空状态使用 Empty 组件
 */
import { useState, useMemo, useCallback } from 'react';
import {
  useNotifications,
  useNotificationStats,
  useMarkAsRead,
  useBatchMarkAsRead,
  useMarkAllAsRead,
  useDeleteNotification,
  useBatchDeleteNotifications,
} from '../hooks/queries/useNotifications';
import { NotificationItem } from '../components/notification';
import { Empty, ConfirmModal, Spinner } from '../components/ui';
import {
  Check,
  Trash,
  CaretLeft,
  CaretRight,
  Bell,
  EnvelopeOpen,
  Envelope,
} from '../components/Icon';
import type { Notification } from '../services/client';

type FilterStatus = 'all' | 'unread' | 'read';

const PAGE_SIZE = 20; // C4

export default function NotificationCenterPage() {
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Queries
  const { data: stats } = useNotificationStats();
  const { data: notifications, isLoading } = useNotifications({
    status: filterStatus === 'all' ? undefined : filterStatus,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // Mutations
  const markAsRead = useMarkAsRead();
  const batchMarkAsRead = useBatchMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteNotification = useDeleteNotification();
  const batchDelete = useBatchDeleteNotifications();

  // 当前页 IDs (C5: 批量选择仅当前页)
  const currentPageIds = useMemo(() => notifications?.map((n) => n.id) ?? [], [notifications]);

  // 切换页面时清空选择 (C5)
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
  }, []);

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === currentPageIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentPageIds));
    }
  }, [selectedIds.size, currentPageIds]);

  // 单选切换
  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 标记单条已读
  const handleMarkAsRead = useCallback(
    (id: string) => {
      markAsRead.mutate(id);
    },
    [markAsRead],
  );

  // 批量标记已读
  const handleBatchMarkAsRead = useCallback(() => {
    if (selectedIds.size > 0) {
      batchMarkAsRead.mutate(Array.from(selectedIds), {
        onSuccess: () => setSelectedIds(new Set()),
      });
    }
  }, [selectedIds, batchMarkAsRead]);

  // 全部标记已读
  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead.mutate();
  }, [markAllAsRead]);

  // 删除单条
  const handleDelete = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
    setDeleteConfirmOpen(true);
  }, []);

  // 批量删除确认 (C6)
  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size > 0) {
      setDeleteConfirmOpen(true);
    }
  }, [selectedIds.size]);

  // 确认删除
  const confirmDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 1) {
      deleteNotification.mutate(ids[0], {
        onSuccess: () => {
          setSelectedIds(new Set());
          setDeleteConfirmOpen(false);
        },
      });
    } else {
      batchDelete.mutate(ids, {
        onSuccess: () => {
          setSelectedIds(new Set());
          setDeleteConfirmOpen(false);
        },
      });
    }
  }, [selectedIds, deleteNotification, batchDelete]);

  // 通知点击
  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (notification.status === 'unread') {
        markAsRead.mutate(notification.id);
      }
    },
    [markAsRead],
  );

  // 计算总页数
  const totalCount =
    filterStatus === 'all'
      ? (stats?.total ?? 0)
      : filterStatus === 'unread'
        ? (stats?.unread ?? 0)
        : (stats?.read ?? 0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const isAllSelected = currentPageIds.length > 0 && selectedIds.size === currentPageIds.length;
  const hasSelection = selectedIds.size > 0;

  return (
    <div className="min-h-screen animate-g3-fade-in bg-gray-50 px-4 py-8 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl">
        {/* 头部 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">通知中心</h1>
          <p className="mt-2 text-base text-gray-600 dark:text-gray-400">管理您的所有通知消息</p>
        </div>

        {/* 统计概览 */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700">
                <Bell size={20} className="text-gray-600 dark:text-gray-300" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats?.total ?? 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">全部通知</div>
              </div>
            </div>
          </div>
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Envelope size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats?.unread ?? 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">未读</div>
              </div>
            </div>
          </div>
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <EnvelopeOpen size={20} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats?.read ?? 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">已读</div>
              </div>
            </div>
          </div>
        </div>

        {/* 主内容卡片 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 shadow-soft backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/80">
          {/* 筛选栏 */}
          <div className="flex items-center justify-between border-b border-gray-200/60 p-4 dark:border-slate-700/60">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setFilterStatus('all');
                  handlePageChange(0);
                }}
                className={`rounded-button px-4 py-2 text-sm font-medium transition-all duration-g3-fast ${
                  filterStatus === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => {
                  setFilterStatus('unread');
                  handlePageChange(0);
                }}
                className={`rounded-button px-4 py-2 text-sm font-medium transition-all duration-g3-fast ${
                  filterStatus === 'unread'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700'
                }`}
              >
                未读
              </button>
              <button
                onClick={() => {
                  setFilterStatus('read');
                  handlePageChange(0);
                }}
                className={`rounded-button px-4 py-2 text-sm font-medium transition-all duration-g3-fast ${
                  filterStatus === 'read'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700'
                }`}
              >
                已读
              </button>
            </div>

            {(stats?.unread ?? 0) > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={markAllAsRead.isPending}
                className="rounded-button px-4 py-2 text-sm font-medium text-blue-600 transition-all duration-g3-fast hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                全部标记已读
              </button>
            )}
          </div>

          {/* 批量操作工具栏 */}
          {currentPageIds.length > 0 && (
            <div className="flex items-center gap-4 border-b border-gray-200/60 bg-gray-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/50">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {hasSelection ? `已选 ${selectedIds.size} 项` : '全选'}
                </span>
              </label>

              {hasSelection && (
                <>
                  <button
                    onClick={handleBatchMarkAsRead}
                    disabled={batchMarkAsRead.isPending}
                    className="flex items-center gap-1 rounded-button px-3 py-1.5 text-sm text-green-600 transition-all duration-g3-fast hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    <Check className="h-4 w-4" />
                    标记已读
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={batchDelete.isPending}
                    className="flex items-center gap-1 rounded-button px-3 py-1.5 text-sm text-red-600 transition-all duration-g3-fast hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Trash className="h-4 w-4" />
                    删除
                  </button>
                </>
              )}
            </div>
          )}

          {/* 通知列表 */}
          <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="xl" color="primary" />
              </div>
            ) : !notifications?.length ? (
              <div className="py-12">
                <Empty type="notification" size="md" />
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-start transition-colors hover:bg-gray-50/50 dark:hover:bg-slate-700/30"
                >
                  <label className="flex cursor-pointer items-center p-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(notification.id)}
                      onChange={() => handleSelect(notification.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                    />
                  </label>
                  <div className="flex-1 pr-4">
                    <NotificationItem
                      notification={notification}
                      onClick={handleNotificationClick}
                      onMarkAsRead={handleMarkAsRead}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 分页控件 (C4) */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200/60 px-4 py-3 dark:border-slate-700/60">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                第 {page + 1} / {totalPages} 页，共 {totalCount} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                  className="rounded-button p-2 text-gray-600 transition-all duration-g3-fast hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-slate-700"
                >
                  <CaretLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="rounded-button p-2 text-gray-600 transition-all duration-g3-fast hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-slate-700"
                >
                  <CaretRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 (C6) */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="确认删除"
        message={`确定要删除选中的 ${selectedIds.size} 条通知吗？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        isLoading={deleteNotification.isPending || batchDelete.isPending}
      />
    </div>
  );
}
