import { useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Warning, Info, X } from '../Icon';
import { useToastStore, ToastType } from '../../stores';

// 导出hook供其他组件使用
export function useToast() {
  const showToast = useToastStore((state) => state.showToast);
  const success = useToastStore((state) => state.success);
  const error = useToastStore((state) => state.error);
  const warning = useToastStore((state) => state.warning);
  const info = useToastStore((state) => state.info);

  return {
    showToast,
    success,
    error,
    warning,
    info,
  };
}

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: Warning,
  info: Info,
};

const toastStyles = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const iconColors = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  // 从store获取状态和方法
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  const clearAllToasts = useToastStore((state) => state.clearAllToasts);

  // 组件卸载时清理所有toast和定时器
  useEffect(() => {
    return () => {
      clearAllToasts();
    };
  }, [clearAllToasts]);

  return (
    <>
      {children}

      {/* Toast Container */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const Icon = toastIcons[toast.type];
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 100, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto flex min-w-[280px] max-w-[400px] items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${toastStyles[toast.type]}`}
                role="alert"
              >
                <Icon
                  size={20}
                  weight="fill"
                  color={iconColors[toast.type]}
                  className="mt-0.5 flex-shrink-0"
                />
                <p className="flex-1 text-sm font-medium">{toast.message}</p>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5"
                  aria-label="关闭"
                >
                  <X size={16} weight="bold" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}
