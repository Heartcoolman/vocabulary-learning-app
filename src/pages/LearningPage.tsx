import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import MasteryProgress from '../components/MasteryProgress';
import { StatusModal, SuggestionModal } from '../components';
import { LearningModeSelector } from '../components/LearningModeSelector';
import ExplainabilityModal from '../components/explainability/ExplainabilityModal';
import AudioService from '../services/AudioService';
import LearningService from '../services/LearningService';
import { Confetti, Books, CircleNotch, Clock, WarningCircle, Brain, ChartPie, Lightbulb } from '../components/Icon';
import { useMasteryLearning } from '../hooks/useMasteryLearning';
import { learningLogger } from '../utils/logger';
import { trackingService } from '../services/TrackingService';


export default function LearningPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isPronouncing, setIsPronouncing] = useState(false);
  const previousPathRef = useRef<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>(undefined);
  const [showResult, setShowResult] = useState(false);
  const [responseStartTime, setResponseStartTime] = useState<number>(Date.now());
  const [testOptions, setTestOptions] = useState<string[]>([]);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [isExplainabilityOpen, setIsExplainabilityOpen] = useState(false);

  // 追踪对话框打开的时间（用于暂停疲劳度计算）
  const [dialogPausedTime, setDialogPausedTime] = useState(0);
  const dialogOpenTimeRef = useRef<number | null>(null);

  // 检测任意对话框是否打开
  const isAnyDialogOpen = isStatusOpen || isSuggestionOpen || isExplainabilityOpen;

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

  // 获取和重置对话框暂停时间的回调函数
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
    latestAmasResult
  } = useMasteryLearning({
    targetMasteryCount: 20,
    getDialogPausedTime,
    resetDialogPausedTime
  });

  const allWordsForOptions = useMemo(() => allWords.map(w => ({
    id: w.id,
    spelling: w.spelling,
    phonetic: w.phonetic,
    meanings: w.meanings,
    examples: w.examples,
    createdAt: 0,
    updatedAt: 0
  })), [allWords]);

  // 用于跟踪当前题目，防止同一单词重复出现时选项不更新
  const [questionIndex, setQuestionIndex] = useState(0);

  // 当 currentWord 或 questionIndex 变化时重新生成选项
  // questionIndex 用于处理同一单词连续出现的情况
  useEffect(() => {
    if (!currentWord) return;

    try {
      const wordForOptions = {
        ...currentWord,
        createdAt: 0,
        updatedAt: 0
      };
      const { options } = LearningService.generateTestOptions(
        wordForOptions,
        allWordsForOptions,
        4
      );
      setTestOptions(options);
    } catch (e) {
      learningLogger.warn({ err: e, wordId: currentWord.id }, '生成测试选项失败，使用备用方案');
      // 回退方案：确保至少2个选项，使用预设干扰项
      const correctAnswer = currentWord.meanings[0];
      const fallbackDistractors = [
        '未知释义',
        '其他含义',
        '暂无解释'
      ];
      // 从干扰项中随机选择一个，确保至少有2个选项
      const randomDistractor = fallbackDistractors[Math.floor(Math.random() * fallbackDistractors.length)];
      // 随机打乱顺序
      const fallbackOptions = Math.random() > 0.5
        ? [correctAnswer, randomDistractor]
        : [randomDistractor, correctAnswer];
      setTestOptions(fallbackOptions);
    }

    setSelectedAnswer(undefined);
    setShowResult(false);
    setResponseStartTime(Date.now());
  }, [currentWord, allWordsForOptions, questionIndex]);

  const handlePronounce = useCallback(async () => {
    if (!currentWord || isPronouncing) return;
    try {
      setIsPronouncing(true);
      await AudioService.playPronunciation(currentWord.spelling);
    } catch (err) {
      learningLogger.error({ err, word: currentWord.spelling }, '播放发音失败');
    } finally {
      setIsPronouncing(false);
    }
  }, [currentWord, isPronouncing]);

  // 使用 ref 立即跟踪是否已提交，防止快速点击重复提交
  const isSubmittingRef = useRef(false);

  const handleSelectAnswer = useCallback(async (answer: string) => {
    if (!currentWord || showResult || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setSelectedAnswer(answer);
    setShowResult(true);

    // 检查所有 meanings，任意一个匹配即为正确（支持多义词）
    const isCorrect = currentWord.meanings.includes(answer);
    const responseTime = Date.now() - responseStartTime;

    await submitAnswer(isCorrect, responseTime);
  }, [currentWord, showResult, responseStartTime, submitAnswer]);

  const handleNext = useCallback(() => {
    advanceToNext();
    setSelectedAnswer(undefined);
    setShowResult(false);
    setResponseStartTime(Date.now());
    setQuestionIndex(prev => prev + 1); // 递增题目索引，强制触发选项重新生成
    isSubmittingRef.current = false; // 重置提交状态
  }, [advanceToNext]);

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

  // 新单词出现时自动朗读
  useEffect(() => {
    if (currentWord && !showResult) {
      // 延迟一点播放，让用户先看到单词
      const timer = setTimeout(() => {
        AudioService.playPronunciation(currentWord.spelling).catch(err => {
          learningLogger.error({ err, word: currentWord.spelling }, '自动朗读失败');
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentWord?.id, showResult]);

  if (isLoading) {
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <WarningCircle size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">加载学习数据失败</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleRestart}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200"
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

  if (isCompleted) {
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
            已掌握 {progress.masteredCount}/{progress.targetCount} 个单词
          </p>
          <p className="text-gray-500 mb-4">
            本次答题 {progress.totalQuestions} 题
          </p>
          {isQuestionLimit && (
            <p className="text-amber-600 mb-4 text-sm">
              已达到今日题目上限，建议明天继续学习
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleRestart}
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

  if (!currentWord) {
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="flex-1 flex flex-col items-center justify-center p-3 w-full max-w-4xl mx-auto">
        <div className="w-full space-y-3">
          {/* 学习进度面板 - 集成工具栏 */}
          <MasteryProgress
            progress={progress}
            isCompleted={isCompleted}
            headerActions={
              <>
                <div className="h-4 w-px bg-gray-200 mx-1" />
                <LearningModeSelector minimal />
                <button
                  onClick={() => setIsStatusOpen(true)}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="状态监控"
                >
                  <ChartPie size={20} />
                </button>
                <button
                  onClick={() => setIsSuggestionOpen(true)}
                  disabled={!latestAmasResult}
                  className="p-2 text-gray-500 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-30"
                  title={!latestAmasResult ? '暂无建议' : 'AI 建议'}
                >
                  <Lightbulb size={20} weight={latestAmasResult ? 'fill' : 'regular'} />
                </button>
                <button
                  onClick={() => setIsExplainabilityOpen(true)}
                  disabled={!latestAmasResult}
                  className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
                  title="决策透视"
                >
                  <Brain size={20} />
                </button>
              </>
            }
          />
          <WordCard
            word={currentWord}
            onPronounce={handlePronounce}
            isPronouncing={isPronouncing}
          />

          <TestOptions
            options={testOptions}
            correctAnswers={currentWord.meanings}
            onSelect={handleSelectAnswer}
            selectedAnswer={selectedAnswer}
            showResult={showResult}
          />
        </div>
      </div>

      {/* AMAS决策解释 - 固定在底部，不影响布局 */}
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl px-3 transition-all duration-500 ease-out ${
        showResult ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        <div className="p-3 bg-white/95 backdrop-blur-sm border border-blue-200 rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">当前学习策略</span>
            <p className="text-sm text-gray-600">
              {latestAmasResult?.explanation || '分析中...'}
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
    </div>
  );
}
