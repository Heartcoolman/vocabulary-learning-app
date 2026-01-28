import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import WordCard from '../components/WordCard';
import ReverseWordCard from '../components/ReverseWordCard';
import TestOptions from '../components/TestOptions';
import MasteryProgress from '../components/MasteryProgress';
import { StatusModal, SuggestionModal } from '../components';
import { Spinner } from '../components/ui';
import { LearningModeSelector } from '../components/LearningModeSelector';
import ExplainabilityModal from '../components/explainability/ExplainabilityModal';
import LearningService from '../services/LearningService';
import {
  Confetti,
  Books,
  Clock,
  WarningCircle,
  Brain,
  ChartPie,
  Lightbulb,
  SkipForward,
  Stop,
  Trophy,
} from '../components/Icon';
import { FloatingEyeIndicator, FatigueAlertModal } from '../components/visual-fatigue';
import { useVisualFatigueStore } from '../stores/visualFatigueStore';
import { useMasteryLearning } from '../hooks/useMasteryLearning';
import { useConfusionBatchLearning } from '../hooks/useConfusionBatchLearning';
import { useDialogPauseTrackingWithStates } from '../hooks/useDialogPauseTracking';
import { useAutoPlayPronunciation } from '../hooks/useAutoPlayPronunciation';
import { useTestOptionsGenerator } from '../hooks/useTestOptions';
import { useStudyConfig } from '../hooks/queries/useStudyConfig';
import { trackingService } from '../services/TrackingService';
import { apiLogger } from '../utils/logger';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { LearningSeedState } from '../utils/learningSeed';

