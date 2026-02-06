import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardContent,
  Switch,
  Button,
  Badge,
  useToast,
  Alert,
  Select,
  Spinner,
} from '../../components/ui';
import {
  Bug,
  ArrowCounterClockwise,
  Play,
  Pause,
  Lightning,
  Database,
  Cpu,
  Gear,
  ShieldCheck,
  Warning,
  CheckCircle,
  XCircle,
  Clock,
} from '../../components/Icon';
import { env } from '../../config/env';
import TokenManager from '../../services/client/base/TokenManager';

// ==================== API ====================

const tokenManager = TokenManager.getInstance();

/** CSRF Cookie 名称 */
const CSRF_COOKIE_NAME = 'csrf_token';
/** CSRF Header 名称 */
const CSRF_HEADER_NAME = 'X-CSRF-Token';
/** 需要 CSRF Token 的 HTTP 方法 */
const CSRF_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

/**
 * 从 Cookie 中获取 CSRF Token
 */
function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = tokenManager.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // 对于状态修改请求，添加 CSRF Token
  const method = (options.method || 'GET').toUpperCase();
  if (CSRF_METHODS.includes(method)) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  const response = await fetch(`${env.apiUrl}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as ApiResponse<unknown>;
    throw new Error(err.error || `请求失败: ${response.status}`);
  }
  const data = (await response.json()) as ApiResponse<T>;
  if (!data.success) throw new Error(data.error || '请求失败');
  return data.data as T;
}

// ==================== 类型 ====================

interface SystemStatus {
  debugEnabled: boolean;
  simulationActive: boolean;
  simulationRemainingMs: number | null;
  infrastructure: {
    redis: { enabled: boolean; connected: boolean };
    database: { connected: boolean; simulateSlowQuery: boolean };
    llm: { enabled: boolean; mockResponse: boolean };
  };
  amas: {
    featureFlags: Record<string, boolean>;
    circuitForceOpen: boolean;
    simulateFallbackReason: string | null;
  };
  services: Record<string, boolean>;
}

interface HealthCheckResult {
  redis: { healthy: boolean; latencyMs: number | null };
  database: { healthy: boolean; latencyMs: number | null };
  amas: { healthy: boolean };
}

interface AuditLogEntry {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
}

interface FallbackTestResult {
  strategy: Record<string, unknown>;
  reason: string;
  explanation: string;
}

// ==================== API客户端 ====================

const debugApi = {
  getStatus: () => apiRequest<SystemStatus>('/api/debug/status'),
  getHealth: () => apiRequest<HealthCheckResult>('/api/debug/health'),
  getAuditLog: (limit = 20) => apiRequest<AuditLogEntry[]>(`/api/debug/audit-log?limit=${limit}`),
  toggleRedis: (enabled: boolean) =>
    apiRequest<void>('/api/debug/redis/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  toggleLlm: (options: { enabled?: boolean }) =>
    apiRequest<void>('/api/debug/llm/toggle', { method: 'POST', body: JSON.stringify(options) }),
  configureDbSimulation: (options: { simulateSlowQuery?: boolean; slowQueryDelayMs?: number }) =>
    apiRequest<void>('/api/debug/db/simulate', { method: 'POST', body: JSON.stringify(options) }),
  updateFeatureFlags: (updates: Record<string, boolean>) =>
    apiRequest<void>('/api/debug/amas/feature-flags', {
      method: 'POST',
      body: JSON.stringify(updates),
    }),
  resetFeatureFlags: () =>
    apiRequest<void>('/api/debug/amas/feature-flags/reset', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  forceCircuitOpen: () =>
    apiRequest<void>('/api/debug/amas/circuit/open', { method: 'POST', body: JSON.stringify({}) }),
  resetCircuit: () =>
    apiRequest<void>('/api/debug/amas/circuit/reset', { method: 'POST', body: JSON.stringify({}) }),
  testFallback: (reason: string) =>
    apiRequest<FallbackTestResult>('/api/debug/amas/fallback/test', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  toggleServices: (updates: Record<string, boolean>) =>
    apiRequest<void>('/api/debug/services/toggle', {
      method: 'POST',
      body: JSON.stringify(updates),
    }),
  resetAll: () =>
    apiRequest<void>('/api/debug/reset', { method: 'POST', body: JSON.stringify({}) }),
  stopSimulations: () =>
    apiRequest<void>('/api/debug/stop-simulations', { method: 'POST', body: JSON.stringify({}) }),
};

// ==================== 组件 ====================

function StatusBadge({
  healthy,
  label,
  latency,
}: {
  healthy: boolean;
  label: string;
  latency?: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      {healthy ? (
        <CheckCircle size={16} className="text-green-500" weight="fill" />
      ) : (
        <XCircle size={16} className="text-red-500" weight="fill" />
      )}
      <span
        className={
          healthy ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
        }
      >
        {label}
      </span>
      {latency != null && (
        <span className="text-xs text-gray-500 dark:text-gray-400">({latency}ms)</span>
      )}
    </div>
  );
}

function HealthPanel({ health }: { health?: HealthCheckResult }) {
  if (!health) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-blue-600" />
          <h3 className="font-semibold">服务健康状态</h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-6">
          <StatusBadge
            healthy={health.redis.healthy}
            label="Redis"
            latency={health.redis.latencyMs}
          />
          <StatusBadge
            healthy={health.database.healthy}
            label="Database"
            latency={health.database.latencyMs}
          />
          <StatusBadge healthy={health.amas.healthy} label="AMAS Engine" />
        </div>
      </CardContent>
    </Card>
  );
}

function InfrastructurePanel({
  status,
  onToggleRedis,
  onToggleLlm,
  onToggleDbSlow,
}: {
  status: SystemStatus;
  onToggleRedis: (v: boolean) => void;
  onToggleLlm: (v: boolean) => void;
  onToggleDbSlow: (v: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database size={20} className="text-purple-600" />
          <h3 className="font-semibold">基础设施控制</h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium dark:text-white">Redis 缓存</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {status.infrastructure.redis.connected ? '已连接' : '未连接'}
            </div>
          </div>
          <Switch checked={status.infrastructure.redis.enabled} onCheckedChange={onToggleRedis} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium dark:text-white">LLM 服务</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {status.infrastructure.llm.mockResponse ? '模拟响应' : '正常'}
            </div>
          </div>
          <Switch checked={status.infrastructure.llm.enabled} onCheckedChange={onToggleLlm} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium dark:text-white">模拟慢查询</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">数据库延迟测试</div>
          </div>
          <Switch
            checked={status.infrastructure.database.simulateSlowQuery}
            onCheckedChange={onToggleDbSlow}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AmasControlPanel({
  status,
  onUpdateFlag,
  onResetFlags,
  onForceCircuitOpen,
  onResetCircuit,
}: {
  status: SystemStatus;
  onUpdateFlag: (k: string, v: boolean) => void;
  onResetFlags: () => void;
  onForceCircuitOpen: () => void;
  onResetCircuit: () => void;
}) {
  const flagInfo: Record<string, { label: string; desc: string }> = {
    enableTrendAnalyzer: { label: '趋势分析器', desc: '分析学习进度趋势，预测掌握程度' },
    enableHeuristicBaseline: { label: '启发式基线', desc: '基于规则的基础调度策略' },
    enableThompsonSampling: { label: 'Thompson采样', desc: '探索-利用平衡的概率选择算法' },
    enableACTRMemory: { label: 'ACT-R记忆模型', desc: '认知心理学记忆衰减模型' },
    enableColdStartManager: { label: '冷启动管理', desc: '新用户/新单词的初始化策略' },
    enableEnsemble: { label: '集成决策', desc: '多模型融合的最终决策机制' },
    enableUserParamsManager: { label: '用户参数管理', desc: '个性化学习参数的存储与更新' },
    enableDelayedRewardAggregator: { label: '延迟奖励聚合', desc: '长期学习效果的反馈收集' },
    enableCausalInference: { label: '因果推断', desc: '分析学习行为与效果的因果关系' },
    enableBayesianOptimizer: { label: '贝叶斯优化', desc: '自适应调整学习参数' },
  };
  const isOpen = status.amas.circuitForceOpen;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gear size={20} className="text-orange-600" />
            <h3 className="font-semibold">AMAS 功能开关</h3>
          </div>
          <Button size="sm" variant="ghost" onClick={onResetFlags}>
            <ArrowCounterClockwise size={16} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {Object.entries(status.amas.featureFlags).map(([k, v]) => {
            const info = flagInfo[k] || { label: k, desc: '' };
            return (
              <div
                key={k}
                className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0 dark:border-slate-700"
              >
                <div className="mr-4 flex-1">
                  <div className="text-sm font-medium dark:text-white">{info.label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{info.desc}</div>
                </div>
                <Switch checked={v} onCheckedChange={(c) => onUpdateFlag(k, c)} />
              </div>
            );
          })}
        </div>
        <div className="border-t pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm dark:text-gray-300">熔断器</span>
            <Badge variant={isOpen ? 'danger' : 'success'}>{isOpen ? 'OPEN' : 'CLOSED'}</Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={onForceCircuitOpen} disabled={isOpen}>
              <Lightning size={16} className="mr-1" />
              触发熔断
            </Button>
            <Button size="sm" variant="secondary" onClick={onResetCircuit}>
              重置
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ServicesPanel({
  services,
  onToggle,
}: {
  services: Record<string, boolean>;
  onToggle: (k: string, v: boolean) => void;
}) {
  const labels: Record<string, string> = {
    behaviorFatigue: '行为疲劳',
    delayedReward: '延迟奖励',
    optimization: '优化服务',
    stateHistory: '状态历史',
    tracking: '追踪服务',
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cpu size={20} className="text-blue-600" />
          <h3 className="font-semibold">核心服务控制</h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(services).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="text-sm dark:text-gray-300">{labels[k] || k}</span>
            <Switch checked={v} onCheckedChange={(c) => onToggle(k, c)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FallbackTestPanel() {
  const [reason, setReason] = useState('circuit_open');
  const [result, setResult] = useState<FallbackTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ reason: string; time: string; success: boolean }>>(
    [],
  );

  const scenarios: Record<string, { label: string; desc: string; color: string }> = {
    circuit_open: {
      label: '熔断触发',
      desc: 'AMAS引擎熔断器打开，切换到安全策略',
      color: 'text-red-600',
    },
    timeout: { label: '请求超时', desc: '决策计算超时，返回快速响应', color: 'text-orange-600' },
    exception: { label: '运行异常', desc: '内部异常捕获，启用容错机制', color: 'text-yellow-600' },
    missing_features: {
      label: '特征缺失',
      desc: '用户特征不完整，使用默认参数',
      color: 'text-blue-600',
    },
    model_unavailable: {
      label: '模型不可用',
      desc: 'ML模型加载失败，回退到规则引擎',
      color: 'text-purple-600',
    },
    degraded_state: {
      label: '状态降级',
      desc: '系统负载过高，简化计算逻辑',
      color: 'text-gray-600',
    },
  };

  const options = Object.entries(scenarios).map(([value, { label }]) => ({ value, label }));

  const handleTest = async (testReason?: string) => {
    const r = testReason || reason;
    setLoading(true);
    try {
      const res = await debugApi.testFallback(r);
      setResult(res);
      setHistory((prev) => [
        { reason: r, time: new Date().toLocaleTimeString(), success: true },
        ...prev.slice(0, 4),
      ]);
    } catch {
      setHistory((prev) => [
        { reason: r, time: new Date().toLocaleTimeString(), success: false },
        ...prev.slice(0, 4),
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Play size={20} className="text-green-600" />
          <h3 className="font-semibold">降级策略测试</h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 场景快捷按钮 */}
        <div>
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">快捷测试</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(scenarios).map(([key, { label, color }]) => (
              <Button
                key={key}
                size="sm"
                variant={reason === key ? 'primary' : 'secondary'}
                onClick={() => {
                  setReason(key);
                  handleTest(key);
                }}
                disabled={loading}
                className="text-xs"
              >
                <span className={reason === key ? '' : color}>{label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* 当前选中场景说明 */}
        <div className="rounded-button border border-blue-100 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/30">
          <div className="mb-1 flex items-center gap-2">
            <span className={`font-medium ${scenarios[reason]?.color}`}>
              {scenarios[reason]?.label}
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{scenarios[reason]?.desc}</div>
        </div>

        {/* 自定义测试 */}
        <div className="flex gap-2">
          <Select value={reason} onChange={setReason} options={options} className="flex-1" />
          <Button onClick={() => handleTest()} disabled={loading}>
            {loading ? <Spinner size="sm" /> : '执行测试'}
          </Button>
        </div>

        {/* 测试结果 */}
        {result && (
          <div className="rounded-button border bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-700">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-500" />
              <span className="font-medium">测试结果</span>
            </div>
            <div className="mb-2 text-gray-600 dark:text-gray-400">{result.explanation || ''}</div>
            <details className="cursor-pointer">
              <summary className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                查看策略详情
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                {JSON.stringify(result.strategy, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* 测试历史 */}
        {history.length > 0 && (
          <div>
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">最近测试</div>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                >
                  {h.success ? (
                    <CheckCircle size={12} className="text-green-500" />
                  ) : (
                    <XCircle size={12} className="text-red-500" />
                  )}
                  <span>{h.time}</span>
                  <span className={scenarios[h.reason]?.color}>{scenarios[h.reason]?.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditLogPanel({ logs }: { logs?: AuditLogEntry[] }) {
  if (!logs?.length) return null;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-gray-600" />
          <h3 className="font-semibold">操作日志</h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-3 border-b py-1 text-sm last:border-0">
              <span className="text-xs text-gray-400">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <Badge variant="secondary" className="text-xs">
                {log.action}
              </Badge>
              <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                {JSON.stringify(log.details)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== 主页面 ====================

export default function SystemDebugPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const {
    data: status,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['debug', 'status'],
    queryFn: debugApi.getStatus,
    refetchInterval: 5000,
  });
  const { data: health } = useQuery({
    queryKey: ['debug', 'health'],
    queryFn: debugApi.getHealth,
    refetchInterval: 10000,
  });
  const { data: auditLog } = useQuery({
    queryKey: ['debug', 'auditLog'],
    queryFn: () => debugApi.getAuditLog(20),
    refetchInterval: 5000,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['debug'] }),
    [queryClient],
  );

  const handle = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      refresh();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '操作失败';
      toast.error(errorMsg);
      console.error('Debug API Error:', err);
    }
  };

  if (error)
    return (
      <div className="p-6">
        <Alert variant="error">
          <Warning size={20} />
          <span>调试模式不可用，仅在开发/测试环境可用</span>
        </Alert>
      </div>
    );
  if (isLoading || !status)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bug size={32} className="text-red-600" />
          <div>
            <h1 className="text-2xl font-bold dark:text-white">系统调试控制面板</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">仅开发/测试环境可用</p>
          </div>
        </div>
        <div className="flex gap-2">
          {status.simulationActive && (
            <Badge variant="warning" className="animate-pulse">
              模拟中 ({Math.round((status.simulationRemainingMs || 0) / 1000)}s)
            </Badge>
          )}
          <Button
            variant="secondary"
            onClick={() => handle(debugApi.stopSimulations, '模拟已停止')}
          >
            <Pause size={16} className="mr-1" />
            停止模拟
          </Button>
          <Button variant="danger" onClick={() => handle(debugApi.resetAll, '已重置')}>
            <ArrowCounterClockwise size={16} className="mr-1" />
            重置全部
          </Button>
        </div>
      </div>

      <HealthPanel health={health} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfrastructurePanel
          status={status}
          onToggleRedis={(v) =>
            handle(() => debugApi.toggleRedis(v), `Redis已${v ? '启用' : '禁用'}`)
          }
          onToggleLlm={(v) => handle(() => debugApi.toggleLlm({ enabled: v }), 'LLM已更新')}
          onToggleDbSlow={(v) =>
            handle(
              () => debugApi.configureDbSimulation({ simulateSlowQuery: v, slowQueryDelayMs: 500 }),
              `慢查询已${v ? '启用' : '禁用'}`,
            )
          }
        />
        <ServicesPanel
          services={status.services}
          onToggle={(k, v) => handle(() => debugApi.toggleServices({ [k]: v }), '服务已更新')}
        />
        <AmasControlPanel
          status={status}
          onUpdateFlag={(k, v) =>
            handle(() => debugApi.updateFeatureFlags({ [k]: v }), '开关已更新')
          }
          onResetFlags={() => handle(debugApi.resetFeatureFlags, '开关已重置')}
          onForceCircuitOpen={() => handle(debugApi.forceCircuitOpen, '熔断器已打开')}
          onResetCircuit={() => handle(debugApi.resetCircuit, '熔断器已重置')}
        />
        <FallbackTestPanel />
        <AuditLogPanel logs={auditLog} />
      </div>
    </div>
  );
}
