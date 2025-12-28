/**
 * Breadcrumb 组件
 *
 * 面包屑导航组件，展示当前页面在层级结构中的位置
 */
import React, {
  forwardRef,
  memo,
  createContext,
  useContext,
  HTMLAttributes,
  ReactNode,
  KeyboardEvent,
  AnchorHTMLAttributes,
} from 'react';
import { cn, Keys } from './utils';

/* ========================================
 * Breadcrumb Context
 * ======================================== */
interface BreadcrumbContextValue {
  separator: ReactNode;
  size: 'sm' | 'md' | 'lg';
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  separator: '/',
  size: 'md',
});

function useBreadcrumbContext() {
  return useContext(BreadcrumbContext);
}

/* ========================================
 * Breadcrumb 根组件
 * ======================================== */
export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  /** 分隔符 */
  separator?: ReactNode;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 最大显示数量（超出折叠） */
  maxItems?: number;
  /** 折叠后保留的首尾数量 */
  itemsBeforeCollapse?: number;
  itemsAfterCollapse?: number;
}

const sizeStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xs gap-1',
  md: 'text-sm gap-2',
  lg: 'text-base gap-2.5',
};

export const Breadcrumb = memo(
  forwardRef<HTMLElement, BreadcrumbProps>(
    (
      {
        separator = (
          <svg className="h-3 w-3 text-gray-400 dark:text-gray-500" viewBox="0 0 12 12" fill="none">
            <path
              d="M4.5 2.5L7.5 6L4.5 9.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
        size = 'md',
        maxItems,
        itemsBeforeCollapse = 1,
        itemsAfterCollapse = 2,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const childArray = React.Children.toArray(children);
      let displayChildren = childArray;

      // 处理折叠逻辑
      if (maxItems && childArray.length > maxItems) {
        const beforeItems = childArray.slice(0, itemsBeforeCollapse);
        const afterItems = childArray.slice(-itemsAfterCollapse);

        displayChildren = [...beforeItems, <BreadcrumbEllipsis key="ellipsis" />, ...afterItems];
      }

      return (
        <BreadcrumbContext.Provider value={{ separator, size }}>
          <nav ref={ref} aria-label="面包屑导航" className={className} {...props}>
            <ol className={cn('flex flex-wrap items-center', sizeStyles[size])}>
              {displayChildren.map((child, index) => (
                <li key={index} className="flex items-center gap-2">
                  {index > 0 && (
                    <span
                      className="flex-shrink-0 text-gray-400 dark:text-gray-500"
                      aria-hidden="true"
                    >
                      {separator}
                    </span>
                  )}
                  {child}
                </li>
              ))}
            </ol>
          </nav>
        </BreadcrumbContext.Provider>
      );
    },
  ),
);

Breadcrumb.displayName = 'Breadcrumb';

/* ========================================
 * BreadcrumbItem 组件
 * ======================================== */
export interface BreadcrumbItemProps extends HTMLAttributes<HTMLSpanElement> {
  /** 是否为当前页（最后一项） */
  isCurrent?: boolean;
  /** 图标 */
  icon?: ReactNode;
}

export const BreadcrumbItem = memo(
  forwardRef<HTMLSpanElement, BreadcrumbItemProps>(
    ({ isCurrent = false, icon, className, children, ...props }, ref) => {
      return (
        <span
          ref={ref}
          aria-current={isCurrent ? 'page' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5',
            isCurrent
              ? 'font-medium text-gray-900 dark:text-white'
              : 'text-gray-500 dark:text-gray-400',
            className,
          )}
          {...props}
        >
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children}
        </span>
      );
    },
  ),
);

BreadcrumbItem.displayName = 'BreadcrumbItem';

/* ========================================
 * BreadcrumbLink 组件
 * ======================================== */
export interface BreadcrumbLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** 图标 */
  icon?: ReactNode;
  /** 自定义渲染组件（如 react-router Link） */
  as?: React.ElementType;
}

export const BreadcrumbLink = memo(
  forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
    ({ icon, as: Component = 'a', className, children, onKeyDown, ...props }, ref) => {
      const handleKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === Keys.Enter || e.key === Keys.Space) {
          // 让默认行为处理
        }
        onKeyDown?.(e);
      };

      return (
        <Component
          ref={ref}
          onKeyDown={handleKeyDown}
          className={cn(
            'inline-flex items-center gap-1.5',
            'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
            'transition-colors duration-g3-instant',
            'focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            className,
          )}
          {...props}
        >
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children}
        </Component>
      );
    },
  ),
);

BreadcrumbLink.displayName = 'BreadcrumbLink';

/* ========================================
 * BreadcrumbEllipsis 组件 - 折叠省略
 * ======================================== */
export interface BreadcrumbEllipsisProps extends HTMLAttributes<HTMLSpanElement> {}

export const BreadcrumbEllipsis = memo(
  forwardRef<HTMLSpanElement, BreadcrumbEllipsisProps>(({ className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        role="presentation"
        aria-hidden="true"
        className={cn(
          'flex w-6 items-center justify-center',
          'text-gray-400 dark:text-gray-500',
          className,
        )}
        {...props}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </span>
    );
  }),
);

BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis';

/* ========================================
 * BreadcrumbSeparator 组件 - 自定义分隔符
 * ======================================== */
export interface BreadcrumbSeparatorProps extends HTMLAttributes<HTMLSpanElement> {}

export const BreadcrumbSeparator = memo(
  forwardRef<HTMLSpanElement, BreadcrumbSeparatorProps>(
    ({ className, children, ...props }, ref) => {
      const { separator } = useBreadcrumbContext();

      return (
        <span
          ref={ref}
          role="presentation"
          aria-hidden="true"
          className={cn('flex-shrink-0 text-gray-400 dark:text-gray-500', className)}
          {...props}
        >
          {children || separator}
        </span>
      );
    },
  ),
);

BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';
