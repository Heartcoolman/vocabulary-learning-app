/**
 * Avatar 组件
 *
 * 头像展示，支持图片、文字和图标
 */
import React, { forwardRef, memo, useState, HTMLAttributes, ReactNode } from 'react';
import { User } from '../Icon';
import { cn, Size } from './utils';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** 图片地址 */
  src?: string;
  /** 替代文本 */
  alt?: string;
  /** 显示的文字（当没有图片时显示首字母） */
  name?: string;
  /** 尺寸 */
  size?: Size;
  /** 形状 */
  shape?: 'circle' | 'square';
  /** 自定义图标 */
  icon?: ReactNode;
  /** 状态指示器 */
  status?: 'online' | 'offline' | 'busy' | 'away';
  /** 加载失败时的回调 */
  onError?: () => void;
}

const sizeStyles: Record<Size, { container: string; text: string; icon: number; status: string }> =
  {
    xs: { container: 'w-6 h-6', text: 'text-xs', icon: 12, status: 'w-1.5 h-1.5 border' },
    sm: { container: 'w-8 h-8', text: 'text-sm', icon: 14, status: 'w-2 h-2 border' },
    md: { container: 'w-10 h-10', text: 'text-base', icon: 18, status: 'w-2.5 h-2.5 border-2' },
    lg: { container: 'w-12 h-12', text: 'text-lg', icon: 22, status: 'w-3 h-3 border-2' },
    xl: { container: 'w-16 h-16', text: 'text-xl', icon: 28, status: 'w-3.5 h-3.5 border-2' },
  };

const statusColors: Record<'online' | 'offline' | 'busy' | 'away', string> = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  busy: 'bg-red-500',
  away: 'bg-amber-500',
};

// 从名字中提取首字母
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

// 根据名字生成背景色
function getColorFromName(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-amber-500',
    'bg-red-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const Avatar = memo(
  forwardRef<HTMLDivElement, AvatarProps>(
    (
      { src, alt, name, size = 'md', shape = 'circle', icon, status, onError, className, ...props },
      ref,
    ) => {
      const [imgError, setImgError] = useState(false);
      const { container, text, icon: iconSize, status: statusSize } = sizeStyles[size];
      const showImage = src && !imgError;
      const showInitials = !showImage && name;
      const showIcon = !showImage && !name;

      const handleError = () => {
        setImgError(true);
        onError?.();
      };

      return (
        <div
          ref={ref}
          className={cn(
            'relative inline-flex flex-shrink-0 items-center justify-center',
            'overflow-hidden',
            container,
            shape === 'circle' ? 'rounded-full' : 'rounded-lg',
            !showImage && (name ? getColorFromName(name) : 'bg-gray-200'),
            className,
          )}
          {...props}
        >
          {showImage && (
            <img
              src={src}
              alt={alt || name || 'avatar'}
              onError={handleError}
              className="h-full w-full object-cover"
            />
          )}

          {showInitials && (
            <span className={cn('select-none font-medium text-white', text)} aria-hidden="true">
              {getInitials(name)}
            </span>
          )}

          {showIcon &&
            (icon || (
              <User size={iconSize} weight="bold" className="text-gray-400" aria-hidden="true" />
            ))}

          {/* 无障碍：屏幕阅读器文本 */}
          <span className="sr-only">{alt || name || 'User avatar'}</span>

          {/* 状态指示器 */}
          {status && (
            <span
              className={cn(
                'absolute bottom-0 right-0',
                'rounded-full border-white',
                statusSize,
                statusColors[status],
              )}
              aria-label={status}
            />
          )}
        </div>
      );
    },
  ),
);

Avatar.displayName = 'Avatar';

/* ========================================
 * AvatarGroup - 头像组
 * ======================================== */
export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** 最多显示数量 */
  max?: number;
  /** 头像尺寸 */
  size?: Size;
  /** 子元素（Avatar） */
  children: ReactNode;
}

export const AvatarGroup = memo(
  forwardRef<HTMLDivElement, AvatarGroupProps>(
    ({ max = 4, size = 'md', className, children, ...props }, ref) => {
      const childArray = React.Children.toArray(children);
      const visibleChildren = childArray.slice(0, max);
      const extraCount = childArray.length - max;
      const { container, text } = sizeStyles[size];

      return (
        <div ref={ref} className={cn('flex items-center -space-x-2', className)} {...props}>
          {visibleChildren.map((child, index) => (
            <div
              key={index}
              className="relative rounded-full ring-2 ring-white"
              style={{ zIndex: visibleChildren.length - index }}
            >
              {React.isValidElement(child)
                ? React.cloneElement(child as React.ReactElement<AvatarProps>, { size })
                : child}
            </div>
          ))}

          {extraCount > 0 && (
            <div
              className={cn(
                'relative flex items-center justify-center',
                'bg-gray-100 font-medium text-gray-600',
                'rounded-full ring-2 ring-white',
                container,
                text,
              )}
              style={{ zIndex: 0 }}
            >
              +{extraCount}
            </div>
          )}
        </div>
      );
    },
  ),
);

AvatarGroup.displayName = 'AvatarGroup';
