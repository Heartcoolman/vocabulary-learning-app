/**
 * OfflineIndicator 组件
 *
 * 网络离线友好提示组件，检测用户网络状态并在离线时显示提示
 */
import React, { useState, useEffect, memo } from 'react';
import { WifiSlash, ArrowsClockwise } from '../Icon';
import { cn } from './utils';

export interface OfflineIndicatorProps {
  /** 自定义类名 */
  className?: string;
  /** 显示位置 */
  position?: 'top' | 'bottom';
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 重试回调 */
  onRetry?: () => void;
}

export const OfflineIndicator = memo<OfflineIndicatorProps>(
  ({ className, position = 'top', showRetry = true, onRetry }) => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [retrying, setRetrying] = useState(false);

    useEffect(() => {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, []);

    const handleRetry = async () => {
      setRetrying(true);
      try {
        // 尝试重新连接
        if (onRetry) {
          await onRetry();
        } else {
          // 默认刷新页面
          window.location.reload();
        }
      } finally {
        setTimeout(() => setRetrying(false), 1000);
      }
    };

    if (isOnline) {
      return null;
    }

    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          'animate-g3-slide-down fixed left-0 right-0 z-50',
          position === 'top' ? 'top-0' : 'bottom-0',
          className,
        )}
      >
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between gap-4 rounded-card border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 shadow-elevated dark:border-orange-800 dark:from-orange-900/30 dark:to-amber-900/30">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/50">
                <WifiSlash
                  size={20}
                  weight="bold"
                  className="text-orange-600 dark:text-orange-400"
                />
              </div>
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-300">网络连接已断开</p>
                <p className="text-sm text-orange-700 dark:text-orange-400">
                  请检查您的网络连接并稍后重试
                </p>
              </div>
            </div>

            {showRetry && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-2 rounded-button bg-orange-600 px-4 py-2 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-orange-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowsClockwise
                  size={16}
                  weight="bold"
                  className={retrying ? 'animate-spin' : ''}
                />
                {retrying ? '重试中...' : '重试'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

OfflineIndicator.displayName = 'OfflineIndicator';
