/**
 * 浮动眼睛指示器组件
 *
 * 右上角显示的视觉疲劳检测状态指示器：
 * - 关闭状态：闭眼图标，左键单击开启
 * - 开启状态：睁眼图标，左键单击展开详情，右键关闭
 *
 * G3 设计规范优化版本：
 * - 玻璃拟态按钮样式
 * - SVG 渐变色疲劳圆环
 * - Framer Motion 动画系统
 * - 三层级信息架构
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeSlash, Warning, CaretDown } from '../Icon';
import { useVisualFatigueStore } from '../../stores/visualFatigueStore';
import { useVisualFatigue } from '../../hooks/useVisualFatigue';
import { videoElementManager } from '../../services/visual-fatigue';
import { g3SpringStandard, g3SpringSnappy } from '../../utils/animations';
import { useTheme } from '../../contexts/ThemeContext';

interface FloatingEyeIndicatorProps {
  /** 自定义类名 */
  className?: string;
  /** 嵌入模式（不使用 fixed 定位，可嵌入到其他组件中） */
  embedded?: boolean;
  /** 尺寸：sm=36px, md=44px, lg=56px */
  size?: 'sm' | 'md' | 'lg';
}

/* ========================================
 * 疲劳等级配置
 * ======================================== */

type FatigueLevel = 'fresh' | 'mild' | 'moderate' | 'severe';

interface FatigueLevelConfig {
  label: string;
  advice: string;
  textColor: string;
  bgColor: string;
  gradientId: string;
  gradientColors: [string, string];
}

const FATIGUE_LEVELS: Record<FatigueLevel, FatigueLevelConfig> = {
  fresh: {
    label: '清醒',
    advice: '状态良好，继续保持',
    textColor: 'text-green-500',
    bgColor: 'bg-green-500',
    gradientId: 'fatigue-gradient-green',
    gradientColors: ['#34d399', '#10b981'],
  },
  mild: {
    label: '轻度',
    advice: '轻微疲劳，建议稍作休息',
    textColor: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
    gradientId: 'fatigue-gradient-yellow',
    gradientColors: ['#fbbf24', '#f59e0b'],
  },
  moderate: {
    label: '中度',
    advice: '较为疲劳，建议休息 5 分钟',
    textColor: 'text-orange-500',
    bgColor: 'bg-orange-500',
    gradientId: 'fatigue-gradient-orange',
    gradientColors: ['#fb923c', '#f97316'],
  },
  severe: {
    label: '严重',
    advice: '严重疲劳，请立即休息！',
    textColor: 'text-red-500',
    bgColor: 'bg-red-500',
    gradientId: 'fatigue-gradient-red',
    gradientColors: ['#f87171', '#ef4444'],
  },
};

/**
 * 根据疲劳分数获取等级
 */
function getFatigueLevel(score: number): FatigueLevel {
  if (score < 0.25) return 'fresh';
  if (score < 0.5) return 'mild';
  if (score < 0.75) return 'moderate';
  return 'severe';
}

/**
 * 获取疲劳等级配置
 */
function getFatigueLevelConfig(score: number): FatigueLevelConfig {
  return FATIGUE_LEVELS[getFatigueLevel(score)];
}

/**
 * 格式化数值
 */
