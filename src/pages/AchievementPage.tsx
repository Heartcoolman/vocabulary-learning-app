import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiClient from '../services/ApiClient';
import { handleError } from '../utils/errorHandler';
import {
  Badge,
  BadgeProgress,
  NewBadgeResult,
  BadgeCategory
} from '../types/amas-enhanced';
import BadgeCelebration from '../components/BadgeCelebration';
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
  Info
} from '../components/Icon';

/**
 * AchievementPage - 成就与徽章页面
 * 显示徽章展示网格、详情弹窗、进度条、庆祝动画
 * Requirements: 3.1, 3.2, 3.5
 */
export default function AchievementPage() {
  const navigate = useNavigate();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [badgeProgress, setBadgeProgress] = useState<BadgeProgress | null>(null);
  const [newBadges, setNewBadges] = useState<NewBadgeResult[]>([]);
  const [celebrationBadge, setCelebrationBadge] = useState<Badge | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingBadges, setIsCheckingBadges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | 'ALL'>('ALL');

  useEffect(() => {
    loadBadges();
  }, []);

  const loadBadges = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 使用 getAllBadgesWithStatus 获取所有徽章（包含未解锁的徽章及其进度）
      const response = await ApiClient.getAllBadgesWithStatus();
      // 转换 unlocked 字段为 unlockedAt 格式，保持与 Badge 类型兼容
      const mappedBadges = response.badges.map(badge => ({
        ...badge,
        unlockedAt: badge.unlocked ? badge.unlockedAt : undefined
      }));
      setBadges(mappedBadges);
      setBadgeCount(response.totalCount);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 检查并获取新徽章
  const checkForNewBadges = async () => {
    try {
      setIsCheckingBadges(true);
      const result = await ApiClient.checkAndAwardBadges();

      if (result.hasNewBadges && result.newBadges.length > 0) {
        setNewBadges(result.newBadges);
        // 显示第一个新徽章的庆祝动画
        setCelebrationBadge(result.newBadges[0].badge);
        // 重新加载徽章列表
        await loadBadges();
      }
    } catch (err) {
      console.error('检查徽章失败:', err);
    } finally {
      setIsCheckingBadges(false);
    }
  };

  // 加载徽章进度
  const loadBadgeProgress = async (badgeId: string) => {
    try {
      const progress = await ApiClient.getBadgeProgress(badgeId);
      setBadgeProgress(progress);
    } catch (err) {
      console.error('加载徽章进度失败:', err);
      setBadgeProgress(null);
    }
  };

  // 打开徽章详情
  const openBadgeDetail = useCallback(async (badge: Badge) => {
    setSelectedBadge(badge);
    if (!badge.unlockedAt) {
      await loadBadgeProgress(badge.id);
    }
  }, []);

  // 关闭徽章详情
  const closeBadgeDetail = () => {
    setSelectedBadge(null);
    setBadgeProgress(null);
  };

  // 关闭庆祝动画
  const closeCelebration = () => {
    setCelebrationBadge(null);
    // 如果还有其他新徽章，显示下一个
    const currentIndex = newBadges.findIndex(nb => nb.badge.id === celebrationBadge?.id);
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
  const filteredBadges = activeCategory === 'ALL'
    ? badges
    : badges.filter(b => b.category === activeCategory);

  // 统计已解锁徽章数量
  const unlockedCount = badges.filter(b => b.unlockedAt).length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600">正在加载成就...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center max-w-md px-4" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadBadges}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 animate-g3-fade-in">
        {/* 页面标题 */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Trophy size={32} weight="duotone" color="#f59e0b" />
            成就与徽章
          </h1>
          <p className="text-gray-600">收集徽章，记录你的学习成就</p>
        </header>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <Medal size={24} weight="duotone" color="#ca8a04" />
              </div>
              <div>
                <p className="text-sm text-gray-500">已解锁徽章</p>
                <p className="text-2xl font-bold text-gray-900">{unlockedCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Star size={24} weight="duotone" color="#2563eb" />
              </div>
              <div>
                <p className="text-sm text-gray-500">总徽章数</p>
                <p className="text-2xl font-bold text-gray-900">{badgeCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
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

        {/* 检查新徽章按钮 */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={checkForNewBadges}
            disabled={isCheckingBadges}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCheckingBadges ? (
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
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveCategory('ALL')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${activeCategory === 'ALL'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
          >
            全部
          </button>
          {(['STREAK', 'ACCURACY', 'COGNITIVE', 'MILESTONE'] as BadgeCategory[]).map(category => {
            const CategoryIcon = getCategoryIcon(category);
            const color = getCategoryColor(category);
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${activeCategory === category
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <CategoryIcon size={18} weight="bold" color={activeCategory === category ? '#ffffff' : color.icon} />
                {getCategoryName(category)}
              </button>
            );
          })}
        </div>

        {/* 徽章网格 */}
        {filteredBadges.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredBadges.map((badge) => {
              const CategoryIcon = getCategoryIcon(badge.category);
              const categoryColor = getCategoryColor(badge.category);
              const tierColor = getTierColor(badge.tier);
              const isUnlocked = !!badge.unlockedAt;

              return (
                <div
                  key={badge.id}
                  onClick={() => openBadgeDetail(badge)}
                  className={`
                    relative p-4 rounded-2xl border-2 cursor-pointer
                    transition-all duration-200 hover:scale-105 hover:shadow-lg
                    ${isUnlocked
                      ? `${tierColor.bg} ${tierColor.border}`
                      : 'bg-gray-100 border-gray-300 opacity-60'
                    }
                  `}
                >
                  {/* 徽章图标 */}
                  <div className={`
                    w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3
                    ${isUnlocked ? categoryColor.bg : 'bg-gray-200'}
                  `}>
                    <CategoryIcon
                      size={32}
                      weight={isUnlocked ? 'duotone' : 'regular'}
                      color={isUnlocked ? categoryColor.icon : '#9ca3af'}
                    />
                  </div>

                  {/* 徽章名称 */}
                  <h3 className={`text-center font-bold mb-1 ${isUnlocked ? tierColor.text : 'text-gray-500'}`}>
                    {badge.name}
                  </h3>

                  {/* 等级星星 */}
                  <div className="flex items-center justify-center gap-0.5 mb-2">
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
                      <div className="w-full bg-gray-300 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${badge.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 text-center mt-1">
                        {badge.progress}%
                      </p>
                    </div>
                  )}

                  {/* 已解锁标记 */}
                  {isUnlocked && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle size={20} weight="fill" color="#22c55e" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-8 text-center">
            <Trophy size={64} weight="duotone" color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="text-xl font-bold text-blue-800 mb-2">暂无徽章</h2>
            <p className="text-blue-600 mb-4">
              继续学习，解锁更多成就徽章！
            </p>
            <button
              onClick={() => navigate('/learning')}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              开始学习
            </button>
          </div>
        )}

        {/* 徽章详情弹窗 */}
        {selectedBadge && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-g3-fade-in"
            onClick={closeBadgeDetail}
          >
            <div
              className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full mx-4 animate-g3-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 关闭按钮 */}
              <button
                onClick={closeBadgeDetail}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                aria-label="关闭"
              >
                <X size={16} weight="bold" color="#6b7280" />
              </button>

              {/* 徽章图标 */}
              <div className="text-center mb-6">
                <div className={`
                  w-24 h-24 mx-auto rounded-full flex items-center justify-center
                  ${selectedBadge.unlockedAt
                    ? getCategoryColor(selectedBadge.category).bg
                    : 'bg-gray-200'
                  }
                `}>
                  {(() => {
                    const CategoryIcon = getCategoryIcon(selectedBadge.category);
                    return (
                      <CategoryIcon
                        size={48}
                        weight={selectedBadge.unlockedAt ? 'duotone' : 'regular'}
                        color={selectedBadge.unlockedAt
                          ? getCategoryColor(selectedBadge.category).icon
                          : '#9ca3af'
                        }
                      />
                    );
                  })()}
                </div>
              </div>

              {/* 徽章名称 */}
              <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
                {selectedBadge.name}
              </h2>

              {/* 等级星星 */}
              <div className="flex items-center justify-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={20}
                    weight={i < selectedBadge.tier ? 'fill' : 'regular'}
                    color={selectedBadge.unlockedAt && i < selectedBadge.tier ? '#f59e0b' : '#d1d5db'}
                  />
                ))}
              </div>

              {/* 类别标签 */}
              <div className="flex justify-center mb-4">
                <span className={`
                  px-3 py-1 rounded-full text-sm font-medium
                  ${getCategoryColor(selectedBadge.category).bg}
                  ${getCategoryColor(selectedBadge.category).text}
                `}>
                  {getCategoryName(selectedBadge.category)}
                </span>
              </div>

              {/* 描述 */}
              <p className="text-center text-gray-600 mb-6">
                {selectedBadge.description}
              </p>

              {/* 解锁状态 */}
              {selectedBadge.unlockedAt ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <CheckCircle size={24} weight="fill" color="#22c55e" className="mx-auto mb-2" />
                  <p className="text-green-700 font-medium">已解锁</p>
                  <p className="text-sm text-green-600">
                    {new Date(selectedBadge.unlockedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Info size={20} weight="fill" color="#6b7280" />
                    <span className="text-gray-700 font-medium">解锁进度</span>
                  </div>
                  {badgeProgress ? (
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

              {/* 关闭按钮 */}
              <button
                onClick={closeBadgeDetail}
                className="w-full mt-6 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200"
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
