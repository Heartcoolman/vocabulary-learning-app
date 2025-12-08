/**
 * List 组件
 *
 * 列表展示组件，支持多种布局和交互模式
 */
import React, {
  forwardRef,
  memo,
  createContext,
  useContext,
  HTMLAttributes,
  ReactNode,
  KeyboardEvent,
} from 'react';
import { cn, Keys, Size } from './utils';

/* ========================================
 * List Context
 * ======================================== */
interface ListContextValue {
  size: Size;
  variant: 'default' | 'bordered' | 'divided';
  interactive: boolean;
}

const ListContext = createContext<ListContextValue>({
  size: 'md',
  variant: 'default',
  interactive: false,
});

function useListContext() {
  return useContext(ListContext);
}

/* ========================================
 * List 根组件
 * ======================================== */
export interface ListProps extends HTMLAttributes<HTMLUListElement> {
  /** 尺寸 */
  size?: Size;
  /** 变体样式 */
  variant?: 'default' | 'bordered' | 'divided';
  /** 是否可交互（hover效果） */
  interactive?: boolean;
  /** 是否水平排列 */
  horizontal?: boolean;
  /** 列表类型 */
  as?: 'ul' | 'ol';
}

const listSizeStyles: Record<Size, string> = {
  xs: 'text-xs gap-1',
  sm: 'text-sm gap-1.5',
  md: 'text-sm gap-2',
  lg: 'text-base gap-2.5',
  xl: 'text-lg gap-3',
};

export const List = memo(
  forwardRef<HTMLUListElement, ListProps>(
    (
      {
        size = 'md',
        variant = 'default',
        interactive = false,
        horizontal = false,
        as: Component = 'ul',
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const variantStyles = {
        default: '',
        bordered: 'border border-gray-200 rounded-lg overflow-hidden',
        divided: horizontal
          ? '[&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:border-gray-200'
          : '[&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-gray-200',
      };

      return (
        <ListContext.Provider value={{ size, variant, interactive }}>
          <Component
            ref={ref as any}
            role="list"
            className={cn(
              'flex',
              horizontal ? 'flex-row flex-wrap' : 'flex-col',
              listSizeStyles[size],
              variantStyles[variant],
              className,
            )}
            {...props}
          >
            {children}
          </Component>
        </ListContext.Provider>
      );
    },
  ),
);

List.displayName = 'List';

/* ========================================
 * ListItem 组件
 * ======================================== */
export interface ListItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'prefix'> {
  /** 前缀内容（图标等） */
  prefix?: ReactNode;
  /** 后缀内容（操作按钮等） */
  suffix?: ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否选中 */
  selected?: boolean;
  /** 是否可点击 */
  clickable?: boolean;
  /** 主要内容 */
  primary?: ReactNode;
  /** 次要内容（描述文字） */
  secondary?: ReactNode;
}

const itemSizeStyles: Record<Size, string> = {
  xs: 'px-2 py-1',
  sm: 'px-2.5 py-1.5',
  md: 'px-3 py-2',
  lg: 'px-4 py-3',
  xl: 'px-5 py-4',
};

export const ListItem = memo(
  forwardRef<HTMLLIElement, ListItemProps>(
    (
      {
        prefix,
        suffix,
        disabled = false,
        selected = false,
        clickable,
        primary,
        secondary,
        className,
        children,
        onClick,
        onKeyDown,
        ...props
      },
      ref,
    ) => {
      const { size, interactive } = useListContext();
      const isClickable = clickable ?? (interactive || !!onClick);

      const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
        if (isClickable && !disabled && (e.key === Keys.Enter || e.key === Keys.Space)) {
          e.preventDefault();
          (e.currentTarget as HTMLLIElement).click();
        }
        onKeyDown?.(e);
      };

      const handleClick = (e: React.MouseEvent<HTMLLIElement>) => {
        if (!disabled) {
          onClick?.(e);
        }
      };

      return (
        <li
          ref={ref}
          role={isClickable ? 'button' : 'listitem'}
          tabIndex={isClickable && !disabled ? 0 : undefined}
          aria-disabled={disabled || undefined}
          aria-selected={selected || undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center gap-3',
            itemSizeStyles[size],
            'transition-colors duration-g3-instant',
            isClickable && !disabled && 'cursor-pointer hover:bg-gray-50',
            selected && 'bg-blue-50 hover:bg-blue-100',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
          {...props}
        >
          {prefix && (
            <span className="flex flex-shrink-0 items-center justify-center text-gray-500">
              {prefix}
            </span>
          )}

          <div className="min-w-0 flex-1">
            {primary || secondary ? (
              <>
                {primary && <div className="truncate font-medium text-gray-900">{primary}</div>}
                {secondary && (
                  <div className="mt-0.5 truncate text-sm text-gray-500">{secondary}</div>
                )}
              </>
            ) : (
              children
            )}
          </div>

          {suffix && (
            <span className="flex flex-shrink-0 items-center text-gray-400">{suffix}</span>
          )}
        </li>
      );
    },
  ),
);

ListItem.displayName = 'ListItem';

/* ========================================
 * ListItemButton 组件 - 可操作的列表项
 * ======================================== */
export interface ListItemButtonProps extends Omit<ListItemProps, 'clickable'> {}

export const ListItemButton = memo(
  forwardRef<HTMLLIElement, ListItemButtonProps>((props, ref) => {
    return <ListItem ref={ref} clickable {...props} />;
  }),
);

ListItemButton.displayName = 'ListItemButton';

/* ========================================
 * ListSubheader 组件 - 列表分组标题
 * ======================================== */
export interface ListSubheaderProps extends HTMLAttributes<HTMLLIElement> {
  /** 是否置顶（sticky） */
  sticky?: boolean;
}

export const ListSubheader = memo(
  forwardRef<HTMLLIElement, ListSubheaderProps>(
    ({ sticky = false, className, children, ...props }, ref) => {
      const { size } = useListContext();

      return (
        <li
          ref={ref}
          role="presentation"
          className={cn(
            'flex items-center',
            itemSizeStyles[size],
            'text-xs font-semibold uppercase tracking-wider text-gray-500',
            'bg-gray-50',
            sticky && 'sticky top-0 z-10',
            className,
          )}
          {...props}
        >
          {children}
        </li>
      );
    },
  ),
);

ListSubheader.displayName = 'ListSubheader';

/* ========================================
 * ListDivider 组件 - 分隔线
 * ======================================== */
export interface ListDividerProps extends HTMLAttributes<HTMLLIElement> {
  /** 是否带缩进 */
  inset?: boolean;
}

export const ListDivider = memo(
  forwardRef<HTMLLIElement, ListDividerProps>(({ inset = false, className, ...props }, ref) => {
    return (
      <li
        ref={ref}
        role="separator"
        aria-hidden="true"
        className={cn('my-1 h-px bg-gray-200', inset && 'ml-12', className)}
        {...props}
      />
    );
  }),
);

ListDivider.displayName = 'ListDivider';
