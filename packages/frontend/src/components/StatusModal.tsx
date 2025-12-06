import { motion } from 'framer-motion';
import { X, ChartPie } from './Icon';
import { fadeInVariants, scaleInVariants } from '../utils/animations';
import AmasStatus from './AmasStatus';

interface StatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    refreshTrigger?: number;
}

export default function StatusModal({ isOpen, onClose, refreshTrigger = 0 }: StatusModalProps) {
    if (!isOpen) return null;

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fadeInVariants}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
        >
            <motion.div
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={scaleInVariants}
                className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
            >
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
                        className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
                    >
                        关闭
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
