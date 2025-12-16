import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FlashCard from '../components/FlashCard';
import MasteryProgress from '../components/MasteryProgress';
import { CircleNotch, Books, Confetti, ArrowLeft } from '../components/Icon';
import { useMasteryLearning } from '../hooks/useMasteryLearning';
import { useAutoPlayPronunciation } from '../hooks/useAutoPlayPronunciation';

export default function FlashcardPage() {
  const navigate = useNavigate();
  const [responseStartTime, setResponseStartTime] = useState<number>(Date.now());

  const {
    currentWord,
    isLoading,
    isCompleted,
    progress,
    submitAnswer,
    advanceToNext,
    resetSession,
    allWords,
    error,
  } = useMasteryLearning({ targetMasteryCount: 20 });

  const { isPlaying: isPronouncing, play: playPronunciation } = useAutoPlayPronunciation({
    word: currentWord?.spelling,
    wordId: currentWord?.id,
    enabled: true,
    delay: 300,
    showResult: false,
  });

  useEffect(() => {
    if (currentWord) setResponseStartTime(Date.now());
  }, [currentWord]);

  const handleKnown = useCallback(async () => {
    if (!currentWord) return;
    const responseTime = Date.now() - responseStartTime;
    await submitAnswer(true, responseTime);
    advanceToNext();
    setResponseStartTime(Date.now());
  }, [currentWord, responseStartTime, submitAnswer, advanceToNext]);

  const handleUnknown = useCallback(async () => {
    if (!currentWord) return;
    const responseTime = Date.now() - responseStartTime;
    await submitAnswer(false, responseTime);
    advanceToNext();
    setResponseStartTime(Date.now());
  }, [currentWord, responseStartTime, submitAnswer, advanceToNext]);

  const handlePronounce = useCallback(async () => {
    if (!currentWord || isPronouncing) return;
    await playPronunciation();
  }, [currentWord, isPronouncing, playPronunciation]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CircleNotch className="animate-spin" size={48} color="#3b82f6" />
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Confetti size={96} weight="duotone" color="#22c55e" className="mx-auto mb-4" />
          <h2 className="mb-2 text-3xl font-bold">学习完成！</h2>
          <p className="mb-4 text-gray-600">
            已掌握 {progress.masteredCount}/{progress.targetCount} 个单词
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={resetSession}
              className="rounded-button bg-blue-500 px-6 py-3 text-white hover:bg-blue-600"
            >
              重新开始
            </button>
            <button
              onClick={() => navigate('/learn')}
              className="rounded-button bg-gray-100 px-6 py-3 hover:bg-gray-200"
            >
              返回学习
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Books size={80} color="#eab308" className="mx-auto mb-4" />
        <p>没有可学习的单词</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="mx-auto w-full max-w-4xl p-4">
        <div className="mb-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/learn')}
            className="rounded-button p-2 hover:bg-gray-100"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">闪记模式</h1>
        </div>
        <MasteryProgress progress={progress} isCompleted={isCompleted} />
        <div className="mt-6">
          <FlashCard
            word={currentWord}
            onKnown={handleKnown}
            onUnknown={handleUnknown}
            onPronounce={handlePronounce}
            isPronouncing={isPronouncing}
          />
        </div>
      </div>
    </div>
  );
}