function formatValue(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/* ========================================
 * 子组件：指标卡片
 * ======================================== */

interface MetricCardProps {
  label: string;
  value: string;
  className?: string;
}

function MetricCard({ label, value, className = '' }: MetricCardProps) {
  return (
    <div className={`rounded-button bg-gray-50 px-3 py-2 dark:bg-slate-700 ${className}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">{value}</div>
    </div>
  );
}

/* ========================================
 * 主组件
 * ======================================== */

// 尺寸配置
const SIZE_CONFIG = {
  sm: { button: 'h-9 w-9', icon: 20, ring: { size: 36, radius: 15, stroke: 2 }, loader: 'h-5 w-5' },
  md: {
    button: 'h-11 w-11',
    icon: 24,
    ring: { size: 44, radius: 19, stroke: 2.5 },
    loader: 'h-6 w-6',
  },
  lg: {
    button: 'h-14 w-14',
    icon: 28,
    ring: { size: 56, radius: 25, stroke: 3 },
    loader: 'h-8 w-8',
  },
};

function FloatingEyeIndicatorComponent({
  className = '',
  embedded = false,
  size = 'lg',
}: FloatingEyeIndicatorProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const sizeConfig = SIZE_CONFIG[size];

  const { enabled, setEnabled, metrics, cameraError } = useVisualFatigueStore();

  const {
    isDetecting,
    isSupported,
    currentFps,
    error: detectorError,
    start,
    stop,
  } = useVisualFatigue();

  // 使用 VideoElementManager 单例获取共享 video 元素
  useEffect(() => {
    if (!videoRef.current) {
      const video = videoElementManager.acquire();
      videoRef.current = video;
      setVideoReady(true);
      console.log('[VisualFatigue] Video element acquired from manager');
    }

    return () => {
      if (videoRef.current) {
        console.log('[VisualFatigue] Releasing video element to manager');
        videoElementManager.release();
        videoRef.current = null;
        setVideoReady(false);
      }
    };
  }, []);

  // 当 enabled 变化或 video 准备好时，启动或停止检测
  useEffect(() => {
    console.log('[FloatingEye] Effect check:', {
      enabled,
      isDetecting,
      isStarting,
      videoReady,
      hasVideo: !!videoRef.current,
    });

    if (enabled && !isDetecting && !isStarting && videoReady && videoRef.current) {
      console.log('[FloatingEye] Starting detection...');
      setIsStarting(true);
      start(videoRef.current)
        .then((success) => {
          console.log('[FloatingEye] Start result:', success);
          if (videoRef.current) {
            console.log('[FloatingEye] Video state:', {
              readyState: videoRef.current.readyState,
              videoWidth: videoRef.current.videoWidth,
              videoHeight: videoRef.current.videoHeight,
              srcObject: !!videoRef.current.srcObject,
            });
          }
        })
        .finally(() => {
          setIsStarting(false);
        });
    } else if (!enabled && isDetecting) {
      console.log('[FloatingEye] Stopping detection...');
      stop();
    }
  }, [enabled, isDetecting, isStarting, videoReady, start, stop]);

  // 处理左键点击
  const handleLeftClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!enabled) {
        // 关闭状态 -> 开启
        setEnabled(true);
      } else {
        // 开启状态 -> 展开/收起详情
        setIsExpanded((prev) => !prev);
      }
    },
    [enabled, setEnabled],
  );

  // 处理右键点击
  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (enabled) {
        setEnabled(false);
        setIsExpanded(false);
      }
    },
    [enabled, setEnabled],
  );

  // 关闭时收起详情
  useEffect(() => {
    if (!enabled) {
      setIsExpanded(false);
      setShowDetails(false);
    }
  }, [enabled]);

  const fatigueScore = metrics.visualFatigueScore;
  const levelConfig = getFatigueLevelConfig(fatigueScore);
  const hasError = !!cameraError || !!detectorError;
  const errorMessage = cameraError || detectorError;
  const isLoading = isStarting || (enabled && !isDetecting && !hasError);

  // 动态悬停提示内容
  const getHoverTip = useCallback(() => {
    if (!enabled) return '点击开启检测';
    if (isExpanded) return '点击收起面板';
    return `${levelConfig.label} - 点击查看详情`;
  }, [enabled, isExpanded, levelConfig.label]);

  // 调试：每秒输出一次 headPose 值
  useEffect(() => {
    if (isDetecting && isExpanded) {
      const interval = setInterval(() => {
        console.log('[FloatingEye] Current headPose in store:', {
          pitch: (metrics.headPose.pitch * 45).toFixed(1) + '°',
          yaw: (metrics.headPose.yaw * 45).toFixed(1) + '°',
          roll: (metrics.headPose.roll * 45).toFixed(1) + '°',
        });
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isDetecting, isExpanded, metrics.headPose]);

  // 不支持时不显示
  if (!isSupported) {
    return null;
  }

  // 计算圆环参数
  const ringRadius = sizeConfig.ring.radius;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = fatigueScore * ringCircumference;
  const ringBgColor = isDark ? '#374151' : '#e5e7eb';
  const panelBgGradient = isDark
    ? 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.92) 100%)'
    : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(249,250,251,0.9) 100%)';
  const panelExpandedBg = isDark
    ? 'linear-gradient(135deg, rgba(30,41,59,0.92) 0%, rgba(15,23,42,0.88) 100%)'
    : 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(249,250,251,0.88) 100%)';

  return (
    <div
      className={` ${embedded ? 'relative' : 'fixed right-4 top-4 z-50'} flex flex-col items-end ${className} `}
    >
      {/* 主按钮容器 */}
      <div className="relative">
        {/* 悬停提示气泡 */}
        <AnimatePresence>
          {isHovered && !isLoading && (
            <motion.div
              className="absolute right-full top-1/2 mr-3 -translate-y-1/2"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={g3SpringSnappy}
            >
              <div className="relative whitespace-nowrap rounded-button bg-gray-800 px-3 py-1.5 text-sm text-white shadow-elevated dark:bg-slate-700">
                {getHoverTip()}
                {/* 右侧小三角 */}
                <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-800 dark:border-l-slate-700" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 主按钮 */}
        <motion.button
          onClick={handleLeftClick}
          onContextMenu={handleRightClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          disabled={isLoading}
          className={`group relative flex ${sizeConfig.button} items-center justify-center rounded-full border border-white/40 shadow-elevated backdrop-blur-xl transition-colors duration-g3-fast dark:border-slate-600/40 ${
            enabled
              ? hasError
                ? 'bg-red-50/90 dark:bg-red-900/30'
                : 'bg-white/90 dark:bg-slate-800/90'
              : 'bg-gray-100/90 dark:bg-slate-700/90'
          } ${isLoading ? 'cursor-wait' : 'cursor-pointer'} `}
          style={{
            background: enabled && !hasError ? panelBgGradient : undefined,
          }}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          transition={g3SpringSnappy}
          title={enabled ? '左键展开详情，右键关闭检测' : '左键开启视觉疲劳检测'}
        >
          {/* SVG 渐变定义 */}
          <svg className="absolute h-0 w-0">
            <defs>
              {Object.values(FATIGUE_LEVELS).map((level) => (
                <linearGradient
                  key={level.gradientId}
                  id={level.gradientId}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={level.gradientColors[0]} />
                  <stop offset="100%" stopColor={level.gradientColors[1]} />
                </linearGradient>
              ))}
            </defs>
          </svg>

          {/* 加载动画 */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={`${sizeConfig.loader} animate-spin rounded-full border-2 border-blue-500 border-t-transparent`}
              />
            </div>
          )}

          {/* 加载提示气泡 */}
          {isLoading && (
            <motion.div
              className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-button bg-gray-800 px-2.5 py-1 text-xs text-white shadow-elevated dark:bg-slate-700"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={g3SpringSnappy}
            >
              加载模型中...
            </motion.div>
          )}

          {/* 眼睛图标 - 带切换动画 */}
          {!isLoading && (
            <AnimatePresence mode="wait">
              <motion.div
                key={enabled ? 'eye-open' : 'eye-closed'}
                initial={{ scale: 0.8, opacity: 0, rotate: -15 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.8, opacity: 0, rotate: 15 }}
                transition={g3SpringSnappy}
              >
                {enabled ? (
                  <Eye
                    size={sizeConfig.icon}
                    weight="fill"
                    className={`transition-colors ${hasError ? 'text-red-500' : levelConfig.textColor}`}
                  />
                ) : (
                  <EyeSlash size={sizeConfig.icon} weight="fill" className="text-gray-500" />
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* 疲劳度渐变指示环 */}
          {enabled && !hasError && isDetecting && (
            <svg
              className="absolute inset-0 -rotate-90"
              viewBox={`0 0 ${sizeConfig.ring.size} ${sizeConfig.ring.size}`}
            >
              {/* 背景环 */}
              <circle
                cx={sizeConfig.ring.size / 2}
                cy={sizeConfig.ring.size / 2}
                r={ringRadius}
                fill="none"
                stroke={ringBgColor}
                strokeWidth={sizeConfig.ring.stroke}
              />
              {/* 进度环 - 使用渐变 */}
              <circle
                cx={sizeConfig.ring.size / 2}
                cy={sizeConfig.ring.size / 2}
                r={ringRadius}
                fill="none"
                stroke={`url(#${levelConfig.gradientId})`}
                strokeWidth={sizeConfig.ring.stroke}
                strokeDasharray={`${ringProgress} ${ringCircumference}`}
                strokeLinecap="round"
                className="transition-all duration-g3-normal"
              />
            </svg>
          )}

          {/* 错误指示 */}
          {enabled && hasError && (
            <Warning size={14} weight="fill" className="absolute -right-1 -top-1 text-red-500" />
          )}

          {/* 检测中呼吸脉冲动画 */}
          {enabled && isDetecting && !hasError && (
            <motion.span
              className={`absolute inset-0 rounded-full ${levelConfig.bgColor}`}
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.15, 0.05, 0.15],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </motion.button>

        {/* 详情面板 - 带展开动画 */}
        <AnimatePresence>
          {isExpanded && enabled && (
            <motion.div
              className={`w-80 overflow-hidden rounded-card border border-white/40 p-4 shadow-floating backdrop-blur-xl dark:border-slate-600/40 ${embedded ? 'absolute right-0 top-full z-50 mt-2' : 'mt-2'} `}
              style={{
                background: panelExpandedBg,
              }}
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={g3SpringStandard}
            >
              {/* ========== 第一层：核心摘要 ========== */}
              <div className="flex items-start gap-4">
                {/* 大号疲劳评分圆环 */}
                <div className="relative h-16 w-16 flex-shrink-0">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke={ringBgColor}
                      strokeWidth="4"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke={`url(#${levelConfig.gradientId})`}
                      strokeWidth="4"
                      strokeDasharray={`${fatigueScore * 176} 176`}
                      strokeLinecap="round"
                      className="transition-all duration-g3-slow"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-lg font-bold ${levelConfig.textColor}`}>
                      {formatValue(fatigueScore * 100, 0)}%
                    </span>
                  </div>
                </div>

                {/* 状态文字和建议 */}
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-800 dark:text-white">
                      {levelConfig.label}疲劳
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${levelConfig.bgColor}`}
                    >
                      {levelConfig.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {levelConfig.advice}
                  </p>
                </div>
              </div>

              {/* 错误显示 */}
              {hasError && (
                <div className="mt-3 rounded-button bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {errorMessage}
                </div>
              )}

              {/* 分隔线 */}
              <div className="my-3 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-slate-600" />

              {/* ========== 第二层：关键指标 ========== */}
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="PERCLOS" value={`${formatValue(metrics.perclos * 100, 1)}%`} />
                <MetricCard label="眨眼频率" value={`${formatValue(metrics.blinkRate, 1)}/分`} />
                <MetricCard label="检测状态" value={isDetecting ? `${currentFps} FPS` : '未检测'} />
              </div>

              {/* ========== 第三层：详细指标（可折叠） ========== */}
              <div className="mt-3">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex w-full items-center justify-center gap-1 rounded-button py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-300"
                >
                  {showDetails ? '收起详情' : '展开详情'}
                  <motion.span
                    animate={{ rotate: showDetails ? 180 : 0 }}
                    transition={g3SpringSnappy}
                  >
                    <CaretDown size={14} />
                  </motion.span>
                </button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={g3SpringStandard}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-2">
                        {/* EAR */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">EAR (眼睛开合度)</span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">
                            {formatValue(metrics.ear, 3)}
                          </span>
                        </div>

                        {/* 眨眼时长 */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">眨眼时长</span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">
                            {formatValue(metrics.avgBlinkDuration, 0)} ms
                          </span>
                        </div>

                        {/* 打哈欠 */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">哈欠次数</span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">
                            {metrics.yawnCount}
                          </span>
                        </div>

                        {/* 头部姿态 */}
                        <div className="rounded-button bg-gray-50 p-2 dark:bg-slate-700">
                          <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                            头部姿态
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <div className="text-xs text-gray-400">Pitch</div>
                              <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                                {formatValue(metrics.headPose.pitch * 45, 1)}°
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Yaw</div>
                              <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                                {formatValue(metrics.headPose.yaw * 45, 1)}°
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Roll</div>
                              <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                                {formatValue(metrics.headPose.roll * 45, 1)}°
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 置信度 */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">检测置信度</span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">
                            {formatValue(metrics.confidence * 100, 0)}%
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 操作提示 */}
              <div className="mt-3 border-t border-gray-100 pt-2 text-center text-xs text-gray-400 dark:border-slate-700">
                右键单击眼睛图标关闭检测
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const FloatingEyeIndicator = memo(FloatingEyeIndicatorComponent);
export default FloatingEyeIndicator;
