import { useEffect, useState } from 'react';
import { Badge } from '../types/amas-enhanced';
import {
  Confetti,
  Star,
  Trophy,
  Medal,
  X
} from './Icon';

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
 * 当用户获得新徽章时显示庆祝动画
 * Requirements: 3.1
 */
export default function BadgeCelebration({ badge, onClose, isVisible }: BadgeCelebrationProps) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // 延迟显示内容，让动画更流畅
      const timer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isVisible]);

  // 自动关闭
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {/* 背景装饰 - 彩带效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-3 h-8 rounded-full animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'][i % 5],
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
              opacity: 0.7
            }}
          />
        ))}
      </div>

      {/* 主内容卡片 */}
      <div 
        className={`
          relative bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4
          transform transition-all duration-500
          ${showContent ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
        `}
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
          <div className="relative inline-block">
            <Confetti 
              size={80} 
              weight="duotone" 
              color="#f59e0b" 
              className="animate-bounce"
            />
            <div className="absolute -top-2 -right-2">
              <Star size={32} weight="fill" color="#fbbf24" className="animate-pulse" />
            </div>
          </div>
        </div>

        {/* 标题 */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          🎉 恭喜获得新徽章！
        </h2>

        {/* 徽章展示 */}
        <div className={`
          mt-6 p-6 rounded-2xl border-2 text-center
          ${tierColor.bg} ${tierColor.border}
        `}>
          <div className={`
            w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4
            ${tierColor.bg} border-4 ${tierColor.border}
          `}>
            <CategoryIcon size={40} weight="duotone" color={tierColor.icon} />
          </div>
          
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
        <button
          onClick={onClose}
          className="w-full mt-6 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
        >
          太棒了！
        </button>
      </div>
    </div>
  );
}
