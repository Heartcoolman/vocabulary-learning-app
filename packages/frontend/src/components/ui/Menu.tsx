/**
 * Menu 组件
 *
 * 菜单导航组件，支持多级嵌套和键盘导航
 */
import React, {
  forwardRef,
  memo,
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  HTMLAttributes,
  ReactNode,
  KeyboardEvent,
} from 'react';
import { cn, generateId, Keys } from './utils';

/* ========================================
 * Menu Context
 * ======================================== */
interface MenuContextValue {
  mode: 'vertical' | 'horizontal' | 'inline';
  size: 'sm' | 'md' | 'lg';
  selectedKeys: string[];
  openKeys: string[];
  onSelect: (key: string) => void;
  onOpenChange: (keys: string[]) => void;
  collapsed: boolean;
}

const MenuContext = createContext<MenuContextValue>({
  mode: 'vertical',
  size: 'md',
  selectedKeys: [],
  openKeys: [],
  onSelect: () => {},
  onOpenChange: () => {},
  collapsed: false,
});

function useMenuContext() {
  return useContext(MenuContext);
}

/* ========================================
 * Menu 根组件
 * ======================================== */
export interface MenuProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  /** 菜单模式 */
  mode?: 'vertical' | 'horizontal' | 'inline';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 选中的菜单项 keys */
  selectedKeys?: string[];
  /** 默认选中的 keys */
  defaultSelectedKeys?: string[];
  /** 展开的子菜单 keys */
  openKeys?: string[];
  /** 默认展开的 keys */
  defaultOpenKeys?: string[];
  /** 选中菜单项回调 */
  onSelect?: (key: string) => void;
  /** 子菜单展开变化回调 */
  onOpenChange?: (keys: string[]) => void;
  /** 是否折叠（仅 inline 模式） */
  collapsed?: boolean;
}

