import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CircleNotch,
  WarningCircle,
  Books,
  Confetti,
  Clock,
} from '../../../components/Icon';
import type { QueueProgress } from '../../../services/learning/WordQueueManager';

/**
 * 学习状态类型
 */
export type LearningState =
  | 'loading'
  | 'error'
  | 'empty'
  | 'completed'
  | 'no_word'
  | 'learning';

/**
 * 学习状态渲染组件 Props
 */
export interface LearningStateRendererProps {
  /** 当前学习状态 */
  state: LearningState;
  /** 是否恢复了会话 */
  hasRestoredSession?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 学习进度 */
  progress?: QueueProgress;
  /** 完成原因 */
  completionReason?: 'mastery_achieved' | 'question_limit' | 'words_exhausted' | null;
  /** 重试/重新开始回调 */
  onRestart?: () => void;
  /** 子元素（用于 learning 状态时渲染学习界面） */
  children?: React.ReactNode;
}

/**
 * 加载状态组件
 */
function LoadingState({ hasRestoredSession }: { hasRestoredSession?: boolean }): React.ReactElement {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
        <p className="text-gray-600">
          {hasRestoredSession ? '恢复学习会话中...' : '加载单词中...'}
        </p>
      </div>
    </div>
  );
}

/**
 * 错误状态组件
 */
function ErrorState({
  error,
  onRestart,
}: {
  error?: string | null;
  onRestart?: () => void;
}): React.ReactElement {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <WarningCircle size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">加载学习数据失败</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={onRestart}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200"
        >
          重试
        </button>
      </div>
    </div>
  );
}

/**
 * 空状态组件（没有单词）
 */
function EmptyState(): React.ReactElement {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <div className="mb-4 animate-bounce">
          <Books size={96} weight="duotone" color="#3b82f6" className="mx-auto" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">暂无单词</h2>
        <p className="text-gray-600 mb-6">
          你还没有添加任何单词，请先选择词书或添加单词
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/vocabulary')}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200"
          >
            选择词书
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="px-6 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-all duration-200"
          >
            添加单词
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 完成状态组件
 */
function CompletedState({
  progress,
  completionReason,
  onRestart,
}: {
  progress?: QueueProgress;
  completionReason?: 'mastery_achieved' | 'question_limit' | 'words_exhausted' | null;
  onRestart?: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const isMasteryAchieved = completionReason === 'mastery_achieved';
  const isQuestionLimit = completionReason === 'question_limit';

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <div className="mb-4 animate-bounce">
          {isMasteryAchieved ? (
            <Confetti size={96} weight="duotone" color="#22c55e" className="mx-auto" />
          ) : (
            <Clock size={96} weight="duotone" color="#f59e0b" className="mx-auto" />
          )}
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {isMasteryAchieved ? '掌握目标达成！' : '今日学习结束'}
        </h2>
        <p className="text-gray-600 mb-2">
          已掌握 {progress?.masteredCount ?? 0}/{progress?.targetCount ?? 0} 个单词
        </p>
        <p className="text-gray-500 mb-4">
          本次答题 {progress?.totalQuestions ?? 0} 题
        </p>
        {isQuestionLimit && (
          <p className="text-amber-600 mb-4 text-sm">
            已达到今日题目上限，建议明天继续学习
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={onRestart}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            重新开始
          </button>
          <button
            onClick={() => navigate('/statistics')}
            className="px-6 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            查看统计
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 无可学单词状态组件
 */
function NoWordState(): React.ReactElement {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <Books size={80} weight="thin" color="#eab308" className="mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">没有可学习的单词</h2>
        <p className="text-gray-600 mb-6">请先配置学习计划或添加词书</p>
        <button
          onClick={() => navigate('/study-settings')}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          前往设置
        </button>
      </div>
    </div>
  );
}

/**
 * 学习状态渲染组件
 *
 * 根据不同的学习状态条件渲染相应的界面：
 * - loading: 加载中
 * - error: 错误
 * - empty: 没有单词
 * - completed: 学习完成
 * - no_word: 当前没有可学习的单词
 * - learning: 正常学习状态（渲染 children）
 *
 * @example
 * ```tsx
 * <LearningStateRenderer
 *   state={currentState}
 *   hasRestoredSession={hasRestoredSession}
 *   error={error}
 *   progress={progress}
 *   completionReason={completionReason}
 *   onRestart={handleRestart}
 * >
 *   {/* 学习界面 *\/}
 * </LearningStateRenderer>
 * ```
 */
export function LearningStateRenderer({
  state,
  hasRestoredSession,
  error,
  progress,
  completionReason,
  onRestart,
  children,
}: LearningStateRendererProps): React.ReactElement | null {
  switch (state) {
    case 'loading':
      return <LoadingState hasRestoredSession={hasRestoredSession} />;
    case 'error':
      return <ErrorState error={error} onRestart={onRestart} />;
    case 'empty':
      return <EmptyState />;
    case 'completed':
      return (
        <CompletedState
          progress={progress}
          completionReason={completionReason}
          onRestart={onRestart}
        />
      );
    case 'no_word':
      return <NoWordState />;
    case 'learning':
      return <>{children}</>;
    default:
      return null;
  }
}

/**
 * 根据学习状态数据确定当前状态
 */
export function determineLearningState({
  isLoading,
  error,
  allWordsCount,
  isCompleted,
  hasCurrentWord,
}: {
  isLoading: boolean;
  error?: string | null;
  allWordsCount: number;
  isCompleted: boolean;
  hasCurrentWord: boolean;
}): LearningState {
  if (isLoading) return 'loading';
  if (error) return 'error';
  if (allWordsCount === 0) return 'empty';
  if (isCompleted) return 'completed';
  if (!hasCurrentWord) return 'no_word';
  return 'learning';
}

export default LearningStateRenderer;
