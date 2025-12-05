import { useState, useCallback, useEffect, useRef } from 'react';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import MasteryProgress from '../components/MasteryProgress';
import AudioService from '../services/AudioService';
import { useMasteryLearning } from '../hooks/useMasteryLearning';
import { useDialogPauseTracking } from '../hooks/learning/useDialogPauseTracking';
import { useLearningTracking } from '../hooks/learning/useLearningTracking';
import { useTestOptions } from '../hooks/learning/useTestOptions';
import { useLearningTimer } from '../hooks/useLearningTimer';
import { useLearningModals } from '../hooks/learning/useLearningModals';
import { LearningToolbar } from './learning/components/LearningToolbar';
import { LearningStateRenderer, determineLearningState } from './learning/components/LearningStateRenderer';
import { AmasExplanationPanel } from './learning/components/AmasExplanationPanel';
import { LearningModals } from './learning/components/LearningModals';
import { learningLogger } from '../utils/logger';

export default function LearningPage() {
  const [isPronouncing, setIsPronouncing] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>(undefined);
  const [showResult, setShowResult] = useState(false);
  const isSubmittingRef = useRef(false);

  // 模态框状态管理
  const modals = useLearningModals();

  // 对话框暂停时间追踪
  const { getDialogPausedTime, resetDialogPausedTime } = useDialogPauseTracking({
    dialogStates: modals.dialogStates,
  });

  // 学习页面埋点追踪
  useLearningTracking({ page: 'learning' });

  // 学习计时器
  const { startTimers, stopTimers } = useLearningTimer();

  // 核心学习逻辑
  const {
    currentWord, isLoading, isCompleted, completionReason, progress,
    submitAnswer, advanceToNext, resetSession, hasRestoredSession,
    allWords, error, latestAmasResult,
  } = useMasteryLearning({ targetMasteryCount: 20, getDialogPausedTime, resetDialogPausedTime });

  // 测试选项生成
  const { testOptions, incrementQuestionIndex } = useTestOptions({ currentWord, allWords, optionCount: 4 });

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

  const handleSelectAnswer = useCallback(async (answer: string) => {
    if (!currentWord || showResult || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSelectedAnswer(answer);
    setShowResult(true);
    await submitAnswer(currentWord.meanings.includes(answer), stopTimers());
  }, [currentWord, showResult, stopTimers, submitAnswer]);

  const handleNext = useCallback(() => {
    advanceToNext();
    setSelectedAnswer(undefined);
    setShowResult(false);
    startTimers();
    incrementQuestionIndex();
    isSubmittingRef.current = false;
  }, [advanceToNext, startTimers, incrementQuestionIndex]);

  // 答题后自动切换到下一词
  useEffect(() => {
    if (showResult) {
      const timer = setTimeout(handleNext, 2000);
      return () => clearTimeout(timer);
    }
  }, [showResult, handleNext]);

  // 新单词出现时：启动计时器、自动朗读
  useEffect(() => {
    if (currentWord && !showResult) {
      setSelectedAnswer(undefined);
      startTimers();
      const timer = setTimeout(() => {
        AudioService.playPronunciation(currentWord.spelling).catch(err => {
          learningLogger.error({ err, word: currentWord.spelling }, '自动朗读失败');
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentWord?.id, showResult, startTimers]);

  const learningState = determineLearningState({
    isLoading, error, allWordsCount: allWords.length, isCompleted, hasCurrentWord: !!currentWord,
  });

  return (
    <LearningStateRenderer
      state={learningState}
      hasRestoredSession={hasRestoredSession}
      error={error}
      progress={progress}
      completionReason={completionReason}
      onRestart={resetSession}
    >
      {currentWord && (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
          <div className="flex-1 flex flex-col items-center justify-center p-3 w-full max-w-4xl mx-auto">
            <div className="w-full space-y-3">
              <MasteryProgress
                progress={progress}
                isCompleted={isCompleted}
                headerActions={
                  <LearningToolbar
                    hasAmasResult={!!latestAmasResult}
                    latestAmasResult={latestAmasResult}
                    onOpenStatus={modals.openStatus}
                    onOpenSuggestion={modals.openSuggestion}
                    onOpenExplainability={modals.openExplainability}
                  />
                }
              />
              <WordCard word={currentWord} onPronounce={handlePronounce} isPronouncing={isPronouncing} />
              <TestOptions
                options={testOptions}
                correctAnswers={currentWord.meanings}
                onSelect={handleSelectAnswer}
                selectedAnswer={selectedAnswer}
                showResult={showResult}
              />
            </div>
          </div>
          <AmasExplanationPanel visible={showResult} latestAmasResult={latestAmasResult} />
          <LearningModals
            isStatusOpen={modals.isStatusOpen}
            onCloseStatus={modals.closeStatus}
            refreshTrigger={progress.totalQuestions}
            isSuggestionOpen={modals.isSuggestionOpen}
            onCloseSuggestion={modals.closeSuggestion}
            isExplainabilityOpen={modals.isExplainabilityOpen}
            onCloseExplainability={modals.closeExplainability}
            latestAmasResult={latestAmasResult}
          />
        </div>
      )}
    </LearningStateRenderer>
  );
}
