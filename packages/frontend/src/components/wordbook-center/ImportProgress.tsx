import { CircleNotch, Check, Warning } from '@phosphor-icons/react';

interface ImportProgressProps {
  status: 'idle' | 'importing' | 'success' | 'error';
  message?: string;
}

export function ImportProgress({ status, message }: ImportProgressProps) {
  if (status === 'idle') return null;

  return (
    <div
      className={`fixed bottom-4 right-4 flex items-center gap-3 rounded-button px-4 py-3 shadow-elevated ${
        status === 'importing'
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : status === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      }`}
    >
      {status === 'importing' && <CircleNotch className="h-5 w-5 animate-spin" />}
      {status === 'success' && <Check className="h-5 w-5" />}
      {status === 'error' && <Warning className="h-5 w-5" />}
      <span className="text-sm font-medium">{message || '处理中...'}</span>
    </div>
  );
}