export default function LearningPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const seedState = location.state as LearningSeedState | null;
  const seedWords = seedState?.seedWords?.length ? seedState.seedWords : undefined;
  const seedSource = seedState?.seedSource;
  const seedLabel = seedState?.seedLabel;
  const confusionPairs = seedState?.confusionPairs ?? [];
  const themeLabel = seedState?.themeLabel ?? '';
  const isConfusionBatchMode = seedSource === 'confusion-batch' && confusionPairs.length > 0;
  const previousPathRef = useRef<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>(undefined);
  const [showResult, setShowResult] = useState(false);
  const [responseStartTime, setResponseStartTime] = useState<number>(Date.now());
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [isExplainabilityOpen, setIsExplainabilityOpen] = useState(false);
  const [isFatigueAlertOpen, setIsFatigueAlertOpen] = useState(false);
  const fatigueAlertShownRef = useRef(false);
  const [learningType, setLearningType] = useState<'word-to-meaning' | 'meaning-to-word'>(() => {
    return (
      (localStorage.getItem(STORAGE_KEYS.LEARNING_TYPE) as 'word-to-meaning' | 'meaning-to-word') ||
      'word-to-meaning'
    );
  });

  // 使用对话框暂停追踪 Hook（替代原来的手动追踪逻辑）
  const { getPausedTime: getDialogPausedTime, resetPausedTime: resetDialogPausedTime } =
    useDialogPauseTrackingWithStates([
      isStatusOpen,
      isSuggestionOpen,
      isExplainabilityOpen,
      isFatigueAlertOpen,
    ]);

  // 获取用户学习配置
  const { data: studyConfig } = useStudyConfig();
  const targetWordCount = seedWords?.length ?? studyConfig?.dailyWordCount ?? 20;

  const seedSessionInfo = useMemo(() => {
    if (!seedSource) return null;
    if (seedSource === 'cluster') {
      return {
        label: '学习该主题',
        detail: seedLabel || '主题词汇',
        badgeClass:
          'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-300',
      };
    }
    if (seedSource === 'confusion') {
      return {
        label: '一起练习',
        detail: '易混淆词',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-300',
      };
    }
    if (seedSource === 'confusion-batch') {
      return {
        label: '批量学习',
        detail: themeLabel || '易混淆词主题',
        badgeClass:
          'border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-800/60 dark:bg-purple-900/30 dark:text-purple-300',
      };
    }
    return null;
  }, [seedSource, seedLabel, themeLabel]);

  // Confusion batch learning hook
  const confusionBatch = useConfusionBatchLearning({
    pairs: confusionPairs,
    themeLabel,
    initialPairIndex: seedState?.currentPairIndex ?? 0,
  });

  // 视觉疲劳状态
  const { enabled: fatigueEnabled, metrics: fatigueMetrics } = useVisualFatigueStore();

  // 保存学习类型偏好
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LEARNING_TYPE, learningType);
  }, [learningType]);

  // 页面切换埋点
  useEffect(() => {
    if (previousPathRef.current !== null && previousPathRef.current !== location.pathname) {
      trackingService.trackPageSwitch(previousPathRef.current, location.pathname);
    }
    previousPathRef.current = location.pathname;
  }, [location.pathname]);

  // 会话开始埋点
  useEffect(() => {
    trackingService.trackSessionStart({
      page: 'learning',
      seedSource: seedSource ?? null,
      seedLabel: seedLabel ?? null,
      seedWordCount: seedWords?.length ?? null,
    });
    return () => {
      // 组件卸载时记录会话结束（页面离开）
      trackingService.trackLearningPause('page_leave');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 疲劳提醒：当疲劳度超过阈值时弹出提醒
  useEffect(() => {
    if (!fatigueEnabled) return;
    const fatigueScore = fatigueMetrics.visualFatigueScore;
    // 阈值 0.6，且本次会话未弹出过
    if (fatigueScore > 0.6 && !fatigueAlertShownRef.current) {
      fatigueAlertShownRef.current = true;
      setIsFatigueAlertOpen(true);
    }
    // 疲劳恢复到 0.3 以下时重置，允许再次提醒
    if (fatigueScore < 0.3) {
      fatigueAlertShownRef.current = false;
    }
  }, [fatigueEnabled, fatigueMetrics.visualFatigueScore]);

  const {
    currentWord,
    isLoading,
    isCompleted,
    completionReason,
    progress,
    submitAnswer,
    advanceToNext,
    resetSession,
    hasRestoredSession,
    allWords,
    error,
    latestAmasResult,
  } = useMasteryLearning({
    targetMasteryCount: targetWordCount,
    getDialogPausedTime,
    resetDialogPausedTime,
    seedWords,
  });

  // 使用自动朗读 Hook
  const { isPlaying: isPronouncing, play: playPronunciation } = useAutoPlayPronunciation({
    word: currentWord?.spelling,
    wordId: currentWord?.id,
    enabled: true,
    delay: 300,
    showResult,
  });

  // 转换单词格式以适配选项生成器
  const allWordsForOptions = useMemo(
    () =>
      allWords.map((w) => ({
        id: w.id,
        spelling: w.spelling,
        phonetic: w.phonetic,
        meanings: w.meanings,
        examples: w.examples,
        createdAt: 0,
        updatedAt: 0,
      })),
    [allWords],
  );

  // 转换当前单词格式
  const currentWordForOptions = useMemo(() => {
    if (!currentWord) return null;
    return {
      ...currentWord,
      createdAt: 0,
      updatedAt: 0,
    };
  }, [currentWord]);

  // 使用测试选项生成器 Hook - 稳定函数引用避免 useEffect 依赖问题
  const optionsGenerator = useMemo(
    () =>
      learningType === 'word-to-meaning'
        ? LearningService.generateTestOptions.bind(LearningService)
        : LearningService.generateReverseTestOptions.bind(LearningService),
    [learningType],
  );

  const fallbackDistractors = useMemo(
    () =>
      learningType === 'word-to-meaning'
        ? ['未知释义', '其他含义', '暂无解释']
        : ['unknown', 'other', 'none'],
    [learningType],
  );

  const { options: testOptions, regenerateOptions } = useTestOptionsGenerator(
    {
      currentWord: currentWordForOptions,
      allWords: allWordsForOptions,
      numberOfOptions: 4,
      fallbackDistractors,
    },
    optionsGenerator,
  );

  // 当单词变化时重置答题状态
  useEffect(() => {
    if (!currentWord) return;
    setSelectedAnswer(undefined);
    setShowResult(false);
    setResponseStartTime(Date.now());
  }, [currentWord]);

  const handlePronounce = useCallback(async () => {
    if (!currentWord || isPronouncing) return;
    await playPronunciation();
  }, [currentWord, isPronouncing, playPronunciation]);

  // 使用 ref 立即跟踪是否已提交，防止快速点击重复提交
  const isSubmittingRef = useRef(false);

  // 使用 ref 存储 handleNext 的最新引用，避免自动跳转定时器因依赖变化而被取消
  const handleNextRef = useRef<() => void>(() => {});

  const handleSelectAnswer = useCallback(
    async (answer: string) => {
      if (!currentWord || showResult || isSubmittingRef.current) return;
      isSubmittingRef.current = true;

      setSelectedAnswer(answer);
      setShowResult(true);

      // 根据学习类型判断正确答案
      const correctAnswers =
        learningType === 'word-to-meaning'
          ? currentWord.meanings.map((m) => LearningService.simplifyMeaning(m))
          : [currentWord.spelling];
      const isCorrect = correctAnswers.includes(answer);
      const responseTime = Date.now() - responseStartTime;

      try {
        await submitAnswer(isCorrect, responseTime);
      } catch (error) {
        // 提交失败时记录错误，但不阻止用户继续学习
        // 答案会被保存到本地队列，后续会自动重试同步
        apiLogger.error({ err: error }, '[LearningPage] 提交答案失败');
      }
      // 注意: isSubmittingRef 在 handleNext 中重置，确保用户看到结果后才能进入下一题
    },
    [currentWord, showResult, responseStartTime, submitAnswer, learningType],
  );

  const handleNext = useCallback(() => {
    advanceToNext();
    // In confusion batch mode, also advance the pair progress
    if (isConfusionBatchMode) {
      confusionBatch.advanceToNextPair();
    }
    setSelectedAnswer(undefined);
    setShowResult(false);
    setResponseStartTime(Date.now());
    regenerateOptions(); // 强制触发选项重新生成
    isSubmittingRef.current = false; // 重置提交状态
  }, [advanceToNext, regenerateOptions, isConfusionBatchMode, confusionBatch]);

  // 始终保持 ref 指向最新的 handleNext
  handleNextRef.current = handleNext;

  const handleRestart = useCallback(async () => {
    await resetSession();
  }, [resetSession]);

  // 答题后自动切换到下一词（使用 ref 调用以避免依赖变化导致定时器被取消）
  useEffect(() => {
    if (showResult) {
      const timer = setTimeout(() => {
        handleNextRef.current();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showResult]);

  // 自动朗读已由 useAutoPlayPronunciation Hook 处理

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-gray-400">
            {hasRestoredSession ? '恢复学习会话中...' : '加载单词中...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <WarningCircle size={64} color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
            加载学习数据失败
          </h2>
          <p className="mb-4 text-gray-600 dark:text-gray-400">{error}</p>
          <button
            onClick={handleRestart}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:bg-blue-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 没有单词时显示提示
  if (!isLoading && allWords.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <div className="mb-4 animate-bounce">
            <Books size={96} color="#3b82f6" className="mx-auto" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">暂无单词</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            你还没有添加任何单词，请先选择词书或添加单词
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={() => navigate('/study-settings')}
              className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:bg-blue-600"
            >
              选择词书
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="rounded-button bg-gray-100 px-6 py-3 text-gray-900 transition-all duration-g3-fast hover:bg-gray-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            >
              添加单词
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confusion batch completion screen
  if (isConfusionBatchMode && confusionBatch.isEnded) {
    const stats = confusionBatch.getSessionStats();
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="max-w-md px-4 text-center">
          <div className="mb-4 animate-bounce">
            <Trophy size={96} color="#a855f7" className="mx-auto" />
          </div>
          <h2 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">主题学习完成！</h2>
          <p className="mb-1 text-lg font-medium text-purple-600 dark:text-purple-400">
            {stats.themeLabel}
          </p>
          <div className="mb-6 mt-4 rounded-card border border-gray-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-800">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.completedPairs}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">完成</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {stats.skippedPairs}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">跳过</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {stats.elapsedTime}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">用时</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={() => navigate('/confusion-words')}
              className="rounded-button bg-purple-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-purple-600 active:scale-95"
            >
              选择其他主题
            </button>
            <button
              onClick={() => navigate('/statistics')}
              className="rounded-button bg-gray-100 px-6 py-3 text-gray-900 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 active:scale-95 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            >
              查看统计
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    const isMasteryAchieved = completionReason === 'mastery_achieved';
    const isQuestionLimit = completionReason === 'question_limit';

    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <div className="mb-4 animate-bounce">
            {isMasteryAchieved ? (
              <Confetti size={96} color="#22c55e" className="mx-auto" />
            ) : (
              <Clock size={96} color="#f59e0b" className="mx-auto" />
            )}
          </div>
          <h2 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
            {isMasteryAchieved ? '掌握目标达成！' : '今日学习结束'}
          </h2>
          <p className="mb-2 text-gray-600 dark:text-gray-400">
            已掌握 {progress.masteredCount}/{progress.targetCount} 个单词
          </p>
          <p className="mb-4 text-gray-500 dark:text-gray-500">
            本次答题 {progress.totalQuestions} 题
          </p>
          {isQuestionLimit && (
            <p className="mb-4 text-sm text-amber-600 dark:text-amber-500">
              已达到今日题目上限，建议明天继续学习
            </p>
          )}
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={handleRestart}
              className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              重新开始
            </button>
            <button
              onClick={() => navigate('/statistics')}
              className="rounded-button bg-gray-100 px-6 py-3 text-gray-900 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 active:scale-95 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            >
              查看统计
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <Books size={80} weight="thin" color="#eab308" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
            没有可学习的单词
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">请先配置学习计划或添加词书</p>
          <button
            onClick={() => navigate('/study-settings')}
            className="rounded-button bg-blue-500 px-6 py-3 text-white hover:bg-blue-600"
          >
            前往设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center p-3 pb-24">
        <div className="w-full space-y-3">
          {seedSessionInfo && (
            <div className="rounded-card border border-dashed border-gray-200 bg-white/80 px-4 py-2 text-sm text-gray-700 shadow-soft dark:border-slate-700 dark:bg-slate-800/70 dark:text-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${seedSessionInfo.badgeClass}`}
                  >
                    {seedSessionInfo.label}
                  </span>
                  <span className="font-medium">{seedSessionInfo.detail}</span>
                  {isConfusionBatchMode ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      词对 {confusionBatch.progress.current}/{confusionBatch.progress.total}
                    </span>
                  ) : seedWords?.length ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      共 {seedWords.length} 词
                    </span>
                  ) : null}
                </div>
                {isConfusionBatchMode && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={confusionBatch.skipPair}
                      className="flex items-center gap-1 rounded-button px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200"
                      title="跳过当前词对"
                    >
                      <SkipForward size={14} />
                      跳过
                    </button>
                    <button
                      onClick={confusionBatch.endSession}
                      className="flex items-center gap-1 rounded-button px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                      title="结束本次学习"
                    >
                      <Stop size={14} />
                      结束
                    </button>
                  </div>
                )}
              </div>
              {isConfusionBatchMode && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-all duration-g3-normal"
                      style={{ width: `${confusionBatch.progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {/* 学习进度面板 - 集成工具栏 */}
          <MasteryProgress
            progress={progress}
            isCompleted={isCompleted}
            headerActions={
              <>
                <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-slate-600" />
                <LearningModeSelector
                  minimal
                  learningType={learningType}
                  onLearningTypeChange={setLearningType}
                />
                <button
                  onClick={() => setIsStatusOpen(true)}
                  className="rounded-button p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-900/30"
                  title="状态监控"
                >
                  <ChartPie size={20} />
                </button>
                <button
                  onClick={() => setIsSuggestionOpen(true)}
                  disabled={!latestAmasResult}
                  className="rounded-button p-2 text-gray-500 transition-colors hover:bg-amber-50 hover:text-amber-500 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-amber-900/30"
                  title={!latestAmasResult ? '暂无建议' : 'AI 建议'}
                >
                  <Lightbulb size={20} weight={latestAmasResult ? 'fill' : 'regular'} />
                </button>
                <button
                  onClick={() => setIsExplainabilityOpen(true)}
                  disabled={!latestAmasResult}
                  className="rounded-button p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-blue-900/30"
                  title="决策透视"
                >
                  <Brain size={20} />
                </button>
                <FloatingEyeIndicator embedded size="sm" />
              </>
            }
          />
          {learningType === 'word-to-meaning' ? (
            <WordCard
              word={currentWord}
              onPronounce={handlePronounce}
              isPronouncing={isPronouncing}
            />
          ) : (
            <ReverseWordCard
              word={currentWord}
              onPronounce={handlePronounce}
              isPronouncing={isPronouncing}
              showSpelling={showResult}
            />
          )}

          <TestOptions
            options={testOptions}
            correctAnswers={
              learningType === 'word-to-meaning'
                ? currentWord.meanings.map((m) => LearningService.simplifyMeaning(m))
                : [currentWord.spelling]
            }
            onSelect={handleSelectAnswer}
            selectedAnswer={selectedAnswer}
            showResult={showResult}
          />
        </div>
      </div>

      {/* AMAS决策解释 - 固定在底部，不影响布局 */}
      <div
        className={`fixed bottom-4 left-1/2 w-full max-w-4xl -translate-x-1/2 px-3 transition-all duration-g3-slow ease-g3 ${
          showResult ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <div className="rounded-button border border-blue-200 bg-white/95 p-3 shadow-elevated backdrop-blur-sm dark:border-blue-800 dark:bg-slate-800/95">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-900 dark:text-white">
                {currentWord?.spelling}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  currentWord?.isNew
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                }`}
              >
                {currentWord?.isNew ? '新词' : '复习'}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {latestAmasResult?.explanation?.text || '分析中...'}
            </p>
          </div>
        </div>
      </div>

      <StatusModal
        isOpen={isStatusOpen}
        onClose={() => setIsStatusOpen(false)}
        refreshTrigger={progress.totalQuestions}
      />

      <SuggestionModal
        isOpen={isSuggestionOpen}
        onClose={() => setIsSuggestionOpen(false)}
        result={latestAmasResult}
        onBreak={() => setIsSuggestionOpen(false)}
      />

      <ExplainabilityModal
        isOpen={isExplainabilityOpen}
        onClose={() => setIsExplainabilityOpen(false)}
        latestDecision={latestAmasResult}
      />

      <FatigueAlertModal
        isOpen={isFatigueAlertOpen}
        onClose={() => setIsFatigueAlertOpen(false)}
        fatigueLevel={Math.round(fatigueMetrics.visualFatigueScore * 100)}
        recommendations={['远眺放松眼睛', '站起来活动一下', '喝杯水休息片刻']}
      />
    </div>
  );
}
