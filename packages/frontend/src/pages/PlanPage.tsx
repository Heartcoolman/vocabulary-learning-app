import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiClient from '../services/client';
import { handleError } from '../utils/errorHandler';
import { LearningPlan, PlanProgress, PlanOptions } from '../types/amas-enhanced';
import {
  Target,
  Calendar,
  ChartBar,
  Warning,
  CircleNotch,
  CheckCircle,
  Clock,
  Books,
  TrendUp,
  TrendDown,
  ArrowRight,
  Plus,
  Gear,
} from '../components/Icon';
import { Spinner } from '../components/ui/Spinner';

/**
 * PlanPage - 智能学习计划页面
 * 显示每日目标卡片、周进度条、预计完成日期、词书分配饼图
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */
export default function PlanPage() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [progress, setProgress] = useState<(PlanProgress & { status: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [planOptions, setPlanOptions] = useState<PlanOptions>({
    dailyTarget: 20,
    targetDays: 30,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const results = await Promise.allSettled([
        ApiClient.getLearningPlan(),
        ApiClient.getPlanProgress(),
      ]);

      const planResult = results[0];
      const progressResult = results[1];

      if (planResult.status === 'rejected' && progressResult.status === 'rejected') {
        throw planResult.reason;
      }

      const planData = planResult.status === 'fulfilled' ? planResult.value : null;
      const progressData = progressResult.status === 'fulfilled' ? progressResult.value : null;

      setPlan(planData);
      setProgress(progressData);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 生成新计划
  const handleGeneratePlan = async () => {
    try {
      setIsGenerating(true);
      const newPlan = await ApiClient.generateLearningPlan(planOptions);
      setPlan(newPlan);
      setShowGenerateModal(false);
      // 重新加载进度
      const progressData = await ApiClient.getPlanProgress();
      setProgress(progressData);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsGenerating(false);
    }
  };

  // 调整计划
  const handleAdjustPlan = async () => {
    try {
      setIsAdjusting(true);
      const adjustedPlan = await ApiClient.adjustLearningPlan('用户手动调整');
      setPlan(adjustedPlan);
      // 重新加载进度
      const progressData = await ApiClient.getPlanProgress();
      setProgress(progressData);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsAdjusting(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 计算剩余天数
  const getDaysRemaining = (dateStr: string) => {
    const targetDate = new Date(dateStr);
    const today = new Date();
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  // 渲染饼图（SVG）
  const renderPieChart = (
    distribution: { wordbookName?: string; percentage: number; priority: number }[],
  ) => {
    if (!distribution || distribution.length === 0) return null;

    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];
    const size = 200;
    const center = size / 2;
    const radius = 80;

    let currentAngle = -90; // 从顶部开始

    const slices = distribution.map((item, index) => {
      const angle = (item.percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${center} ${center}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z',
      ].join(' ');

      return (
        <path
          key={index}
          d={pathData}
          fill={colors[index % colors.length]}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />
      );
    });

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-full w-full max-w-[200px]">
        {slices}
        {/* 中心圆 */}
        <circle cx={center} cy={center} r={40} className="fill-white dark:fill-slate-800" />
        <text
          x={center}
          y={center - 5}
          textAnchor="middle"
          className="fill-gray-700 text-sm font-bold dark:fill-gray-200"
        >
          {distribution.length}
        </text>
        <text
          x={center}
          y={center + 15}
          textAnchor="middle"
          className="fill-gray-500 text-xs dark:fill-gray-400"
        >
          词书
        </text>
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-gray-400">正在加载学习计划...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">出错了</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button
            onClick={loadData}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl animate-g3-fade-in px-4 py-8">
        {/* 页面标题 */}
        <header className="mb-8">
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <Target size={32} color="#3b82f6" />
            学习计划
          </h1>
          <p className="text-gray-600 dark:text-gray-400">智能规划你的学习目标，高效完成词汇学习</p>
        </header>

        {/* 无计划时显示创建按钮 */}
        {!plan ? (
          <div className="rounded-card border-2 border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-800 dark:bg-blue-900/20">
            <Calendar size={64} color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="mb-2 text-xl font-bold text-blue-800 dark:text-blue-200">
              还没有学习计划
            </h2>
            <p className="mb-6 text-blue-600 dark:text-blue-300">
              创建一个智能学习计划，让学习更有目标
            </p>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="mx-auto flex items-center gap-2 rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
            >
              <Plus size={20} />
              创建学习计划
            </button>
          </div>
        ) : (
          <>
            {/* 每日目标卡片 */}
            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* 今日目标 */}
              <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Target size={24} color="#2563eb" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">今日目标</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {plan.dailyTarget} 词
                    </p>
                  </div>
                </div>
                {progress && (
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">已完成</span>
                      <span className="font-medium text-blue-600">
                        {progress.completedToday} / {progress.targetToday}
                        <span className="ml-1 text-gray-500 dark:text-gray-400">
                          ({Math.round((progress.completedToday / progress.targetToday) * 100)}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700">
                      <div
                        className="h-2 rounded-full bg-blue-500 transition-all duration-g3-slow"
                        style={{
                          width: `${Math.min((progress.completedToday / progress.targetToday) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 本周进度 */}
              <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle size={24} color="#16a34a" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">本周进度</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {progress ? Math.round(progress.weeklyProgress) : 0}%
                    </p>
                  </div>
                </div>
                {progress && (
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all duration-g3-slow"
                      style={{ width: `${progress.weeklyProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 总体进度 */}
              <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                    <ChartBar size={24} color="#9333ea" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">总体进度</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {progress ? Math.round(progress.overallProgress) : 0}%
                    </p>
                  </div>
                </div>
                {progress && (
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-purple-500 transition-all duration-g3-slow"
                      style={{ width: `${progress.overallProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 计划状态 */}
              <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      progress?.onTrack
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}
                  >
                    {progress?.onTrack ? (
                      <TrendUp size={24} color="#16a34a" />
                    ) : (
                      <TrendDown size={24} color="#ca8a04" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">计划状态</p>
                    <p
                      className={`text-lg font-bold ${progress?.onTrack ? 'text-green-600' : 'text-yellow-600'}`}
                    >
                      {progress?.onTrack ? '按计划进行' : '需要加油'}
                    </p>
                  </div>
                </div>
                {progress && (
                  <p
                    className={`text-sm ${progress.deviation >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {progress.deviation >= 0 ? '超前' : '落后'}{' '}
                    {Math.abs(progress.deviation).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>

            {/* 预计完成日期和词书分配 */}
            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* 预计完成日期 */}
              <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <Calendar size={24} color="#3b82f6" />
                  预计完成日期
                </h2>
                <div className="py-6 text-center">
                  <p className="mb-2 text-4xl font-bold text-blue-600">
                    {formatDate(plan.estimatedCompletionDate)}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">
                    还剩{' '}
                    <span className="font-bold text-gray-700 dark:text-gray-300">
                      {getDaysRemaining(plan.estimatedCompletionDate)}
                    </span>{' '}
                    天
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Clock size={16} />
                  <span>按当前进度计算</span>
                </div>
              </div>

              {/* 词书分配饼图 */}
              <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <Books size={24} color="#a855f7" />
                  词书分配
                </h2>
                {plan.wordbookDistribution && plan.wordbookDistribution.length > 0 ? (
                  <div className="flex flex-col items-center gap-6 md:flex-row">
                    <div className="h-48 w-48">{renderPieChart(plan.wordbookDistribution)}</div>
                    <div className="flex-1 space-y-2">
                      {plan.wordbookDistribution.map((item, index) => {
                        const colors = [
                          'bg-blue-500',
                          'bg-green-500',
                          'bg-yellow-500',
                          'bg-purple-500',
                          'bg-red-500',
                          'bg-cyan-500',
                        ];
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <div
                              className={`h-3 w-3 rounded-full ${colors[index % colors.length]}`}
                            />
                            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                              {item.wordbookName || `词书 ${index + 1}`}
                            </span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {item.percentage}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="py-8 text-center text-gray-500 dark:text-gray-400">
                    暂无词书分配数据
                  </p>
                )}
              </div>
            </div>

            {/* 周里程碑 */}
            {plan.weeklyMilestones && plan.weeklyMilestones.length > 0 && (
              <div className="mb-8 rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <Target size={24} color="#f59e0b" />
                  周里程碑
                </h2>
                <div className="space-y-4">
                  {plan.weeklyMilestones.map((milestone, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-4 rounded-card border-2 p-4 transition-all ${
                        milestone.completed
                          ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950'
                          : 'border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800'
                      } `}
                    >
                      <div
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${milestone.completed ? 'bg-green-500' : 'bg-gray-300'} `}
                      >
                        {milestone.completed ? (
                          <CheckCircle size={20} weight="fill" color="#ffffff" />
                        ) : (
                          <span className="font-bold text-white">{milestone.week}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p
                          className={`font-medium ${milestone.completed ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}
                        >
                          第 {milestone.week} 周
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {milestone.description}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-bold ${milestone.completed ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'}`}
                        >
                          {milestone.target} 词
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-2 rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
              >
                <Plus size={20} />
                重新生成计划
              </button>
              <button
                onClick={handleAdjustPlan}
                disabled={isAdjusting}
                className="flex items-center gap-2 rounded-button bg-gray-100 px-6 py-3 text-gray-700 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 active:scale-95 disabled:opacity-50 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
              >
                {isAdjusting ? (
                  <CircleNotch className="animate-spin" size={20} weight="bold" />
                ) : (
                  <Gear size={20} />
                )}
                自动调整计划
              </button>
              <button
                onClick={() => navigate('/learning')}
                className="flex items-center gap-2 rounded-button bg-green-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-green-600 active:scale-95"
              >
                开始学习
                <ArrowRight size={20} />
              </button>
            </div>
          </>
        )}

        {/* 生成计划弹窗 */}
        {showGenerateModal && (
          <div
            className="fixed inset-0 z-50 flex animate-g3-fade-in items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowGenerateModal(false)}
          >
            <div
              className="mx-4 w-full max-w-md animate-g3-slide-up rounded-3xl bg-white p-8 shadow-floating dark:bg-slate-800"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
                <Target size={28} color="#3b82f6" />
                创建学习计划
              </h2>

              <div className="space-y-6">
                {/* 每日目标 */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    每日学习目标（单词数）
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={planOptions.dailyTarget || 20}
                    onChange={(e) =>
                      setPlanOptions((prev) => ({
                        ...prev,
                        dailyTarget: parseInt(e.target.value) || 20,
                      }))
                    }
                    className="w-full rounded-card border border-gray-300 px-4 py-3 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    建议范围：10-50 词/天
                  </p>
                </div>

                {/* 目标天数 */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    计划周期（天）
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={365}
                    value={planOptions.targetDays || 30}
                    onChange={(e) =>
                      setPlanOptions((prev) => ({
                        ...prev,
                        targetDays: parseInt(e.target.value) || 30,
                      }))
                    }
                    className="w-full rounded-card border border-gray-300 px-4 py-3 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">建议范围：7-90 天</p>
                </div>
              </div>

              <div className="mt-8 flex gap-4">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1 rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-700 transition-all duration-g3-fast hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                >
                  取消
                </button>
                <button
                  onClick={handleGeneratePlan}
                  disabled={isGenerating}
                  className="flex flex-1 items-center justify-center gap-2 rounded-card bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Spinner className="animate-spin" size="sm" color="white" />
                      生成中...
                    </>
                  ) : (
                    '生成计划'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
