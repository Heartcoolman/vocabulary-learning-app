import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, BadgeProgress, NewBadgeResult, BadgeCategory } from '../types/amas-enhanced';
import BadgeCelebration from '../components/BadgeCelebration';
import {
  useAchievements,
  useCheckNewBadges,
  useAchievementProgress,
} from '../hooks/queries/useAchievements';
import {
  Trophy,
  Star,
  Medal,
  Target,
  Warning,
  CircleNotch,
  Fire,
  Brain,
  CheckCircle,
  X,
  Info,
} from '../components/Icon';
import { uiLogger } from '../utils/logger';

/**
 * AchievementPage - 成就与徽章页面
 * 显示徽章展示网格、详情弹窗、进度条、庆祝动画
 * Requirements: 3.1, 3.2, 3.5
 */
export default function AchievementPage() {
  const navigate = useNavigate();
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [newBadges, setNewBadges] = useState<NewBadgeResult[]>([]);
  const [celebrationBadge, setCelebrationBadge] = useState<Badge | null>(null);
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | 'ALL'>('ALL');

  // 使用 React Query hooks
  const { data, isLoading, error, refetch } = useAchievements();
  const checkNewBadgesMutation = useCheckNewBadges();
  const { data: badgeProgress } = useAchievementProgress(
    selectedBadge && !selectedBadge.unlockedAt ? selectedBadge.id : null,
  );

  const badges =
    data?.badges.map((badge) => ({
      ...badge,
      unlockedAt: badge.unlocked ? badge.unlockedAt : undefined,
    })) || [];
  const badgeCount = data?.totalCount || 0;

  // 检查并获取新徽章
  const checkForNewBadges = async () => {
    try {
      const result = await checkNewBadgesMutation.mutateAsync();

      if (result.hasNewBadges && result.newBadges.length > 0) {
        setNewBadges(result.newBadges);
        // 显示第一个新徽章的庆祝动画
        setCelebrationBadge(result.newBadges[0].badge);
      }
    } catch (err) {
      uiLogger.error({ err }, '检查徽章失败');
    }
  };

  // 打开徽章详情
  const openBadgeDetail = useCallback((badge: Badge) => {
    setSelectedBadge(badge);
  }, []);

  // 关闭徽章详情
  const closeBadgeDetail = () => {
    setSelectedBadge(null);
  };

  // 关闭庆祝动画
  const closeCelebration = () => {
    setCelebrationBadge(null);
    // 如果还有其他新徽章，显示下一个
    const currentIndex = newBadges.findIndex((nb) => nb.badge.id === celebrationBadge?.id);
    if (currentIndex >= 0 && currentIndex < newBadges.length - 1) {
      setCelebrationBadge(newBadges[currentIndex + 1].badge);
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

  // 根据等级获取颜色
  const getTierColor = (tier: number) => {
    switch (tier) {
      case 1:
        return { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' };
      case 2:
        return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' };
      case 3:
        return { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-700' };
      case 4:
        return { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700' };
      case 5:
        return { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700' };
      default:
        return { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700' };
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

  // 过滤徽章
  const filteredBadges =
    activeCategory === 'ALL' ? badges : badges.filter((b) => b.category === activeCategory);

  // 统计已解锁徽章数量
  const unlockedCount = badges.filter((b) => b.unlockedAt).length;

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600">正在加载成就...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">出错了</h2>
          <p className="mb-6 text-gray-600">
            {error instanceof Error ? error.message : '加载失败'}
          </p>
          <button
            onClick={() => refetch()}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl animate-g3-fade-in px-4 py-8">
        {/* 页面标题 */}
        <header className="mb-8">
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold text-gray-900">
            <Trophy size={32} weight="duotone" color="#f59e0b" />
            成就与徽章
          </h1>
          <p className="text-gray-600">收集徽章，记录你的学习成就</p>
        </header>

        {/* 统计卡片 */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                <Medal size={24} weight="duotone" color="#ca8a04" />
              </div>
              <div>
                <p className="text-sm text-gray-500">已解锁徽章</p>
                <p className="text-2xl font-bold text-gray-900">{unlockedCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Star size={24} weight="duotone" color="#2563eb" />
              </div>
              <div>
                <p className="text-sm text-gray-500">总徽章数</p>
                <p className="text-2xl font-bold text-gray-900">{badgeCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle size={24} weight="duotone" color="#16a34a" />
              </div>
              <div>
                <p className="text-sm text-gray-500">完成进度</p>
                <p className="text-2xl font-bold text-gray-900">
                  {badgeCount > 0 ? Math.round((unlockedCount / badgeCount) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="mb-6 flex justify-end gap-3">
          <button
            onClick={() => navigate('/badges')}
            className="flex items-center gap-2 rounded-button border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 active:scale-95"
          >
            <Trophy size={18} weight="bold" />
            查看所有成就
          </button>
          <button
            onClick={checkForNewBadges}
            disabled={checkNewBadgesMutation.isPending}
            className="flex items-center gap-2 rounded-button bg-blue-500 px-4 py-2 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checkNewBadgesMutation.isPending ? (
              <>
                <CircleNotch className="animate-spin" size={18} weight="bold" />
                检查中...
              </>
            ) : (
              <>
                <Star size={18} weight="bold" />
                检查新徽章
              </>
            )}
          </button>
        </div>

        {/* 类别筛选 */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('ALL')}
            className={`rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
              activeCategory === 'ALL'
                ? 'bg-blue-500 text-white shadow-soft'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            全部
          </button>
          {(['STREAK', 'ACCURACY', 'COGNITIVE', 'MILESTONE'] as BadgeCategory[]).map((category) => {
            const CategoryIcon = getCategoryIcon(category);
            const color = getCategoryColor(category);
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
                  activeCategory === category
                    ? 'bg-blue-500 text-white shadow-soft'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <CategoryIcon
                  size={18}
                  weight="bold"
                  color={activeCategory === category ? '#ffffff' : color.icon}
                />
                {getCategoryName(category)}
              </button>
            );
          })}
        </div>

        {/* 徽章网格 */}
        {filteredBadges.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filteredBadges.map((badge) => {
              const CategoryIcon = getCategoryIcon(badge.category);
              const categoryColor = getCategoryColor(badge.category);
              const tierColor = getTierColor(badge.tier);
              const isUnlocked = !!badge.unlockedAt;

              return (
                <div
                  key={badge.id}
                  onClick={() => openBadgeDetail(badge)}
                  className={`relative cursor-pointer rounded-card border-2 p-4 transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated ${
                    isUnlocked
                      ? `${tierColor.bg} ${tierColor.border}`
                      : 'border-gray-300 bg-gray-100 opacity-60'
                  } `}
                >
                  {/* 徽章图标 */}
                  <div
                    className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ${isUnlocked ? categoryColor.bg : 'bg-gray-200'} `}
                  >
                    <CategoryIcon
                      size={32}
                      weight={isUnlocked ? 'duotone' : 'regular'}
                      color={isUnlocked ? categoryColor.icon : '#9ca3af'}
                    />
                  </div>

                  {/* 徽章名称 */}
                  <h3
                    className={`mb-1 text-center font-bold ${isUnlocked ? tierColor.text : 'text-gray-500'}`}
                  >
                    {badge.name}
                  </h3>

                  {/* 等级星星 */}
                  <div className="mb-2 flex items-center justify-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={12}
                        weight={i < badge.tier ? 'fill' : 'regular'}
                        color={isUnlocked && i < badge.tier ? '#f59e0b' : '#d1d5db'}
                      />
                    ))}
                  </div>

                  {/* 进度条（未解锁时显示） */}
                  {!isUnlocked && badge.progress !== undefined && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full rounded-full bg-gray-300">
                        <div
                          className="h-1.5 rounded-full bg-blue-500 transition-all duration-g3-slow"
                          style={{ width: `${badge.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-center text-xs text-gray-500">{badge.progress}%</p>
                    </div>
                  )}

                  {/* 已解锁标记 */}
                  {isUnlocked && (
                    <div className="absolute right-2 top-2">
                      <CheckCircle size={20} weight="fill" color="#22c55e" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-card border-2 border-blue-200 bg-blue-50 p-8 text-center">
            <Trophy size={64} weight="duotone" color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="mb-2 text-xl font-bold text-blue-800">暂无徽章</h2>
            <p className="mb-4 text-blue-600">继续学习，解锁更多成就徽章！</p>
            <button
              onClick={() => navigate('/learning')}
              className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              开始学习
            </button>
          </div>
        )}

        {/* 徽章详情弹窗 */}
        {selectedBadge && (
          <div
            className="fixed inset-0 z-50 flex animate-g3-fade-in items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={closeBadgeDetail}
          >
            <div
              className="mx-4 w-full max-w-md animate-g3-slide-up rounded-3xl bg-white p-8 shadow-floating"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 关闭按钮 */}
              <button
                onClick={closeBadgeDetail}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200"
                aria-label="关闭"
              >
                <X size={16} weight="bold" color="#6b7280" />
              </button>

              {/* 徽章图标 */}
              <div className="mb-6 text-center">
                <div
                  className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full ${
                    selectedBadge.unlockedAt
                      ? getCategoryColor(selectedBadge.category).bg
                      : 'bg-gray-200'
                  } `}
                >
                  {(() => {
                    const CategoryIcon = getCategoryIcon(selectedBadge.category);
                    return (
                      <CategoryIcon
                        size={48}
                        weight={selectedBadge.unlockedAt ? 'duotone' : 'regular'}
                        color={
                          selectedBadge.unlockedAt
                            ? getCategoryColor(selectedBadge.category).icon
                            : '#9ca3af'
                        }
                      />
                    );
                  })()}
                </div>
              </div>

              {/* 徽章名称 */}
              <h2 className="mb-2 text-center text-2xl font-bold text-gray-900">
                {selectedBadge.name}
              </h2>

              {/* 等级星星 */}
              <div className="mb-4 flex items-center justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={20}
                    weight={i < selectedBadge.tier ? 'fill' : 'regular'}
                    color={
                      selectedBadge.unlockedAt && i < selectedBadge.tier ? '#f59e0b' : '#d1d5db'
                    }
                  />
                ))}
              </div>

              {/* 类别标签 */}
              <div className="mb-4 flex justify-center">
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${getCategoryColor(selectedBadge.category).bg} ${getCategoryColor(selectedBadge.category).text} `}
                >
                  {getCategoryName(selectedBadge.category)}
                </span>
              </div>

              {/* 描述 */}
              <p className="mb-6 text-center text-gray-600">{selectedBadge.description}</p>

              {/* 解锁状态 */}
              {selectedBadge.unlockedAt ? (
                <div className="rounded-card border border-green-200 bg-green-50 p-4 text-center">
                  <CheckCircle size={24} weight="fill" color="#22c55e" className="mx-auto mb-2" />
                  <p className="font-medium text-green-700">已解锁</p>
                  <p className="text-sm text-green-600">
                    {new Date(selectedBadge.unlockedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              ) : (
                <div className="rounded-card border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Info size={20} weight="fill" color="#6b7280" />
                    <span className="font-medium text-gray-700">解锁进度</span>
                  </div>
                  {badgeProgress ? (
                    <>
                      <div className="mb-2 h-3 w-full rounded-full bg-gray-200">
                        <div
                          className="h-3 rounded-full bg-blue-500 transition-all duration-g3-slow"
                          style={{ width: `${badgeProgress.percentage}%` }}
                        />
                      </div>
                      <p className="text-center text-sm text-gray-600">
                        {badgeProgress.currentValue} / {badgeProgress.targetValue}
                        <span className="ml-2 font-medium text-blue-600">
                          ({badgeProgress.percentage}%)
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="text-center text-sm text-gray-500">继续学习以解锁此徽章</p>
                  )}
                </div>
              )}

              {/* 关闭按钮 */}
              <button
                onClick={closeBadgeDetail}
                className="mt-6 w-full rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-700 transition-all duration-g3-fast hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {/* 庆祝动画 */}
        {celebrationBadge && (
          <BadgeCelebration
            badge={celebrationBadge}
            onClose={closeCelebration}
            isVisible={!!celebrationBadge}
          />
        )}
      </div>
    </div>
  );
}
