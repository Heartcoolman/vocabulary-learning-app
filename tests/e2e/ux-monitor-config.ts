/**
 * 用户体验监控配置
 *
 * 该配置用于实时监控用户体验指标，并在指标超标时发出警告
 */

export interface PerformanceBudget {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
}

export interface UXMonitorConfig {
  enabled: boolean;
  sampleRate: number; // 采样率 (0-1)
  reportInterval: number; // 上报间隔（毫秒）
  budgets: PerformanceBudget[];
  alertWebhook?: string; // 告警 Webhook URL
}

/**
 * 默认性能预算配置
 */
export const DEFAULT_PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  {
    metric: 'FCP',
    warning: 2000,
    critical: 3000,
    unit: 'ms',
  },
  {
    metric: 'LCP',
    warning: 4000,
    critical: 5000,
    unit: 'ms',
  },
  {
    metric: 'TTI',
    warning: 5000,
    critical: 7000,
    unit: 'ms',
  },
  {
    metric: 'CLS',
    warning: 0.1,
    critical: 0.25,
    unit: '',
  },
  {
    metric: 'FID',
    warning: 100,
    critical: 300,
    unit: 'ms',
  },
  {
    metric: 'TotalLoadTime',
    warning: 5000,
    critical: 8000,
    unit: 'ms',
  },
];

/**
 * 默认监控配置
 */
export const DEFAULT_UX_MONITOR_CONFIG: UXMonitorConfig = {
  enabled: process.env.NODE_ENV === 'production',
  sampleRate: 0.1, // 10% 采样率
  reportInterval: 60000, // 每分钟上报一次
  budgets: DEFAULT_PERFORMANCE_BUDGETS,
  alertWebhook: process.env.UX_ALERT_WEBHOOK,
};

/**
 * 场景测试配置
 */
export interface ScenarioConfig {
  id: string;
  name: string;
  rounds: number;
  timeout: number;
  enabled: boolean;
  criticalPath?: boolean;
}

export const SCENARIO_CONFIGS: ScenarioConfig[] = [
  {
    id: 'scenario-1',
    name: '新用户首次访问',
    rounds: 5,
    timeout: 30000,
    enabled: true,
    criticalPath: true,
  },
  {
    id: 'scenario-2',
    name: '老用户重复访问',
    rounds: 5,
    timeout: 20000,
    enabled: true,
    criticalPath: true,
  },
  {
    id: 'scenario-3',
    name: '快速连续操作',
    rounds: 3,
    timeout: 15000,
    enabled: true,
    criticalPath: false,
  },
  {
    id: 'scenario-4',
    name: '弱网络环境',
    rounds: 5,
    timeout: 60000,
    enabled: true,
    criticalPath: false,
  },
  {
    id: 'scenario-5',
    name: '长时间使用',
    rounds: 1,
    timeout: 600000, // 10分钟
    enabled: false, // 默认禁用，因为耗时较长
    criticalPath: false,
  },
  {
    id: 'scenario-6',
    name: '跨浏览器测试',
    rounds: 1,
    timeout: 30000,
    enabled: false, // 需要手动启用多浏览器
    criticalPath: false,
  },
  {
    id: 'scenario-7',
    name: '边缘场景',
    rounds: 3,
    timeout: 20000,
    enabled: true,
    criticalPath: false,
  },
];

/**
 * 获取启用的场景
 */
export function getEnabledScenarios(): ScenarioConfig[] {
  return SCENARIO_CONFIGS.filter((s) => s.enabled);
}

/**
 * 获取关键路径场景
 */
export function getCriticalPathScenarios(): ScenarioConfig[] {
  return SCENARIO_CONFIGS.filter((s) => s.enabled && s.criticalPath);
}

/**
 * 环境特定配置
 */
export function getEnvironmentConfig(): Partial<UXMonitorConfig> {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'production':
      return {
        enabled: true,
        sampleRate: 0.1,
        reportInterval: 60000,
      };

    case 'staging':
      return {
        enabled: true,
        sampleRate: 0.5,
        reportInterval: 30000,
      };

    case 'development':
      return {
        enabled: false,
        sampleRate: 1.0,
        reportInterval: 10000,
      };

    default:
      return {};
  }
}

/**
 * 性能等级评估
 */
export function evaluatePerformance(
  metric: string,
  value: number,
  budgets: PerformanceBudget[],
): 'good' | 'warning' | 'critical' {
  const budget = budgets.find((b) => b.metric === metric);

  if (!budget) return 'good';

  if (value >= budget.critical) {
    return 'critical';
  } else if (value >= budget.warning) {
    return 'warning';
  } else {
    return 'good';
  }
}

/**
 * 生成性能报告摘要
 */
export function generatePerformanceSummary(metrics: Record<string, number>): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: string[];
} {
  let score = 100;
  const issues: string[] = [];

  DEFAULT_PERFORMANCE_BUDGETS.forEach((budget) => {
    const value = metrics[budget.metric];
    if (value === undefined) return;

    const status = evaluatePerformance(budget.metric, value, DEFAULT_PERFORMANCE_BUDGETS);

    if (status === 'critical') {
      score -= 15;
      issues.push(
        `${budget.metric} 严重超标: ${value}${budget.unit} (期望 < ${budget.critical}${budget.unit})`,
      );
    } else if (status === 'warning') {
      score -= 5;
      issues.push(
        `${budget.metric} 超出警告线: ${value}${budget.unit} (期望 < ${budget.warning}${budget.unit})`,
      );
    }
  });

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return {
    score: Math.max(0, score),
    grade,
    issues,
  };
}
