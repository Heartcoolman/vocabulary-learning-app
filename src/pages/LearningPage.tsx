import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import WordCard from '../components/WordCard';
import TestOptions from '../components/TestOptions';
import AudioService from '../services/AudioService';
import { Confetti, Books, TrendUp, TrendDown, Clock, Star, Lightbulb, ChartPie, CircleNotch } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { useLearningSession } from '../hooks';
import SuggestionModal from '../components/SuggestionModal';
import StatusModal from '../components/StatusModal';

export default function LearningPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isPronouncing, setIsPronouncing] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  // 使用学习会话 Hook
  const { state, actions, timer } = useLearningSession();
  const {
    currentWord,
    testOptions,
    selectedAnswer,
    showResult,
    progress,
    isLoading,
    error,
    isCompleted,
    answerFeedback,
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

  // 监听 AMAS 结果，自动弹出建议
  useEffect(() => {
    if (!amasResult) return;

    // 自动弹出条件：
    // 1. 明确建议休息
    // 2. 注意力低于 40%
    // 3. 疲劳度高于 70%
    const shouldPopup =
      amasResult.shouldBreak ||
      (amasResult.state.attention < 0.4) ||
      (amasResult.state.fatigue > 0.7);

    if (shouldPopup) {
      setShowSuggestion(true);
    }
  }, [amasResult]);

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
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
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
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
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
              className={`px-6 py-3 ${showSettingsButton
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
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
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
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 顶部极细进度条 */}
      <div className="w-full h-1 bg-gray-200 fixed top-0 left-0 z-50">
        <div
          className="h-full bg-green-500 transition-all duration-500 ease-out"
          style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
        />
      </div>

      {/* 提交错误提示 */}
      {submitError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg shadow-lg flex items-center gap-2 animate-g3-slide-up">
          <span>{submitError}</span>
          <button
            onClick={() => actions.clearSubmitError()}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* 沉浸式主内容区域 */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-2xl mx-auto relative">

        {/* 学习状态按钮 - 左下角幽灵按钮 */}
        <button
          onClick={() => setShowStatus(true)}
          className="absolute bottom-4 left-4 p-2 text-gray-400 rounded-full hover:bg-white hover:shadow-sm hover:scale-105 transition-all duration-300 opacity-0 hover:opacity-100 group z-10"
          title="查看学习状态"
        >
          <ChartPie size={24} weight="duotone" className="group-hover:text-blue-600" />
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            学习状态
          </span>
        </button>

        {/* AI 建议按钮 - 右上角 */}
        {amasResult && (
          <button
            onClick={() => setShowSuggestion(true)}
            className="absolute top-4 right-4 p-2 bg-white text-blue-500 rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 group"
            title="查看 AI 建议"
          >
            <Lightbulb size={24} weight="duotone" className="group-hover:text-blue-600" />
            <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              AI 建议
            </span>
          </button>
        )}

        <div className="w-full space-y-8">
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
            <div className="flex flex-col items-center pb-4 animate-g3-fade-in">
              {/* 答题反馈信息 - 简化版 */}
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
                className="px-8 py-3 bg-blue-500 text-white rounded-lg text-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
                aria-label="进入下一个单词，或按回车"
                autoFocus
              >
                下一词 (Enter)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI 建议模态框 */}
      <SuggestionModal
        isOpen={showSuggestion}
        onClose={() => setShowSuggestion(false)}
        result={amasResult}
        onBreak={handleBreak}
      />

      {/* 学习状态模态框 */}
      <StatusModal
        isOpen={showStatus}
        onClose={() => setShowStatus(false)}
        refreshTrigger={amasRefreshTrigger}
      />
    </div>
  );
}