export const Menu = memo(
  forwardRef<HTMLElement, MenuProps>(
    (
      {
        mode = 'vertical',
        size = 'md',
        selectedKeys: selectedKeysProp,
        defaultSelectedKeys = [],
        openKeys: openKeysProp,
        defaultOpenKeys = [],
        onSelect,
        onOpenChange,
        collapsed = false,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const [internalSelectedKeys, setInternalSelectedKeys] = useState(defaultSelectedKeys);
      const [internalOpenKeys, setInternalOpenKeys] = useState(defaultOpenKeys);

      const selectedKeys = selectedKeysProp ?? internalSelectedKeys;
      const openKeys = openKeysProp ?? internalOpenKeys;

      const handleSelect = useCallback(
        (key: string) => {
          if (!selectedKeysProp) {
            setInternalSelectedKeys([key]);
          }
          onSelect?.(key);
        },
        [selectedKeysProp, onSelect],
      );

      const handleOpenChange = useCallback(
        (keys: string[]) => {
          if (!openKeysProp) {
            setInternalOpenKeys(keys);
          }
          onOpenChange?.(keys);
        },
        [openKeysProp, onOpenChange],
      );

      return (
        <MenuContext.Provider
          value={{
            mode,
            size,
            selectedKeys,
            openKeys,
            onSelect: handleSelect,
            onOpenChange: handleOpenChange,
            collapsed,
          }}
        >
          <nav
            ref={ref}
            role="navigation"
            aria-label="菜单"
            className={cn(
              'flex',
              mode === 'horizontal' ? 'flex-row items-center' : 'flex-col',
              collapsed && mode === 'inline' && 'w-16',
              className,
            )}
            {...props}
          >
            <ul
              role="menubar"
              aria-orientation={mode === 'horizontal' ? 'horizontal' : 'vertical'}
              className={cn(
                'm-0 flex list-none p-0',
                mode === 'horizontal' ? 'flex-row items-center gap-1' : 'w-full flex-col',
              )}
            >
              {children}
            </ul>
          </nav>
        </MenuContext.Provider>
      );
    },
  ),
);

Menu.displayName = 'Menu';

/* ========================================
 * MenuItem 组件
 * ======================================== */
export interface MenuItemProps extends HTMLAttributes<HTMLLIElement> {
  /** 菜单项唯一标识 */
  itemKey: string;
  /** 图标 */
  icon?: ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否为危险操作 */
  danger?: boolean;
}

const sizeStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export const MenuItem = memo(
  forwardRef<HTMLLIElement, MenuItemProps>(
    (
      {
        itemKey,
        icon,
        disabled = false,
        danger = false,
        className,
        children,
        onClick,
        onKeyDown,
        ...props
      },
      ref,
    ) => {
      const { mode, size, selectedKeys, onSelect, collapsed } = useMenuContext();
      const isSelected = selectedKeys.includes(itemKey);

      const handleClick = (e: React.MouseEvent<HTMLLIElement>) => {
        if (!disabled) {
          onSelect(itemKey);
        }
        onClick?.(e);
      };

      const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
        if (!disabled && (e.key === Keys.Enter || e.key === Keys.Space)) {
          e.preventDefault();
          onSelect(itemKey);
        }

        // 箭头键导航
        const menuItems = e.currentTarget.parentElement?.querySelectorAll<HTMLLIElement>(
          '[role="menuitem"]:not([aria-disabled="true"])',
        );
        if (!menuItems) return;

        const items = Array.from(menuItems);
        const currentIndex = items.indexOf(e.currentTarget);
        let nextIndex = -1;

        const isHorizontal = mode === 'horizontal';

        switch (e.key) {
          case isHorizontal ? Keys.ArrowRight : Keys.ArrowDown:
            nextIndex = currentIndex + 1 >= items.length ? 0 : currentIndex + 1;
            break;
          case isHorizontal ? Keys.ArrowLeft : Keys.ArrowUp:
            nextIndex = currentIndex - 1 < 0 ? items.length - 1 : currentIndex - 1;
            break;
          case Keys.Home:
            nextIndex = 0;
            break;
          case Keys.End:
            nextIndex = items.length - 1;
            break;
        }

        if (nextIndex !== -1) {
          e.preventDefault();
          items[nextIndex].focus();
        }

        onKeyDown?.(e);
      };

      return (
        <li
          ref={ref}
          role="menuitem"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-current={isSelected ? 'page' : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center gap-2 rounded-button',
            'transition-all duration-g3-fast ease-g3',
            'cursor-pointer select-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
            sizeStyles[size],
            // 状态样式
            isSelected && !danger && 'bg-blue-50 text-blue-600',
            !isSelected && !danger && !disabled && 'text-gray-700 hover:bg-gray-100',
            danger && !disabled && 'text-red-600 hover:bg-red-50',
            disabled && 'cursor-not-allowed text-gray-400',
            // 折叠模式
            collapsed && 'justify-center px-2',
            className,
          )}
          {...props}
        >
          {icon && (
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{icon}</span>
          )}
          {(!collapsed || mode !== 'inline') && <span className="flex-1 truncate">{children}</span>}
        </li>
      );
    },
  ),
);

MenuItem.displayName = 'MenuItem';

/* ========================================
 * SubMenu 组件 - 子菜单
 * ======================================== */
export interface SubMenuProps extends Omit<HTMLAttributes<HTMLLIElement>, 'title'> {
  /** 子菜单唯一标识 */
  itemKey: string;
  /** 子菜单标题 */
  title: ReactNode;
  /** 图标 */
  icon?: ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
}

