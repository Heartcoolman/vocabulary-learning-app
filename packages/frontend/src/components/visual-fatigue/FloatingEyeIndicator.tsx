/**
 * 浮动眼睛指示器组件
 *
 * 右上角显示的视觉疲劳检测状态指示器：
 * - 关闭状态：闭眼图标，左键单击开启
 * - 开启状态：睁眼图标，左键单击展开详情，右键关闭
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Eye, EyeSlash, Warning, CaretDown, CaretUp } from '../Icon';
import { useVisualFatigueStore } from '../../stores/visualFatigueStore';
import { useVisualFatigue } from '../../hooks/useVisualFatigue';

interface FloatingEyeIndicatorProps {
  /** 自定义类名 */
  className?: string;
}

/**
 * 获取疲劳等级颜色
 */
function getFatigueColor(score: number): string {
  if (score < 0.25) return 'text-green-500';
  if (score < 0.5) return 'text-yellow-500';
  if (score < 0.75) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * 获取疲劳等级背景色
 */
function getFatigueBgColor(score: number): string {
  if (score < 0.25) return 'bg-green-500';
  if (score < 0.5) return 'bg-yellow-500';
  if (score < 0.75) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * 获取疲劳等级文字
 */
function getFatigueLevel(score: number): string {
  if (score < 0.25) return '清醒';
  if (score < 0.5) return '轻度';
  if (score < 0.75) return '中度';
  return '严重';
}

/**
 * 格式化数值
 */
function formatValue(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/**
 * 浮动眼睛指示器
 */
function FloatingEyeIndicatorComponent({ className = '' }: FloatingEyeIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { enabled, setEnabled, metrics, cameraError } = useVisualFatigueStore();

  const {
    isDetecting,
    isSupported,
    currentFps,
    error: detectorError,
    start,
    stop,
  } = useVisualFatigue();

  // 创建隐藏的 video 元素（需要保持真实尺寸供 MediaPipe 检测）
  useEffect(() => {
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.setAttribute('muted', 'true');
      // 使用 visibility:hidden 隐藏但保持渲染
      video.style.position = 'fixed';
      video.style.width = '320px';
      video.style.height = '240px';
      video.style.top = '0';
      video.style.left = '0';
      video.style.visibility = 'hidden';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-9999';
      document.body.appendChild(video);
      videoRef.current = video;
      console.log('[VisualFatigue] Video element created');
    }

    return () => {
      if (videoRef.current) {
        console.log('[VisualFatigue] Cleaning up video element');
        videoRef.current.srcObject = null;
        videoRef.current.remove();
        videoRef.current = null;
      }
    };
  }, []);

  // 当 enabled 变化时，启动或停止检测
  useEffect(() => {
    if (enabled && !isDetecting && !isStarting && videoRef.current) {
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
  }, [enabled, isDetecting, isStarting, start, stop]);

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
    }
  }, [enabled]);

  const fatigueScore = metrics.visualFatigueScore;
  const hasError = !!cameraError || !!detectorError;
  const errorMessage = cameraError || detectorError;
  const isLoading = isStarting || (enabled && !isDetecting && !hasError);

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

  return (
    <div className={`fixed right-4 top-4 z-50 ${className}`}>
      {/* 主按钮 */}
      <button
        onClick={handleLeftClick}
        onContextMenu={handleRightClick}
        disabled={isLoading}
        className={`group relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
          enabled
            ? hasError
              ? 'bg-red-100 hover:bg-red-200'
              : 'bg-white hover:bg-gray-50'
            : 'bg-gray-200 hover:bg-gray-300'
        } ${isLoading ? 'cursor-wait' : 'cursor-pointer'}`}
        title={enabled ? '左键展开详情，右键关闭检测' : '左键开启视觉疲劳检测'}
      >
        {/* 加载动画 */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* 加载提示气泡 */}
        {isLoading && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white">
            加载模型中...
          </div>
        )}

        {/* 眼睛图标 */}
        {!isLoading && (
          <>
            {enabled ? (
              <Eye
                size={28}
                weight="fill"
                className={`transition-colors ${
                  hasError ? 'text-red-500' : getFatigueColor(fatigueScore)
                }`}
              />
            ) : (
              <EyeSlash size={28} weight="fill" className="text-gray-500" />
            )}
          </>
        )}

        {/* 疲劳度指示环 */}
        {enabled && !hasError && isDetecting && (
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
            <circle
              cx="24"
              cy="24"
              r="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-gray-200"
            />
            <circle
              cx="24"
              cy="24"
              r="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${fatigueScore * 138} 138`}
              strokeLinecap="round"
              className={getFatigueColor(fatigueScore)}
            />
          </svg>
        )}

        {/* 错误指示 */}
        {enabled && hasError && (
          <Warning size={14} weight="fill" className="absolute -right-1 -top-1 text-red-500" />
        )}

        {/* 检测中脉冲动画 */}
        {enabled && isDetecting && !hasError && (
          <span className="absolute inset-0 animate-ping rounded-full bg-green-400 opacity-20" />
        )}
      </button>

      {/* 展开/收起指示 */}
      {enabled && (
        <div className="mt-1 flex justify-center">
          {isExpanded ? (
            <CaretUp size={16} className="text-gray-400" />
          ) : (
            <CaretDown size={16} className="text-gray-400" />
          )}
        </div>
      )}

      {/* 详情面板 */}
      {isExpanded && enabled && (
        <div className="mt-2 w-64 rounded-lg bg-white p-4 shadow-xl">
          {/* 标题行 */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">视觉疲劳检测</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${getFatigueBgColor(fatigueScore)}`}
            >
              {getFatigueLevel(fatigueScore)}
            </span>
          </div>

          {/* 错误显示 */}
          {hasError && (
            <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-600">{errorMessage}</div>
          )}

          {/* 主要指标 */}
          <div className="space-y-2">
            {/* 疲劳评分 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">疲劳评分</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full transition-all duration-300 ${getFatigueBgColor(fatigueScore)}`}
                    style={{ width: `${fatigueScore * 100}%` }}
                  />
                </div>
                <span className={`text-sm font-medium ${getFatigueColor(fatigueScore)}`}>
                  {formatValue(fatigueScore * 100, 0)}%
                </span>
              </div>
            </div>

            {/* EAR */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">EAR (眼睛开合度)</span>
              <span className="font-mono text-sm text-gray-700">{formatValue(metrics.ear, 3)}</span>
            </div>

            {/* PERCLOS */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">PERCLOS (闭眼比例)</span>
              <span className="font-mono text-sm text-gray-700">
                {formatValue(metrics.perclos * 100, 1)}%
              </span>
            </div>

            {/* 眨眼频率 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">眨眼频率</span>
              <span className="font-mono text-sm text-gray-700">
                {formatValue(metrics.blinkRate, 1)} 次/分
              </span>
            </div>

            {/* 平均眨眼时长 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">眨眼时长</span>
              <span className="font-mono text-sm text-gray-700">
                {formatValue(metrics.avgBlinkDuration, 0)} ms
              </span>
            </div>

            {/* 打哈欠 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">打哈欠次数</span>
              <span className="font-mono text-sm text-gray-700">{metrics.yawnCount}</span>
            </div>

            {/* 头部姿态 */}
            <div className="border-t border-gray-100 pt-2">
              <span className="text-xs text-gray-500">头部姿态</span>
              <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-gray-400">Pitch</div>
                  <div className="font-mono text-sm text-gray-700">
                    {formatValue(metrics.headPose.pitch * 45, 1)}°
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Yaw</div>
                  <div className="font-mono text-sm text-gray-700">
                    {formatValue(metrics.headPose.yaw * 45, 1)}°
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Roll</div>
                  <div className="font-mono text-sm text-gray-700">
                    {formatValue(metrics.headPose.roll * 45, 1)}°
                  </div>
                </div>
              </div>
            </div>

            {/* 检测状态 */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <span className="text-xs text-gray-500">检测状态</span>
              <div className="flex items-center gap-1">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isDetecting ? 'animate-pulse bg-green-500' : 'bg-gray-300'
                  }`}
                />
                <span className="text-xs text-gray-600">
                  {isDetecting ? `${currentFps} FPS` : '未检测'}
                </span>
              </div>
            </div>

            {/* 置信度 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">检测置信度</span>
              <span className="font-mono text-sm text-gray-700">
                {formatValue(metrics.confidence * 100, 0)}%
              </span>
            </div>
          </div>

          {/* 操作提示 */}
          <div className="mt-3 border-t border-gray-100 pt-2 text-center text-xs text-gray-400">
            右键单击眼睛图标关闭检测
          </div>
        </div>
      )}
    </div>
  );
}

export const FloatingEyeIndicator = memo(FloatingEyeIndicatorComponent);
export default FloatingEyeIndicator;
