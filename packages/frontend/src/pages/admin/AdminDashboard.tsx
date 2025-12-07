import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { AdminStatistics } from '../../services/ApiClient';
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
} from '../../components/Icon';
import { adminLogger } from '../../utils/logger';
import { LearningStrategy } from '../../types/amas';
import { ConfirmModal, AlertModal } from '../../components/ui';

/** 颜色类名映射 */
type ColorKey = 'blue' | 'green' | 'purple' | 'indigo' | 'pink' | 'yellow' | 'red';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amasStrategy, setAmasStrategy] = useState<LearningStrategy | null>(null);
  const [isAmasLoading, setIsAmasLoading] = useState(false);
  const [amasError, setAmasError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [, setIsBatchProcessing] = useState(false); // isBatchProcessing 目前未在UI中显示，但保留setter用于状态管理

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

  useEffect(() => {
    loadStatistics();
    loadAmasStrategy();
  }, []);

  const loadStatistics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.adminGetStatistics();
      setStats(data);
    } catch (err) {
      adminLogger.error({ err }, '加载统计数据失败');
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAmasStrategy = async () => {
    try {
      setIsAmasLoading(true);
      setAmasError(null);
      const strategy = await apiClient.getAmasStrategy();
      setAmasStrategy(strategy);
    } catch (err) {
      adminLogger.error({ err }, '加载AMAS策略失败');
      setAmasError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsAmasLoading(false);
    }
  };

  const handleResetAmas = async () => {
    setResetConfirm(true);
  };

  const confirmResetAmas = async () => {
    setResetConfirm(false);
    try {
      setIsResetting(true);
      await apiClient.resetAmasState();
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

  const handleBatchProcessEvents = async () => {
    // 由于批量处理需要具体的事件数据源，这里展示正确的状态管理流程
    // 实际使用时需要根据业务需求提供事件数据
    setIsBatchProcessing(true);
    try {
      // 示例：如果有待处理事件，可以调用 apiClient.batchProcessEvents(events)
      // 目前显示提示信息，因为没有具体的事件来源
      await new Promise((resolve) => setTimeout(resolve, 500)); // 模拟处理延迟
      setAlertModal({
        isOpen: true,
        title: '功能提示',
        message: '批量处理事件功能需要在后端实现具体的事件来源逻辑。',
        variant: 'info',
      });
    } catch (err) {
      adminLogger.error({ err }, '批量处理事件失败');
      setAlertModal({
        isOpen: true,
        title: '操作失败',
        message: err instanceof Error ? err.message : '批量处理失败',
        variant: 'error',
      });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // 计算系统健康度
  const getSystemHealth = () => {
    if (!stats) return { status: 'unknown', score: 0, issues: [] };

    const issues: string[] = [];
    let score = 100;

    // 检查活跃率
    const activeRate = stats.totalUsers > 0 ? (stats.activeUsers / stats.totalUsers) * 100 : 0;
    if (activeRate < 30) {
      issues.push('用户活跃率较低');
      score -= 20;
    } else if (activeRate < 50) {
      issues.push('用户活跃率偏低');
      score -= 10;
    }

    // 检查系统词库
    if (stats.systemWordBooks < 3) {
      issues.push('系统词库数量较少');
      score -= 15;
    }

    // 检查单词数量
    const avgWordsPerBook = stats.totalWordBooks > 0 ? stats.totalWords / stats.totalWordBooks : 0;
    if (avgWordsPerBook < 50) {
      issues.push('平均词库单词数较少');
      score -= 15;
    }

    // 检查学习记录
    const avgRecordsPerUser = stats.totalUsers > 0 ? stats.totalRecords / stats.totalUsers : 0;
    if (avgRecordsPerUser < 10) {
      issues.push('用户学习活跃度低');
      score -= 10;
    }

    let status: 'excellent' | 'good' | 'warning' | 'error' = 'excellent';
    if (score < 60) status = 'error';
    else if (score < 75) status = 'warning';
    else if (score < 90) status = 'good';

    return { status, score, issues };
  };

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
          <p className="text-gray-600" role="status" aria-live="polite">
            正在加载...
          </p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center p-8">
        <div className="max-w-md text-center" role="alert" aria-live="assertive">
          <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">加载失败</h2>
          <p className="mb-6 text-gray-600">{error || '无法加载统计数据'}</p>
          <button
            onClick={loadStatistics}
            className="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
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
      <h1 className="mb-8 text-3xl font-bold text-gray-900">系统概览</h1>

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-lg"
            >
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${getColorClasses(
                  card.color,
                )}`}
              >
                <IconComponent size={28} weight="duotone" />
              </div>
              <div className="mb-1 text-sm text-gray-600">{card.label}</div>
              <div className="text-3xl font-bold text-gray-900">{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* 系统健康度监控 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Pulse size={28} weight="duotone" className="text-blue-500" />
          系统健康度
        </h2>
        <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          {(() => {
            const health = getSystemHealth();
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
                color: 'text-gray-600',
                bgColor: 'bg-gray-50',
                icon: Pulse,
                label: '未知',
              },
            };

            const config = statusConfig[health.status];
            const Icon = config.icon;

            return (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 ${config.bgColor} rounded-lg`}>
                      <Icon size={32} weight="bold" className={config.color} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">系统状态：{config.label}</h3>
                      <p className="text-sm text-gray-600">健康度评分：{health.score}/100</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-3xl font-bold"
                      style={{
                        color:
                          health.score >= 90
                            ? '#10b981'
                            : health.score >= 75
                              ? '#3b82f6'
                              : health.score >= 60
                                ? '#f59e0b'
                                : '#ef4444',
                      }}
                    >
                      {health.score}
                    </div>
                    <div className="text-xs text-gray-500">健康分</div>
                  </div>
                </div>

                {/* 健康度进度条 */}
                <div className="mb-4">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${health.score}%`,
                        backgroundColor:
                          health.score >= 90
                            ? '#10b981'
                            : health.score >= 75
                              ? '#3b82f6'
                              : health.score >= 60
                                ? '#f59e0b'
                                : '#ef4444',
                      }}
                    />
                  </div>
                </div>

                {/* 问题列表 */}
                {health.issues.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-semibold text-gray-900">需要关注的问题：</h4>
                    {health.issues.map((issue, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded bg-gray-50 px-3 py-2 text-sm text-gray-700"
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
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Gear size={28} weight="duotone" className="text-purple-500" />
          快捷操作
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="rounded-xl border border-gray-200/60 bg-white/80 p-4 text-left shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <UsersThree size={24} weight="duotone" className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900">用户管理</h3>
            </div>
            <p className="text-sm text-gray-600">查看和管理系统用户</p>
          </button>

          <button
            onClick={() => navigate('/admin/wordbooks')}
            className="rounded-xl border border-gray-200/60 bg-white/80 p-4 text-left shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2">
                <Books size={24} weight="duotone" className="text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900">词库管理</h3>
            </div>
            <p className="text-sm text-gray-600">管理系统词库和单词</p>
          </button>

          <button
            onClick={() => navigate('/admin/algorithm-config')}
            className="rounded-xl border border-gray-200/60 bg-white/80 p-4 text-left shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <Gear size={24} weight="duotone" className="text-indigo-600" />
              </div>
              <h3 className="font-semibold text-gray-900">算法配置</h3>
            </div>
            <p className="text-sm text-gray-600">调整学习算法参数</p>
          </button>

          <button
            onClick={() => navigate('/admin/experiments')}
            className="rounded-xl border border-gray-200/60 bg-white/80 p-4 text-left shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <ChartBar size={24} weight="duotone" className="text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">实验管理</h3>
            </div>
            <p className="text-sm text-gray-600">A/B 测试和实验控制</p>
          </button>
        </div>
      </div>

      {/* AMAS 管理面板 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Brain size={28} weight="duotone" className="text-purple-500" />
          AMAS 管理面板
        </h2>
        <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          {isAmasLoading ? (
            <div className="flex items-center justify-center py-8">
              <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
            </div>
          ) : amasError ? (
            <div className="py-8 text-center">
              <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
              <p className="mb-4 text-gray-600">{amasError}</p>
              <button
                onClick={loadAmasStrategy}
                className="rounded-lg bg-blue-500 px-4 py-2 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
              >
                重试
              </button>
            </div>
          ) : amasStrategy ? (
            <div>
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Lightning size={20} weight="duotone" className="text-blue-600" />
                    <span className="text-sm text-gray-600">新单词比例</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.round((amasStrategy.new_ratio || 0) * 100)}%
                  </p>
                </div>
                <div className="rounded-lg bg-green-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Pulse size={20} weight="duotone" className="text-green-600" />
                    <span className="text-sm text-gray-600">难度级别</span>
                  </div>
                  <p className="text-2xl font-bold capitalize text-gray-900">
                    {amasStrategy.difficulty || 'mid'}
                  </p>
                </div>
                <div className="rounded-lg bg-purple-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <ChartBar size={20} weight="duotone" className="text-purple-600" />
                    <span className="text-sm text-gray-600">批次大小</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {amasStrategy.batch_size || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={loadAmasStrategy}
                  disabled={isAmasLoading}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowClockwise size={18} weight="bold" />
                  刷新策略
                </button>
                <button
                  onClick={handleResetAmas}
                  disabled={isResetting}
                  className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-white transition-all duration-200 hover:scale-105 hover:bg-yellow-600 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
                <button
                  onClick={handleBatchProcessEvents}
                  disabled={true}
                  className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-gray-400 px-4 py-2 text-white transition-all duration-200"
                  title="功能开发中"
                >
                  <Lightning size={18} weight="bold" />
                  批量处理事件
                  <span className="ml-1 rounded bg-yellow-500 px-1.5 py-0.5 text-xs text-white">
                    开发中
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">暂无AMAS策略数据</div>
          )}
        </div>
      </div>

      {/* 额外信息 */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">用户活跃度</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">总用户数</span>
              <span className="font-medium">{stats.totalUsers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">活跃用户（7天内）</span>
              <span className="font-medium">{stats.activeUsers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">活跃率</span>
              <span className="font-medium">
                {stats.totalUsers > 0
                  ? Math.round((stats.activeUsers / stats.totalUsers) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">词库统计</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">系统词库</span>
              <span className="font-medium">{stats.systemWordBooks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">用户词库</span>
              <span className="font-medium">{stats.userWordBooks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">平均每词库单词数</span>
              <span className="font-medium">
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
