/**
 * 通知项组件
 *
 * 显示单条通知：已读/未读圆点、标题、摘要、时间、操作菜单
 * 支持广播类型样式区分
 */
import { memo } from 'react';
import type { Notification } from '../../services/client';
import { Clock, Check, Trash, Megaphone } from '@phosphor-icons/react';

export interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (notification: Notification) => void;
  compact?: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

const priorityColors: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

export const NotificationItem = memo(function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClick,
  compact = false,
}: NotificationItemProps) {
  const isUnread = notification.status === 'unread';
  const isBroadcast = !!notification.broadcastId;

  const handleClick = () => {
    onClick?.(notification);
  };

  const handleMarkAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkAsRead?.(notification.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`group flex cursor-pointer gap-3 p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${isUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''} ${isBroadcast ? 'border-l-2 border-l-purple-500' : ''} ${compact ? 'py-2' : ''} `}
    >
      {/* 未读指示器 / 广播图标 */}
      <div className="flex-shrink-0 pt-1.5">
        {isBroadcast ? (
          <Megaphone className="h-4 w-4 text-purple-500" weight="fill" />
        ) : isUnread ? (
          <span
            className={`block h-2 w-2 rounded-full ${priorityColors[notification.priority] ?? 'bg-blue-500'}`}
          />
        ) : (
          <span className="block h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
        )}
      </div>

      {/* 内容区 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm ${isUnread ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}
          >
            {notification.title}
          </p>
          {isBroadcast && (
            <span className="flex-shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              广播
            </span>
          )}
        </div>
        {!compact && (
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
            {notification.content}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {isUnread && onMarkAsRead && (
          <button
            onClick={handleMarkAsRead}
            className="p-1 text-gray-400 transition-colors hover:text-green-500 dark:hover:text-green-400"
            title="标记已读"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="p-1 text-gray-400 transition-colors hover:text-red-500 dark:hover:text-red-400"
            title="删除"
          >
            <Trash className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
});
