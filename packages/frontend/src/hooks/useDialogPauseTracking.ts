/**
 * useDialogPauseTracking Hook
 *
 * 追踪对话框打开期间的暂停时间，用于疲劳度计算
 * 当用户打开对话框（如状态监控、AI建议等）时，学习计时器应暂停
 */

import { useState, useRef, useCallback, useEffect } from 'react';

import { trackingService } from '../services/TrackingService';

/**
 * Hook 配置选项
 */
export interface UseDialogPauseTrackingOptions {
  /** 暂停时间变化时的回调 */
  onPauseChange?: (pausedTime: number) => void;
  /** 是否启用埋点 */
  enableTracking?: boolean;
}

/**
 * Hook 返回值
 */
export interface UseDialogPauseTrackingReturn {
  /** 累计暂停时间（毫秒） */
  pausedTime: number;
  /** 获取当前累计暂停时间（包含当前打开中的对话框时间） */
  getPausedTime: () => number;
  /** 重置累计暂停时间 */
  resetPausedTime: () => void;
  /** 对话框打开时调用 */
  onDialogOpen: (reason?: string) => void;
  /** 对话框关闭时调用 */
  onDialogClose: (reason?: string) => void;
  /** 当前是否有对话框打开 */
  isDialogOpen: boolean;
}

/**
 * 对话框暂停时间追踪 Hook
 *
 * @param options - 配置选项
 * @returns 暂停时间追踪相关的状态和方法
 *
 * @example
 * ```tsx
 * const { pausedTime, getPausedTime, onDialogOpen, onDialogClose } = useDialogPauseTracking();
 *
 * // 在对话框组件中使用
 * <Modal
 *   isOpen={isOpen}
 *   onOpen={onDialogOpen}
 *   onClose={onDialogClose}
 * />
 * ```
 */
export function useDialogPauseTracking(
  options: UseDialogPauseTrackingOptions = {},
): UseDialogPauseTrackingReturn {
  const { onPauseChange, enableTracking = true } = options;

  // 累计暂停时间
  const [pausedTime, setPausedTime] = useState(0);

  // 对话框打开时的时间戳
  const dialogOpenTimeRef = useRef<number | null>(null);

  // 当前是否有对话框打开
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 对话框打开回调
  const onDialogOpen = useCallback(
    (reason?: string) => {
      // 如果已经有对话框打开，不重复记录
      if (dialogOpenTimeRef.current !== null) {
        return;
      }

      dialogOpenTimeRef.current = Date.now();
      setIsDialogOpen(true);

      // 埋点：学习暂停事件
      if (enableTracking) {
        trackingService.trackLearningPause(reason || 'dialog_opened');
      }
    },
    [enableTracking],
  );

  // 对话框关闭回调
  const onDialogClose = useCallback(
    (reason?: string) => {
      if (dialogOpenTimeRef.current === null) {
        return;
      }

      const duration = Date.now() - dialogOpenTimeRef.current;
      const newPausedTime = pausedTime + duration;

      setPausedTime(newPausedTime);
      dialogOpenTimeRef.current = null;
      setIsDialogOpen(false);

      // 埋点：学习恢复事件
      if (enableTracking) {
        trackingService.trackLearningResume(reason || 'dialog_closed');
      }

      // 触发回调
      onPauseChange?.(newPausedTime);
    },
    [pausedTime, enableTracking, onPauseChange],
  );

  // 获取当前累计暂停时间（包含当前打开中的对话框时间）
  const getPausedTime = useCallback(() => {
    if (dialogOpenTimeRef.current !== null) {
      return pausedTime + (Date.now() - dialogOpenTimeRef.current);
    }
    return pausedTime;
  }, [pausedTime]);

  // 重置累计暂停时间
  const resetPausedTime = useCallback(() => {
    setPausedTime(0);
    // 不重置 dialogOpenTimeRef，因为对话框可能仍在打开状态
  }, []);

  // 组件卸载时，如果对话框仍打开，记录最后的暂停时间
  useEffect(() => {
    return () => {
      if (dialogOpenTimeRef.current !== null && enableTracking) {
        trackingService.trackLearningPause('page_leave');
      }
    };
  }, [enableTracking]);

  return {
    pausedTime,
    getPausedTime,
    resetPausedTime,
    onDialogOpen,
    onDialogClose,
    isDialogOpen,
  };
}

/**
 * 用于多个对话框状态的便捷 Hook
 *
 * 当页面有多个对话框时，可以使用此 Hook 自动追踪
 *
 * @param dialogStates - 对话框状态数组
 * @param options - 配置选项
 * @returns 暂停时间追踪相关的状态和方法
 *
 * @example
 * ```tsx
 * const [isStatusOpen, setIsStatusOpen] = useState(false);
 * const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
 *
 * const { pausedTime, getPausedTime, resetPausedTime } = useDialogPauseTrackingWithStates(
 *   [isStatusOpen, isSuggestionOpen]
 * );
 * ```
 */
export function useDialogPauseTrackingWithStates(
  dialogStates: boolean[],
  options: UseDialogPauseTrackingOptions = {},
): Omit<UseDialogPauseTrackingReturn, 'onDialogOpen' | 'onDialogClose'> {
  const { onPauseChange, enableTracking = true } = options;

  // 累计暂停时间
  const [pausedTime, setPausedTime] = useState(0);

  // 对话框打开时的时间戳
  const dialogOpenTimeRef = useRef<number | null>(null);

  // 检测是否有任意对话框打开
  const isAnyDialogOpen = dialogStates.some((state) => state);

  // 当对话框打开/关闭时，记录暂停时间并上报埋点
  useEffect(() => {
    if (isAnyDialogOpen) {
      // 对话框刚打开，记录开始时间
      if (dialogOpenTimeRef.current === null) {
        dialogOpenTimeRef.current = Date.now();
        // 埋点：学习暂停事件
        if (enableTracking) {
          trackingService.trackLearningPause('dialog_opened');
        }
      }
    } else {
      // 对话框刚关闭，累加暂停时间
      if (dialogOpenTimeRef.current !== null) {
        const pausedDuration = Date.now() - dialogOpenTimeRef.current;
        const newPausedTime = pausedTime + pausedDuration;
        setPausedTime(newPausedTime);
        dialogOpenTimeRef.current = null;

        // 埋点：学习恢复事件
        if (enableTracking) {
          trackingService.trackLearningResume('dialog_closed');
        }

        // 触发回调
        onPauseChange?.(newPausedTime);
      }
    }
  }, [isAnyDialogOpen, enableTracking, onPauseChange, pausedTime]);

  // 获取当前累计暂停时间（包含当前打开中的对话框时间）
  const getPausedTime = useCallback(() => {
    if (dialogOpenTimeRef.current !== null) {
      return pausedTime + (Date.now() - dialogOpenTimeRef.current);
    }
    return pausedTime;
  }, [pausedTime]);

  // 重置累计暂停时间
  const resetPausedTime = useCallback(() => {
    setPausedTime(0);
  }, []);

  // 组件卸载时，如果对话框仍打开，记录最后的暂停时间
  useEffect(() => {
    return () => {
      if (dialogOpenTimeRef.current !== null && enableTracking) {
        trackingService.trackLearningPause('page_leave');
      }
    };
  }, [enableTracking]);

  return {
    pausedTime,
    getPausedTime,
    resetPausedTime,
    isDialogOpen: isAnyDialogOpen,
  };
}
