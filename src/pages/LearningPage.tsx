import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Word } from '../types/models';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import ProgressBar from '../components/ProgressBar';
import LearningService from '../services/LearningService';
import AudioService from '../services/AudioService';
import ApiClient from '../services/ApiClient';
import { handleError } from '../utils/errorHandler';
import { Confetti, Books, TrendUp, TrendDown, Clock, Star } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';

export default function LearningPage() {
  const { user } = useAuth();
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
  
  // 计时器相关状态
  const [responseTime, setResponseTime] = useState<number>(0);
  const [dwellTime, setDwellTime] = useState<number>(0);
  const wordDisplayTimeRef = useRef<number>(0);
  const dwellTimerRef = useRef<number | null>(null);

  // 🚀 预计算结果缓存：存储答对和答错的结果
  const precomputedResultsRef = useRef<{
    correct: {
      masteryLevelBefore: number;
      masteryLevelAfter: number;
      score: number;
      nextReviewDate: string;
    } | null;
    wrong: {
      masteryLevelBefore: number;
      masteryLevelAfter: number;
      score: number;
      nextReviewDate: string;
    } | null;
  }>({ correct: null, wrong: null });

  // 答题反馈信息
  const [answerFeedback, setAnswerFeedback] = useState<{
    masteryLevelBefore: number;
    masteryLevelAfter: number;
    score: number;
    nextReviewDate: string;
  } | null>(null);
  
  // 当前单词的学习状态
  const [wordState, setWordState] = useState<{
    masteryLevel: number;
    score: number;
    nextReviewDate: string;
  } | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    // 等待用户信息加载完成后再初始化
    if (user) {
      initializeSession();
    } else {
      // 用户未登录，显示错误提示
      setIsLoading(false);
      setError('请先登录后再开始学习');
    }
  }, [user]);

  const initializeSession = async () => {
    // 确保用户已登录
    if (!user) {
      setError('请先登录后再开始学习');
      setIsLoading(false);
      return;
    }

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
      await LearningService.startSession(wordIds, user.id);

      loadCurrentWord(words);
      setIsLoading(false);
    } catch (err) {
      const errorMessage = handleError(err);
      setError(errorMessage || '加载学习内容失败');
      setIsLoading(false);
    }
  };

  const loadCurrentWord = async (words: Word[]) => {
    const word = LearningService.getCurrentWord();

    if (!word) {
      setIsCompleted(true);
      return;
    }

    setCurrentWord(word);
    setSelectedAnswer(undefined);
    setShowResult(false);
    setAnswerFeedback(null);

    // 重置计时器
    setResponseTime(0);
    setDwellTime(0);
    wordDisplayTimeRef.current = Date.now();
    
    // 清除旧的停留时长计时器
    if (dwellTimerRef.current) {
      clearInterval(dwellTimerRef.current);
    }
    
    // 启动停留时长计时器（每100ms更新一次）
    dwellTimerRef.current = setInterval(() => {
      setDwellTime(Date.now() - wordDisplayTimeRef.current);
    }, 100);

    // 如果有用户ID，尝试获取单词的学习状态
    if (user?.id) {
      try {
        const state = await LearningService.getWordState(user.id, word.id);
        if (state) {
          const currentState = {
            masteryLevel: state.masteryLevel,
            score: state.score || 0,
            nextReviewDate: state.nextReviewDate
              ? new Date(state.nextReviewDate).toLocaleDateString('zh-CN')
              : '未知'
          };
          setWordState(currentState);

          // 🚀 预计算答对和答错的结果
          const masteryLevel = state.masteryLevel;
          precomputedResultsRef.current = {
            correct: {
              masteryLevelBefore: masteryLevel,
              masteryLevelAfter: Math.min(5, masteryLevel + 1),
              score: state.score || 0,
              nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')
            },
            wrong: {
              masteryLevelBefore: masteryLevel,
              masteryLevelAfter: Math.max(0, masteryLevel - 1),
              score: state.score || 0,
              nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')
            }
          };
        } else {
          setWordState(null);
          // 新单词的预计算结果
          precomputedResultsRef.current = {
            correct: {
              masteryLevelBefore: 0,
              masteryLevelAfter: 1,
              score: 0,
              nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')
            },
            wrong: {
              masteryLevelBefore: 0,
              masteryLevelAfter: 0,
              score: 0,
              nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')
            }
          };
        }
      } catch (error) {
        console.error('获取单词状态失败:', error);
        setWordState(null);
        precomputedResultsRef.current = { correct: null, wrong: null };
      }
    } else {
      setWordState(null);
      precomputedResultsRef.current = { correct: null, wrong: null };
    }

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
  
  // 清理计时器
  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) {
        clearInterval(dwellTimerRef.current);
      }
    };
  }, []);

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

    // 停止停留时长计时器
    if (dwellTimerRef.current) {
      clearInterval(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }

    // 计算响应时间（从显示单词到选择答案）
    const finalResponseTime = Date.now() - wordDisplayTimeRef.current;
    setResponseTime(finalResponseTime);

    setSelectedAnswer(answer);
    setShowResult(true);

    const isCorrect = answer === currentWord.meanings[0];

    // 🚀 使用预计算的结果（0延迟）
    const precomputedResult = isCorrect
      ? precomputedResultsRef.current.correct
      : precomputedResultsRef.current.wrong;

    if (precomputedResult) {
      setAnswerFeedback(precomputedResult);
    } else {
      // 降级方案：简单计算
      const currentMasteryLevel = wordState?.masteryLevel || 0;
      setAnswerFeedback({
        masteryLevelBefore: currentMasteryLevel,
        masteryLevelAfter: isCorrect ? Math.min(5, currentMasteryLevel + 1) : Math.max(0, currentMasteryLevel - 1),
        score: wordState?.score || 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')
      });
    }

    // 后台提交答题（不阻塞UI）
    LearningService.submitAnswer(
      currentWord.id,
      answer,
      isCorrect,
      finalResponseTime,
      dwellTime,
      user?.id
    ).then(result => {
      // 收到真实结果后更新（通常用户已经点击下一题了）
      if (result) {
        setAnswerFeedback({
          masteryLevelBefore: result.masteryLevelBefore || 0,
          masteryLevelAfter: result.masteryLevelAfter || 0,
          score: result.score || 0,
          nextReviewDate: result.nextReviewDate
            ? new Date(result.nextReviewDate).toLocaleDateString('zh-CN')
            : '未知'
        });
      }
    }).catch(err => {
      console.error('保存答题记录失败:', err);
    });
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
        <WordCard 
          word={currentWord} 
          onPronounce={handlePronounce} 
          isPronouncing={isPronouncing}
          masteryLevel={wordState?.masteryLevel}
          wordScore={wordState?.score}
          nextReviewDate={wordState?.nextReviewDate}
        />

        <TestOptions
          options={testOptions}
          correctAnswer={currentWord.meanings[0]}
          onSelect={handleSelectAnswer}
          selectedAnswer={selectedAnswer}
          showResult={showResult}
        />

        {showResult && (
          <div className="flex flex-col items-center pb-8 animate-fade-in">
            {/* 答题反馈信息 */}
            {answerFeedback && (
              <div className="mb-6 p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm max-w-2xl w-full">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* 掌握程度变化 */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-2">
                      <Star size={20} weight="duotone" color="#3b82f6" />
                      <span className="text-sm text-gray-600">掌握程度</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {answerFeedback.masteryLevelBefore}
                      </span>
                      {answerFeedback.masteryLevelAfter > answerFeedback.masteryLevelBefore ? (
                        <TrendUp size={20} weight="bold" color="#22c55e" />
                      ) : answerFeedback.masteryLevelAfter < answerFeedback.masteryLevelBefore ? (
                        <TrendDown size={20} weight="bold" color="#ef4444" />
                      ) : null}
                      <span className="text-2xl font-bold text-gray-900">
                        {answerFeedback.masteryLevelAfter}
                      </span>
                    </div>
                  </div>

                  {/* 单词得分 */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-2">
                      <Star size={20} weight="fill" color="#f59e0b" />
                      <span className="text-sm text-gray-600">单词得分</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">
                      {Math.round(answerFeedback.score)}
                    </span>
                  </div>

                  {/* 响应时间 */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={20} weight="bold" color="#8b5cf6" />
                      <span className="text-sm text-gray-600">响应时间</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">
                      {(responseTime / 1000).toFixed(1)}s
                    </span>
                  </div>

                  {/* 下次复习 */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={20} weight="duotone" color="#06b6d4" />
                      <span className="text-sm text-gray-600">下次复习</span>
                    </div>
                    <span className="text-base font-medium text-gray-900">
                      {answerFeedback.nextReviewDate}
                    </span>
                  </div>
                </div>
              </div>
            )}

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
