import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input, Select, Switch, Textarea, useToast, type SelectOption } from '../../ui';
import { CheckCircle, CircleNotch, Lightning, Warning } from '../../Icon';
import { adminClient } from '../../../services/client';

interface CreateBroadcastRequest {
  title: string;
  content: string;
  target: string;
  targetFilter?: Record<string, unknown>;
  priority?: string;
  persistent?: boolean;
  expiresAt?: string;
}

const targetOptions: SelectOption[] = [
  { value: 'all', label: '全部用户' },
  { value: 'online', label: '在线用户' },
  { value: 'group', label: '指定分组' },
  { value: 'user', label: '单个用户' },
  { value: 'users', label: '多个用户' },
];

const priorityOptions: SelectOption[] = [
  { value: 'LOW', label: '低' },
  { value: 'NORMAL', label: '普通' },
  { value: 'HIGH', label: '高' },
  { value: 'URGENT', label: '紧急' },
];

interface BroadcastFormProps {
  onCreated?: () => void;
}

export default function BroadcastForm({ onCreated }: BroadcastFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('all');
  const [priority, setPriority] = useState('NORMAL');
  const [persistent, setPersistent] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [targetFilterText, setTargetFilterText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: CreateBroadcastRequest) =>
      adminClient.requestAdmin('/api/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('广播已创建');
      setTitle('');
      setContent('');
      setTarget('all');
      setPriority('NORMAL');
      setPersistent(false);
      setExpiresAt('');
      setTargetFilterText('');
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
      onCreated?.();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '创建失败';
      toast.error(message);
      setFormError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !content.trim()) {
      setFormError('标题和内容不能为空');
      return;
    }

    if (title.length > 100) {
      setFormError('标题不能超过100字符');
      return;
    }

    if (content.length > 10000) {
      setFormError('内容不能超过10000字符');
      return;
    }

    let parsedFilter: Record<string, unknown> | undefined;
    if (targetFilterText.trim()) {
      try {
        parsedFilter = JSON.parse(targetFilterText.trim());
      } catch {
        setFormError('目标筛选条件必须是有效的 JSON');
        return;
      }
    }

    let normalizedExpiresAt: string | undefined;
    if (expiresAt) {
      const date = new Date(expiresAt);
      if (Number.isNaN(date.getTime())) {
        setFormError('过期时间格式无效');
        return;
      }
      normalizedExpiresAt = date.toISOString();
    }

    createMutation.mutate({
      title: title.trim(),
      content: content.trim(),
      target,
      targetFilter: parsedFilter,
      priority,
      persistent,
      expiresAt: normalizedExpiresAt,
    });
  };

  const showTargetFilter = ['group', 'user', 'users'].includes(target);

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-button bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
          <Lightning size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">创建广播</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">向目标用户发送通知消息</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="广播标题（最多100字符）"
          required
          fullWidth
        />
        <Select
          label="目标"
          value={target}
          onChange={setTarget}
          options={targetOptions}
          fullWidth
        />
        <Select
          label="优先级"
          value={priority}
          onChange={setPriority}
          options={priorityOptions}
          fullWidth
        />
        <div className="flex w-full flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">过期时间</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-input border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all duration-g3-fast ease-g3 hover:border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:border-slate-500 dark:focus:ring-blue-900/50"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">可选，留空则不过期</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <Textarea
          label="内容"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="广播内容（最多10000字符）"
          minRows={4}
          autoResize
          required
          fullWidth
        />

        {showTargetFilter && (
          <Textarea
            label="目标筛选条件 (JSON)"
            value={targetFilterText}
            onChange={(e) => setTargetFilterText(e.target.value)}
            placeholder={
              target === 'group'
                ? '{"wordbook": "CET4"}'
                : target === 'user'
                  ? '{"userId": "用户ID"}'
                  : '{"userIds": ["用户ID1", "用户ID2"]}'
            }
            helperText="用 JSON 格式指定目标范围"
            minRows={2}
            autoResize
            fullWidth
          />
        )}

        <Switch
          checked={persistent}
          onCheckedChange={setPersistent}
          label="持久化广播"
          description="为离线用户保存通知记录"
        />
      </div>

      <div className="mt-6 flex items-center justify-end gap-4">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-2 rounded-button bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createMutation.isPending ? (
            <CircleNotch className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle size={16} />
          )}
          创建广播
        </button>
      </div>

      {formError && (
        <div className="mt-4 flex items-center gap-2 rounded-button border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          <Warning size={16} />
          <span>{formError}</span>
        </div>
      )}
    </form>
  );
}
