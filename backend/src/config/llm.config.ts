/**
 * LLM Advisor Configuration
 * LLM 顾问配置
 *
 * 用于配置 LLM 周度顾问系统的参数
 */

// ==================== 类型定义 ====================

/**
 * LLM 提供者类型
 */
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'custom';

/**
 * LLM 配置接口
 */
export interface LLMConfig {
  /** 是否启用 LLM 顾问 */
  enabled: boolean;

  /** LLM 提供者 */
  provider: LLMProvider;

  /** 模型名称 */
  model: string;

  /** API Key */
  apiKey: string;

  /** 自定义 API 地址（可选） */
  baseUrl?: string;

  /** 请求超时（毫秒） */
  timeout: number;

  /** 最大重试次数 */
  maxRetries: number;

  /** 温度参数（0-1，越低越确定性） */
  temperature: number;

  /** 最大输出 token 数 */
  maxTokens: number;
}

/**
 * LLM 顾问调度配置
 */
export interface LLMAdvisorScheduleConfig {
  /** 周度分析的 cron 表达式，默认周日凌晨 4 点 */
  weeklyAnalysisCron: string;

  /** 是否启用自动分析 */
  autoAnalysisEnabled: boolean;
}

// ==================== 默认配置 ====================

/**
 * 各提供者的默认模型
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  ollama: 'llama3.2',
  custom: 'default'
};

/**
 * 各提供者的默认 API 地址
 */
export const DEFAULT_BASE_URLS: Record<LLMProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434/api',
  custom: ''
};

// ==================== 配置加载 ====================

/**
 * 从环境变量解析 LLM 提供者
 */
function parseProvider(value: string | undefined): LLMProvider {
  const validProviders: LLMProvider[] = ['openai', 'anthropic', 'ollama', 'custom'];
  const provider = (value?.toLowerCase() || 'openai') as LLMProvider;
  return validProviders.includes(provider) ? provider : 'openai';
}

/**
 * 从环境变量加载 LLM 配置
 */
export function loadLLMConfig(): LLMConfig {
  const provider = parseProvider(process.env.LLM_PROVIDER);

  return {
    enabled: process.env.LLM_ADVISOR_ENABLED === 'true',
    provider,
    model: process.env.LLM_MODEL || DEFAULT_MODELS[provider],
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || DEFAULT_BASE_URLS[provider],
    timeout: parseInt(process.env.LLM_TIMEOUT || '60000', 10),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '2', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10)
  };
}

/**
 * 加载调度配置
 */
export function loadScheduleConfig(): LLMAdvisorScheduleConfig {
  return {
    weeklyAnalysisCron: process.env.LLM_WEEKLY_CRON || '0 4 * * 0', // 周日 04:00
    autoAnalysisEnabled: process.env.LLM_AUTO_ANALYSIS !== 'false'
  };
}

// ==================== 配置实例 ====================

/** 当前 LLM 配置 */
export const llmConfig = loadLLMConfig();

/** 当前调度配置 */
export const scheduleConfig = loadScheduleConfig();

// ==================== 验证函数 ====================

/**
 * 验证 LLM 配置是否完整
 */
export function validateLLMConfig(config: LLMConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, errors: [] }; // 未启用时不需要验证
  }

  if (!config.apiKey && config.provider !== 'ollama') {
    errors.push('LLM_API_KEY 未设置');
  }

  if (!config.model) {
    errors.push('LLM_MODEL 未设置');
  }

  if (config.timeout < 1000 || config.timeout > 300000) {
    errors.push('LLM_TIMEOUT 应在 1000-300000 毫秒之间');
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('LLM_TEMPERATURE 应在 0-2 之间');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 获取配置摘要（隐藏敏感信息）
 */
export function getConfigSummary(config: LLMConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    apiKeySet: !!config.apiKey
  };
}
