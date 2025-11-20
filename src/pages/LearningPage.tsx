import { useState, useEffect } from 'react';
import { Word } from '../types/models';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import ProgressBar from '../components/ProgressBar';
import LearningService from '../services/LearningService';
import AudioService from '../services/AudioService';
import StorageService from '../services/StorageService';
import { handleError } from '../utils/errorHandler';

/**
 * LearningPage - 主学习页面
 * 集成单词卡片、测试选项和进度条，管理学习流程
 */
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

  // 初始化学习会话
  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 加载所有单词
      const words = await StorageService.getWords();
      
      if (words.length === 0) {
        setError('词库为空，请先添加单词');
        setIsLoading(false);
        return;
      }

      setAllWords(words);

      // 开始学习会话
      const wordIds = words.map(w => w.id);
      await LearningService.startSession(wordIds);

      // 加载第一个单词
      loadCurrentWord(words);
      
      setIsLoading(false);
    } catch (err) {
      const errorMessage = handleError(err);
      setError(errorMessage);
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

    // 生成测试选项
    const options = LearningService.generateTestOptions(word, words, 4);
    setTestOptions(options);

    // 更新进度
    const prog = LearningService.getProgress();
    setProgress(prog);

    // 预加载当前和下一个单词的音频
    if (word.audioUrl) {
      AudioService.preloadAudio(word.audioUrl).catch(err => {
        console.warn('音频预加载失败:', err);
      });
    }

    // 预加载下一个单词的音频
    const currentIndex = words.findIndex(w => w.id === word.id);
    if (currentIndex >= 0 && currentIndex < words.length - 1) {
      const nextWord = words[currentIndex + 1];
      if (nextWord.audioUrl) {
        AudioService.preloadAudio(nextWord.audioUrl).catch(err => {
          console.warn('下一个单词音频预加载失败:', err);
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

    // 检查答案是否正确
    const isCorrect = answer === currentWord.meanings[0];

    // 提交答案记录
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

  // 加载中状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="alert" aria-live="assertive">
          <div className="text-red-500 text-5xl mb-4" aria-hidden="true">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.href = '/vocabulary'}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            前往词库管理
          </button>
        </div>
      </div>
    );
  }

  // 学习完成状态
  if (isCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="status" aria-live="polite">
          <div className="text-green-500 text-6xl mb-4 animate-bounce" aria-hidden="true">🎉</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">学习完成！</h2>
          <p className="text-gray-600 mb-2">
            你已经完成了本次学习会话
          </p>
          <p className="text-gray-500 mb-8">
            共学习 {progress.total} 个单词
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleRestart}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="重新开始学习"
            >
              重新开始
            </button>
            <button
              onClick={() => window.location.href = '/history'}
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

  // 正常学习状态
  if (!currentWord) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 进度条 */}
      <div className="pt-6">
        <ProgressBar current={progress.current} total={progress.total} />
      </div>

      {/* 单词卡片 */}
      <div className="flex-1 flex flex-col justify-center">
        <WordCard
          word={currentWord}
          onPronounce={handlePronounce}
          isPronouncing={isPronouncing}
        />

        {/* 测试选项 */}
        <TestOptions
          options={testOptions}
          correctAnswer={currentWord.meanings[0]}
          onSelect={handleSelectAnswer}
          selectedAnswer={selectedAnswer}
          showResult={showResult}
        />

        {/* 下一个按钮 */}
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
              aria-label="进入下一个单词，或按回车键"
              autoFocus
            >
              下一个 (Enter)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
