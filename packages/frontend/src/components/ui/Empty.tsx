/**
 * Empty 组件
 *
 * 空状态展示组件，用于无数据时的占位显示
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn, Size } from './utils';

/* ========================================
 * Empty 组件
 * ======================================== */
export interface EmptyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 尺寸 */
  size?: Size;
  /** 自定义图标/图片 */
  icon?: ReactNode;
  /** 标题文字 */
  title?: ReactNode;
  /** 描述文字 */
  description?: ReactNode;
  /** 操作按钮区域 */
  action?: ReactNode;
  /** 预设图标类型 */
  type?:
    | 'default'
    | 'search'
    | 'error'
    | 'network'
    | 'data'
    | 'inbox'
    | 'learning'
    | 'wordbook'
    | 'history'
    | 'notification';
}

const sizeStyles: Record<Size, { container: string; icon: string; title: string; desc: string }> = {
  xs: {
    container: 'py-4 gap-2',
    icon: 'w-12 h-12',
    title: 'text-sm',
    desc: 'text-xs',
  },
  sm: {
    container: 'py-6 gap-2',
    icon: 'w-16 h-16',
    title: 'text-sm',
    desc: 'text-xs',
  },
  md: {
    container: 'py-8 gap-3',
    icon: 'w-20 h-20',
    title: 'text-base',
    desc: 'text-sm',
  },
  lg: {
    container: 'py-12 gap-4',
    icon: 'w-24 h-24',
    title: 'text-lg',
    desc: 'text-sm',
  },
  xl: {
    container: 'py-16 gap-5',
    icon: 'w-32 h-32',
    title: 'text-xl',
    desc: 'text-base',
  },
};

// 预设图标 SVG
const presetIcons: Record<string, ReactNode> = {
  default: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M8 26h48" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="21" r="2" fill="currentColor" />
      <circle cx="24" cy="21" r="2" fill="currentColor" />
      <circle cx="32" cy="21" r="2" fill="currentColor" />
      <path d="M20 36h24M20 44h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="28" r="16" stroke="currentColor" strokeWidth="2" />
      <path d="M40 40l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M22 28h12M28 22v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="2" />
      <path d="M32 20v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="44" r="2" fill="currentColor" />
    </svg>
  ),
  network: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="16" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="48" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="48" cy="48" r="8" stroke="currentColor" strokeWidth="2" />
      <path
        d="M26 22l-6 18M38 22l6 18M24 48h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 2"
      />
    </svg>
  ),
  data: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="32" cy="16" rx="20" ry="8" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 16v32c0 4.418 8.954 8 20 8s20-3.582 20-8V16"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 32c0 4.418 8.954 8 20 8s20-3.582 20-8"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.5"
      />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 24l8 24h32l8-24" stroke="currentColor" strokeWidth="2" />
      <path d="M8 24v20a4 4 0 004 4h40a4 4 0 004-4V24" stroke="currentColor" strokeWidth="2" />
      <path d="M24 36h16a4 4 0 004-4H20a4 4 0 004 4z" fill="currentColor" opacity="0.3" />
      <path
        d="M32 8v16M26 18l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  learning: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 20l24-12 24 12v4l-24 12-24-12v-4z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 24v16l24 12 24-12V24" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <path d="M32 32v20" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />
      <circle cx="32" cy="56" r="4" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  wordbook: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="8" width="40" height="48" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M20 8v48" stroke="currentColor" strokeWidth="2" />
      <path
        d="M28 20h16M28 28h12M28 36h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="2" />
      <path
        d="M32 16v18l10 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 32H4M60 32h-4M32 4v4M32 56v4"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.3"
      />
    </svg>
  ),
  notification: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 48h16c0 4.418-3.582 8-8 8s-8-3.582-8-8z" fill="currentColor" opacity="0.3" />
      <path
        d="M12 44h40c-2-4-4-8-4-16 0-8.837-7.163-16-16-16s-16 7.163-16 16c0 8-2 12-4 16z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  ),
};

// 预设文案
const presetTexts: Record<string, { title: string; description: string }> = {
  default: {
    title: '暂无内容',
    description: '当前没有可显示的数据',
  },
  search: {
    title: '未找到结果',
    description: '请尝试其他搜索关键词',
  },
  error: {
    title: '出错了',
    description: '加载数据时发生错误，请稍后重试',
  },
  network: {
    title: '网络异常',
    description: '请检查网络连接后重试',
  },
  data: {
    title: '暂无数据',
    description: '数据为空，请先添加内容',
  },
  inbox: {
    title: '收件箱为空',
    description: '暂时没有新消息',
  },
  learning: {
    title: '还没有学习记录',
    description: '开始学习单词后，这里会显示你的学习统计',
  },
  wordbook: {
    title: '暂无词书',
    description: '创建你的第一个词书，开始学习之旅',
  },
  history: {
    title: '还没有学习记录',
    description: '开始学习后，这里会记录你的学习历程',
  },
  notification: {
    title: '暂无通知',
    description: '新消息会显示在这里',
  },
};

export const Empty = memo(
  forwardRef<HTMLDivElement, EmptyProps>(
    (
      {
        size = 'md',
        icon,
        title,
        description,
        action,
        type = 'default',
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const styles = sizeStyles[size];
      const preset = presetTexts[type];
      const presetIcon = presetIcons[type];

      const displayIcon = icon ?? presetIcon;
      const displayTitle = title ?? preset.title;
      const displayDesc = description ?? preset.description;

      return (
        <div
          ref={ref}
          role="status"
          aria-label={typeof displayTitle === 'string' ? displayTitle : '空状态'}
          className={cn(
            'flex flex-col items-center justify-center text-center',
            styles.container,
            className,
          )}
          {...props}
        >
          {displayIcon && (
            <div className={cn('text-gray-300 dark:text-gray-600', styles.icon)}>{displayIcon}</div>
          )}

          {displayTitle && (
            <h3 className={cn('font-medium text-gray-900 dark:text-white', styles.title)}>
              {displayTitle}
            </h3>
          )}

          {displayDesc && (
            <p className={cn('max-w-sm text-gray-500 dark:text-gray-400', styles.desc)}>
              {displayDesc}
            </p>
          )}

          {children}

          {action && <div className="mt-4">{action}</div>}
        </div>
      );
    },
  ),
);

Empty.displayName = 'Empty';

/* ========================================
 * EmptySimple 组件 - 简单空状态
 * ======================================== */
export interface EmptySimpleProps extends HTMLAttributes<HTMLDivElement> {
  /** 消息文字 */
  message?: string;
}

export const EmptySimple = memo(
  forwardRef<HTMLDivElement, EmptySimpleProps>(
    ({ message = '暂无数据', className, ...props }, ref) => {
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-center justify-center py-8 text-sm text-gray-400 dark:text-gray-500',
            className,
          )}
          {...props}
        >
          {message}
        </div>
      );
    },
  ),
);

EmptySimple.displayName = 'EmptySimple';
