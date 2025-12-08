/**
 * Alert 组件
 *
 * 警告提示，用于重要信息展示
 */
import React, { forwardRef, memo, useState, HTMLAttributes, ReactNode } from 'react';
import { CheckCircle, XCircle, Warning, Info, X } from '../Icon';
import { cn } from './utils';

export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  /** 变体 */
  variant?: AlertVariant;
  /** 标题 */
  title?: string;
  /** 图标（设为 false 隐藏） */
  icon?: ReactNode | false;
  /** 是否可关闭 */
  closable?: boolean;
  /** 关闭回调 */
  onClose?: () => void;
  /** 操作区 */
  action?: ReactNode;
}

const variantStyles: Record<AlertVariant, { container: string; icon: string; iconColor: string }> =
  {
    success: {
      container: 'bg-green-50 border-green-200 text-green-800',
      icon: 'text-green-500',
      iconColor: '#22c55e',
    },
    error: {
      container: 'bg-red-50 border-red-200 text-red-800',
      icon: 'text-red-500',
      iconColor: '#ef4444',
    },
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: 'text-amber-500',
      iconColor: '#f59e0b',
    },
    info: {
      container: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: 'text-blue-500',
      iconColor: '#3b82f6',
    },
  };

const defaultIcons: Record<AlertVariant, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: Warning,
  info: Info,
};

export const Alert = memo(
  forwardRef<HTMLDivElement, AlertProps>(
    (
      {
        variant = 'info',
        title,
        icon,
        closable = false,
        onClose,
        action,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const [visible, setVisible] = useState(true);
      const styles = variantStyles[variant];
      const DefaultIcon = defaultIcons[variant];

      const handleClose = () => {
        setVisible(false);
        onClose?.();
      };

      if (!visible) return null;

      const showIcon = icon !== false;
      const IconComponent = icon || (
        <DefaultIcon size={20} weight="fill" color={styles.iconColor} />
      );

      return (
        <div
          ref={ref}
          role="alert"
          className={cn('flex gap-3 rounded-card border p-4', styles.container, className)}
          {...props}
        >
          {showIcon && <span className="mt-0.5 flex-shrink-0">{IconComponent}</span>}

          <div className="min-w-0 flex-1">
            {title && <h4 className="mb-1 font-semibold">{title}</h4>}
            <div className={cn('text-sm', !title && 'mt-0.5')}>{children}</div>
            {action && <div className="mt-3">{action}</div>}
          </div>

          {closable && (
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'flex-shrink-0 rounded-badge p-1',
                'transition-colors duration-g3-fast',
                'hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                variant === 'success' && 'focus-visible:ring-green-500',
                variant === 'error' && 'focus-visible:ring-red-500',
                variant === 'warning' && 'focus-visible:ring-amber-500',
                variant === 'info' && 'focus-visible:ring-blue-500',
              )}
              aria-label="关闭提示"
            >
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
      );
    },
  ),
);

Alert.displayName = 'Alert';

/* ========================================
 * AlertBanner - 横幅式警告
 * ======================================== */
export interface AlertBannerProps extends Omit<AlertProps, 'closable'> {
  /** 是否可关闭 */
  dismissible?: boolean;
}

export const AlertBanner = memo(
  forwardRef<HTMLDivElement, AlertBannerProps>(
    (
      {
        variant = 'info',
        title,
        icon,
        dismissible = true,
        onClose,
        action,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const [visible, setVisible] = useState(true);
      const styles = variantStyles[variant];
      const DefaultIcon = defaultIcons[variant];

      const handleClose = () => {
        setVisible(false);
        onClose?.();
      };

      if (!visible) return null;

      const showIcon = icon !== false;
      const IconComponent = icon || (
        <DefaultIcon size={20} weight="fill" color={styles.iconColor} />
      );

      return (
        <div
          ref={ref}
          role="alert"
          className={cn(
            'flex items-center justify-center gap-3 px-4 py-3',
            'border-b',
            styles.container,
            className,
          )}
          {...props}
        >
          {showIcon && <span className="flex-shrink-0">{IconComponent}</span>}

          <div className="flex items-center gap-2 text-sm">
            {title && <span className="font-semibold">{title}</span>}
            {children}
          </div>

          {action && <div className="ml-2">{action}</div>}

          {dismissible && (
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'ml-auto flex-shrink-0 rounded-badge p-1',
                'transition-colors duration-g3-fast',
                'hover:bg-black/5 focus:outline-none focus-visible:ring-2',
              )}
              aria-label="关闭提示"
            >
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
      );
    },
  ),
);

AlertBanner.displayName = 'AlertBanner';
