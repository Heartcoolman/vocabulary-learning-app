/**
 * UI 组件库工具函数
 *
 * 提供 className 合并、类型定义等通用功能
 */

/**
 * 合并 className，过滤掉 falsy 值
 * 简化版的 clsx/classnames 实现
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * 生成唯一 ID
 * 用于无障碍属性关联
 */
let idCounter = 0;
export function generateId(prefix: string = 'ui'): string {
  return `${prefix}-${++idCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 通用组件尺寸类型
 */
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * 通用组件变体类型
 */
export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info';

/**
 * 通用方向类型
 */
export type Direction = 'horizontal' | 'vertical';

/**
 * 通用位置类型
 */
export type Placement = 'top' | 'bottom' | 'left' | 'right';

/**
 * 延迟执行函数
 * 用于动画等场景
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 检测是否为服务端渲染
 */
export const isSSR = typeof window === 'undefined';

/**
 * 键盘按键常量
 */
export const Keys = {
  Enter: 'Enter',
  Space: ' ',
  Escape: 'Escape',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
} as const;
