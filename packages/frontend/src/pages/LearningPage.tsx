import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import WordCard from '../components/WordCard';
import ReverseWordCard from '../components/ReverseWordCard';
import TestOptions from '../components/TestOptions';
import MasteryProgress from '../components/MasteryProgress';
import { StatusModal, SuggestionModal } from '../components';
import { LearningModeSelector } from '../components/LearningModeSelector';
import ExplainabilityModal from '../components/explainability/ExplainabilityModal';
import LearningService from '../services/LearningService';
import {
  Confetti,
  Books,
  CircleNotch,
  Clock,
  WarningCircle,
  Brain,
  ChartPie,
  Lightbulb,
} from '../components/Icon';
import { FloatingEyeIndicator, FatigueAlertModal } from '../components/visual-fatigue';
import { useVisualFatigueStore } from '../stores/visualFatigueStore';
import { useMasteryLearning } from '../hooks/useMasteryLearning';
import { useDialogPauseTrackingWithStates } from '../hooks/useDialogPauseTracking';
import { useAutoPlayPronunciation } from '../hooks/useAutoPlayPronunciation';
import { useTestOptionsGenerator } from '../hooks/useTestOptions';
import { trackingService } from '../services/TrackingService';
import { STORAGE_KEYS } from '../constants/storageKeys';

export default function LearningPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
    trackingService.trackSessionStart({ page: 'learning' });
    return () => {
      // 组件卸载时记录会话结束（页面离开）
      trackingService.trackLearningPause('page_leave');
    };
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
    targetMasteryCount: 20,
    getDialogPausedTime,
    resetDialogPausedTime,
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
        console.error('[LearningPage] 提交答案失败:', error);
      }
      // 注意: isSubmittingRef 在 handleNext 中重置，确保用户看到结果后才能进入下一题
    },
    [currentWord, showResult, responseStartTime, submitAnswer, learningType],
  );

  const handleNext = useCallback(() => {
    advanceToNext();
    setSelectedAnswer(undefined);
    setShowResult(false);
    setResponseStartTime(Date.now());
    regenerateOptions(); // 强制触发选项重新生成
    isSubmittingRef.current = false; // 重置提交状态
  }, [advanceToNext, regenerateOptions]);

  const handleRestart = useCallback(async () => {
    await resetSession();
  }, [resetSession]);

  // 答题后自动切换到下一词
  useEffect(() => {
    if (showResult) {
      const timer = setTimeout(() => {
        handleNext();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showResult, handleNext]);

  // 自动朗读已由 useAutoPlayPronunciation Hook 处理

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
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
          <WarningCircle size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
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
            <Books size={96} weight="duotone" color="#3b82f6" className="mx-auto" />
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

  if (isCompleted) {
    const isMasteryAchieved = completionReason === 'mastery_achieved';
    const isQuestionLimit = completionReason === 'question_limit';

    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <div className="mb-4 animate-bounce">
            {isMasteryAchieved ? (
              <Confetti size={96} weight="duotone" color="#22c55e" className="mx-auto" />
            ) : (
              <Clock size={96} weight="duotone" color="#f59e0b" className="mx-auto" />
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
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center p-3">
        <div className="w-full space-y-3">
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
                  className="rounded-button p-2 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-indigo-900/30"
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
            <span className="text-sm text-gray-700 dark:text-gray-300">当前学习策略</span>
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
