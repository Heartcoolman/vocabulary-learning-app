/**
 * useMasteryState Hook
 *
 * 使用 useReducer 整合 useMasteryLearning 中的多个 useState，
 * 提供统一的状态管理方案。
 */

import { useReducer, useCallback } from 'react';
import { WordItem, QueueProgress, CompletionReason } from '../../services/learning/WordQueueManager';
import { AmasProcessResult } from '../../types/amas';

// ========== 状态类型定义 ==========

/**
 * Mastery Learning 统一状态结构
 */
export interface MasteryState {
  /** 是否正在加载 */
  isLoading: boolean;
  /** 学习是否完成 */
  isCompleted: boolean;
  /** 完成原因 */
  completionReason: CompletionReason | null;
  /** 当前单词 */
  currentWord: WordItem | null;
  /** 所有单词列表 */
  allWords: WordItem[];
  /** 错误信息 */
  error: string | null;
  /** 目标掌握数量 */
  targetMasteryCount: number;
  /** 队列进度 */
  progress: QueueProgress;
  /** 是否已恢复会话 */
  hasRestoredSession: boolean;
  /** 最新的 AMAS 处理结果 */
  latestAmasResult: AmasProcessResult | null;
}

/**
 * Mastery Action 类型
 */
export type MasteryAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_COMPLETED'; payload: { isCompleted: boolean; reason?: CompletionReason } }
  | { type: 'SET_CURRENT_WORD'; payload: WordItem | null }
  | { type: 'SET_ALL_WORDS'; payload: WordItem[] }
  | { type: 'ADD_WORDS'; payload: WordItem[] }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_TARGET_MASTERY_COUNT'; payload: number }
  | { type: 'SET_PROGRESS'; payload: QueueProgress }
  | { type: 'SET_HAS_RESTORED_SESSION'; payload: boolean }
  | { type: 'SET_AMAS_RESULT'; payload: AmasProcessResult | null }
  | { type: 'RESTORE_SESSION'; payload: Partial<MasteryState> }
  | { type: 'RESET'; payload?: { targetMasteryCount?: number } };

// ========== 初始状态 ==========

/**
 * 创建初始状态
 * @param targetMasteryCount 目标掌握数量，默认为 20
 */
export function createInitialState(targetMasteryCount: number = 20): MasteryState {
  return {
    isLoading: true,
    isCompleted: false,
    completionReason: null,
    currentWord: null,
    allWords: [],
    error: null,
    targetMasteryCount,
    progress: {
      masteredCount: 0,
      targetCount: targetMasteryCount,
      totalQuestions: 0,
      activeCount: 0,
      pendingCount: 0
    },
    hasRestoredSession: false,
    latestAmasResult: null
  };
}

/**
 * 默认初始状态
 */
export const initialMasteryState: MasteryState = createInitialState();

// ========== Reducer 函数 ==========

/**
 * Mastery State Reducer
 * 处理所有状态更新操作
 */
export function masteryReducer(state: MasteryState, action: MasteryAction): MasteryState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload
      };

    case 'SET_COMPLETED':
      return {
        ...state,
        isCompleted: action.payload.isCompleted,
        completionReason: action.payload.reason ?? null
      };

    case 'SET_CURRENT_WORD':
      return {
        ...state,
        currentWord: action.payload
      };

    case 'SET_ALL_WORDS':
      return {
        ...state,
        allWords: action.payload
      };

    case 'ADD_WORDS':
      return {
        ...state,
        allWords: [...state.allWords, ...action.payload]
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload
      };

    case 'SET_TARGET_MASTERY_COUNT':
      return {
        ...state,
        targetMasteryCount: action.payload,
        progress: {
          ...state.progress,
          targetCount: action.payload
        }
      };

    case 'SET_PROGRESS':
      return {
        ...state,
        progress: action.payload
      };

    case 'SET_HAS_RESTORED_SESSION':
      return {
        ...state,
        hasRestoredSession: action.payload
      };

    case 'SET_AMAS_RESULT':
      return {
        ...state,
        latestAmasResult: action.payload
      };

    case 'RESTORE_SESSION':
      return {
        ...state,
        ...action.payload,
        hasRestoredSession: true
      };

    case 'RESET': {
      const targetCount = action.payload?.targetMasteryCount ?? state.targetMasteryCount;
      return createInitialState(targetCount);
    }

    default:
      return state;
  }
}

