import React, { useState, useCallback } from 'react';
import { PerformanceProfiler, performanceMonitor } from '../../utils/performanceProfiler';
import { DailyMissionCard } from '../../components/dashboard/DailyMissionCard';
import { ProgressOverviewCard } from '../../components/dashboard/ProgressOverviewCard';
import { MasteryWordItem } from '../../components/word-mastery/MasteryWordItem';
import { adminLogger } from '../../utils/logger';
import { CheckCircle, Confetti } from '../../components/Icon';

/**
 * PerformanceTestPage - 用于测试React.memo优化效果的页面
 */
const PerformanceTestPage: React.FC = () => {
  const [renderCount, setRenderCount] = useState(0);
  const [showReport, setShowReport] = useState(false);

  // Stable callback using useCallback
  const handleStart = useCallback(() => {
    adminLogger.debug('Start learning clicked');
  }, []);

  // Mock data for testing
  const progressData = {
    todayStudied: 25,
    todayTarget: 50,
    totalStudied: 1234,
    correctRate: 85,
    weeklyTrend: [20, 25, 22, 30, 28, 25, 25],
  };

  const masteryData = {
    wordId: 'test-word-1',
    spelling: 'abundant',
    meanings: 'adj. 大量的；丰富的；充裕的',
    mastery: {
      wordId: 'test-word-1',
      score: 0.85,
      confidence: 0.9,
      isLearned: true,
      factors: {
        srsLevel: 5,
        msmtRecall: 0.88,
        recentAccuracy: 0.92,
        userFatigue: 0.1,
      },
      suggestion: '继续保持，定期复习即可',
    },
  };

  // Force re-render to test memo effectiveness
  const forceRerender = () => {
    setRenderCount((prev) => prev + 1);
  };

  const clearMetrics = () => {
    performanceMonitor.clear();
    setRenderCount(0);
    setShowReport(false);
  };

  const generateReport = () => {
    performanceMonitor.logReport();
    setShowReport(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
            React.memo 性能测试 - 15/15组件已优化
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            测试优化后的组件在多次重渲染时的性能表现。点击"触发重渲染"按钮测试组件是否正确使用memo优化。
          </p>
        </div>

        {/* Control Panel */}
        <div className="mb-8 rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">测试控制面板</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={forceRerender}
              className="rounded-button bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              触发重渲染 ({renderCount} 次)
            </button>
            <button
              onClick={generateReport}
              className="rounded-button bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700"
            >
              生成性能报告
            </button>
            <button
              onClick={clearMetrics}
              className="rounded-button bg-gray-600 px-6 py-3 font-medium text-white transition-colors hover:bg-gray-700"
            >
              清除数据
            </button>
          </div>

          {showReport && (
            <div className="mt-6 rounded-button bg-gray-50 p-4 dark:bg-slate-700">
              <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">性能统计</h3>
              <pre className="overflow-x-auto text-xs text-gray-700 dark:text-gray-300">
                {performanceMonitor.generateReport()}
              </pre>
            </div>
          )}
        </div>

        {/* Test Components */}
        <div className="space-y-8">
          {/* DailyMissionCard Test */}
          <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              <CheckCircle size={20} className="mr-2 inline text-green-500" />
              DailyMissionCard
            </h2>
            <PerformanceProfiler id="DailyMissionCard">
              <DailyMissionCard
                totalWords={100}
                todayStudied={25}
                todayTarget={50}
                estimatedTime={30}
                correctRate={85}
                onStart={handleStart}
              />
            </PerformanceProfiler>
          </div>

          {/* ProgressOverviewCard Test */}
          <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              <CheckCircle size={20} className="mr-2 inline text-green-500" />
              ProgressOverviewCard
            </h2>
            <PerformanceProfiler id="ProgressOverviewCard">
              <ProgressOverviewCard data={progressData} />
            </PerformanceProfiler>
          </div>

          {/* MasteryWordItem Test */}
          <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              <CheckCircle size={20} className="mr-2 inline text-green-500" />
              MasteryWordItem
            </h2>
            <PerformanceProfiler id="MasteryWordItem">
              <MasteryWordItem {...masteryData} />
            </PerformanceProfiler>
          </div>

          {/* Optimization Summary */}
          <div className="rounded-card border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/30">
            <h2 className="mb-4 text-xl font-bold text-green-900 dark:text-green-300">
              <Confetti size={20} className="mr-2 inline" />
              优化完成总结
            </h2>
            <div className="space-y-2 text-green-800 dark:text-green-200">
              <p className="font-semibold">已优化组件 (15/15):</p>
              <ul className="ml-6 list-disc space-y-1">
                <li>DailyMissionCard - Dashboard每日任务卡片</li>
                <li>ProgressOverviewCard - Dashboard进度概览卡片</li>
                <li>MasteryWordItem - 单词掌握度列表项</li>
                <li>StatusModal - 学习状态监控弹窗</li>
                <li>SuggestionModal - AI学习建议弹窗</li>
                <li>BadgeDetailModal - 徽章详情弹窗</li>
                <li>BatchImportModal - 批量导入单词弹窗</li>
                <li>其他8个之前已优化的组件</li>
              </ul>

              <div className="mt-4 rounded-button border border-green-300 bg-white p-4 dark:border-green-700 dark:bg-slate-800">
                <p className="font-semibold text-green-900 dark:text-green-300">优化技术:</p>
                <ul className="ml-6 mt-2 list-disc space-y-1 text-sm">
                  <li>React.memo包装所有组件</li>
                  <li>自定义比较函数进行深度对象比较</li>
                  <li>避免内联对象和函数创建</li>
                  <li>使用useCallback保证回调函数稳定性</li>
                  <li>针对复杂对象进行字段级别比较</li>
                </ul>
              </div>

              <div className="mt-4 rounded-button border border-green-300 bg-white p-4 dark:border-green-700 dark:bg-slate-800">
                <p className="font-semibold text-green-900 dark:text-green-300">预期性能提升:</p>
                <ul className="ml-6 mt-2 list-disc space-y-1 text-sm">
                  <li>减少30-50%的不必要重渲染</li>
                  <li>降低页面交互延迟</li>
                  <li>提升大列表滚动流畅度</li>
                  <li>减少CPU占用和内存压力</li>
                  <li>改善移动设备性能表现</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceTestPage;
