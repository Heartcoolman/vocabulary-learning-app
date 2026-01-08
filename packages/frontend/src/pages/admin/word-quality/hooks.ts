import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wordQualityApi, IssueFilters, StartTaskOptions, CheckType } from './api';
import TokenManager from '../../../services/client/base/TokenManager';

// --- Keys ---
const KEYS = {
  stats: (wbId: string) => ['word-quality', 'stats', wbId],
  issues: (wbId: string, filters: IssueFilters) => ['word-quality', 'issues', wbId, filters],
  tasks: (wbId: string) => ['word-quality', 'tasks', wbId],
};

// --- Queries ---

export function useWordQualityStats(wordbookId: string | null) {
  return useQuery({
    queryKey: KEYS.stats(wordbookId || ''),
    queryFn: () => wordQualityApi.getStats(wordbookId!),
    enabled: !!wordbookId,
  });
}

export function useWordQualityIssues(wordbookId: string | null, filters: IssueFilters) {
  return useQuery({
    queryKey: KEYS.issues(wordbookId || '', filters),
    queryFn: () => wordQualityApi.listIssues(wordbookId!, filters),
    enabled: !!wordbookId,
    placeholderData: (prev) => prev, // Keep previous data while fetching new filter
  });
}

export function useLatestTask(wordbookId: string | null) {
  return useQuery({
    queryKey: KEYS.tasks(wordbookId || ''),
    queryFn: async () => {
      const tasks = await wordQualityApi.listTasks(wordbookId!, 1);
      return tasks.length > 0 ? tasks[0] : null;
    },
    enabled: !!wordbookId,
    refetchInterval: (query) => {
      const task = query.state.data;
      if (task && task.status === 'running') return 2000;
      return false;
    },
  });
}

// --- Mutations ---

export function useWordQualityMutations(wordbookId: string | null) {
  const queryClient = useQueryClient();

  const startTask = useMutation({
    mutationFn: (options: StartTaskOptions) => {
      if (!wordbookId) throw new Error('No wordbook selected');
      return wordQualityApi.startTask(wordbookId, options);
    },
    onSuccess: (newTask) => {
      // Invalidate tasks and stats, though SSE will likely update UI
      if (wordbookId) {
        queryClient.setQueryData(KEYS.tasks(wordbookId), newTask);
      }
    },
  });

  const fixIssue = useMutation({
    mutationFn: (issueId: string) => wordQualityApi.applyFix(issueId),
    onSuccess: () => {
      if (wordbookId) {
        queryClient.invalidateQueries({ queryKey: ['word-quality', 'issues'] }); // Broad invalidation or specific?
        queryClient.invalidateQueries({ queryKey: KEYS.stats(wordbookId) });
      }
    },
  });

  const ignoreIssue = useMutation({
    mutationFn: (issueId: string) => wordQualityApi.ignoreIssue(issueId),
    onSuccess: () => {
      if (wordbookId) {
        queryClient.invalidateQueries({ queryKey: ['word-quality', 'issues'] });
        queryClient.invalidateQueries({ queryKey: KEYS.stats(wordbookId) });
      }
    },
  });

  const batchOperation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'fix' | 'ignore' }) =>
      wordQualityApi.batchOperation(ids, action),
    onSuccess: () => {
      if (wordbookId) {
        queryClient.invalidateQueries({ queryKey: ['word-quality', 'issues'] });
        queryClient.invalidateQueries({ queryKey: KEYS.stats(wordbookId) });
      }
    },
  });

  const cancelTask = useMutation({
    mutationFn: (taskId: string) => wordQualityApi.cancelTask(taskId),
    onSuccess: () => {
      if (wordbookId) {
        queryClient.invalidateQueries({ queryKey: KEYS.tasks(wordbookId) });
      }
    },
  });

  return { startTask, fixIssue, ignoreIssue, batchOperation, cancelTask };
}

// --- SSE Hook ---

export interface TaskProgress {
  taskId: string;
  wordbookId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  issuesFound: number;
  currentItem: string | null;
  percentage: number;
}

export function useQualityTaskSSE(wordbookId: string | null) {
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!wordbookId) {
      setProgress(null);
      return;
    }

    const token = TokenManager.getInstance().getToken();
    if (!token) return;

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams({ token });
    const sessionId = encodeURIComponent(wordbookId);
    const url = `/api/v1/realtime/sessions/${sessionId}/stream?${params.toString()}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);

    es.addEventListener('quality-task-progress', (event) => {
      try {
        const envelope = JSON.parse(event.data) as { type: string; payload: TaskProgress };
        const data = envelope.payload;
        if (data.wordbookId === wordbookId) {
          setProgress(data);

          // If task completed, refresh data
          if (data.status === 'completed' || data.status === 'failed') {
            queryClient.invalidateQueries({ queryKey: KEYS.stats(wordbookId) });
            queryClient.invalidateQueries({ queryKey: ['word-quality', 'issues'] });
          }
        }
      } catch (e) {
        console.error('SSE Parse Error', e);
      }
    });

    es.onerror = () => {
      setIsConnected(false);
      // Optional: Retry logic could go here
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [wordbookId, queryClient]);

  return { progress, isConnected };
}
