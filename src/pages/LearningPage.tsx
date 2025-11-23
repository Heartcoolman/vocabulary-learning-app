import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Word } from '../types/models';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import ProgressBar from '../components/ProgressBar';
import LearningService from '../services/LearningService';
import AudioService from '../services/AudioService';
import ApiClient from '../services/ApiClient';
import { handleError } from '../utils/errorHandler';
import { Confetti, Books } from '../components/Icon';

export default function LearningPage() {
  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [testOptions, setTestOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [isPronouncing, setIsPronouncing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await ApiClient.getTodayWords();
      const words: Word[] = response.words;

      if (!words || words.length === 0) {
        setError('还没有配置学习计划，请先进行学习设置');
        setIsLoading(false);
        return;
      }

      setAllWords(words);

      const wordIds = words.map((w) => w.id);
      await LearningService.startSession(wordIds);

      loadCurrentWord(words);
      setIsLoading(false);
    } catch (err) {
      const errorMessage = handleError(err);
      setError(errorMessage || '加载学习内容失败');
      setIsLoading(false);
    }
  };

  const loadCurrentWord = (words: Word[]) => {
    const word = LearningService.getCurrentWord();

    if (!word) {
      setIsCompleted(true);
      return;
    }

    setCurrentWord(word);
    setSelectedAnswer(undefined);
    setShowResult(false);

    // generateTestOptions 现在返回 { options, correctAnswer }
    const { options } = LearningService.generateTestOptions(word, words, 4);
    setTestOptions(options);

    const prog = LearningService.getProgress();
    setProgress(prog);

    if (word.audioUrl) {
      AudioService.preloadAudio(word.audioUrl).catch((err) => {
        console.warn('音频预加载失败', err);
      });
    }

    const currentIndex = words.findIndex((w) => w.id === word.id);
    if (currentIndex >= 0 && currentIndex < words.length - 1) {
      const nextWord = words[currentIndex + 1];
      if (nextWord.audioUrl) {
        AudioService.preloadAudio(nextWord.audioUrl).catch((err) => {
          console.warn('下一个单词音频预加载失败', err);
        });
      }
    }
  };

  const handlePronounce = async () => {
    if (!currentWord || isPronouncing) return;

    try {
      setIsPronouncing(true);
      await AudioService.playPronunciation(currentWord.spelling);
    } catch (err) {
      console.error('播放发音失败:', err);
    } finally {
      setIsPronouncing(false);
    }
  };

  const handleSelectAnswer = async (answer: string) => {
    if (!currentWord || showResult) return;

    setSelectedAnswer(answer);
    setShowResult(true);

    const isCorrect = answer === currentWord.meanings[0];

    try {
      await LearningService.submitAnswer(currentWord.id, answer, isCorrect);
    } catch (err) {
      console.error('保存答题记录失败:', err);
    }
  };

  const handleNext = () => {
    const nextWord = LearningService.nextWord();

    if (!nextWord) {
      setIsCompleted(true);
      return;
    }

    loadCurrentWord(allWords);
  };

  const handleRestart = () => {
    LearningService.endSession();
    setIsCompleted(false);
    initializeSession();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600" role="status" aria-live="polite">
            正在加载...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    const showSettingsButton = error.includes('学习设置') || error.includes('配置');
    const errorTitle = showSettingsButton ? '需要配置学习计划' : '加载学习内容失败';

    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="alert" aria-live="assertive">
          <div className="mb-4" aria-hidden="true">
            <Books size={80} weight="thin" color="#eab308" className="mx-auto" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{errorTitle}</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {showSettingsButton && (
              <button
                onClick={() => navigate('/study-settings')}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                前往学习设置
              </button>
            )}
            <button
              onClick={() => navigate('/vocabulary')}
              className={`px-6 py-3 ${
                showSettingsButton
                  ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              } rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
            >
              词库管理
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="status" aria-live="polite">
          <div className="mb-4 animate-bounce" aria-hidden="true">
            <Confetti size={96} weight="duotone" color="#22c55e" className="mx-auto" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">学习完成！</h2>
          <p className="text-gray-600 mb-2">你已经完成了本次学习会话</p>
          <p className="text-gray-500 mb-8">共学习 {progress.total} 个单词</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleRestart}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="重新开始学习"
            >
              重新开始
            </button>
            <button
              onClick={() => navigate('/history')}
              className="px-6 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              aria-label="查看学习历史"
            >
              查看学习历史
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentWord) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div>
        <ProgressBar current={progress.current} total={progress.total} />
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <WordCard word={currentWord} onPronounce={handlePronounce} isPronouncing={isPronouncing} />

        <TestOptions
          options={testOptions}
          correctAnswer={currentWord.meanings[0]}
          onSelect={handleSelectAnswer}
          selectedAnswer={selectedAnswer}
          showResult={showResult}
        />

        {showResult && (
          <div className="flex justify-center pb-8 animate-fade-in">
            <button
              onClick={handleNext}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNext();
                }
              }}
              className="px-8 py-3 bg-blue-500 text-white rounded-lg text-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="进入下一个单词，或按回车"
              autoFocus
            >
              下一词 (Enter)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
