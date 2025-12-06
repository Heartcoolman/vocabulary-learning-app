import { useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '../types/amas-enhanced';
import {
  Confetti,
  Star,
  Trophy,
  Medal,
  X
} from './Icon';
import {
  backdropVariants,
  celebrationVariants,
  g3SpringBouncy,
  g3SpringGentle,
} from '../utils/animations';

interface BadgeCelebrationProps {
  /** 新获得的徽章 */
  badge: Badge;
  /** 关闭回调 */
  onClose: () => void;
  /** 是否显示 */
  isVisible: boolean;
}

/**
 * BadgeCelebration - 徽章获得庆祝动画组件
 * 使用 Framer Motion 实现 G3 级别的弹簧物理动画
 * Requirements: 3.1
 */
export default function BadgeCelebration({ badge, onClose, isVisible }: BadgeCelebrationProps) {
  // 自动关闭
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  // 预生成彩带位置，避免重渲染时位置变化
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        color: ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'][i % 5],
        delay: Math.random() * 0.3,
      })),
    []
  );

  // 根据徽章类别获取图标
  const getCategoryIcon = () => {
    switch (badge.category) {
      case 'STREAK':
        return Star;
      case 'ACCURACY':
        return Trophy;
      case 'COGNITIVE':
        return Medal;
      case 'MILESTONE':
        return Confetti;
      default:
        return Star;
    }
  };

  // 根据徽章等级获取颜色
  const getTierColor = () => {
    switch (badge.tier) {
      case 1:
        return { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', icon: '#d97706' };
      case 2:
        return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700', icon: '#6b7280' };
      case 3:
        return { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-700', icon: '#ca8a04' };
      case 4:
        return { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700', icon: '#0891b2' };
      case 5:
        return { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700', icon: '#9333ea' };
      default:
        return { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', icon: '#3b82f6' };
    }
  };

  const CategoryIcon = getCategoryIcon();
  const tierColor = getTierColor();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          {/* 背景装饰 - 彩带效果 */}
          <motion.div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.05, delayChildren: 0.1 },
              },
              exit: { opacity: 0 },
            }}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {confettiPieces.map(piece => (
              <motion.div
                key={piece.id}
                className="absolute w-3 h-8 rounded-full"
                style={{
                  left: piece.left,
                  top: piece.top,
                  backgroundColor: piece.color,
                }}
                variants={{
                  hidden: { y: -12, opacity: 0 },
                  visible: {
                    y: 0,
                    opacity: 0.7,
                    rotate: 8,
                    transition: { ...g3SpringGentle, delay: piece.delay },
                  },
                  exit: { y: -8, opacity: 0, transition: g3SpringGentle },
                }}
              />
            ))}
          </motion.div>

          {/* 主内容卡片 */}
          <motion.div
            className="relative bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4"
            variants={celebrationVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              aria-label="关闭"
            >
              <X size={16} weight="bold" color="#6b7280" />
            </button>

            {/* 庆祝图标 */}
            <div className="text-center mb-6">
              <motion.div
                className="relative inline-block"
                initial={{ scale: 0.9, rotate: -5, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1, transition: g3SpringBouncy }}
              >
                <Confetti
                  size={80}
                  weight="duotone"
                  color="#f59e0b"
                />
                <motion.div
                  className="absolute -top-2 -right-2"
                  animate={{ scale: [1, 1.12, 1], rotate: [0, -6, 0] }}
                  transition={{ ...g3SpringBouncy, repeat: Infinity, repeatType: 'mirror' }}
                >
                  <Star size={32} weight="fill" color="#fbbf24" />
                </motion.div>
              </motion.div>
            </div>

            {/* 标题 */}
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
              恭喜获得新徽章!
            </h2>

            {/* 徽章展示 */}
            <div className={`
              mt-6 p-6 rounded-2xl border-2 text-center
              ${tierColor.bg} ${tierColor.border}
            `}>
              <motion.div
                className={`
                  w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4
                  ${tierColor.bg} border-4 ${tierColor.border}
                `}
                animate={{ scale: [0.95, 1.05, 1], rotate: [-4, 2, 0] }}
                transition={{ ...g3SpringBouncy, repeat: Infinity, repeatType: 'loop', repeatDelay: 2 }}
              >
                <CategoryIcon size={40} weight="duotone" color={tierColor.icon} />
              </motion.div>

              <h3 className={`text-xl font-bold ${tierColor.text} mb-2`}>
                {badge.name}
              </h3>

              <p className="text-gray-600 mb-3">
                {badge.description}
              </p>

              {/* 等级标识 */}
              <div className="flex items-center justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    weight={i < badge.tier ? 'fill' : 'regular'}
                    color={i < badge.tier ? tierColor.icon : '#d1d5db'}
                  />
                ))}
              </div>
            </div>

            {/* 解锁时间 */}
            {badge.unlockedAt && (
              <p className="text-center text-sm text-gray-500 mt-4">
                解锁时间: {new Date(badge.unlockedAt).toLocaleString('zh-CN')}
              </p>
            )}

            {/* 确认按钮 */}
            <motion.button
              onClick={onClose}
              className="w-full mt-6 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 shadow-lg"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={g3SpringBouncy}
            >
              太棒了!
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
