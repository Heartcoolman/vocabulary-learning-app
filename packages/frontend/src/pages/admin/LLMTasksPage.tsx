import { useState, useEffect, useCallback } from 'react';
import {
  Queue,
  CircleNotch,
  Play,
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  Clock,
  Eye,
  Plus,
  Funnel,
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminClient, LLMTask, WordVariant } from '../../services/client';

type TabType = 'tasks' | 'variants';

export default function LLMTasksPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [tasks, setTasks] = useState<LLMTask[]>([]);
  const [variants, setVariants] = useState<WordVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState<LLMTask | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<WordVariant | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminClient.getLLMTasks({
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 50,
      });
      setTasks(data);
    } catch {
      toast.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  const loadVariants = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminClient.getWordVariants({
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 50,
      });
      setVariants(data);
    } catch {
      toast.error('加载变体列表失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    if (activeTab === 'tasks') {
      loadTasks();
    } else {
      loadVariants();
    }
  }, [activeTab, loadTasks, loadVariants]);

  const handleStartTask = async (taskId: string) => {
    try {
      await adminClient.startLLMTask(taskId);
      toast.success('任务已启动');
      loadTasks();
    } catch {
      toast.error('启动任务失败');
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await adminClient.completeLLMTask(taskId, { manual: true });
      toast.success('任务已完成');
      loadTasks();
    } catch {
      toast.error('完成任务失败');
    }
  };

  const handleFailTask = async (taskId: string, error: string) => {
    try {
      await adminClient.failLLMTask(taskId, error);
      toast.success('任务已标记失败');
      loadTasks();
    } catch {
      toast.error('操作失败');
    }
  };

  const handleApproveVariant = async (variantId: string) => {
    try {
      await adminClient.updateWordVariantStatus(variantId, 'approved');
      toast.success('变体已批准');
      loadVariants();
      setSelectedVariant(null);
    } catch {
      toast.error('批准失败');
    }
  };

  const handleRejectVariant = async (variantId: string) => {
    try {
      await adminClient.updateWordVariantStatus(variantId, 'rejected');
      toast.success('变体已拒绝');
      loadVariants();
      setSelectedVariant(null);
    } catch {
      toast.error('拒绝失败');
    }
  };

  const taskStatusOptions = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待处理' },
    { value: 'processing', label: '处理中' },
    { value: 'completed', label: '已完成' },
    { value: 'failed', label: '失败' },
  ];

  const variantStatusOptions = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待审核' },
    { value: 'approved', label: '已批准' },
    { value: 'rejected', label: '已拒绝' },
  ];

  const statusOptions = activeTab === 'tasks' ? taskStatusOptions : variantStatusOptions;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Queue size={32} weight="duotone" className="text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">LLM 任务管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">管理 AI 任务队列和内容变体</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2 rounded-lg border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => {
              setActiveTab('tasks');
              setStatusFilter('all');
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'tasks'
                ? 'bg-indigo-500 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            任务队列
          </button>
          <button
            onClick={() => {
              setActiveTab('variants');
              setStatusFilter('all');
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'variants'
                ? 'bg-indigo-500 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            内容变体
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Funnel size={18} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-gray-300"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={activeTab === 'tasks' ? loadTasks : loadVariants}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <ArrowsClockwise size={18} className="text-gray-500" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <CircleNotch className="animate-spin text-indigo-500" size={32} />
          </div>
        ) : activeTab === 'tasks' ? (
          <TaskList
            tasks={tasks}
            onView={setSelectedTask}
            onStart={handleStartTask}
            onComplete={handleCompleteTask}
            onFail={handleFailTask}
          />
        ) : (
          <VariantList
            variants={variants}
            onView={setSelectedVariant}
            onApprove={handleApproveVariant}
            onReject={handleRejectVariant}
          />
        )}
      </div>

      {selectedTask && (
        <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}

      {selectedVariant && (
        <VariantDetailModal
          variant={selectedVariant}
          onClose={() => setSelectedVariant(null)}
          onApprove={() => handleApproveVariant(selectedVariant.id)}
          onReject={() => handleRejectVariant(selectedVariant.id)}
        />
      )}
    </div>
  );
}

