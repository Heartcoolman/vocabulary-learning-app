import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, BadgeCategory } from '../types/amas-enhanced';
import BadgeDetailModal from '../components/badges/BadgeDetailModal';
import { useAllBadgesWithStatus } from '../hooks/queries/useBadges';
import {
  Trophy,
  Star,
  Medal,
  Fire,
  Brain,
  Target,
  CheckCircle,
  Warning,
  CircleNotch,
  ArrowLeft,
} from '../components/Icon';

/**
 * BadgeGalleryPage - 成就画廊页面
 * 展示所有徽章（已获得/未获得），支持进度追踪和详情查看
 * Requirements: 3.1, 3.2, 3.5
 */
export default function BadgeGalleryPage() {
  const navigate = useNavigate();
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | 'ALL'>('ALL');

  // 使用 React Query hooks
  const { data, isLoading, error, refetch } = useAllBadgesWithStatus();

  const badges = data?.badges || [];
  const totalCount = data?.totalCount || 0;
  const unlockedCount = data?.unlockedCount || 0;

  // 打开徽章详情
  const openBadgeDetail = (badge: Badge & { unlocked: boolean }) => {
    // 转换为 Badge 类型
    const badgeForModal: Badge = {
      ...badge,
      unlockedAt: badge.unlocked ? badge.unlockedAt : undefined,
    };
    setSelectedBadge(badgeForModal);
  };

  // 关闭徽章详情
  const closeBadgeDetail = () => {
    setSelectedBadge(null);
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
        return {
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          text: 'text-orange-700 dark:text-orange-400',
          icon: '#ea580c',
        };
      case 'ACCURACY':
        return {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-400',
          icon: '#16a34a',
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
          icon: '#2563eb',
        };
      default:
        return {
          bg: 'bg-gray-100 dark:bg-slate-700',
          text: 'text-gray-700 dark:text-gray-300',
          icon: '#6b7280',
        };
    }
  };

  // 根据等级获取颜色
  const getTierColor = (tier: number) => {
    switch (tier) {
      case 1:
        return {
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          border: 'border-amber-400 dark:border-amber-600',
          text: 'text-amber-700 dark:text-amber-400',
        };
      case 2:
        return {
          bg: 'bg-gray-100 dark:bg-slate-700',
          border: 'border-gray-400 dark:border-slate-500',
          text: 'text-gray-700 dark:text-gray-300',
        };
      case 3:
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          border: 'border-yellow-400 dark:border-yellow-600',
          text: 'text-yellow-700 dark:text-yellow-400',
        };
      case 4:
        return {
          bg: 'bg-cyan-100 dark:bg-cyan-900/30',
          border: 'border-cyan-400 dark:border-cyan-600',
          text: 'text-cyan-700 dark:text-cyan-400',
        };
      case 5:
        return {
          bg: 'bg-purple-100 dark:bg-purple-900/30',
          border: 'border-purple-400 dark:border-purple-600',
          text: 'text-purple-700 dark:text-purple-400',
        };
      default:
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          border: 'border-blue-400 dark:border-blue-600',
          text: 'text-blue-700 dark:text-blue-400',
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

  // 过滤徽章
  const filteredBadges =
    activeCategory === 'ALL' ? badges : badges.filter((b) => b.category === activeCategory);

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
          <p className="text-gray-600 dark:text-gray-400">正在加载成就画廊...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">出错了</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl animate-g3-fade-in px-4 py-8">
        {/* 页面标题 */}
        <header className="mb-8">
          <div className="mb-4 flex items-center gap-4">
            <button
              onClick={() => navigate('/achievements')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              aria-label="返回"
            >
              <ArrowLeft size={20} weight="bold" color="#6b7280" />
            </button>
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
                <Trophy size={32} weight="duotone" color="#f59e0b" />
                成就画廊
              </h1>
              <p className="mt-1 text-gray-600 dark:text-gray-400">浏览所有可获得的成就徽章</p>
            </div>
          </div>
        </header>

        {/* 统计卡片 */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                <Medal size={24} weight="duotone" color="#ca8a04" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">已解锁徽章</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{unlockedCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Star size={24} weight="duotone" color="#2563eb" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">总徽章数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle size={24} weight="duotone" color="#16a34a" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">完成进度</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 类别筛选 */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('ALL')}
            className={`rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
              activeCategory === 'ALL'
                ? 'bg-blue-500 text-white shadow-soft'
                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
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
                    : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
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
              const isUnlocked = badge.unlocked;

              return (
                <div
                  key={badge.id}
                  onClick={() => openBadgeDetail(badge)}
                  className={`relative cursor-pointer rounded-card border-2 p-4 transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated ${
                    isUnlocked
                      ? `${tierColor.bg} ${tierColor.border}`
                      : 'border-gray-300 bg-gray-100 opacity-60 dark:border-slate-600 dark:bg-slate-800'
                  } `}
                >
                  {/* 徽章图标 */}
                  <div
                    className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ${isUnlocked ? categoryColor.bg : 'bg-gray-200 dark:bg-slate-700'} `}
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
                      <div className="h-1.5 w-full rounded-full bg-gray-300 dark:bg-slate-600">
                        <div
                          className="h-1.5 rounded-full bg-blue-500 transition-all duration-g3-slow"
                          style={{ width: `${badge.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
                        {badge.progress}%
                      </p>
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
          <div className="rounded-card border-2 border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-800 dark:bg-blue-900/20">
            <Trophy size={64} weight="duotone" color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="mb-2 text-xl font-bold text-blue-800 dark:text-blue-300">暂无徽章</h2>
            <p className="mb-4 text-blue-600 dark:text-blue-400">继续学习，解锁更多成就徽章！</p>
            <button
              onClick={() => navigate('/learning')}
              className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              开始学习
            </button>
          </div>
        )}

        {/* 徽章详情弹窗 */}
        {selectedBadge && <BadgeDetailModal badge={selectedBadge} onClose={closeBadgeDetail} />}
      </div>
    </div>
  );
}
