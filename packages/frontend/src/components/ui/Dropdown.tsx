/**
 * Dropdown 组件
 *
 * 下拉菜单，支持键盘导航和无障碍访问
 */
import React, {
  forwardRef,
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
  HTMLAttributes,
  KeyboardEvent,
} from 'react';
import { CaretDown } from '../Icon';
import { cn, generateId, Keys, Placement } from './utils';

export interface DropdownItem {
  /** 唯一标识 */
  key: string;
  /** 显示文本 */
  label: ReactNode;
  /** 图标 */
  icon?: ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否为分割线 */
  divider?: boolean;
  /** 危险操作 */
  danger?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

export interface DropdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 触发器内容 */
  trigger: ReactNode;
  /** 下拉菜单项 */
  items: DropdownItem[];
  /** 菜单位置 */
  placement?: Placement;
  /** 是否禁用 */
  disabled?: boolean;
  /** 打开状态变化回调 */
  onOpenChange?: (open: boolean) => void;
}

export const Dropdown = memo(
  forwardRef<HTMLDivElement, DropdownProps>(
    (
      { trigger, items, placement = 'bottom', disabled = false, onOpenChange, className, ...props },
      ref,
    ) => {
      const [isOpen, setIsOpen] = useState(false);
      const [activeIndex, setActiveIndex] = useState(-1);
      const triggerRef = useRef<HTMLButtonElement>(null);
      const menuRef = useRef<HTMLDivElement>(null);
      const [menuId] = useState(() => generateId('dropdown-menu'));

      const enabledItems = items.filter((item) => !item.disabled && !item.divider);

      const handleOpen = useCallback(
        (open: boolean) => {
          if (disabled) return;
          setIsOpen(open);
          onOpenChange?.(open);
          if (open) {
            setActiveIndex(-1);
          }
        },
        [disabled, onOpenChange],
      );

      const handleSelect = useCallback(
        (item: DropdownItem) => {
          if (item.disabled) return;
          item.onClick?.();
          handleOpen(false);
        },
        [handleOpen],
      );

      // 点击外部关闭
      useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
          const target = event.target as Node;
          if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
            handleOpen(false);
          }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, [isOpen, handleOpen]);

      // 键盘导航
      const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
          if (!isOpen) {
            if (
              event.key === Keys.Enter ||
              event.key === Keys.Space ||
              event.key === Keys.ArrowDown
            ) {
              event.preventDefault();
              handleOpen(true);
            }
            return;
          }

          switch (event.key) {
            case Keys.Escape:
              event.preventDefault();
              handleOpen(false);
              triggerRef.current?.focus();
              break;
            case Keys.ArrowDown:
              event.preventDefault();
              setActiveIndex((prev) => {
                const next = prev + 1;
                return next >= enabledItems.length ? 0 : next;
              });
              break;
            case Keys.ArrowUp:
              event.preventDefault();
              setActiveIndex((prev) => {
                const next = prev - 1;
                return next < 0 ? enabledItems.length - 1 : next;
              });
              break;
            case Keys.Enter:
            case Keys.Space:
              event.preventDefault();
              if (activeIndex >= 0 && activeIndex < enabledItems.length) {
                handleSelect(enabledItems[activeIndex]);
              }
              break;
            case Keys.Home:
              event.preventDefault();
              setActiveIndex(0);
              break;
            case Keys.End:
              event.preventDefault();
              setActiveIndex(enabledItems.length - 1);
              break;
          }
        },
        [isOpen, handleOpen, activeIndex, enabledItems, handleSelect],
      );

      const placementStyles: Record<Placement, string> = {
        top: 'bottom-full mb-1',
        bottom: 'top-full mt-1',
        left: 'right-full mr-1',
        right: 'left-full ml-1',
      };

      return (
        <div ref={ref} className={cn('relative inline-block', className)} {...props}>
          {/* Trigger */}
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
            onClick={() => handleOpen(!isOpen)}
            onKeyDown={handleKeyDown}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2',
              'rounded-button border border-gray-200 bg-white dark:border-slate-600 dark:bg-slate-800',
              'text-sm font-medium text-gray-700 dark:text-gray-200',
              'transition-all duration-g3-fast ease-g3',
              'hover:border-gray-300 hover:bg-gray-50 dark:hover:border-slate-500 dark:hover:bg-slate-700',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {trigger}
            <CaretDown
              size={14}
              className={cn('transition-transform duration-g3-fast', isOpen && 'rotate-180')}
            />
          </button>

          {/* Menu */}
          {isOpen && (
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-orientation="vertical"
              className={cn(
                'absolute z-50 min-w-[160px]',
                'rounded-card border border-gray-100 bg-white dark:border-slate-700 dark:bg-slate-800',
                'py-1 shadow-elevated',
                'animate-g3-fade-in',
                placementStyles[placement],
              )}
            >
              {items.map((item, index) => {
                if (item.divider) {
                  return (
                    <div
                      key={item.key}
                      className="my-1 h-px bg-gray-100 dark:bg-slate-700"
                      role="separator"
                    />
                  );
                }

                const enabledIndex = enabledItems.findIndex((i) => i.key === item.key);
                const isActive = enabledIndex === activeIndex;

                return (
                  <button
                    key={item.key}
                    role="menuitem"
                    disabled={item.disabled}
                    tabIndex={-1}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(enabledIndex)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2',
                      'text-left text-sm',
                      'transition-colors duration-g3-instant',
                      item.disabled
                        ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                        : item.danger
                          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-700',
                      isActive &&
                        !item.disabled &&
                        (item.danger
                          ? 'bg-red-50 dark:bg-red-900/30'
                          : 'bg-gray-50 dark:bg-slate-700'),
                    )}
                  >
                    {item.icon && <span className="h-4 w-4 flex-shrink-0">{item.icon}</span>}
                    <span className="flex-1">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    },
  ),
);

Dropdown.displayName = 'Dropdown';