function TaskList({
  tasks,
  onView,
  onStart,
  onComplete,
  onFail,
}: {
  tasks: LLMTask[];
  onView: (task: LLMTask) => void;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onFail: (id: string, error: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <Queue size={48} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400">暂无任务</p>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pending: {
      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300',
      icon: <Clock size={14} />,
      label: '待处理',
    },
    processing: {
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300',
      icon: <CircleNotch size={14} className="animate-spin" />,
      label: '处理中',
    },
    completed: {
      color: 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300',
      icon: <CheckCircle size={14} />,
      label: '已完成',
    },
    failed: {
      color: 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300',
      icon: <XCircle size={14} />,
      label: '失败',
    },
  };

  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-700">
      {tasks.map((task) => {
        const status = statusConfig[task.status] || statusConfig.pending;
        return (
          <div
            key={task.id}
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50"
          >
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-3">
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                >
                  {status.icon}
                  {status.label}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {task.taskType}
                </span>
                <span className="text-xs text-gray-400">P{task.priority}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span>ID: {task.id.slice(0, 8)}...</span>
                <span>创建: {new Date(task.createdAt).toLocaleString()}</span>
                {task.tokensUsed && <span>Token: {task.tokensUsed}</span>}
                {task.error && (
                  <span className="text-red-500">错误: {task.error.slice(0, 30)}...</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {task.status === 'pending' && (
                <button
                  onClick={() => onStart(task.id)}
                  className="rounded-lg bg-blue-500 p-2 text-white hover:bg-blue-600"
                  title="启动任务"
                >
                  <Play size={16} />
                </button>
              )}
              {task.status === 'processing' && (
                <>
                  <button
                    onClick={() => onComplete(task.id)}
                    className="rounded-lg bg-green-500 p-2 text-white hover:bg-green-600"
                    title="完成任务"
                  >
                    <CheckCircle size={16} />
                  </button>
                  <button
                    onClick={() => onFail(task.id, '手动标记失败')}
                    className="rounded-lg bg-red-500 p-2 text-white hover:bg-red-600"
                    title="标记失败"
                  >
                    <XCircle size={16} />
                  </button>
                </>
              )}
              <button
                onClick={() => onView(task)}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-600"
                title="查看详情"
              >
                <Eye size={16} className="text-gray-500" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VariantList({
  variants,
  onView,
  onApprove,
  onReject,
}: {
  variants: WordVariant[];
  onView: (variant: WordVariant) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (variants.length === 0) {
    return (
      <div className="py-16 text-center">
        <Plus size={48} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400">暂无内容变体</p>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: {
      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300',
      label: '待审核',
    },
    approved: {
      color: 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300',
      label: '已批准',
    },
    rejected: {
      color: 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300',
      label: '已拒绝',
    },
  };

  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-700">
      {variants.map((variant) => {
        const status = statusConfig[variant.status] || statusConfig.pending;
        return (
          <div
            key={variant.id}
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50"
          >
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                  {status.label}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  字段: {variant.field}
                </span>
                <span className="text-xs text-gray-400">
                  置信度: {(variant.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span>单词ID: {variant.wordId.slice(0, 8)}...</span>
                <span>创建: {new Date(variant.createdAt).toLocaleString()}</span>
                {variant.approvedBy && <span>审核人: {variant.approvedBy}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {variant.status === 'pending' && (
                <>
                  <button
                    onClick={() => onApprove(variant.id)}
                    className="rounded-lg bg-green-500 p-2 text-white hover:bg-green-600"
                    title="批准"
                  >
                    <CheckCircle size={16} />
                  </button>
                  <button
                    onClick={() => onReject(variant.id)}
                    className="rounded-lg bg-red-500 p-2 text-white hover:bg-red-600"
                    title="拒绝"
                  >
                    <XCircle size={16} />
                  </button>
                </>
              )}
              <button
                onClick={() => onView(variant)}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-600"
                title="查看详情"
              >
                <Eye size={16} className="text-gray-500" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskDetailModal({ task, onClose }: { task: LLMTask; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">任务详情</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700"
          >
            <XCircle size={20} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">任务ID</label>
                <p className="font-mono text-sm text-gray-900 dark:text-white">{task.id}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">任务类型</label>
                <p className="text-gray-900 dark:text-white">{task.taskType}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">状态</label>
                <p className="text-gray-900 dark:text-white">{task.status}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">优先级</label>
                <p className="text-gray-900 dark:text-white">{task.priority}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">创建时间</label>
                <p className="text-gray-900 dark:text-white">
                  {new Date(task.createdAt).toLocaleString()}
                </p>
              </div>
              {task.startedAt && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">开始时间</label>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(task.startedAt).toLocaleString()}
                  </p>
                </div>
              )}
              {task.completedAt && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">完成时间</label>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(task.completedAt).toLocaleString()}
                  </p>
                </div>
              )}
              {task.tokensUsed && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Token 消耗</label>
                  <p className="text-gray-900 dark:text-white">{task.tokensUsed}</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">输入参数</label>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs dark:bg-slate-900">
                {JSON.stringify(task.input, null, 2)}
              </pre>
            </div>

            {task.output && (
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">输出结果</label>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs dark:bg-slate-900">
                  {JSON.stringify(task.output, null, 2)}
                </pre>
              </div>
            )}

            {task.error && (
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">错误信息</label>
                <p className="mt-1 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {task.error}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantDetailModal({
  variant,
  onClose,
  onApprove,
  onReject,
}: {
  variant: WordVariant;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isPending = variant.status === 'pending';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">内容变体详情</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700"
          >
            <XCircle size={20} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">变体ID</label>
                <p className="font-mono text-sm text-gray-900 dark:text-white">{variant.id}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">单词ID</label>
                <p className="font-mono text-sm text-gray-900 dark:text-white">{variant.wordId}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">字段</label>
                <p className="text-gray-900 dark:text-white">{variant.field}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">置信度</label>
                <p className="text-gray-900 dark:text-white">
                  {(variant.confidence * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  原始值
                </label>
                <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs dark:bg-slate-900">
                  {variant.originalValue ? JSON.stringify(variant.originalValue, null, 2) : '(空)'}
                </pre>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  AI 生成值
                </label>
                <pre className="overflow-x-auto rounded-lg bg-indigo-50 p-3 text-xs dark:bg-indigo-900/20">
                  {JSON.stringify(variant.generatedValue, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {isPending && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
            <button
              onClick={onReject}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-100 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              拒绝
            </button>
            <button
              onClick={onApprove}
              className="rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600"
            >
              批准应用
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
