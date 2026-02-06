import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminStatistics } from '../../hooks/queries/useAdminStatistics';
import {
  useSystemStatus,
  usePerformanceMetrics,
  useCombinedHealth,
} from '../../hooks/queries/useSystemStatus';
import { useSystemVersion } from '../../hooks/queries/useSystemVersion';
import { useVisualFatigueStats } from '../../hooks/queries/useVisualFatigueStats';
import { useLLMPendingCount } from '../../hooks/queries/useLLMAdvisor';
import { adminClient } from '../../services/client';
import type { AMASMonitoringOverview } from '../../services/client';
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
  Eye,
  Robot,
  Download,
  XCircle,
  Database,
  Clock,
  Timer,
  ArrowRight,
  Lightning,
} from '../../components/Icon';
import { adminLogger } from '../../utils/logger';
import { ConfirmModal, AlertModal, Modal, Button, Progress, Spinner } from '../../components/ui';
import { useOTAUpdate, useRestartBackend } from '../../hooks/mutations';

/** 颜色类名映射 */
type ColorKey = 'blue' | 'green' | 'purple' | 'pink' | 'yellow' | 'red';

/** 格式化运行时间 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟`;
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  // 使用新的 hooks
  const { data: stats, isLoading, error: statsError, refetch: refetchStats } = useAdminStatistics();
  const { data: systemStatus, isLoading: isStatusLoading } = useSystemStatus();
  const { data: perfMetrics } = usePerformanceMetrics();
  const {
    data: visualFatigueStats,
    isLoading: isVfLoading,
    error: vfError,
  } = useVisualFatigueStats();
  const { data: llmPendingCount } = useLLMPendingCount();
  const { data: versionInfo } = useSystemVersion();
  const { data: combinedHealth, isLoading: isHealthLoading } = useCombinedHealth();
  const {
    triggerUpdate,
    updateStatus,
    isTriggering,
    triggerError,
    resetUpdate,
    openModal: openUpdateModal,
    closeModal: closeUpdateModal,
    isCheckingStatus,
    isUpdateInProgress,
  } = useOTAUpdate();
  const {
    restartBackend,
    isPending: isRestartPending,
    error: restartError,
    isRestarting,
    isConfirmOpen: isRestartConfirmOpen,
    openConfirmModal: openRestartModal,
    closeConfirmModal: closeRestartModal,
  } = useRestartBackend();

  const [amasOverview, setAmasOverview] = useState<AMASMonitoringOverview | null>(null);
  const [isAmasLoading, setIsAmasLoading] = useState(false);
  const [amasError, setAmasError] = useState<string | null>(null);

  // 自动刷新配置
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0); // 0 表示关闭

  // 对话框状态
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
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // OTA 更新处理
  const handleOpenUpdateModal = () => {
    setShowUpdateModal(true);
    openUpdateModal();
  };

  const handleStartUpdate = () => {
    triggerUpdate();
  };

  const handleCloseUpdateModal = () => {
    if (isUpdateInProgress) {
      return;
    }
    setShowUpdateModal(false);
    closeUpdateModal();
    if (updateStatus?.stage === 'completed' || updateStatus?.stage === 'failed' || triggerError) {
      resetUpdate();
    }
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return '未知错误';
  };

  // 加载 AMAS 监控概览
  const loadAmasOverview = async () => {
    try {
      setIsAmasLoading(true);
      setAmasError(null);
      const overview = await adminClient.getAMASMonitoringOverview();
      setAmasOverview(overview);
    } catch (err) {
      adminLogger.error({ err }, '加载AMAS监控概览失败');
      setAmasError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsAmasLoading(false);
    }
  };

  // 初始加载 AMAS 概览
  React.useEffect(() => {
    loadAmasOverview();
  }, []);

  // 自动刷新定时器
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      refetchStats();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, refetchStats]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center p-8">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
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
          <Warning size={64} color="#ef4444" className="mx-auto mb-4" />
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
      color: 'blue',
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
      pink: 'bg-pink-50 text-pink-600',
      yellow: 'bg-yellow-50 text-yellow-600',
      red: 'bg-red-50 text-red-600',
    };
    return colors[color];
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">系统概览</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Timer size={18} />
            <span>自动刷新</span>
          </div>
          <select
            value={autoRefreshInterval}
            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            className="rounded-button border border-gray-300 px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            <option value={0}>关闭</option>
            <option value={30}>30秒</option>
            <option value={60}>1分钟</option>
            <option value={300}>5分钟</option>
          </select>
          {autoRefreshInterval > 0 && (
            <span className="flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          )}
        </div>
      </div>

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
                <IconComponent size={28} />
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
          <Pulse size={28} className="text-blue-500" />
          系统健康度
        </h2>
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          {isHealthLoading || isStatusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" color="primary" />
            </div>
          ) : systemStatus ? (
            <div className="space-y-6">
              {/* 综合健康度评分 */}
              <div className="flex items-center gap-6 rounded-button border border-gray-100 bg-gradient-to-r from-gray-50 to-white p-4 dark:border-slate-700 dark:from-slate-800/50 dark:to-slate-800">
                <div
                  className={`flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full ${
                    combinedHealth?.status === 'excellent'
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : combinedHealth?.status === 'good'
                        ? 'bg-blue-100 dark:bg-blue-900/30'
                        : combinedHealth?.status === 'warning'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30'
                          : 'bg-red-100 dark:bg-red-900/30'
                  }`}
                >
                  <span
                    className={`text-2xl font-bold ${
                      combinedHealth?.status === 'excellent'
                        ? 'text-green-600'
                        : combinedHealth?.status === 'good'
                          ? 'text-blue-600'
                          : combinedHealth?.status === 'warning'
                            ? 'text-yellow-600'
                            : 'text-red-600'
                    }`}
                  >
                    {combinedHealth?.score ?? 0}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">综合健康度</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        combinedHealth?.status === 'excellent'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : combinedHealth?.status === 'good'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : combinedHealth?.status === 'warning'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {combinedHealth?.status === 'excellent'
                        ? '优秀'
                        : combinedHealth?.status === 'good'
                          ? '良好'
                          : combinedHealth?.status === 'warning'
                            ? '警告'
                            : '异常'}
                    </span>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">业务健康度：</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {combinedHealth?.businessScore ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">运行健康度：</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {combinedHealth?.runtimeScore ?? 0}
                      </span>
                    </div>
                  </div>
                  {combinedHealth?.issues && combinedHealth.issues.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {combinedHealth.issues.slice(0, 3).join(' · ')}
                      {combinedHealth.issues.length > 3 && ` 等 ${combinedHealth.issues.length} 项`}
                    </div>
                  )}
                </div>
              </div>

              {/* 详细指标 */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* 整体状态 */}
                <div className="flex items-center gap-4 rounded-button border border-gray-100 bg-gray-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      systemStatus.overall === 'healthy'
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : systemStatus.overall === 'degraded'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30'
                          : 'bg-red-100 dark:bg-red-900/30'
                    }`}
                  >
                    {systemStatus.overall === 'healthy' ? (
                      <CheckCircle size={24} weight="fill" className="text-green-600" />
                    ) : systemStatus.overall === 'degraded' ? (
                      <Warning size={24} weight="fill" className="text-yellow-600" />
                    ) : (
                      <XCircle size={24} weight="fill" className="text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">系统状态</p>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {systemStatus.overall === 'healthy'
                        ? '健康'
                        : systemStatus.overall === 'degraded'
                          ? '降级'
                          : '异常'}
                    </h3>
                  </div>
                </div>

                {/* 数据库状态 */}
                <div className="flex flex-col justify-center rounded-button border border-gray-100 bg-gray-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Database size={20} />
                      <span className="font-semibold">数据库</span>
                    </div>
                    {(() => {
                      const dbService = systemStatus.services.find((s) => s.name === 'Database');
                      return (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            dbService?.status === 'healthy'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {dbService?.latency ? `${dbService.latency}ms` : 'N/A'}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {systemStatus.services.find((s) => s.name === 'Database')?.message || '未知'}
                  </div>
                </div>

                {/* 内存使用 */}
                <div className="flex flex-col justify-center rounded-button border border-gray-100 bg-gray-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Database size={20} />
                      <span className="font-semibold">内存</span>
                    </div>
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {perfMetrics?.memoryUsage
                        ? `${Math.round(perfMetrics.memoryUsage)} MB`
                        : '--'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                    <div
                      className={`h-full transition-all duration-g3-slow ${
                        (perfMetrics?.memoryUsage ?? 0) > 1024
                          ? 'bg-red-500'
                          : (perfMetrics?.memoryUsage ?? 0) > 512
                            ? 'bg-yellow-500'
                            : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min((perfMetrics?.memoryUsage ?? 0) / 20, 100)}%` }}
                    />
                  </div>
                </div>

                {/* 运行时间 & 版本 */}
                <div className="flex flex-col justify-center space-y-2 rounded-button border border-gray-100 bg-gray-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Clock size={16} />
                      <span className="text-xs">运行时间</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatUptime(systemStatus.uptime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-2 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Gear size={16} />
                      <span className="text-xs">版本</span>
                    </div>
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                      {versionInfo?.currentVersion ? `v${versionInfo.currentVersion}` : '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              无法获取系统状态
            </div>
          )}
        </div>
      </div>

      {/* 快捷操作面板 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Gear size={28} className="text-purple-500" />
          快捷操作
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="rounded-card border border-gray-200/60 bg-white/80 p-4 text-left shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-button bg-blue-50 p-2 dark:bg-blue-900/30">
                <UsersThree size={24} className="text-blue-600 dark:text-blue-400" />
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
                <Books size={24} className="text-purple-600 dark:text-purple-400" />
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
              <div className="rounded-button bg-blue-50 p-2 dark:bg-blue-900/30">
                <Gear size={24} className="text-blue-600 dark:text-blue-400" />
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
                <ChartBar size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">实验管理</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">A/B 测试和实验控制</p>
          </button>
        </div>
      </div>

      {/* AMAS 监控概览 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Brain size={28} className="text-purple-500" />
          AMAS 监控概览
        </h2>
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          {isAmasLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" color="primary" />
            </div>
          ) : amasError ? (
            <div className="py-8 text-center">
              <Warning size={48} color="#ef4444" className="mx-auto mb-4" />
              <p className="mb-4 text-gray-600 dark:text-gray-400">{amasError}</p>
              <button
                onClick={loadAmasOverview}
                className="rounded-button bg-blue-500 px-4 py-2 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
              >
                重试
              </button>
            </div>
          ) : amasOverview ? (
            <div>
              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-button bg-blue-50 p-4 dark:bg-blue-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <ChartBar size={20} className="text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">24h事件数</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {amasOverview.eventsLast24h.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-button bg-green-50 p-4 dark:bg-green-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">约束满足率</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {(amasOverview.constraintsSatisfiedRate * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-button bg-purple-50 p-4 dark:bg-purple-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <Pulse size={20} className="text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">平均延迟</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {amasOverview.avgLatencyMs.toFixed(0)}ms
                  </p>
                </div>
                <div className="rounded-button bg-amber-50 p-4 dark:bg-amber-900/30">
                  <div className="mb-2 flex items-center gap-2">
                    <Warning size={20} className="text-amber-600 dark:text-amber-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">异常率</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {(amasOverview.anomalyRate * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={loadAmasOverview}
                  disabled={isAmasLoading}
                  className="flex items-center gap-2 rounded-button bg-blue-500 px-4 py-2 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowClockwise size={18} />
                  刷新
                </button>
                <button
                  onClick={() => navigate('/admin/amas-monitoring')}
                  className="flex items-center gap-2 rounded-button bg-purple-500 px-4 py-2 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 active:scale-95"
                >
                  查看详情
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              暂无AMAS监控数据
            </div>
          )}
        </div>
      </div>

      {/* 视觉疲劳检测统计 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Eye size={28} className="text-cyan-500" />
          视觉疲劳检测统计
        </h2>
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          {isVfLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" color="primary" />
            </div>
          ) : vfError ? (
            <div className="py-8 text-center text-red-500">
              <Warning size={48} className="mx-auto mb-4 text-red-400" />
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
                    <ChartBar size={20} className="text-cyan-600 dark:text-cyan-400" />
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
                    <UsersThree size={20} className="text-blue-600 dark:text-blue-400" />
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
                    <Pulse size={20} className="text-amber-600 dark:text-amber-400" />
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
                    <Warning size={20} className="text-red-600 dark:text-red-400" />
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
              <Eye size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
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
            <Gear size={28} className="text-gray-500" />
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => openRestartModal()}
                  className="inline-flex items-center gap-2 rounded-button bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
                >
                  <ArrowClockwise size={18} />
                  重启服务
                </button>
                {versionInfo.hasUpdate && (
                  <>
                    {versionInfo.releaseUrl && (
                      <a
                        href={versionInfo.releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-button bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                      >
                        查看更新
                      </a>
                    )}
                    <button
                      onClick={handleOpenUpdateModal}
                      className="inline-flex items-center gap-2 rounded-button bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                    >
                      <Download size={18} />
                      立即更新
                    </button>
                  </>
                )}
              </div>
            </div>
            {versionInfo.releaseNotes && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  更新说明
                </h3>
                <div className="max-h-32 space-y-1 overflow-y-auto text-sm text-gray-600 dark:text-gray-400">
                  {(versionInfo.releaseNotes.length > 500
                    ? versionInfo.releaseNotes.slice(0, 500) + '...'
                    : versionInfo.releaseNotes
                  )
                    .split('\n')
                    .map((line, i) => {
                      const trimmed = line.replace(/^#+\s*/, '');
                      const isHeading = /^#+\s/.test(line);
                      return trimmed ? (
                        <p
                          key={i}
                          className={
                            isHeading ? 'font-semibold text-gray-800 dark:text-gray-200' : ''
                          }
                        >
                          {trimmed}
                        </p>
                      ) : null;
                    })}
                </div>
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

      {/* 提示对话框 */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />

      {/* 重启确认对话框 */}
      <ConfirmModal
        isOpen={isRestartConfirmOpen}
        onClose={closeRestartModal}
        onConfirm={() => restartBackend()}
        title="重启后端服务"
        message={
          restartError
            ? `重启失败: ${restartError instanceof Error ? restartError.message : '未知错误'}`
            : '确定要重启后端服务吗？服务将暂时中断，重启完成后页面会自动刷新。'
        }
        confirmText="确认重启"
        cancelText="取消"
        variant={restartError ? 'danger' : 'warning'}
        isLoading={isRestartPending}
      />

      {/* 重启中 Modal */}
      <Modal
        isOpen={isRestarting}
        onClose={() => {}}
        title="正在重启服务"
        maxWidth="sm"
        showCloseButton={false}
        closeOnOverlayClick={false}
      >
        <div className="flex flex-col items-center justify-center py-8">
          <CircleNotch size={48} className="mb-4 animate-spin text-blue-600" />
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            服务重启中...
          </h3>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            请稍候，系统正在重新启动。
            <br />
            完成后页面将自动刷新。
          </p>
        </div>
      </Modal>

      {/* OTA 更新 Modal */}
      <Modal
        isOpen={showUpdateModal}
        onClose={handleCloseUpdateModal}
        title="系统更新"
        maxWidth="md"
        showCloseButton={!isTriggering && !isUpdateInProgress}
        closeOnOverlayClick={!isTriggering && !isUpdateInProgress}
      >
        <div className="space-y-6">
          {isCheckingStatus && !updateStatus && !isTriggering && !triggerError ? (
            <div className="flex items-center justify-center py-8">
              <CircleNotch size={32} className="animate-spin text-blue-600" />
            </div>
          ) : (!updateStatus || updateStatus.stage === 'idle') && !isTriggering && !triggerError ? (
            <>
              <div className="flex items-center gap-4 rounded-button bg-blue-50 p-4 dark:bg-blue-900/20">
                <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/40">
                  <Lightning size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    发现新版本 v{versionInfo?.latestVersion}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    更新过程可能需要几分钟，期间服务将短暂重启。
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={handleCloseUpdateModal}>
                  取消
                </Button>
                <Button variant="primary" onClick={handleStartUpdate}>
                  确认更新
                </Button>
              </div>
            </>
          ) : triggerError || updateStatus?.stage === 'failed' ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <XCircle size={32} weight="bold" className="text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">更新失败</h3>
              <p className="mb-6 text-gray-600 dark:text-gray-400">
                {triggerError ? getErrorMessage(triggerError) : updateStatus?.error || '未知错误'}
              </p>
              <Button variant="secondary" onClick={handleCloseUpdateModal}>
                关闭
              </Button>
            </div>
          ) : updateStatus?.stage === 'completed' ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle
                  size={32}
                  weight="bold"
                  className="text-green-600 dark:text-green-400"
                />
              </div>
              <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">更新完成</h3>
              <p className="mb-6 text-gray-600 dark:text-gray-400">系统已成功更新到最新版本。</p>
              <Button variant="primary" onClick={() => window.location.reload()}>
                刷新页面
              </Button>
            </div>
          ) : (
            <div className="py-4">
              <div className="mb-2 flex justify-between text-sm font-medium">
                <span className="text-gray-900 dark:text-white">
                  {isTriggering
                    ? '正在启动更新...'
                    : updateStatus?.stage === 'pulling'
                      ? '正在下载更新...'
                      : updateStatus?.stage === 'restarting'
                        ? '正在重启服务...'
                        : '更新中...'}
                </span>
                <span className="text-blue-600 dark:text-blue-400">
                  {updateStatus?.progress || 0}%
                </span>
              </div>
              <Progress value={updateStatus?.progress || 0} className="mb-4" />
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                {updateStatus?.message || '请勿关闭页面...'}
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
