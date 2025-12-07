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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={scaleInVariants}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2 text-blue-600">
            <ChartPie size={24} weight="duotone" />
            <h3 className="text-lg font-bold">学习状态监控</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
        <div className="flex justify-end bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-blue-500 px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-600 hover:shadow-xl focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          >
            关闭
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
