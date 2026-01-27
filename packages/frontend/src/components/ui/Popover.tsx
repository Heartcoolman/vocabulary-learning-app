/**
 * Popover 组件
 *
 * 弹出提示框，支持交互内容和多种触发方式
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
import { X } from '../Icon';
import { cn, Placement, generateId, Keys } from './utils';

export interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content' | 'title'> {
  /** 弹出内容 */
  content: ReactNode;
  /** 触发器 */
  children: ReactNode;
  /** 位置 */
  placement?: Placement;
  /** 触发方式 */
  trigger?: 'click' | 'hover';
  /** 延迟显示时间（毫秒，仅 hover 模式） */
  delayShow?: number;
  /** 延迟隐藏时间（毫秒，仅 hover 模式） */
  delayHide?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 最大宽度 */
  maxWidth?: number;
  /** 是否显示关闭按钮 */
  closable?: boolean;
  /** 是否显示箭头 */
  showArrow?: boolean;
  /** 标题 */
  title?: ReactNode;
  /** 受控模式：是否可见 */
  open?: boolean;
  /** 受控模式：可见性变化回调 */
  onOpenChange?: (open: boolean) => void;
  /** 点击外部是否关闭 */
  closeOnClickOutside?: boolean;
  /** 按 Escape 键是否关闭 */
  closeOnEscape?: boolean;
}

const placementStyles: Record<Placement, { popover: string; arrow: string }> = {
  top: {
    popover: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow:
      'top-full left-1/2 -translate-x-1/2 border-t-white dark:border-t-slate-800 border-x-transparent border-b-transparent',
  },
  bottom: {
    popover: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow:
      'bottom-full left-1/2 -translate-x-1/2 border-b-white dark:border-b-slate-800 border-x-transparent border-t-transparent',
  },
  left: {
    popover: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow:
      'left-full top-1/2 -translate-y-1/2 border-l-white dark:border-l-slate-800 border-y-transparent border-r-transparent',
  },
  right: {
    popover: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow:
      'right-full top-1/2 -translate-y-1/2 border-r-white dark:border-r-slate-800 border-y-transparent border-l-transparent',
  },
};

export const Popover = memo(
  forwardRef<HTMLDivElement, PopoverProps>(
    (
      {
        content,
        children,
        placement = 'bottom',
        trigger = 'click',
        delayShow = 100,
        delayHide = 100,
        disabled = false,
        maxWidth = 320,
        closable = false,
        showArrow = true,
        title,
        open: controlledOpen,
        onOpenChange,
        closeOnClickOutside = true,
        closeOnEscape = true,
        className,
        ...props
      },
      ref,
    ) => {
      const [internalOpen, setInternalOpen] = useState(false);
      const isControlled = controlledOpen !== undefined;
      const isOpen = isControlled ? controlledOpen : internalOpen;

      const showTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
      const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
      const containerRef = useRef<HTMLDivElement>(null);
      const [popoverId] = useState(() => generateId('popover'));

      const setOpen = useCallback(
        (value: boolean) => {
          if (disabled) return;
          if (!isControlled) {
            setInternalOpen(value);
          }
          onOpenChange?.(value);
        },
        [disabled, isControlled, onOpenChange],
      );

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

      const handleShow = useCallback(() => {
        if (disabled) return;
        clearTimeouts();
        if (trigger === 'hover') {
          showTimeoutRef.current = setTimeout(() => {
            setOpen(true);
          }, delayShow);
        } else {
          setOpen(true);
        }
      }, [disabled, trigger, delayShow, clearTimeouts, setOpen]);

      const handleHide = useCallback(() => {
        clearTimeouts();
        if (trigger === 'hover') {
          hideTimeoutRef.current = setTimeout(() => {
            setOpen(false);
          }, delayHide);
        } else {
          setOpen(false);
        }
      }, [trigger, delayHide, clearTimeouts, setOpen]);

      const handleToggle = useCallback(() => {
        if (disabled) return;
        if (isOpen) {
          handleHide();
        } else {
          handleShow();
        }
      }, [disabled, isOpen, handleShow, handleHide]);

      // 点击外部关闭
      useEffect(() => {
        if (!closeOnClickOutside || !isOpen || trigger !== 'click') return;

        const handleClickOutside = (event: MouseEvent) => {
          if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
            setOpen(false);
          }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, [closeOnClickOutside, isOpen, trigger, setOpen]);

      // Escape 键关闭
      useEffect(() => {
        if (!closeOnEscape || !isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === Keys.Escape) {
            setOpen(false);
          }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
      }, [closeOnEscape, isOpen, setOpen]);

      // 清理定时器
      useEffect(() => {
        return () => clearTimeouts();
      }, [clearTimeouts]);

      const { popover: popoverPosition, arrow: arrowPosition } = placementStyles[placement];

      const triggerProps =
        trigger === 'hover'
          ? {
              onMouseEnter: handleShow,
              onMouseLeave: handleHide,
            }
          : {
              onClick: handleToggle,
            };

      return (
        <div
          ref={(node) => {
            // 合并 refs
            (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          className={cn('relative inline-flex', className)}
          {...props}
        >
          {/* Trigger */}
          <span
            {...triggerProps}
            aria-describedby={isOpen ? popoverId : undefined}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
          >
            {children}
          </span>

          {/* Popover */}
          {isOpen && content && (
            <div
              id={popoverId}
              role="dialog"
              aria-modal="false"
              className={cn(
                'absolute z-50',
                'rounded-card bg-white dark:bg-slate-800',
                'shadow-elevated',
                'animate-g3-scale-in',
                'border border-gray-100 dark:border-slate-700',
                popoverPosition,
              )}
              style={{ maxWidth }}
              {...(trigger === 'hover'
                ? { onMouseEnter: handleShow, onMouseLeave: handleHide }
                : {})}
            >
              {/* Header */}
              {(title || closable) && (
                <div
                  className={cn(
                    'flex items-center justify-between gap-2 px-4 pt-3',
                    title ? 'border-b border-gray-100 pb-2 dark:border-slate-700' : undefined,
                  )}
                >
                  {title && (
                    <h4 className="font-semibold text-gray-900 dark:text-white">{title}</h4>
                  )}
                  {closable && (
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className={cn(
                        'rounded-badge p-1',
                        'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                        'transition-colors duration-g3-fast',
                        'hover:bg-gray-100 dark:hover:bg-slate-700',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      )}
                      aria-label="关闭"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              <div className={cn('px-4 py-3', 'text-sm text-gray-600 dark:text-gray-300')}>
                {content}
              </div>

              {/* Arrow */}
              {showArrow && (
                <span
                  className={cn('absolute h-0 w-0', 'border-[6px]', arrowPosition)}
                  aria-hidden="true"
                />
              )}
            </div>
          )}
        </div>
      );
    },
  ),
);

Popover.displayName = 'Popover';
