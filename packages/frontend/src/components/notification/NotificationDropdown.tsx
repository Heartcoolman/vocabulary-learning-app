/**
 * 通知下拉面板组件
 *
 * 遵循 C3:
 * - 列表大小: 最多 5 条
 * - 筛选: status != 'archived'，按 createdAt DESC 排序
 * - 点击行为: 乐观导航 + 异步标记已读
 * - 关闭触发: 点击外部、按 Escape 键
 */
import { memo, useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { NotificationItem } from './NotificationItem';
import {
  useNotifications,
  useNotificationStats,
  useMarkAsRead,
} from '../../hooks/queries/useNotifications';
import { CircleNotch } from '@phosphor-icons/react';
import { Empty } from '../ui/Empty';
import type { Notification } from '../../services/client';

export interface NotificationDropdownProps {
  className?: string;
  /** 仅显示系统通知，排除广播 */
  systemOnly?: boolean;
}

export const NotificationDropdown = memo(function NotificationDropdown({
  className = '',
  systemOnly = false,
}: NotificationDropdownProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const { data: stats } = useNotificationStats();
  const { data: notifications, isLoading } = useNotifications(
    { limit: 5, offset: 0 },
    { enabled: isOpen },
  );
  const markAsRead = useMarkAsRead();

  // 过滤已归档并按时间降序（API 默认排序，但确保顺序正确）
  const visibleNotifications = notifications
    ?.filter((n) => n.status !== 'archived')
    .filter((n) => !systemOnly || !n.broadcastId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  const unreadCount = stats?.unread ?? 0;
  const broadcastCount = systemOnly
    ? 0
    : (visibleNotifications?.filter((n) => n.broadcastId).length ?? 0);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // 乐观导航
      setIsOpen(false);
      navigate('/notifications');
      // 异步标记已读
      if (notification.status === 'unread') {
        markAsRead.mutate(notification.id);
      }
    },
    [navigate, markAsRead],
  );

  const handleViewAll = () => {
    setIsOpen(false);
    navigate('/notifications');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <NotificationBell count={unreadCount} onClick={() => setIsOpen(!isOpen)} />

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-card bg-white shadow-elevated ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">通知</h3>
            <div className="flex items-center gap-2">
              {broadcastCount > 0 && (
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                  {broadcastCount} 广播
                </span>
              )}
              {unreadCount > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {unreadCount} 条未读
                </span>
              )}
            </div>
          </div>

          {/* 列表 */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <CircleNotch className="h-6 w-6 animate-spin text-gray-400" weight="bold" />
              </div>
            ) : !visibleNotifications?.length ? (
              <Empty type="notification" size="sm" />
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {visibleNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={handleNotificationClick}
                    compact
                  />
                ))}
              </div>
            )}
          </div>

          {/* 底部 */}
          <div className="border-t border-gray-100 px-4 py-2 dark:border-gray-800">
            <button
              onClick={handleViewAll}
              className="w-full text-center text-sm text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              查看全部通知
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
