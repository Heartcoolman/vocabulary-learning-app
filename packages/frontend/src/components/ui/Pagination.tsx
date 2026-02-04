/**
 * Pagination 组件
 *
 * 分页导航
 */
import React, { forwardRef, memo, HTMLAttributes, useMemo } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from './utils';

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  /** 当前页码（从 1 开始） */
  current: number;
  /** 总页数 */
  total: number;
  /** 页码变化回调 */
  onChange: (page: number) => void;
  /** 最多显示的页码数量 */
  siblingCount?: number;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示首尾页快捷按钮 */
  showEdges?: boolean;
}

const sizeStyles = {
  sm: {
    button: 'w-7 h-7 text-xs',
    icon: 14,
  },
  md: {
    button: 'w-9 h-9 text-sm',
    icon: 16,
  },
  lg: {
    button: 'w-11 h-11 text-base',
    icon: 18,
  },
};

// 生成页码数组
function generatePages(
  current: number,
  total: number,
  siblingCount: number,
): (number | 'ellipsis')[] {
  const totalNumbers = siblingCount * 2 + 3; // 兄弟 + 当前 + 首尾
  const totalBlocks = totalNumbers + 2; // 加上省略号

  if (total <= totalBlocks) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(current - siblingCount, 1);
  const rightSiblingIndex = Math.min(current + siblingCount, total);

  const shouldShowLeftEllipsis = leftSiblingIndex > 2;
  const shouldShowRightEllipsis = rightSiblingIndex < total - 1;

  if (!shouldShowLeftEllipsis && shouldShowRightEllipsis) {
    const leftItemCount = 3 + 2 * siblingCount;
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, 'ellipsis', total];
  }

  if (shouldShowLeftEllipsis && !shouldShowRightEllipsis) {
    const rightItemCount = 3 + 2 * siblingCount;
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => total - rightItemCount + i + 1,
    );
    return [1, 'ellipsis', ...rightRange];
  }

  const middleRange = Array.from(
    { length: rightSiblingIndex - leftSiblingIndex + 1 },
    (_, i) => leftSiblingIndex + i,
  );
  return [1, 'ellipsis', ...middleRange, 'ellipsis', total];
}

export const Pagination = memo(
  forwardRef<HTMLElement, PaginationProps>(
    (
      {
        current,
        total,
        onChange,
        siblingCount = 1,
        size = 'md',
        disabled = false,
        showEdges: _showEdges = true,
        className,
        ...props
      },
      ref,
    ) => {
      const { button: buttonSize, icon: iconSize } = sizeStyles[size];
      const pages = useMemo(
        () => generatePages(current, total, siblingCount),
        [current, total, siblingCount],
      );

      const canGoPrev = current > 1 && !disabled;
      const canGoNext = current < total && !disabled;

      const handlePageChange = (page: number) => {
        if (page >= 1 && page <= total && page !== current && !disabled) {
          onChange(page);
        }
      };

      const buttonBaseStyles = cn(
        'inline-flex items-center justify-center',
        'rounded-button font-medium',
        'transition-all duration-g3-fast ease-g3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        buttonSize,
      );

      const pageButtonStyles = (isActive: boolean) =>
        cn(
          buttonBaseStyles,
          isActive
            ? 'bg-blue-500 text-white shadow-button-rest'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700',
          disabled && 'cursor-not-allowed opacity-50',
        );

      const navButtonStyles = (canNavigate: boolean) =>
        cn(
          buttonBaseStyles,
          'text-gray-600 dark:text-gray-300',
          canNavigate
            ? 'hover:bg-gray-100 dark:hover:bg-slate-700'
            : 'cursor-not-allowed opacity-50',
        );

      if (total <= 1) return null;

      return (
        <nav
          ref={ref}
          role="navigation"
          aria-label="分页导航"
          className={cn('flex items-center gap-1', className)}
          {...props}
        >
          {/* 上一页 */}
          <button
            type="button"
            onClick={() => handlePageChange(current - 1)}
            disabled={!canGoPrev}
            className={navButtonStyles(canGoPrev)}
            aria-label="上一页"
          >
            <CaretLeft size={iconSize} />
          </button>

          {/* 页码 */}
          {pages.map((page, index) => {
            if (page === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className={cn(
                    'inline-flex items-center justify-center',
                    'text-gray-400 dark:text-gray-500',
                    buttonSize,
                  )}
                  aria-hidden="true"
                >
                  ...
                </span>
              );
            }

            const isActive = page === current;
            return (
              <button
                key={page}
                type="button"
                onClick={() => handlePageChange(page)}
                disabled={disabled}
                className={pageButtonStyles(isActive)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`第 ${page} 页`}
              >
                {page}
              </button>
            );
          })}

          {/* 下一页 */}
          <button
            type="button"
            onClick={() => handlePageChange(current + 1)}
            disabled={!canGoNext}
            className={navButtonStyles(canGoNext)}
            aria-label="下一页"
          >
            <CaretRight size={iconSize} />
          </button>
        </nav>
      );
    },
  ),
);

Pagination.displayName = 'Pagination';

/* ========================================
 * SimplePagination - 简单分页（仅上下页）
 * ======================================== */
export interface SimplePaginationProps extends Omit<PaginationProps, 'siblingCount' | 'showEdges'> {
  /** 显示页码信息 */
  showInfo?: boolean;
}

export const SimplePagination = memo(
  forwardRef<HTMLElement, SimplePaginationProps>(
    (
      {
        current,
        total,
        onChange,
        size = 'md',
        disabled = false,
        showInfo = true,
        className,
        ...props
      },
      ref,
    ) => {
      const { button: buttonSize, icon: iconSize } = sizeStyles[size];
      const canGoPrev = current > 1 && !disabled;
      const canGoNext = current < total && !disabled;

      const buttonStyles = (canNavigate: boolean) =>
        cn(
          'inline-flex items-center justify-center gap-1',
          'rounded-button font-medium px-3',
          'transition-all duration-g3-fast ease-g3',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
          buttonSize,
          canNavigate
            ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
            : 'cursor-not-allowed text-gray-300 dark:text-gray-600',
        );

      return (
        <nav
          ref={ref}
          role="navigation"
          aria-label="分页导航"
          className={cn('flex items-center gap-2', className)}
          {...props}
        >
          <button
            type="button"
            onClick={() => canGoPrev && onChange(current - 1)}
            disabled={!canGoPrev}
            className={buttonStyles(canGoPrev)}
          >
            <CaretLeft size={iconSize} />
            <span>上一页</span>
          </button>

          {showInfo && (
            <span className="px-2 text-sm text-gray-500 dark:text-gray-400">
              {current} / {total}
            </span>
          )}

          <button
            type="button"
            onClick={() => canGoNext && onChange(current + 1)}
            disabled={!canGoNext}
            className={buttonStyles(canGoNext)}
          >
            <span>下一页</span>
            <CaretRight size={iconSize} />
          </button>
        </nav>
      );
    },
  ),
);

SimplePagination.displayName = 'SimplePagination';
