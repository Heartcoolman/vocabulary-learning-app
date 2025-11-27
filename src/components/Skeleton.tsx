import { memo, useMemo } from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full' | 'card' | 'button' | 'badge';
  animated?: boolean;
}

interface SkeletonCardProps {
  className?: string;
  lines?: number;
  showAvatar?: boolean;
  showAction?: boolean;
  animated?: boolean;
}

interface SkeletonListProps {
  count?: number;
  className?: string;
  animated?: boolean;
}

const roundedClasses: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
  card: 'rounded-card',
  button: 'rounded-button',
  badge: 'rounded-badge',
};

/**
 * 检测用户是否偏好减少动画
 */
function usePrefersReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
}

/**
 * 基础骨架屏组件
 * 使用CSS shimmer动画提供加载占位
 * @param animated - 是否启用动画，默认true（会自动遵循prefers-reduced-motion）
 */
export const Skeleton = memo(function Skeleton({
  className = '',
  width,
  height,
  rounded = 'badge',
  animated = true,
}: SkeletonProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const roundedClass = roundedClasses[rounded];
  const shouldAnimate = animated && !prefersReducedMotion;

  return (
    <div
      className={`${shouldAnimate ? 'skeleton' : 'skeleton-static'} ${roundedClass} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
      role="presentation"
    />
  );
});

/**
 * 骨架屏卡片预设
 * 模拟常见的卡片布局
 */
export const SkeletonCard = memo(function SkeletonCard({
  className = '',
  lines = 3,
  showAvatar = false,
  showAction = true,
  animated = true,
}: SkeletonCardProps) {
  const lineWidths = ['w-3/4', 'w-full', 'w-5/6', 'w-2/3'];

  return (
    <div className={`skeleton-card ${className}`}>
      {showAvatar && (
        <div className="flex items-center gap-3 mb-4">
          <Skeleton rounded="full" width={40} height={40} animated={animated} />
          <div className="flex-1 space-y-2">
            <Skeleton height={14} className="w-1/3" animated={animated} />
            <Skeleton height={12} className="w-1/4" animated={animated} />
          </div>
        </div>
      )}

      <Skeleton height={20} className="w-2/3 mb-3" rounded="button" animated={animated} />

      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            height={14}
            className={lineWidths[index % lineWidths.length]}
            animated={animated}
          />
        ))}
      </div>

      {showAction && (
        <div className="mt-4 pt-3 border-t border-gray-100/50">
          <Skeleton height={36} className="w-24" rounded="button" animated={animated} />
        </div>
      )}
    </div>
  );
});

/**
 * 骨架屏列表预设
 * 快速生成多个骨架卡片
 */
export const SkeletonList = memo(function SkeletonList({
  count = 3,
  className = '',
  animated = true,
}: SkeletonListProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} lines={2} animated={animated} />
      ))}
    </div>
  );
});

/**
 * 骨架屏文本行
 * 用于段落占位
 */
export const SkeletonText = memo(function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4'];

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={14}
          className={index === lines - 1 ? 'w-3/5' : widths[index % widths.length]}
        />
      ))}
    </div>
  );
});

export default Skeleton;
