/**
 * Tooltip 组件
 *
 * 提示框，支持多种位置和触发方式
 */
import React, {
  forwardRef,
  memo,
  useState,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
  HTMLAttributes,
} from 'react';
import { cn, Placement, generateId } from './utils';

export interface TooltipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  /** 提示内容 */
  content: ReactNode;
  /** 触发器 */
  children: ReactNode;
  /** 位置 */
  placement?: Placement;
  /** 延迟显示时间（毫秒） */
  delayShow?: number;
  /** 延迟隐藏时间（毫秒） */
  delayHide?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 最大宽度 */
  maxWidth?: number;
}

const placementStyles: Record<Placement, { tooltip: string; arrow: string }> = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow:
      'top-full left-1/2 -translate-x-1/2 border-t-gray-900 dark:border-t-slate-200 border-x-transparent border-b-transparent',
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow:
      'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-slate-200 border-x-transparent border-t-transparent',
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow:
      'left-full top-1/2 -translate-y-1/2 border-l-gray-900 dark:border-l-slate-200 border-y-transparent border-r-transparent',
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow:
      'right-full top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-slate-200 border-y-transparent border-l-transparent',
  },
};

export const Tooltip = memo(
  forwardRef<HTMLDivElement, TooltipProps>(
    (
      {
        content,
        children,
        placement = 'top',
        delayShow = 200,
        delayHide = 0,
        disabled = false,
        maxWidth = 250,
        className,
        ...props
      },
      ref,
    ) => {
      const [isVisible, setIsVisible] = useState(false);
      const showTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
      const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
      const [tooltipId] = useState(() => generateId('tooltip'));

      const clearTimeouts = useCallback(() => {
        if (showTimeoutRef.current) {
          clearTimeout(showTimeoutRef.current);
          showTimeoutRef.current = undefined;
        }
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = undefined;
        }
      }, []);

      useEffect(() => clearTimeouts, [clearTimeouts]);

      const handleShow = useCallback(() => {
        if (disabled) return;
        clearTimeouts();
        showTimeoutRef.current = setTimeout(() => {
          setIsVisible(true);
        }, delayShow);
      }, [disabled, delayShow, clearTimeouts]);

      const handleHide = useCallback(() => {
        clearTimeouts();
        hideTimeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, delayHide);
      }, [delayHide, clearTimeouts]);

      const { tooltip: tooltipPosition, arrow: arrowPosition } = placementStyles[placement];

      return (
        <div
          ref={ref}
          className={cn('relative inline-flex', className)}
          onMouseEnter={handleShow}
          onMouseLeave={handleHide}
          onFocus={handleShow}
          onBlur={handleHide}
          {...props}
        >
          {/* Trigger element with aria-describedby */}
          <span aria-describedby={isVisible ? tooltipId : undefined}>{children}</span>

          {/* Tooltip */}
          {isVisible && content && (
            <div
              id={tooltipId}
              role="tooltip"
              className={cn(
                'absolute z-50 px-2.5 py-1.5',
                'rounded-badge bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900',
                'text-xs font-medium',
                'shadow-elevated',
                'animate-g3-fade-in',
                'pointer-events-none',
                tooltipPosition,
              )}
              style={{ maxWidth }}
            >
              {content}
              {/* Arrow */}
              <span
                className={cn('absolute h-0 w-0', 'border-4', arrowPosition)}
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      );
    },
  ),
);

Tooltip.displayName = 'Tooltip';
