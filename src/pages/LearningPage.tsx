import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import MasteryProgress from '../components/MasteryProgress';
import AudioService from '../services/AudioService';
import LearningService from '../services/LearningService';
import { Confetti, Books, CircleNotch, Clock, WarningCircle } from '../components/Icon';
import { useMasteryLearning } from '../hooks/useMasteryLearning';


export default function LearningPage() {
  const navigate = useNavigate();
  const [isPronouncing, setIsPronouncing] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>(undefined);
  const [showResult, setShowResult] = useState(false);
  const [responseStartTime, setResponseStartTime] = useState<number>(Date.now());
  const [testOptions, setTestOptions] = useState<string[]>([]);

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
    error
  } = useMasteryLearning({ targetMasteryCount: 20 });

  const allWordsForOptions = useMemo(() => allWords.map(w => ({
    id: w.id,
    spelling: w.spelling,
    phonetic: w.phonetic,
    meanings: w.meanings,
    examples: w.examples,
    createdAt: 0,
    updatedAt: 0
  })), [allWords]);

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
      console.warn('[LearningPage] 生成选项失败，使用备用方案:', e);
      setTestOptions([currentWord.meanings[0]]);
    }

    setSelectedAnswer(undefined);
    setShowResult(false);
    setResponseStartTime(Date.now());
  }, [currentWord, allWordsForOptions]);

  const handlePronounce = useCallback(async () => {
    if (!currentWord || isPronouncing) return;
    try {
      setIsPronouncing(true);
      await AudioService.playPronunciation(currentWord.spelling);
    } catch (err) {
      console.error('播放发音失败:', err);
    } finally {
      setIsPronouncing(false);
    }
  }, [currentWord, isPronouncing]);

  const handleSelectAnswer = useCallback(async (answer: string) => {
    if (!currentWord || showResult) return;

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
  }, [advanceToNext]);

  const handleRestart = useCallback(async () => {
    await resetSession();
  }, [resetSession]);

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
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-2xl mx-auto">
        <div className="w-full space-y-6">
          <MasteryProgress
            progress={progress}
            isCompleted={isCompleted}
          />
          <WordCard
            word={currentWord}
            onPronounce={handlePronounce}
            isPronouncing={isPronouncing}
          />

          <TestOptions
            options={testOptions}
            correctAnswer={currentWord.meanings[0]}
            onSelect={handleSelectAnswer}
            selectedAnswer={selectedAnswer}
            showResult={showResult}
          />

          {showResult && (
            <div className="flex justify-center pb-4">
              <button
                onClick={handleNext}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNext();
                  }
                }}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg text-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
                autoFocus
              >
                下一词 (Enter)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
