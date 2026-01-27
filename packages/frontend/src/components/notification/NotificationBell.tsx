/**
 * 通知铃铛组件
 *
 * 遵循 C2:
 * - 零值: 隐藏徽章
 * - 封顶: count > 99 显示 "99+"
 * - 格式: 1-99 显示精确数字
 */
import { memo } from 'react';
import { Bell } from '../Icon';

export interface NotificationBellProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

export const NotificationBell = memo(function NotificationBell({
  count,
  onClick,
  className = '',
}: NotificationBellProps) {
  const showBadge = count > 0;
  const displayCount = count > 99 ? '99+' : String(count);

  return (
    <button
      onClick={onClick}
      className={`relative p-2 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${className}`}
      aria-label={showBadge ? `${count} 条未读通知` : '通知'}
    >
      <Bell className="h-5 w-5" />
      {showBadge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
          {displayCount}
        </span>
      )}
    </button>
  );
});
