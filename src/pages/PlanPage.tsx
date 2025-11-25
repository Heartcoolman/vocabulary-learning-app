import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiClient from '../services/ApiClient';
import { handleError } from '../utils/errorHandler';
import { 
  LearningPlan, 
  PlanProgress,
  PlanOptions
} from '../types/amas-enhanced';
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
  Gear
} from '../components/Icon';

/**
 * PlanPage - 智能学习计划页面
 * 显示每日目标卡片、周进度条、预计完成日期、词书分配饼图
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */
export default function PlanPage() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [progress, setProgress] = useState<PlanProgress & { status: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [planOptions, setPlanOptions] = useState<PlanOptions>({
    dailyTarget: 20,
    targetDays: 30
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [planData, progressData] = await Promise.all([
        ApiClient.getLearningPlan(),
        ApiClient.getPlanProgress()
      ]);

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
      day: 'numeric'
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
  const renderPieChart = (distribution: { wordbookName?: string; percentage: number; priority: number }[]) => {
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
        'Z'
      ].join(' ');

      return (
        <path
          key={index}
          d={pathData}
          fill={colors[index % colors.length]}
          className="hover:opacity-80 transition-opacity cursor-pointer"
        />
      );
    });

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full max-w-[200px] mx-auto">
        {slices}
        {/* 中心圆 */}
        <circle cx={center} cy={center} r={40} fill="white" />
        <text x={center} y={center - 5} textAnchor="middle" className="text-sm font-bold fill-gray-700">
          {distribution.length}
        </text>
        <text x={center} y={center + 15} textAnchor="middle" className="text-xs fill-gray-500">
          词书
        </text>
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600">正在加载学习计划...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
        {/* 页面标题 */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Target size={32} weight="duotone" color="#3b82f6" />
            学习计划
          </h1>
          <p className="text-gray-600">智能规划你的学习目标，高效完成词汇学习</p>
        </header>

        {/* 无计划时显示创建按钮 */}
        {!plan ? (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-8 text-center">
            <Calendar size={64} weight="duotone" color="#3b82f6" className="mx-auto mb-4" />
            <h2 className="text-xl font-bold text-blue-800 mb-2">还没有学习计划</h2>
            <p className="text-blue-600 mb-6">
              创建一个智能学习计划，让学习更有目标
            </p>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
            >
              <Plus size={20} weight="bold" />
              创建学习计划
            </button>
          </div>
        ) : (
          <>
            {/* 每日目标卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* 今日目标 */}
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Target size={24} weight="duotone" color="#2563eb" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">今日目标</p>
                    <p className="text-2xl font-bold text-gray-900">{plan.dailyTarget} 词</p>
                  </div>
                </div>
                {progress && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">已完成</span>
                      <span className="font-medium text-blue-600">
                        {progress.completedToday} / {progress.targetToday}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((progress.completedToday / progress.targetToday) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 本周进度 */}
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle size={24} weight="duotone" color="#16a34a" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">本周进度</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {progress ? Math.round(progress.weeklyProgress) : 0}%
                    </p>
                  </div>
                </div>
                {progress && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress.weeklyProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 总体进度 */}
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <ChartBar size={24} weight="duotone" color="#9333ea" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">总体进度</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {progress ? Math.round(progress.overallProgress) : 0}%
                    </p>
                  </div>
                </div>
                {progress && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress.overallProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 计划状态 */}
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    progress?.onTrack ? 'bg-green-100' : 'bg-yellow-100'
                  }`}>
                    {progress?.onTrack ? (
                      <TrendUp size={24} weight="duotone" color="#16a34a" />
                    ) : (
                      <TrendDown size={24} weight="duotone" color="#ca8a04" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">计划状态</p>
                    <p className={`text-lg font-bold ${progress?.onTrack ? 'text-green-600' : 'text-yellow-600'}`}>
                      {progress?.onTrack ? '按计划进行' : '需要加油'}
                    </p>
                  </div>
                </div>
                {progress && (
                  <p className={`text-sm ${progress.deviation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {progress.deviation >= 0 ? '超前' : '落后'} {Math.abs(progress.deviation).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>

            {/* 预计完成日期和词书分配 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* 预计完成日期 */}
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar size={24} weight="duotone" color="#3b82f6" />
                  预计完成日期
                </h2>
                <div className="text-center py-6">
                  <p className="text-4xl font-bold text-blue-600 mb-2">
                    {formatDate(plan.estimatedCompletionDate)}
                  </p>
                  <p className="text-gray-500">
                    还剩 <span className="font-bold text-gray-700">{getDaysRemaining(plan.estimatedCompletionDate)}</span> 天
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Clock size={16} weight="regular" />
                  <span>按当前进度计算</span>
                </div>
              </div>

              {/* 词书分配饼图 */}
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Books size={24} weight="duotone" color="#a855f7" />
                  词书分配
                </h2>
                {plan.wordbookDistribution && plan.wordbookDistribution.length > 0 ? (
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="w-48 h-48">
                      {renderPieChart(plan.wordbookDistribution)}
                    </div>
                    <div className="flex-1 space-y-2">
                      {plan.wordbookDistribution.map((item, index) => {
                        const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-red-500', 'bg-cyan-500'];
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`} />
                            <span className="text-sm text-gray-700 flex-1">
                              {item.wordbookName || `词书 ${index + 1}`}
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {item.percentage}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">暂无词书分配数据</p>
                )}
              </div>
            </div>

            {/* 周里程碑 */}
            {plan.weeklyMilestones && plan.weeklyMilestones.length > 0 && (
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Target size={24} weight="duotone" color="#f59e0b" />
                  周里程碑
                </h2>
                <div className="space-y-4">
                  {plan.weeklyMilestones.map((milestone, index) => (
                    <div 
                      key={index}
                      className={`
                        flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                        ${milestone.completed 
                          ? 'bg-green-50 border-green-300' 
                          : 'bg-gray-50 border-gray-200'
                        }
                      `}
                    >
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                        ${milestone.completed ? 'bg-green-500' : 'bg-gray-300'}
                      `}>
                        {milestone.completed ? (
                          <CheckCircle size={20} weight="fill" color="#ffffff" />
                        ) : (
                          <span className="text-white font-bold">{milestone.week}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${milestone.completed ? 'text-green-700' : 'text-gray-700'}`}>
                          第 {milestone.week} 周
                        </p>
                        <p className="text-sm text-gray-500">{milestone.description}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${milestone.completed ? 'text-green-600' : 'text-gray-600'}`}>
                          {milestone.target} 词
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <Plus size={20} weight="bold" />
                重新生成计划
              </button>
              <button
                onClick={handleAdjustPlan}
                disabled={isAdjusting}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 disabled:opacity-50"
              >
                {isAdjusting ? (
                  <CircleNotch className="animate-spin" size={20} weight="bold" />
                ) : (
                  <Gear size={20} weight="bold" />
                )}
                自动调整计划
              </button>
              <button
                onClick={() => navigate('/learning')}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                开始学习
                <ArrowRight size={20} weight="bold" />
              </button>
            </div>
          </>
        )}

        {/* 生成计划弹窗 */}
        {showGenerateModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowGenerateModal(false)}
          >
            <div 
              className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full mx-4 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Target size={28} weight="duotone" color="#3b82f6" />
                创建学习计划
              </h2>

              <div className="space-y-6">
                {/* 每日目标 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    每日学习目标（单词数）
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={planOptions.dailyTarget || 20}
                    onChange={(e) => setPlanOptions(prev => ({ ...prev, dailyTarget: parseInt(e.target.value) || 20 }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">建议范围：10-50 词/天</p>
                </div>

                {/* 目标天数 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    计划周期（天）
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={365}
                    value={planOptions.targetDays || 30}
                    onChange={(e) => setPlanOptions(prev => ({ ...prev, targetDays: parseInt(e.target.value) || 30 }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">建议范围：7-90 天</p>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleGeneratePlan}
                  disabled={isGenerating}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <CircleNotch className="animate-spin" size={20} weight="bold" />
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
