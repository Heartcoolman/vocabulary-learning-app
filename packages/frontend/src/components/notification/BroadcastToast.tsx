/**
 * BroadcastToast - 广播通知弹窗组件
 *
 * 在收到管理员广播时显示 toast 通知
 */
import { memo } from 'react';
import { Bell } from '@phosphor-icons/react';

interface BroadcastToastProps {
  title: string;
  content: string;
  priority: string;
  onClose?: () => void;
}

const priorityStyles: Record<string, string> = {
  URGENT: 'border-red-500 bg-red-50 dark:bg-red-900/20',
  HIGH: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20',
  NORMAL: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
  LOW: 'border-gray-400 bg-gray-50 dark:bg-gray-800/50',
};

const priorityIconStyles: Record<string, string> = {
  URGENT: 'text-red-600 dark:text-red-400',
  HIGH: 'text-orange-600 dark:text-orange-400',
  NORMAL: 'text-blue-600 dark:text-blue-400',
  LOW: 'text-gray-600 dark:text-gray-400',
};

export const BroadcastToast = memo(function BroadcastToast({
  title,
  content,
  priority,
  onClose,
}: BroadcastToastProps) {
  const containerStyle = priorityStyles[priority] ?? priorityStyles.NORMAL;
  const iconStyle = priorityIconStyles[priority] ?? priorityIconStyles.NORMAL;

  return (
    <div
      className={`flex gap-3 rounded-card border-l-4 p-4 shadow-elevated ${containerStyle}`}
      role="alert"
    >
      <div className={`flex-shrink-0 ${iconStyle}`}>
        <Bell size={20} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{content}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="关闭"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
});
