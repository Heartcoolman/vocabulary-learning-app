import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import ProgressBar from '../components/ProgressBar';
import AudioService from '../services/AudioService';
import { Confetti, Books, TrendUp, TrendDown, Clock, Star } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { AmasStatus, AmasSuggestion } from '../components';
import { useLearningSession } from '../hooks';

export default function LearningPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isPronouncing, setIsPronouncing] = useState(false);

  // 使用学习会话 Hook
  const { state, actions, timer } = useLearningSession();
  const {
    currentWord,
    allWords,
    testOptions,
    selectedAnswer,
    showResult,
    progress,
    isLoading,
    error,
    isCompleted,
    answerFeedback,
    wordState,
    amasResult,
    amasRefreshTrigger,
    submitError,
  } = state;
  const { responseTime } = timer;

  // 使用 ref 存储 actions，避免依赖数组问题
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // 初始化学习会话
  useEffect(() => {
    if (user?.id) {
      actionsRef.current.initialize(user.id);
    }
  }, [user?.id]);

  // 发音处理
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

  // 答题处理
  const handleSelectAnswer = useCallback(async (answer: string) => {
    await actions.handleSelectAnswer(answer, user?.id);
  }, [actions, user?.id]);

  // 下一题（hook 内部已处理 userId 传递）
  const handleNext = useCallback(() => {
    actions.handleNext();
  }, [actions]);

  // 休息
  const handleBreak = useCallback(() => {
    navigate('/statistics');
  }, [navigate]);

  // 重新开始
  const handleRestart = useCallback(() => {
    actions.restart();
    if (user?.id) {
      actions.initialize(user.id);
    }
  }, [actions, user?.id]);

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
    // 根据错误信息判断显示哪些按钮
    const showSettingsButton = error.includes('配置') || error.includes('设置');

    // 更智能的标题选择
    let errorTitle = '今天没有可学习的单词';
    if (error.includes('未配置')) {
      errorTitle = '需要配置学习计划';
    } else if (error.includes('已学完')) {
      errorTitle = '所有单词已学完';
    }

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
      {/* 顶部进度条 */}
      <ProgressBar current={progress.current} total={progress.total} />

      {/* 提交错误提示 */}
      {submitError && (
        <div className="mx-4 mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
          <span className="text-yellow-700 text-sm">{submitError}</span>
          <button
            onClick={() => actions.clearSubmitError()}
            className="text-yellow-600 hover:text-yellow-800 text-sm underline"
            aria-label="关闭提示"
          >
            知道了
          </button>
        </div>
      )}

      {/* 主内容区域 - 三栏布局：左状态 | 中学习 | 右建议 */}
      <div className="flex-1 grid grid-cols-5 gap-4 p-4 overflow-hidden">
        {/* 左侧：AMAS状态 */}
        <div className="col-span-1 flex flex-col justify-start pt-8">
          <AmasStatus detailed={false} refreshTrigger={amasRefreshTrigger} />
        </div>

        {/* 中间：学习主区域 - 居中 */}
        <div className="col-span-3 flex flex-col justify-center items-center min-w-0">
          <div className="w-full max-w-2xl">
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
              <div className="flex flex-col items-center pb-4 animate-fade-in">
                {/* 答题反馈信息 */}
                {answerFeedback && (
                  <div className="mb-6 p-4 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm w-full">
                    <div className="grid grid-cols-4 gap-3">
                      {/* 掌握程度变化 */}
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 mb-1">
                          <Star size={16} weight="duotone" color="#3b82f6" />
                          <span className="text-xs text-gray-600">掌握度</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-lg font-bold text-gray-900">
                            {answerFeedback.masteryLevelBefore}
                          </span>
                          {answerFeedback.masteryLevelAfter > answerFeedback.masteryLevelBefore ? (
                            <TrendUp size={14} weight="bold" color="#22c55e" />
                          ) : answerFeedback.masteryLevelAfter < answerFeedback.masteryLevelBefore ? (
                            <TrendDown size={14} weight="bold" color="#ef4444" />
                          ) : null}
                          <span className="text-lg font-bold text-gray-900">
                            {answerFeedback.masteryLevelAfter}
                          </span>
                        </div>
                      </div>

                      {/* 单词得分 */}
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 mb-1">
                          <Star size={16} weight="fill" color="#f59e0b" />
                          <span className="text-xs text-gray-600">得分</span>
                        </div>
                        <span className="text-lg font-bold text-gray-900">
                          {Math.round(answerFeedback.score)}
                        </span>
                      </div>

                      {/* 响应时间 */}
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 mb-1">
                          <Clock size={16} weight="bold" color="#8b5cf6" />
                          <span className="text-xs text-gray-600">用时</span>
                        </div>
                        <span className="text-lg font-bold text-gray-900">
                          {(responseTime / 1000).toFixed(1)}s
                        </span>
                      </div>

                      {/* 下次复习 */}
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 mb-1">
                          <Clock size={16} weight="duotone" color="#06b6d4" />
                          <span className="text-xs text-gray-600">复习</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
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

        {/* 右侧：AI建议 */}
        <div className="col-span-1 flex flex-col justify-start pt-8">
          {showResult && <AmasSuggestion result={amasResult} onBreak={handleBreak} />}
        </div>
      </div>
    </div>
  );
}