export const SubMenu = memo(
  forwardRef<HTMLLIElement, SubMenuProps>(
    ({ itemKey, title, icon, disabled = false, className, children, ...props }, ref) => {
      const { mode, size, openKeys, onOpenChange, collapsed } = useMenuContext();
      const isOpen = openKeys.includes(itemKey);
      const [menuId] = useState(() => generateId('submenu'));
      const triggerRef = useRef<HTMLDivElement>(null);

      const toggleOpen = () => {
        if (disabled) return;
        const newOpenKeys = isOpen ? openKeys.filter((k) => k !== itemKey) : [...openKeys, itemKey];
        onOpenChange(newOpenKeys);
      };

      const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;

        if (e.key === Keys.Enter || e.key === Keys.Space) {
          e.preventDefault();
          toggleOpen();
        } else if (e.key === Keys.ArrowRight && !isOpen && mode !== 'horizontal') {
          e.preventDefault();
          toggleOpen();
        } else if (e.key === Keys.ArrowLeft && isOpen && mode !== 'horizontal') {
          e.preventDefault();
          toggleOpen();
        } else if (e.key === Keys.Escape && isOpen) {
          e.preventDefault();
          onOpenChange(openKeys.filter((k) => k !== itemKey));
          triggerRef.current?.focus();
        }
      };

      return (
        <li ref={ref} role="none" className={cn('relative', className)} {...props}>
          <div
            ref={triggerRef}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-controls={menuId}
            tabIndex={disabled ? -1 : 0}
            onClick={toggleOpen}
            onKeyDown={handleKeyDown}
            className={cn(
              'flex items-center gap-2 rounded-button',
              'transition-all duration-g3-fast ease-g3',
              'cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
              sizeStyles[size],
              !disabled && 'text-gray-700 hover:bg-gray-100',
              disabled && 'cursor-not-allowed text-gray-400',
              collapsed && mode === 'inline' && 'justify-center px-2',
            )}
          >
            {icon && (
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{icon}</span>
            )}
            {(!collapsed || mode !== 'inline') && (
              <>
                <span className="flex-1 truncate">{title}</span>
                <svg
                  className={cn(
                    'h-4 w-4 transition-transform duration-g3-fast',
                    isOpen && 'rotate-180',
                    mode === 'horizontal' && 'rotate-0',
                  )}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    stroke="currentColor"
                  />
                </svg>
              </>
            )}
          </div>

          {/* 子菜单内容 */}
          {isOpen && (
            <ul
              id={menuId}
              role="menu"
              aria-orientation="vertical"
              className={cn(
                'm-0 list-none overflow-hidden',
                'animate-g3-fade-in',
                mode === 'horizontal' &&
                  'absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-button border border-gray-100 bg-white py-1 shadow-elevated',
                mode !== 'horizontal' && 'mt-1 pl-4',
              )}
            >
              {children}
            </ul>
          )}
        </li>
      );
    },
  ),
);

SubMenu.displayName = 'SubMenu';

/* ========================================
 * MenuGroup 组件 - 菜单分组
 * ======================================== */
export interface MenuGroupProps extends Omit<HTMLAttributes<HTMLLIElement>, 'title'> {
  /** 分组标题 */
  title: ReactNode;
}

export const MenuGroup = memo(
  forwardRef<HTMLLIElement, MenuGroupProps>(({ title, className, children, ...props }, ref) => {
    const { size, collapsed, mode } = useMenuContext();

    return (
      <li ref={ref} role="none" className={cn('mt-2', className)} {...props}>
        {(!collapsed || mode !== 'inline') && (
          <div
            className={cn(
              'px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500',
              size === 'sm' && 'px-3 py-1',
            )}
          >
            {title}
          </div>
        )}
        <ul
          role="group"
          aria-label={typeof title === 'string' ? title : undefined}
          className="m-0 list-none p-0"
        >
          {children}
        </ul>
      </li>
    );
  }),
);

MenuGroup.displayName = 'MenuGroup';

/* ========================================
 * MenuDivider 组件 - 分割线
 * ======================================== */
export interface MenuDividerProps extends HTMLAttributes<HTMLLIElement> {}

export const MenuDivider = memo(
  forwardRef<HTMLLIElement, MenuDividerProps>(({ className, ...props }, ref) => {
    return (
      <li
        ref={ref}
        role="separator"
        aria-hidden="true"
        className={cn('mx-2 my-1 h-px bg-gray-200', className)}
        {...props}
      />
    );
  }),
);

MenuDivider.displayName = 'MenuDivider';
