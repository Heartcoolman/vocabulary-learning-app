/**
 * Skeleton 组件
 *
 * 骨架屏加载占位符
 */
import React, { forwardRef, memo, HTMLAttributes } from 'react';
import { cn } from './utils';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** 宽度 */
  width?: string | number;
  /** 高度 */
  height?: string | number;
  /** 形状 */
  variant?: 'text' | 'rectangular' | 'circular';
  /** 是否有动画 */
  animation?: 'pulse' | 'shimmer' | 'none';
}

export const Skeleton = memo(
  forwardRef<HTMLDivElement, SkeletonProps>(
    (
      { width, height, variant = 'text', animation = 'shimmer', className, style, ...props },
      ref,
    ) => {
      const variantStyles: Record<string, string> = {
        text: 'rounded-badge h-4',
        rectangular: 'rounded-badge',
        circular: 'rounded-full',
      };

      const animationStyles: Record<string, string> = {
        pulse: 'animate-pulse-soft',
        shimmer: 'skeleton',
        none: 'skeleton-static',
      };

      return (
        <div
          ref={ref}
          className={cn(
            'bg-gray-200/60',
            variantStyles[variant],
            animationStyles[animation],
            className,
          )}
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            height: typeof height === 'number' ? `${height}px` : height,
            ...style,
          }}
          aria-hidden="true"
          {...props}
        />
      );
    },
  ),
);

Skeleton.displayName = 'Skeleton';

/* ========================================
 * 预设骨架屏组件
 * ======================================== */

/** 文本行骨架屏 */
export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  /** 行数 */
  lines?: number;
  /** 最后一行宽度 */
  lastLineWidth?: string | number;
}

export const SkeletonText = memo(
  forwardRef<HTMLDivElement, SkeletonTextProps>(
    ({ lines = 3, lastLineWidth = '60%', className, ...props }, ref) => {
      return (
        <div ref={ref} className={cn('space-y-2', className)} {...props}>
          {Array.from({ length: lines }).map((_, index) => (
            <Skeleton
              key={index}
              variant="text"
              width={index === lines - 1 ? lastLineWidth : '100%'}
            />
          ))}
        </div>
      );
    },
  ),
);

SkeletonText.displayName = 'SkeletonText';

/** 头像骨架屏 */
export interface SkeletonAvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const avatarSizes: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

export const SkeletonAvatar = memo(
  forwardRef<HTMLDivElement, SkeletonAvatarProps>(({ size = 'md', className, ...props }, ref) => {
    const dimension = avatarSizes[size];
    return (
      <Skeleton
        ref={ref}
        variant="circular"
        width={dimension}
        height={dimension}
        className={className}
        {...props}
      />
    );
  }),
);

SkeletonAvatar.displayName = 'SkeletonAvatar';

/** 按钮骨架屏 */
export interface SkeletonButtonProps extends HTMLAttributes<HTMLDivElement> {
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 宽度 */
  width?: string | number;
}

const buttonSizes: Record<'sm' | 'md' | 'lg', number> = {
  sm: 32,
  md: 38,
  lg: 44,
};

export const SkeletonButton = memo(
  forwardRef<HTMLDivElement, SkeletonButtonProps>(
    ({ size = 'md', width = 100, className, ...props }, ref) => {
      return (
        <Skeleton
          ref={ref}
          variant="rectangular"
          width={width}
          height={buttonSizes[size]}
          className={cn('rounded-button', className)}
          {...props}
        />
      );
    },
  ),
);

SkeletonButton.displayName = 'SkeletonButton';

/** 卡片骨架屏 */
export interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否显示头像 */
  avatar?: boolean;
  /** 是否显示图片 */
  image?: boolean;
  /** 文本行数 */
  lines?: number;
}

export const SkeletonCard = memo(
  forwardRef<HTMLDivElement, SkeletonCardProps>(
    ({ avatar = true, image = false, lines = 3, className, ...props }, ref) => {
      return (
        <div
          ref={ref}
          className={cn(
            'rounded-card border border-gray-100/50 bg-white p-4',
            'space-y-4 shadow-soft',
            className,
          )}
          {...props}
        >
          {image && (
            <Skeleton variant="rectangular" height={160} className="-mx-4 -mt-4 rounded-button" />
          )}

          {avatar && (
            <div className="flex items-center gap-3">
              <SkeletonAvatar size="md" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="50%" />
                <Skeleton variant="text" width="30%" />
              </div>
            </div>
          )}

          <SkeletonText lines={lines} />
        </div>
      );
    },
  ),
);

SkeletonCard.displayName = 'SkeletonCard';
