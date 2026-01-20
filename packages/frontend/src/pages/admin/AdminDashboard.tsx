import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAdminStatistics,
  useSystemHealth,
  useVisualFatigueStats,
  useSystemVersion,
} from '../../hooks/queries';
import { useLLMPendingCount } from '../../hooks/queries/useLLMAdvisor';
import { amasClient } from '../../services/client';
import {
  UsersThree,
  Sparkle,
  Books,
  BookOpen,
  Note,
  FileText,
  ChartBar,
  CircleNotch,
  Warning,
  CheckCircle,
  Pulse,
  Gear,
  Brain,
  ArrowClockwise,
  Lightning,
  Eye,
  Robot,
} from '../../components/Icon';
import { adminLogger } from '../../utils/logger';
import { LearningStrategy } from '../../types/amas';
import { ConfirmModal, AlertModal } from '../../components/ui';

/** 颜色类名映射 */
type ColorKey = 'blue' | 'green' | 'purple' | 'indigo' | 'pink' | 'yellow' | 'red';

/**
 * 根据健康分数返回对应的 Tailwind 颜色类
 */
function getScoreColorClass(score: number): string {
  if (score >= 90) return 'text-green-500';
  if (score >= 75) return 'text-blue-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

/**
 * 根据健康分数返回进度条背景色类
 */
function getScoreBarColorClass(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 75) return 'bg-blue-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  // 使用新的 hooks
  const { data: stats, isLoading, error: statsError, refetch: refetchStats } = useAdminStatistics();
  const { data: health } = useSystemHealth();
  const {
    data: visualFatigueStats,
    isLoading: isVfLoading,
    error: vfError,
  } = useVisualFatigueStats();
  const { data: llmPendingCount } = useLLMPendingCount();
  const { data: versionInfo } = useSystemVersion();

  const [amasStrategy, setAmasStrategy] = useState<LearningStrategy | null>(null);
  const [isAmasLoading, setIsAmasLoading] = useState(false);
  const [amasError, setAmasError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // 对话框状态
  const [resetConfirm, setResetConfirm] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
  });

  // 加载 AMAS 策略（保留原有逻辑）
  const loadAmasStrategy = async () => {
    try {
      setIsAmasLoading(true);
      setAmasError(null);
      const strategy = await amasClient.getAmasStrategy();
      setAmasStrategy(strategy);
    } catch (err) {
      adminLogger.error({ err }, '加载AMAS策略失败');
      setAmasError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsAmasLoading(false);
    }
  };

  // 初始加载 AMAS 策略
  React.useEffect(() => {
    loadAmasStrategy();
  }, []);

  const handleResetAmas = async () => {
    setResetConfirm(true);
  };

  const confirmResetAmas = async () => {
    setResetConfirm(false);
    try {
      setIsResetting(true);
      await amasClient.resetAmasState();
      setAlertModal({
        isOpen: true,
        title: '操作成功',
        message: 'AMAS状态已重置',
        variant: 'success',
      });
      await loadAmasStrategy();
    } catch (err) {
      adminLogger.error({ err }, '重置AMAS状态失败');
      setAlertModal({
        isOpen: true,
        title: '操作失败',
        message: err instanceof Error ? err.message : '重置失败',
        variant: 'error',
      });
    } finally {
      setIsResetting(false);
    }
  };

  // 使用新的健康度计算（从 hook 获取）
  const systemHealth = health || { status: 'unknown' as const, score: 0, issues: [] };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center p-8">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
            正在加载...
          </p>
        </div>
      </div>
    );
  }

  if (statsError || !stats) {
    return (
      <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center p-8">
        <div className="max-w-md text-center" role="alert" aria-live="assertive">
          <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">加载失败</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            {statsError instanceof Error ? statsError.message : '无法加载统计数据'}
          </p>
          <button
            onClick={() => refetchStats()}
            className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const statCards: Array<{
    label: string;
    value: number;
    icon: typeof UsersThree;
    color: ColorKey;
  }> = [
    {
      label: '总用户数',
      value: stats.totalUsers,
      icon: UsersThree,
      color: 'blue',
    },
    {
      label: '活跃用户',
      value: stats.activeUsers,
      icon: Sparkle,
      color: 'green',
    },
    {
      label: '总词库数',
      value: stats.totalWordBooks,
      icon: Books,
      color: 'purple',
    },
    {
      label: '系统词库',
      value: stats.systemWordBooks,
      icon: BookOpen,
      color: 'indigo',
    },
    {
      label: '用户词库',
      value: stats.userWordBooks,
      icon: Note,
      color: 'pink',
    },
    {
      label: '总单词数',
      value: stats.totalWords,
      icon: FileText,
      color: 'yellow',
    },
    {
      label: '学习记录',
      value: stats.totalRecords,
      icon: ChartBar,
      color: 'red',
    },
    {
      label: 'LLM待审核',
      value: llmPendingCount ?? 0,
      icon: Robot,
      color: 'purple',
    },
  ];

  const getColorClasses = (color: ColorKey): string => {
    const colors: Record<ColorKey, string> = {
      blue: 'bg-blue-50 text-blue-600',
      green: 'bg-green-50 text-green-600',
      purple: 'bg-purple-50 text-purple-600',
      indigo: 'bg-indigo-50 text-indigo-600',
      pink: 'bg-pink-50 text-pink-600',
      yellow: 'bg-yellow-50 text-yellow-600',
      red: 'bg-red-50 text-red-600',
    };
    return colors[color];
  };

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">系统概览</h1>

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
            >
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-button ${getColorClasses(
                  card.color,
                )}`}
              >
                <IconComponent size={28} weight="duotone" />
              </div>
              <div className="mb-1 text-sm text-gray-600 dark:text-gray-400">{card.label}</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* 系统健康度监控 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Pulse size={28} weight="duotone" className="text-blue-500" />
          系统健康度
        </h2>
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          {(() => {
            const statusConfig: Record<
              string,
              { color: string; bgColor: string; icon: typeof CheckCircle; label: string }
            > = {
              excellent: {
                color: 'text-green-600',
                bgColor: 'bg-green-50',
                icon: CheckCircle,
                label: '优秀',
              },
              good: {
                color: 'text-blue-600',
                bgColor: 'bg-blue-50',
                icon: CheckCircle,
                label: '良好',
              },
              warning: {
                color: 'text-yellow-600',
                bgColor: 'bg-yellow-50',
                icon: Warning,
                label: '警告',
              },
              error: { color: 'text-red-600', bgColor: 'bg-red-50', icon: Warning, label: '异常' },
              unknown: {
                color: 'text-gray-600 dark:text-gray-400',
                bgColor: 'bg-gray-50 dark:bg-slate-700',
                icon: Pulse,
                label: '未知',
              },
            };

            const config = statusConfig[systemHealth.status];
            const Icon = config.icon;

            return (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 ${config.bgColor} rounded-button`}>
                      <Icon size={32} weight="bold" className={config.color} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        系统状态：{config.label}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        健康度评分：{systemHealth.score}/100
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-bold ${getScoreColorClass(systemHealth.score)}`}>
                      {systemHealth.score}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">健康分</div>
                  </div>
                </div>

                {/* 健康度进度条 */}
                <div className="mb-4">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                    <div
                      className={`h-full transition-all duration-g3-slow ${getScoreBarColorClass(systemHealth.score)}`}
                      style={{ width: `${systemHealth.score}%` }}
                    />
                  </div>
                </div>

                {/* 问题列表 */}
                {systemHealth.issues.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                      需要关注的问题：
                    </h4>
                    {systemHealth.issues.map((issue, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-slate-900 dark:text-gray-300"
                      >
                        <Warning
                          size={16}
                          weight="bold"
                          className="flex-shrink-0 text-yellow-600"
                        />
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* 快捷操作面板 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Gear size={28} weight="duotone" className="text-purple-500" />
          快捷操作
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="rounded-card border border-gray-200/60 bg-white/80 p-4 text-left shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-button bg-blue-50 p-2 dark:bg-blue-900/30">
                <UsersThree
                  size={24}
                  weight="duotone"
                  className="text-blue-600 dark:text-blue-400"
                />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">用户管理</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">查看和管理系统用户</p>
          </button>

          <button
            onClick={() => navigate('/admin/wordbooks')}
            className="rounded-card border border-gray-200/60 bg-white/80 p-4 text-left shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-button bg-purple-50 p-2 dark:bg-purple-900/30">
                <Books
                  size={24}
                  weight="duotone"
                  className="text-purple-600 dark:text-purple-400"
                />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">词库管理</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">管理系统词库和单词</p>
          </button>

          <button
            onClick={() => navigate('/admin/algorithm-config')}
            className="rounded-card border border-gray-200/60 bg-white/80 p-4 text-left shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-button bg-indigo-50 p-2 dark:bg-indigo-900/30">
                <Gear size={24} weight="duotone" className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">算法配置</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">调整学习算法参数</p>
          </button>

          <button
            onClick={() => navigate('/admin/experiments')}
            className="rounded-card border border-gray-200/60 bg-white/80 p-4 text-left shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-button bg-green-50 p-2 dark:bg-green-900/30">
                <ChartBar
                  size={24}
                  weight="duotone"
                  className="text-green-600 dark:text-green-400"
                />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">实验管理</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">A/B 测试和实验控制</p>
          </button>
        </div>
      </div>

      {/* AMAS 管理面板 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Brain size={28} weight="duotone" className="text-purple-500" />
          AMAS 管理面板
        </h2>
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          {isAmasLoading ? (
            <div className="flex items-center justify-center py-8">
              <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
            </div>
          ) : amasError ? (
            <div className="py-8 text-center">
              <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
              <p className="mb-4 text-gray-600 dark:text-gray-400">{amasError}</p>
              <button
                onClick={loadAmasStrategy}
                className="rounded-button bg-blue-500 px-4 py-2 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
              >
                重试
              </button>
            </div>
          ) : amasStrategy ? (
            <div>
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-button bg-blue-50 p-4 dark:bg-blue-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <Lightning
                      size={20}
                      weight="duotone"
                      className="text-blue-600 dark:text-blue-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">新单词比例</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {Math.round((amasStrategy.new_ratio || 0) * 100)}%
                  </p>
                </div>
                <div className="rounded-button bg-green-50 p-4 dark:bg-green-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <Pulse
                      size={20}
                      weight="duotone"
                      className="text-green-600 dark:text-green-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">难度级别</span>
                  </div>
                  <p className="text-2xl font-bold capitalize text-gray-900 dark:text-white">
                    {amasStrategy.difficulty || 'mid'}
                  </p>
                </div>
                <div className="rounded-button bg-purple-50 p-4 dark:bg-purple-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <ChartBar
                      size={20}
                      weight="duotone"
                      className="text-purple-600 dark:text-purple-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">批次大小</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {amasStrategy.batch_size || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={loadAmasStrategy}
                  disabled={isAmasLoading}
                  className="flex items-center gap-2 rounded-button bg-blue-500 px-4 py-2 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowClockwise size={18} weight="bold" />
                  刷新策略
                </button>
                <button
                  onClick={handleResetAmas}
                  disabled={isResetting}
                  className="flex items-center gap-2 rounded-button bg-yellow-500 px-4 py-2 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isResetting ? (
                    <>
                      <CircleNotch className="animate-spin" size={18} weight="bold" />
                      重置中...
                    </>
                  ) : (
                    <>
                      <Warning size={18} weight="bold" />
                      重置状态
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              暂无AMAS策略数据
            </div>
          )}
        </div>
      </div>

      {/* 视觉疲劳检测统计 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Eye size={28} weight="duotone" className="text-cyan-500" />
          视觉疲劳检测统计
        </h2>
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          {isVfLoading ? (
            <div className="flex items-center justify-center py-8">
              <CircleNotch className="animate-spin" size={32} weight="bold" color="#06b6d4" />
            </div>
          ) : vfError ? (
            <div className="py-8 text-center text-red-500">
              <Warning size={48} weight="duotone" className="mx-auto mb-4 text-red-400" />
              <p>加载视觉疲劳数据失败</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {vfError instanceof Error ? vfError.message : '请检查后端服务是否正常'}
              </p>
            </div>
          ) : visualFatigueStats ? (
            <div>
              {/* 主要指标卡片 */}
              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-button bg-cyan-50 p-4 dark:bg-cyan-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <ChartBar
                      size={20}
                      weight="duotone"
                      className="text-cyan-600 dark:text-cyan-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">数据量</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {visualFatigueStats.dataVolume.totalRecords.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    今日 +{visualFatigueStats.dataVolume.recordsToday}
                  </p>
                </div>
                <div className="rounded-button bg-blue-50 p-4 dark:bg-blue-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <UsersThree
                      size={20}
                      weight="duotone"
                      className="text-blue-600 dark:text-blue-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">启用率</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {Math.round(visualFatigueStats.usage.enableRate)}%
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {visualFatigueStats.usage.enabledUsers}/{visualFatigueStats.usage.totalUsers}{' '}
                    用户
                  </p>
                </div>
                <div className="rounded-button bg-amber-50 p-4 dark:bg-amber-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <Pulse
                      size={20}
                      weight="duotone"
                      className="text-amber-600 dark:text-amber-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">平均疲劳度</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {(visualFatigueStats.fatigue.avgVisualFatigue * 100).toFixed(0)}%
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    融合后 {(visualFatigueStats.fatigue.avgFusedFatigue * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-button bg-red-50 p-4 dark:bg-red-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <Warning
                      size={20}
                      weight="duotone"
                      className="text-red-600 dark:text-red-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">高疲劳用户</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {visualFatigueStats.fatigue.highFatigueUsers}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">疲劳度 &gt;60%</p>
                </div>
              </div>

              {/* 疲劳度分布 */}
              <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-900">
                <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  疲劳度分布
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600 dark:text-gray-400">
                      低 (0-30%)
                    </span>
                    <div className="flex-1">
                      <div className="h-4 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                        <div
                          className="h-full bg-green-500 transition-all duration-g3-slow"
                          style={{
                            width: `${visualFatigueStats.fatigue.fatigueDistribution.low}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-12 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                      {visualFatigueStats.fatigue.fatigueDistribution.low}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600 dark:text-gray-400">
                      中 (30-60%)
                    </span>
                    <div className="flex-1">
                      <div className="h-4 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                        <div
                          className="h-full bg-yellow-500 transition-all duration-g3-slow"
                          style={{
                            width: `${visualFatigueStats.fatigue.fatigueDistribution.medium}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-12 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                      {visualFatigueStats.fatigue.fatigueDistribution.medium}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600 dark:text-gray-400">
                      高 (60-100%)
                    </span>
                    <div className="flex-1">
                      <div className="h-4 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                        <div
                          className="h-full bg-red-500 transition-all duration-g3-slow"
                          style={{
                            width: `${visualFatigueStats.fatigue.fatigueDistribution.high}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-12 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                      {visualFatigueStats.fatigue.fatigueDistribution.high}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              <Eye
                size={48}
                weight="duotone"
                className="mx-auto mb-4 text-gray-300 dark:text-gray-600"
              />
              <p>暂无视觉疲劳检测数据</p>
              <p className="mt-1 text-sm">用户启用摄像头检测后，数据将在此显示</p>
            </div>
          )}
        </div>
      </div>

      {/* 系统版本 */}
      {versionInfo && (
        <div className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Gear size={28} weight="duotone" className="text-gray-500" />
            系统版本
          </h2>
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">当前版本</span>
                  <span className="font-mono text-lg font-semibold text-gray-900 dark:text-white">
                    v{versionInfo.currentVersion}
                  </span>
                </div>
                {versionInfo.latestVersion && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">最新版本</span>
                    <span
                      className={`font-mono text-lg font-semibold ${
                        versionInfo.hasUpdate
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      v{versionInfo.latestVersion}
                    </span>
                    {versionInfo.hasUpdate && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                        有更新
                      </span>
                    )}
                  </div>
                )}
                {versionInfo.publishedAt && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">发布时间</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {new Date(versionInfo.publishedAt).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </div>
              {versionInfo.hasUpdate && versionInfo.releaseUrl && (
                <a
                  href={versionInfo.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-button bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  查看更新
                </a>
              )}
            </div>
            {versionInfo.releaseNotes && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  更新说明
                </h3>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
                  {versionInfo.releaseNotes.length > 500
                    ? versionInfo.releaseNotes.slice(0, 500) + '...'
                    : versionInfo.releaseNotes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 额外信息 */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">用户活跃度</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">总用户数</span>
              <span className="font-medium dark:text-white">{stats.totalUsers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">活跃用户（7天内）</span>
              <span className="font-medium dark:text-white">{stats.activeUsers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">活跃率</span>
              <span className="font-medium dark:text-white">
                {stats.totalUsers > 0
                  ? Math.round((stats.activeUsers / stats.totalUsers) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">词库统计</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">系统词库</span>
              <span className="font-medium dark:text-white">{stats.systemWordBooks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">用户词库</span>
              <span className="font-medium dark:text-white">{stats.userWordBooks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">平均每词库单词数</span>
              <span className="font-medium dark:text-white">
                {stats.totalWordBooks > 0 ? Math.round(stats.totalWords / stats.totalWordBooks) : 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 重置确认对话框 */}
      <ConfirmModal
        isOpen={resetConfirm}
        onClose={() => setResetConfirm(false)}
        onConfirm={confirmResetAmas}
        title="重置 AMAS 状态"
        message="确定要重置AMAS状态吗？这将清除用户的所有AMAS学习历史。"
        confirmText="确认重置"
        cancelText="取消"
        variant="warning"
        isLoading={isResetting}
      />

      {/* 提示对话框 */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
}
