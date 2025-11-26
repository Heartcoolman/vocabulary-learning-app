import { X, ChartPie } from './Icon';
import AmasStatus from './AmasStatus';

interface StatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    refreshTrigger?: number;
}

export default function StatusModal({ isOpen, onClose, refreshTrigger = 0 }: StatusModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-slide-up">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-blue-600">
                        <ChartPie size={24} weight="duotone" />
                        <h3 className="text-lg font-bold">学习状态监控</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="关闭"
                    >
                        <X size={20} weight="bold" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <AmasStatus detailed={true} refreshTrigger={refreshTrigger} />
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
}
