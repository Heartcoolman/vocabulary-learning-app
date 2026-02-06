import React, { useEffect, useState, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { Badge, BadgeProgress, BadgeCategory } from '../../types/amas-enhanced';
import { amasClient } from '../../services/client';
import { Trophy, Star, Fire, Brain, Target, CheckCircle, X, Info, CircleNotch } from '../Icon';
import { uiLogger } from '../../utils/logger';
import { IconColor } from '../../utils/iconColors';

interface BadgeDetailModalProps {
  badge: Badge;
  onClose: () => void;
}

/**
 * BadgeDetailModal - 徽章详情模态框
 * 显示徽章的详细信息、解锁条件、进度追踪和奖励说明
 */
const BadgeDetailModalComponent = ({ badge, onClose }: BadgeDetailModalProps) => {
  const [badgeProgress, setBadgeProgress] = useState<BadgeProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadBadgeProgress = useCallback(async () => {
    try {
      setIsLoading(true);
      const progress = await amasClient.getBadgeProgress(badge.id);
      setBadgeProgress(progress);
    } catch (err) {
      uiLogger.error({ err, badgeId: badge.id }, '加载徽章进度失败');
      setBadgeProgress(null);
    } finally {
      setIsLoading(false);
    }
  }, [badge.id]);

  useEffect(() => {
    // 如果徽章未解锁，加载进度
    if (!badge.unlockedAt) {
      loadBadgeProgress();
    }
  }, [badge.unlockedAt, loadBadgeProgress]);

  // 根据类别获取图标
  const getCategoryIcon = (category: BadgeCategory) => {
    switch (category) {
      case 'STREAK':
        return Fire;
      case 'ACCURACY':
        return Target;
      case 'COGNITIVE':
        return Brain;
      case 'MILESTONE':
        return Trophy;
      default:
        return Star;
    }
  };

  // 根据类别获取颜色
  const getCategoryColor = (category: BadgeCategory) => {
    switch (category) {
      case 'STREAK':
        return {
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          text: 'text-orange-700 dark:text-orange-400',
          icon: '#ea580c',
        };
      case 'ACCURACY':
        return {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-400',
          icon: IconColor.success,
        };
      case 'COGNITIVE':
        return {
          bg: 'bg-purple-100 dark:bg-purple-900/30',
          text: 'text-purple-700 dark:text-purple-400',
          icon: '#9333ea',
        };
      case 'MILESTONE':
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          text: 'text-blue-700 dark:text-blue-400',
          icon: IconColor.primaryDark,
        };
      default:
        return {
          bg: 'bg-gray-100 dark:bg-slate-700',
          text: 'text-gray-700 dark:text-gray-300',
          icon: IconColor.secondary,
        };
    }
  };

  // 获取类别名称
  const getCategoryName = (category: BadgeCategory) => {
    switch (category) {
      case 'STREAK':
        return '连续学习';
      case 'ACCURACY':
        return '正确率';
      case 'COGNITIVE':
        return '认知提升';
      case 'MILESTONE':
        return '里程碑';
      default:
        return '其他';
    }
  };

  const CategoryIcon = getCategoryIcon(badge.category);
  const categoryColor = getCategoryColor(badge.category);
  const isUnlocked = !!badge.unlockedAt;

  return (
    <Modal isOpen={true} onClose={onClose} title="" maxWidth="md" showCloseButton={false}>
      <div
        className="relative w-full bg-white p-8 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
          aria-label="关闭"
        >
          <X size={16} color={IconColor.secondary} />
        </button>

        {/* 徽章图标 */}
        <div className="mb-6 text-center">
          <div
            className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full ${isUnlocked ? categoryColor.bg : 'bg-gray-200 dark:bg-slate-700'} `}
          >
            <CategoryIcon
              size={48}
              weight={isUnlocked ? 'duotone' : 'regular'}
              color={isUnlocked ? categoryColor.icon : IconColor.muted}
            />
          </div>
        </div>

        {/* 徽章名称 */}
        <h2 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">
          {badge.name}
        </h2>

        {/* 等级星星 */}
        <div className="mb-4 flex items-center justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              size={20}
              weight={i < badge.tier ? 'fill' : 'regular'}
              color={isUnlocked && i < badge.tier ? IconColor.star : IconColor.starEmpty}
            />
          ))}
        </div>

        {/* 类别标签 */}
        <div className="mb-4 flex justify-center">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${categoryColor.bg} ${categoryColor.text} `}
          >
            {getCategoryName(badge.category)}
          </span>
        </div>

        {/* 描述 */}
        <p className="mb-6 text-center text-gray-600 dark:text-gray-400">{badge.description}</p>

        {/* 解锁状态 */}
        {isUnlocked ? (
          <div className="rounded-card border border-green-200 bg-green-50 p-4 text-center dark:border-green-800 dark:bg-green-900/20">
            <CheckCircle
              size={24}
              weight="fill"
              color={IconColor.success}
              className="mx-auto mb-2"
            />
            <p className="font-medium text-green-700 dark:text-green-400">已解锁</p>
            <p className="text-sm text-green-600 dark:text-green-500">
              {new Date(badge.unlockedAt!).toLocaleString('zh-CN')}
            </p>
          </div>
        ) : (
          <div className="rounded-card border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-700/50">
            <div className="mb-3 flex items-center gap-2">
              <Info size={20} weight="fill" color={IconColor.secondary} />
              <span className="font-medium text-gray-700 dark:text-gray-300">解锁进度</span>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <CircleNotch
                  className="animate-spin"
                  size={24}
                  weight="bold"
                  color={IconColor.primary}
                />
              </div>
            ) : badgeProgress ? (
              <>
                <div className="mb-2 h-3 w-full rounded-full bg-gray-200 dark:bg-slate-600">
                  <div
                    className="h-3 rounded-full bg-blue-500 transition-all duration-g3-slow"
                    style={{ width: `${badgeProgress.percentage}%` }}
                  />
                </div>
                <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                  {badgeProgress.currentValue} / {badgeProgress.targetValue}
                  <span className="ml-2 font-medium text-blue-600">
                    ({badgeProgress.percentage}%)
                  </span>
                </p>
              </>
            ) : (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                继续学习以解锁此徽章
              </p>
            )}
          </div>
        )}

        {/* 奖励说明 */}
        <div className="mt-6 rounded-card border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="mb-2 flex items-center gap-2">
            <Trophy size={20} color={IconColor.primaryDark} />
            <span className="font-medium text-blue-900 dark:text-blue-300">奖励说明</span>
          </div>
          <p className="text-sm text-blue-700 dark:text-blue-400">
            获得此徽章将提升你的成就等级，解锁更多学习内容和个性化功能。
          </p>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-700 transition-all duration-g3-fast hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
        >
          关闭
        </button>
      </div>
    </Modal>
  );
};

/**
 * Deep comparison for Badge object
 */
const compareBadge = (prev: Badge, next: Badge): boolean => {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.description === next.description &&
    prev.category === next.category &&
    prev.tier === next.tier &&
    prev.unlockedAt === next.unlockedAt
  );
};

/**
 * Memoized BadgeDetailModal component
 */
const BadgeDetailModal = React.memo(BadgeDetailModalComponent, (prevProps, nextProps) => {
  return prevProps.onClose === nextProps.onClose && compareBadge(prevProps.badge, nextProps.badge);
});

export default BadgeDetailModal;
