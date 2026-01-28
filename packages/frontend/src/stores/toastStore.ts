import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'custom';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  customContent?: ReactNode;
  duration?: number;
}

interface CustomToastOptions {
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  timers: Map<string, ReturnType<typeof setTimeout>>;

  // Actions
  showToast: (type: ToastType, message: string, duration?: number) => void;
  showCustom: (content: ReactNode, options?: CustomToastOptions) => void;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;

  // 便捷方法
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

export const useToastStore = create<ToastState>()(
  devtools(
    (set, get) => ({
      // 初始状态
      toasts: [],
      timers: new Map(),

      // 显示Toast
      showToast: (type: ToastType, message: string, duration = 3000) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const newToast: Toast = { id, type, message, duration };

        set(
          (state) => ({
            toasts: [...state.toasts, newToast],
          }),
          false,
          'showToast',
        );

        // 自动移除
        if (duration > 0) {
          const timerId = setTimeout(() => {
            get().removeToast(id);
          }, duration);

          // 存储定时器
          set(
            (state) => {
              const newTimers = new Map(state.timers);
              newTimers.set(id, timerId);
              return { timers: newTimers };
            },
            false,
            'setTimer',
          );
        }
      },

      // 显示自定义Toast
      showCustom: (content: ReactNode, options?: CustomToastOptions) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const duration = options?.duration ?? 5000;
        const newToast: Toast = {
          id,
          type: 'custom',
          message: '',
          customContent: content,
          duration,
        };

        set(
          (state) => ({
            toasts: [...state.toasts, newToast],
          }),
          false,
          'showCustom',
        );

        if (duration > 0) {
          const timerId = setTimeout(() => {
            get().removeToast(id);
          }, duration);

          set(
            (state) => {
              const newTimers = new Map(state.timers);
              newTimers.set(id, timerId);
              return { timers: newTimers };
            },
            false,
            'setTimer',
          );
        }
      },

      // 移除Toast
      removeToast: (id: string) => {
        const { timers } = get();
        const timerId = timers.get(id);

        if (timerId) {
          clearTimeout(timerId);
          const newTimers = new Map(timers);
          newTimers.delete(id);

          set(
            (state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
              timers: newTimers,
            }),
            false,
            'removeToast',
          );
        } else {
          set(
            (state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }),
            false,
            'removeToast',
          );
        }
      },

      // 清除所有Toast
      clearAllToasts: () => {
        const { timers } = get();

        // 清除所有定时器
        timers.forEach((timerId) => {
          clearTimeout(timerId);
        });

        set(
          {
            toasts: [],
            timers: new Map(),
          },
          false,
          'clearAllToasts',
        );
      },

      // 便捷方法
      success: (message: string, duration?: number) => {
        get().showToast('success', message, duration);
      },

      error: (message: string, duration?: number) => {
        get().showToast('error', message, duration);
      },

      warning: (message: string, duration?: number) => {
        get().showToast('warning', message, duration);
      },

      info: (message: string, duration?: number) => {
        get().showToast('info', message, duration);
      },
    }),
    {
      name: 'Toast Store',
      enabled: import.meta.env.DEV,
    },
  ),
);

// 组件卸载时清理定时器的Hook
export function useToastCleanup() {
  const clearAllToasts = useToastStore((state) => state.clearAllToasts);
  return clearAllToasts;
}