// ========== Hook 类型定义 ==========

export interface UseMasteryStateOptions {
  /** 初始目标掌握数量 */
  initialTargetMasteryCount?: number;
}

export interface UseMasteryStateReturn {
  /** 当前状态 */
  state: MasteryState;
  /** dispatch 函数 */
  dispatch: React.Dispatch<MasteryAction>;
  /** 便捷 action creators */
  actions: {
    setLoading: (isLoading: boolean) => void;
    setCompleted: (isCompleted: boolean, reason?: CompletionReason) => void;
    setCurrentWord: (word: WordItem | null) => void;
    setAllWords: (words: WordItem[]) => void;
    addWords: (words: WordItem[]) => void;
    setError: (error: string | null) => void;
    setTargetMasteryCount: (count: number) => void;
    setProgress: (progress: QueueProgress) => void;
    setHasRestoredSession: (restored: boolean) => void;
    setAmasResult: (result: AmasProcessResult | null) => void;
    restoreSession: (partialState: Partial<MasteryState>) => void;
    reset: (options?: { targetMasteryCount?: number }) => void;
  };
}

// ========== Hook 实现 ==========

/**
 * useMasteryState Hook
 *
 * 使用 useReducer 整合 useMasteryLearning 中的多个 useState，
 * 提供统一的状态管理和便捷的 action creators。
 *
 * @example
 * ```tsx
 * const { state, actions } = useMasteryState({ initialTargetMasteryCount: 20 });
 *
 * // 使用便捷方法
 * actions.setLoading(true);
 * actions.setCurrentWord(word);
 * actions.setProgress(newProgress);
 *
 * // 或直接使用 dispatch
 * dispatch({ type: 'SET_LOADING', payload: false });
 * ```
 */
export function useMasteryState(
  options: UseMasteryStateOptions = {}
): UseMasteryStateReturn {
  const { initialTargetMasteryCount = 20 } = options;

  const [state, dispatch] = useReducer(
    masteryReducer,
    initialTargetMasteryCount,
    createInitialState
  );

  // 便捷 action creators
  const setLoading = useCallback((isLoading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: isLoading });
  }, []);

  const setCompleted = useCallback((isCompleted: boolean, reason?: CompletionReason) => {
    dispatch({ type: 'SET_COMPLETED', payload: { isCompleted, reason } });
  }, []);

  const setCurrentWord = useCallback((word: WordItem | null) => {
    dispatch({ type: 'SET_CURRENT_WORD', payload: word });
  }, []);

  const setAllWords = useCallback((words: WordItem[]) => {
    dispatch({ type: 'SET_ALL_WORDS', payload: words });
  }, []);

  const addWords = useCallback((words: WordItem[]) => {
    dispatch({ type: 'ADD_WORDS', payload: words });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const setTargetMasteryCount = useCallback((count: number) => {
    dispatch({ type: 'SET_TARGET_MASTERY_COUNT', payload: count });
  }, []);

  const setProgress = useCallback((progress: QueueProgress) => {
    dispatch({ type: 'SET_PROGRESS', payload: progress });
  }, []);

  const setHasRestoredSession = useCallback((restored: boolean) => {
    dispatch({ type: 'SET_HAS_RESTORED_SESSION', payload: restored });
  }, []);

  const setAmasResult = useCallback((result: AmasProcessResult | null) => {
    dispatch({ type: 'SET_AMAS_RESULT', payload: result });
  }, []);

  const restoreSession = useCallback((partialState: Partial<MasteryState>) => {
    dispatch({ type: 'RESTORE_SESSION', payload: partialState });
  }, []);

  const reset = useCallback((resetOptions?: { targetMasteryCount?: number }) => {
    dispatch({ type: 'RESET', payload: resetOptions });
  }, []);

  return {
    state,
    dispatch,
    actions: {
      setLoading,
      setCompleted,
      setCurrentWord,
      setAllWords,
      addWords,
      setError,
      setTargetMasteryCount,
      setProgress,
      setHasRestoredSession,
      setAmasResult,
      restoreSession,
      reset
    }
  };
}
