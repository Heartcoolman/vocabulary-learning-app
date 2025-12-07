/**
 * useAutoPlayPronunciation Hook
 *
 * 封装自动朗读发音的逻辑，包括:
 * - 自动播放控制
 * - 播放延迟管理
 * - 播放状态跟踪
 * - 手动播放/停止功能
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import AudioService from '../services/AudioService';
import { learningLogger } from '../utils/logger';

export interface UseAutoPlayPronunciationConfig {
  /** 要朗读的单词 */
  word?: string;
  /** 单词ID，用于在同一单词时不重复播放 */
  wordId?: string | number;
  /** 是否启用自动朗读 */
  enabled?: boolean;
  /** 播放前延迟时间 (ms) */
  delay?: number;
  /** 是否在结果显示时禁止播放 */
  showResult?: boolean;
  /** 播放开始时回调 */
  onPlayStart?: () => void;
  /** 播放结束时回调 */
  onPlayEnd?: () => void;
  /** 播放错误时回调 */
  onPlayError?: (error: Error) => void;
}

export interface UseAutoPlayPronunciationReturn {
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 手动触发播放 */
  play: () => Promise<void>;
  /** 停止播放 */
  stop: () => void;
  /** 设置是否启用自动播放 */
  setEnabled: (enabled: boolean) => void;
  /** 当前是否启用自动播放 */
  isEnabled: boolean;
}

/**
 * 自动朗读发音 Hook
 *
 * @param config - 配置选项
 * @returns 播放状态和控制方法
 *
 * @example
 * ```tsx
 * const { isPlaying, play, stop } = useAutoPlayPronunciation({
 *   word: currentWord?.spelling,
 *   wordId: currentWord?.id,
 *   enabled: true,
 *   delay: 300,
 *   showResult: false,
 * });
 * ```
 */
export function useAutoPlayPronunciation(
  config: UseAutoPlayPronunciationConfig,
): UseAutoPlayPronunciationReturn {
  const {
    word,
    wordId,
    enabled = true,
    delay = 300,
    showResult = false,
    onPlayStart,
    onPlayEnd,
    onPlayError,
  } = config;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // 同步外部 enabled 状态
  useEffect(() => {
    setIsEnabled(enabled);
  }, [enabled]);

  // 手动触发播放
  const play = useCallback(async () => {
    if (!word || isPlaying) return;

    try {
      setIsPlaying(true);
      onPlayStart?.();

      await AudioService.playPronunciation(word);

      if (isMountedRef.current) {
        setIsPlaying(false);
        onPlayEnd?.();
      }
    } catch (error) {
      if (isMountedRef.current) {
        setIsPlaying(false);
        const err = error as Error;
        learningLogger.error({ err, word }, '播放发音失败');
        onPlayError?.(err);
      }
    }
  }, [word, isPlaying, onPlayStart, onPlayEnd, onPlayError]);

  // 停止播放
  const stop = useCallback(() => {
    // 清除待执行的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // 停止音频服务
    AudioService.stopAudio();
    setIsPlaying(false);
  }, []);

  // 自动播放 effect
  useEffect(() => {
    // 不满足播放条件时不触发
    if (!word || !isEnabled || showResult) return;

    // 清除之前的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 延迟播放，让用户先看到单词
    timeoutRef.current = setTimeout(async () => {
      try {
        await AudioService.playPronunciation(word);
      } catch (err) {
        learningLogger.error({ err, word }, '自动朗读失败');
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [wordId, word, isEnabled, delay, showResult]);

  // 组件卸载时清理
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      AudioService.stopAudio();
    };
  }, []);

  return {
    isPlaying,
    play,
    stop,
    setEnabled: setIsEnabled,
    isEnabled,
  };
}
