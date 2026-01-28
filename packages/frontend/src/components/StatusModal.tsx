import React from 'react';
import { createPortal } from 'react-dom';
import { X, ChartPie } from './Icon';
import AmasStatus from './AmasStatus';

interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  refreshTrigger?: number;
}

const StatusModalComponent = ({ isOpen, onClose, refreshTrigger = 0 }: StatusModalProps) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-g3-fade-in items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md animate-g3-scale-in overflow-hidden rounded-card bg-white shadow-floating dark:bg-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <ChartPie size={24} />
            <h3 className="text-lg font-bold">学习状态监控</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <AmasStatus detailed={true} refreshTrigger={refreshTrigger} />
        </div>

        {/* Footer */}
        <div className="flex justify-end bg-gray-50 px-6 py-4 dark:bg-slate-900">
          <button
            onClick={onClose}
            className="rounded-card bg-blue-500 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 hover:shadow-floating focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Memoized StatusModal component
 * Only re-renders when isOpen, onClose function, or refreshTrigger changes
 */
const StatusModal = React.memo(StatusModalComponent, (prevProps, nextProps) => {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.onClose === nextProps.onClose &&
    prevProps.refreshTrigger === nextProps.refreshTrigger
  );
});

export default StatusModal;
