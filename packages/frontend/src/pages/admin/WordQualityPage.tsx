import React, { useState, useEffect } from 'react';
import { useSystemWordBooks } from '../../hooks/queries/useWordBooks';
import { StatsDashboard } from './word-quality/components/StatsDashboard';
import { TaskRunner } from './word-quality/components/TaskRunner';
import { IssueListTable } from './word-quality/components/IssueList';
import {
  useWordQualityStats,
  useWordQualityIssues,
  useWordQualityMutations,
  useQualityTaskSSE,
  useLatestTask,
} from './word-quality/hooks';
import { IssueStatus, CheckType, Task } from './word-quality/api';
import { useToast } from '../../components/ui';
import { Books } from '@phosphor-icons/react';

export default function WordQualityPage() {
  const { success, error, info } = useToast();
  const [selectedWordbook, setSelectedWordbook] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<IssueStatus>('open');
  const [manualRunningTask, setManualRunningTask] = useState<Task | null>(null);

  // 1. Fetch Wordbooks
  const { data: wordbooks, isLoading: loadingBooks } = useSystemWordBooks();

  // Auto-select first wordbook
  useEffect(() => {
    if (wordbooks && wordbooks.length > 0 && !selectedWordbook) {
      setSelectedWordbook(wordbooks[0].id);
    }
  }, [wordbooks]);

  // 2. Fetch Data
  const {
    data: stats,
    isLoading: loadingStats,
    refetch: refetchStats,
  } = useWordQualityStats(selectedWordbook || null);
  const {
    data: issuesData,
    isLoading: loadingIssues,
    refetch: refetchIssues,
  } = useWordQualityIssues(selectedWordbook || null, { status: filterStatus });
  const { data: latestTask } = useLatestTask(selectedWordbook || null);

  // 3. SSE Progress
  const { progress } = useQualityTaskSSE(selectedWordbook || null);

  console.log('Debug State:', {
    progress,
    latestTask,
    manualRunningTask,
    activeTaskDerived: manualRunningTask || latestTask || null,
  });

  useEffect(() => {
    const isDone = (status?: string) =>
      status === 'completed' || status === 'failed' || status === 'cancelled';

    if (isDone(progress?.status) || isDone(latestTask?.status)) {
      if (manualRunningTask) {
        setManualRunningTask(null);
        refetchStats();
        refetchIssues();
        success('检查完成：所有单词已检查完毕');
      }
    }
  }, [progress, latestTask, manualRunningTask, refetchStats, refetchIssues, success]);

  // 4. Mutations
  const { startTask, fixIssue, ignoreIssue, batchOperation, cancelTask } = useWordQualityMutations(
    selectedWordbook || null,
  );

  // Handlers
  const handleStartTask = (type: CheckType) => {
    startTask.mutate(
      { taskType: 'check', checkType: type },
      {
        onSuccess: (task) => {
          setManualRunningTask(task);
          info('任务已启动：检查任务正在后台运行...');
        },
        onError: (e) => error(`启动失败: ${e.message}`),
      },
    );
  };

  const handleCancel = () => {
    const taskId = progress?.taskId || latestTask?.id || manualRunningTask?.id;
    console.log('Cancelling task details:', {
      progressId: progress?.taskId,
      latestId: latestTask?.id,
      manualId: manualRunningTask?.id,
      finalId: taskId,
    });
    if (!taskId) return;

    cancelTask.mutate(taskId, {
      onSuccess: () => {
        setManualRunningTask(null);
        info('任务已取消');
      },
      onError: (e) => error(`取消失败: ${e.message}`),
    });
  };

  const handleFix = (id: string) => {
    fixIssue.mutate(id, {
      onSuccess: () => success('修复成功'),
      onError: (e) => error(`修复失败: ${e.message}`),
    });
  };

  const handleIgnore = (id: string) => {
    ignoreIssue.mutate(id, {
      onSuccess: () => info('已忽略'),
      onError: (e) => error(`操作失败: ${e.message}`),
    });
  };

  const handleBatch = (ids: string[], action: 'fix' | 'ignore') => {
    batchOperation.mutate(
      { ids, action },
      {
        onSuccess: (res) =>
          success(`批量操作完成：成功 ${res.successCount}, 失败 ${res.failedCount}`),
        onError: (e) => error(`批量操作失败: ${e.message}`),
      },
    );
  };

  if (loadingBooks) {
    return (
      <div className="flex justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-gray-50/50 p-6 dark:bg-slate-900 md:p-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            词库质量管理
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            监控并修复词库中的数据质量问题，提升学习体验。
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="px-2 text-gray-400 dark:text-gray-500">
            <Books className="h-5 w-5" />
          </div>
          <select
            value={selectedWordbook}
            onChange={(e) => setSelectedWordbook(e.target.value)}
            className="min-w-[150px] cursor-pointer border-none bg-transparent text-sm font-medium text-gray-700 outline-none dark:text-gray-300"
          >
            <option value="" disabled>
              选择词书...
            </option>
            {wordbooks?.map((wb) => (
              <option key={wb.id} value={wb.id}>
                {wb.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {selectedWordbook ? (
        <>
          {/* Dashboard */}
          <StatsDashboard stats={stats} loading={loadingStats} />

          {/* Task Runner */}
          <TaskRunner
            onStart={handleStartTask}
            onCancel={handleCancel}
            loading={startTask.isPending}
            progress={progress}
            activeTask={manualRunningTask || latestTask || null}
          />

          {/* Issue List */}
          <IssueListTable
            issues={issuesData?.items || []}
            total={issuesData?.total || 0}
            loading={loadingIssues}
            onFix={handleFix}
            onIgnore={handleIgnore}
            onBatch={handleBatch}
            filterStatus={filterStatus}
            onStatusChange={setFilterStatus}
          />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
          <Books className="mb-4 h-16 w-16 opacity-20" />
          <p>请选择一个词书开始管理</p>
        </div>
      )}
    </div>
  );
}
