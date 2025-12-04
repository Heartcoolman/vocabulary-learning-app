import { useEffect, useState } from 'react';
import { Badge, BadgeProgress, BadgeCategory } from '../../types/amas-enhanced';
import ApiClient from '../../services/ApiClient';
import {
  Trophy,
  Star,
  Fire,
  Brain,
  Target,
  CheckCircle,
  X,
  Info,
  CircleNotch
} from '../Icon';
import { uiLogger } from '../../utils/logger';

interface BadgeDetailModalProps {
  badge: Badge;
  onClose: () => void;
}

/**
 * BadgeDetailModal - 徽章详情模态框
 * 显示徽章的详细信息、解锁条件、进度追踪和奖励说明
 */
export default function BadgeDetailModal({ badge, onClose }: BadgeDetailModalProps) {
  const [badgeProgress, setBadgeProgress] = useState<BadgeProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 如果徽章未解锁，加载进度
    if (!badge.unlockedAt) {
      loadBadgeProgress();
    }
  }, [badge.id]);

  const loadBadgeProgress = async () => {
    try {
      setIsLoading(true);
      const progress = await ApiClient.getBadgeProgress(badge.id);
      setBadgeProgress(progress);
    } catch (err) {
      uiLogger.error({ err, badgeId: badge.id }, '加载徽章进度失败');
      setBadgeProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

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
        return { bg: 'bg-orange-100', text: 'text-orange-700', icon: '#ea580c' };
      case 'ACCURACY':
        return { bg: 'bg-green-100', text: 'text-green-700', icon: '#16a34a' };
      case 'COGNITIVE':
        return { bg: 'bg-purple-100', text: 'text-purple-700', icon: '#9333ea' };
      case 'MILESTONE':
        return { bg: 'bg-blue-100', text: 'text-blue-700', icon: '#2563eb' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', icon: '#6b7280' };
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-g3-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full mx-4 animate-g3-slide-up relative"
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

        {/* 徽章图标 */}
        <div className="text-center mb-6">
          <div
            className={`
              w-24 h-24 mx-auto rounded-full flex items-center justify-center
              ${isUnlocked ? categoryColor.bg : 'bg-gray-200'}
            `}
          >
            <CategoryIcon
              size={48}
              weight={isUnlocked ? 'duotone' : 'regular'}
              color={isUnlocked ? categoryColor.icon : '#9ca3af'}
            />
          </div>
        </div>

        {/* 徽章名称 */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          {badge.name}
        </h2>

        {/* 等级星星 */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              size={20}
              weight={i < badge.tier ? 'fill' : 'regular'}
              color={isUnlocked && i < badge.tier ? '#f59e0b' : '#d1d5db'}
            />
          ))}
        </div>

        {/* 类别标签 */}
        <div className="flex justify-center mb-4">
          <span
            className={`
              px-3 py-1 rounded-full text-sm font-medium
              ${categoryColor.bg} ${categoryColor.text}
            `}
          >
            {getCategoryName(badge.category)}
          </span>
        </div>

        {/* 描述 */}
        <p className="text-center text-gray-600 mb-6">{badge.description}</p>

        {/* 解锁状态 */}
        {isUnlocked ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle size={24} weight="fill" color="#22c55e" className="mx-auto mb-2" />
            <p className="text-green-700 font-medium">已解锁</p>
            <p className="text-sm text-green-600">
              {new Date(badge.unlockedAt!).toLocaleString('zh-CN')}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info size={20} weight="fill" color="#6b7280" />
              <span className="text-gray-700 font-medium">解锁进度</span>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <CircleNotch className="animate-spin" size={24} weight="bold" color="#3b82f6" />
              </div>
            ) : badgeProgress ? (
              <>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${badgeProgress.percentage}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 text-center">
                  {badgeProgress.currentValue} / {badgeProgress.targetValue}
                  <span className="ml-2 text-blue-600 font-medium">
                    ({badgeProgress.percentage}%)
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500 text-center">
                继续学习以解锁此徽章
              </p>
            )}
          </div>
        )}

        {/* 奖励说明 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={20} weight="duotone" color="#2563eb" />
            <span className="text-blue-900 font-medium">奖励说明</span>
          </div>
          <p className="text-sm text-blue-700">
            获得此徽章将提升你的成就等级，解锁更多学习内容和个性化功能。
          </p>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="w-full mt-6 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
