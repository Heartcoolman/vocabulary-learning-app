import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '../types/amas-enhanced';
import { Confetti, Star, Trophy, Medal, X } from '@phosphor-icons/react';
import {
  backdropVariants,
  celebrationVariants,
  g3SpringBouncy,
  g3SpringGentle,
} from '../utils/animations';
import { IconColor, badgeCategoryColors, confettiColors } from '../utils/iconColors';

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
        color: confettiColors[i % confettiColors.length],
        delay: Math.random() * 0.3,
      })),
    [],
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
        return {
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          border: 'border-amber-400 dark:border-amber-600',
          text: 'text-amber-700 dark:text-amber-400',
          icon: badgeCategoryColors.bronze.icon,
        };
      case 2:
        return {
          bg: 'bg-gray-100 dark:bg-slate-700',
          border: 'border-gray-400 dark:border-slate-500',
          text: 'text-gray-700 dark:text-gray-300',
          icon: badgeCategoryColors.silver.icon,
        };
      case 3:
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          border: 'border-yellow-400 dark:border-yellow-600',
          text: 'text-yellow-700 dark:text-yellow-400',
          icon: badgeCategoryColors.gold.icon,
        };
      case 4:
        return {
          bg: 'bg-cyan-100 dark:bg-cyan-900/30',
          border: 'border-cyan-400 dark:border-cyan-600',
          text: 'text-cyan-700 dark:text-cyan-400',
          icon: badgeCategoryColors.platinum.icon,
        };
      case 5:
        return {
          bg: 'bg-purple-100 dark:bg-purple-900/30',
          border: 'border-purple-400 dark:border-purple-600',
          text: 'text-purple-700 dark:text-purple-400',
          icon: badgeCategoryColors.diamond.icon,
        };
      default:
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          border: 'border-blue-400 dark:border-blue-600',
          text: 'text-blue-700 dark:text-blue-400',
          icon: badgeCategoryColors.master.icon,
        };
    }
  };

  const CategoryIcon = getCategoryIcon();
  const tierColor = getTierColor();

  return createPortal(
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
            className="pointer-events-none absolute inset-0 overflow-hidden"
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
            {confettiPieces.map((piece) => (
              <motion.div
                key={piece.id}
                className="absolute h-8 w-3 rounded-full"
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
            className="relative mx-4 w-full max-w-md rounded-card bg-white p-8 shadow-elevated dark:bg-slate-800"
            variants={celebrationVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
              aria-label="关闭"
            >
              <X size={16} weight="bold" color={IconColor.secondary} />
            </button>

            {/* 庆祝图标 */}
            <div className="mb-6 text-center">
              <motion.div
                className="relative inline-block"
                initial={{ scale: 0.9, rotate: -5, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1, transition: g3SpringBouncy }}
              >
                <Confetti size={80} color={IconColor.warning} />
                <motion.div
                  className="absolute -right-2 -top-2"
                  animate={{ scale: [1, 1.12, 1], rotate: [0, -6, 0] }}
                  transition={{ ...g3SpringBouncy, repeat: Infinity, repeatType: 'mirror' }}
                >
                  <Star size={32} weight="fill" color={IconColor.star} />
                </motion.div>
              </motion.div>
            </div>

            {/* 标题 */}
            <h2 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">
              恭喜获得新徽章!
            </h2>

            {/* 徽章展示 */}
            <div
              className={`mt-6 rounded-card border-2 p-6 text-center ${tierColor.bg} ${tierColor.border} `}
            >
              <motion.div
                className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${tierColor.bg} border-4 ${tierColor.border} `}
                animate={{ scale: [0.95, 1.05, 1], rotate: [-4, 2, 0] }}
                transition={{
                  ...g3SpringBouncy,
                  repeat: Infinity,
                  repeatType: 'loop',
                  repeatDelay: 2,
                }}
              >
                <CategoryIcon size={48} color={tierColor.icon} />
              </motion.div>

              <h3 className={`text-xl font-bold ${tierColor.text} mb-2`}>{badge.name}</h3>

              <p className="mb-3 text-gray-600 dark:text-gray-300">{badge.description}</p>

              {/* 等级标识 */}
              <div className="flex items-center justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    weight={i < badge.tier ? 'fill' : 'regular'}
                    color={i < badge.tier ? tierColor.icon : IconColor.starEmpty}
                  />
                ))}
              </div>
            </div>

            {/* 解锁时间 */}
            {badge.unlockedAt && (
              <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                解锁时间: {new Date(badge.unlockedAt).toLocaleString('zh-CN')}
              </p>
            )}

            {/* 确认按钮 */}
            <motion.button
              onClick={onClose}
              className="mt-6 w-full rounded-card bg-blue-500 px-6 py-3 font-medium text-white shadow-elevated hover:bg-blue-600"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={g3SpringBouncy}
            >
              太棒了!
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
