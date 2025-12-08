/**
 * Tag 组件
 *
 * 标签组件，用于分类、标记和筛选
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode, KeyboardEvent } from 'react';
import { cn, Keys, Variant } from './utils';

/* ========================================
 * Tag 组件
 * ======================================== */
export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** 变体颜色 */
  variant?: Variant | 'default';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否可关闭 */
  closable?: boolean;
  /** 关闭回调 */
  onClose?: () => void;
  /** 是否可点击 */
  clickable?: boolean;
  /** 是否选中 */
  selected?: boolean;
  /** 左侧图标 */
  icon?: ReactNode;
  /** 是否圆角 */
  rounded?: boolean;
  /** 是否有边框 */
  outlined?: boolean;
}

const variantStyles: Record<
  Variant | 'default',
  { solid: string; outline: string; selected: string }
> = {
  default: {
    solid: 'bg-gray-100 text-gray-700',
    outline: 'border-gray-300 text-gray-700',
    selected: 'bg-gray-200 text-gray-900',
  },
  primary: {
    solid: 'bg-blue-100 text-blue-700',
    outline: 'border-blue-300 text-blue-700',
    selected: 'bg-blue-500 text-white',
  },
  secondary: {
    solid: 'bg-gray-100 text-gray-600',
    outline: 'border-gray-300 text-gray-600',
    selected: 'bg-gray-300 text-gray-800',
  },
  ghost: {
    solid: 'bg-transparent text-gray-600',
    outline: 'border-transparent text-gray-600',
    selected: 'bg-gray-100 text-gray-800',
  },
  danger: {
    solid: 'bg-red-100 text-red-700',
    outline: 'border-red-300 text-red-700',
    selected: 'bg-red-500 text-white',
  },
  success: {
    solid: 'bg-green-100 text-green-700',
    outline: 'border-green-300 text-green-700',
    selected: 'bg-green-500 text-white',
  },
  warning: {
    solid: 'bg-amber-100 text-amber-700',
    outline: 'border-amber-300 text-amber-700',
    selected: 'bg-amber-500 text-white',
  },
  info: {
    solid: 'bg-blue-100 text-blue-700',
    outline: 'border-blue-300 text-blue-700',
    selected: 'bg-blue-500 text-white',
  },
};

const sizeStyles: Record<'sm' | 'md' | 'lg', { tag: string; icon: string; close: string }> = {
  sm: {
    tag: 'px-2 py-0.5 text-xs gap-1',
    icon: 'w-3 h-3',
    close: 'w-3.5 h-3.5 -mr-0.5',
  },
  md: {
    tag: 'px-2.5 py-1 text-xs gap-1.5',
    icon: 'w-3.5 h-3.5',
    close: 'w-4 h-4 -mr-0.5',
  },
  lg: {
    tag: 'px-3 py-1.5 text-sm gap-2',
    icon: 'w-4 h-4',
    close: 'w-4.5 h-4.5 -mr-1',
  },
};

export const Tag = memo(
  forwardRef<HTMLSpanElement, TagProps>(
    (
      {
        variant = 'default',
        size = 'md',
        closable = false,
        onClose,
        clickable = false,
        selected = false,
        icon,
        rounded = false,
        outlined = false,
        className,
        children,
        onClick,
        onKeyDown,
        ...props
      },
      ref,
    ) => {
      const styles = variantStyles[variant];
      const sizes = sizeStyles[size];

      const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
        if (clickable && (e.key === Keys.Enter || e.key === Keys.Space)) {
          e.preventDefault();
          (e.currentTarget as HTMLSpanElement).click();
        }
        onKeyDown?.(e);
      };

      const handleCloseKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === Keys.Enter || e.key === Keys.Space) {
          e.preventDefault();
          e.stopPropagation();
          onClose?.();
        }
      };

      const handleCloseClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onClose?.();
      };

      return (
        <span
          ref={ref}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          aria-pressed={clickable ? selected : undefined}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'inline-flex items-center font-medium',
            'transition-all duration-g3-fast ease-g3',
            rounded ? 'rounded-full' : 'rounded-md',
            outlined && 'border',
            // 样式
            selected ? styles.selected : outlined ? styles.outline : styles.solid,
            // 尺寸
            sizes.tag,
            // 交互
            clickable && 'cursor-pointer hover:opacity-80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
            className,
          )}
          {...props}
        >
          {icon && <span className={cn('flex-shrink-0', sizes.icon)}>{icon}</span>}
          <span className="truncate">{children}</span>
          {closable && (
            <button
              type="button"
              onClick={handleCloseClick}
              onKeyDown={handleCloseKeyDown}
              className={cn(
                'flex flex-shrink-0 items-center justify-center',
                'rounded-full opacity-60 hover:opacity-100',
                'transition-opacity duration-g3-instant',
                'focus:outline-none focus:ring-2 focus:ring-current focus:ring-offset-1',
                sizes.close,
              )}
              aria-label="Remove tag"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
              </svg>
            </button>
          )}
        </span>
      );
    },
  ),
);

Tag.displayName = 'Tag';

/* ========================================
 * TagGroup 组件 - 标签组
 * ======================================== */
export interface TagGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** 间距 */
  spacing?: 'sm' | 'md' | 'lg';
  /** 是否允许换行 */
  wrap?: boolean;
}

const spacingStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'gap-1',
  md: 'gap-2',
  lg: 'gap-3',
};

export const TagGroup = memo(
  forwardRef<HTMLDivElement, TagGroupProps>(
    ({ spacing = 'md', wrap = true, className, children, ...props }, ref) => {
      return (
        <div
          ref={ref}
          role="group"
          className={cn(
            'flex items-center',
            spacingStyles[spacing],
            wrap && 'flex-wrap',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

TagGroup.displayName = 'TagGroup';

/* ========================================
 * SelectableTag 组件 - 可选择标签
 * ======================================== */
export interface SelectableTagProps extends Omit<TagProps, 'clickable' | 'onClick'> {
  /** 选中状态变化回调 */
  onSelectedChange?: (selected: boolean) => void;
}

export const SelectableTag = memo(
  forwardRef<HTMLSpanElement, SelectableTagProps>(
    ({ selected = false, onSelectedChange, ...props }, ref) => {
      const handleClick = () => {
        onSelectedChange?.(!selected);
      };

      return <Tag ref={ref} clickable selected={selected} onClick={handleClick} {...props} />;
    },
  ),
);

SelectableTag.displayName = 'SelectableTag';
