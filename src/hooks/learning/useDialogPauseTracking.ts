import { useState, useCallback, useRef, useEffect } from 'react';
import { trackingService } from '../../services/TrackingService';

/**
 * 对话框暂停时间追踪 Hook
 *
 * 用于追踪用户打开对话框（如状态监控、AI建议、决策透视）时的暂停时间，
 * 以便在计算疲劳度时排除这些非学习时间。
 */
export interface UseDialogPauseTrackingResult {
  /** 当前累计的对话框暂停时间（毫秒） */
  dialogPausedTime: number;
  /** 获取总的对话框暂停时间（包括当前正在打开的对话框） */
  getDialogPausedTime: () => number;
  /** 重置对话框暂停时间 */
  resetDialogPausedTime: () => void;
  /** 检查是否有任何对话框打开 */
  isAnyDialogOpen: boolean;
}

export interface UseDialogPauseTrackingOptions {
  /** 需要追踪的对话框状态数组 */
  dialogStates: boolean[];
}

/**
 * 对话框暂停时间追踪 Hook
 *
 * @param options - 配置选项
 * @param options.dialogStates - 需要追踪的对话框打开状态数组
 * @returns 对话框暂停时间追踪相关的状态和方法
 *
 * @example
 * ```tsx
 * const [isStatusOpen, setIsStatusOpen] = useState(false);
 * const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
 *
 * const {
 *   getDialogPausedTime,
 *   resetDialogPausedTime,
 *   isAnyDialogOpen
 * } = useDialogPauseTracking({
 *   dialogStates: [isStatusOpen, isSuggestionOpen]
 * });
 * ```
 */
export function useDialogPauseTracking({
  dialogStates,
}: UseDialogPauseTrackingOptions): UseDialogPauseTrackingResult {
  // 追踪对话框打开的时间（用于暂停疲劳度计算）
  const [dialogPausedTime, setDialogPausedTime] = useState(0);
  const dialogOpenTimeRef = useRef<number | null>(null);

  // 检测任意对话框是否打开
  const isAnyDialogOpen = dialogStates.some(state => state);

  // 当对话框打开/关闭时，记录暂停时间并上报埋点
  useEffect(() => {
    if (isAnyDialogOpen) {
      // 对话框刚打开，记录开始时间
      if (dialogOpenTimeRef.current === null) {
        dialogOpenTimeRef.current = Date.now();
        // 埋点：学习暂停事件
        trackingService.trackLearningPause('dialog_opened');
      }
    } else {
      // 对话框刚关闭，累加暂停时间
      if (dialogOpenTimeRef.current !== null) {
        const pausedDuration = Date.now() - dialogOpenTimeRef.current;
        setDialogPausedTime(prev => prev + pausedDuration);
        dialogOpenTimeRef.current = null;
        // 埋点：学习恢复事件
        trackingService.trackLearningResume('dialog_closed');
      }
    }
  }, [isAnyDialogOpen]);

  // 获取对话框暂停时间的回调函数
  const getDialogPausedTime = useCallback(() => {
    // 如果对话框当前打开，需要加上当前打开的时间
    if (dialogOpenTimeRef.current !== null) {
      return dialogPausedTime + (Date.now() - dialogOpenTimeRef.current);
    }
    return dialogPausedTime;
  }, [dialogPausedTime]);

  const resetDialogPausedTime = useCallback(() => {
    setDialogPausedTime(0);
  }, []);

  return {
    dialogPausedTime,
    getDialogPausedTime,
    resetDialogPausedTime,
    isAnyDialogOpen,
  };
}

export default useDialogPauseTracking;
