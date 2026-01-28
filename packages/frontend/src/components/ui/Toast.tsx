import { useEffect, ReactNode } from 'react';
import { CheckCircle, XCircle, Warning, Info, X } from '../Icon';
import { useToastStore } from '../../stores';
import { IconColor } from '../../utils/iconColors';

interface CustomToastOptions {
  duration?: number;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const showToast = useToastStore((state) => state.showToast);
  const showCustom = useToastStore((state) => state.showCustom);
  const success = useToastStore((state) => state.success);
  const error = useToastStore((state) => state.error);
  const warning = useToastStore((state) => state.warning);
  const info = useToastStore((state) => state.info);

  return {
    showToast,
    custom: (content: ReactNode, options?: CustomToastOptions) => showCustom(content, options),
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
  success:
    'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  error:
    'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  warning:
    'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
  info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
};

type StandardToastType = 'success' | 'error' | 'warning' | 'info';

const toastIconColors: Record<StandardToastType, string> = {
  success: IconColor.success,
  error: IconColor.danger,
  warning: IconColor.warning,
  info: IconColor.primary,
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
        {toasts.map((toast) => {
          if (toast.type === 'custom' && toast.customContent) {
            return (
              <div
                key={toast.id}
                className="pointer-events-auto animate-g3-slide-in-right"
                role="alert"
              >
                {toast.customContent}
              </div>
            );
          }

          const Icon = toastIcons[toast.type as keyof typeof toastIcons];
          const style = toastStyles[toast.type as keyof typeof toastStyles];
          const iconColor = toastIconColors[toast.type as keyof typeof toastIconColors];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex min-w-[280px] max-w-[400px] animate-g3-slide-in-right items-start gap-3 rounded-button border px-4 py-3 shadow-elevated ${style}`}
              role="alert"
            >
              <Icon size={20} weight="fill" color={iconColor} className="mt-0.5 flex-shrink-0" />
              <p className="flex-1 text-sm font-medium">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
