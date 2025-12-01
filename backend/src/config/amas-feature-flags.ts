/**
 * AMAS 决策流水线特性开关配置
 *
 * 控制真实数据功能的启用/禁用，支持灰度发布和回滚
 *
 * 环境变量：
 * - AMAS_REAL_DATA_WRITE_ENABLED: 启用决策记录写入（默认 false）
 * - AMAS_REAL_DATA_READ_ENABLED: 启用真实数据读取（默认 false）
 * - AMAS_VISUALIZATION_ENABLED: 启用流水线可视化（默认 true）
 * - AMAS_ABOUT_DATA_SOURCE: 'real' | 'virtual'（默认 virtual）
 */

// ==================== 类型定义 ====================

export type DataSourceMode = 'real' | 'virtual';

export interface AmasFeatureFlags {
  /** 启用决策记录写入到数据库 */
  writeEnabled: boolean;
  /** 启用从数据库读取真实数据 */
  readEnabled: boolean;
  /** 启用流水线可视化 */
  visualizationEnabled: boolean;
  /** About 页面数据源 */
  aboutDataSource: DataSourceMode;
  /** 缓存 TTL（毫秒） */
  cacheTtlMs: number;
  /** 队列最大长度 */
  maxQueueSize: number;
  /** 最小数据量阈值（低于此值使用默认数据） */
  minDataThreshold: number;
}

// ==================== 配置解析 ====================

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? defaultValue : num;
}

function parseDataSource(value: string | undefined): DataSourceMode {
  if (value === 'real') return 'real';
  return 'virtual';
}

// ==================== 特性开关实例 ====================

export const amasFeatureFlags: AmasFeatureFlags = {
  writeEnabled: parseBoolean(process.env.AMAS_REAL_DATA_WRITE_ENABLED, false),
  readEnabled: parseBoolean(process.env.AMAS_REAL_DATA_READ_ENABLED, false),
  visualizationEnabled: parseBoolean(process.env.AMAS_VISUALIZATION_ENABLED, true),
  aboutDataSource: parseDataSource(process.env.AMAS_ABOUT_DATA_SOURCE),
  cacheTtlMs: parseNumber(process.env.AMAS_CACHE_TTL_MS, 60000),
  maxQueueSize: parseNumber(process.env.AMAS_MAX_QUEUE_SIZE, 1000),
  minDataThreshold: parseNumber(process.env.AMAS_MIN_DATA_THRESHOLD, 5)
};

// ==================== 便捷函数 ====================

/**
 * 检查是否启用决策记录写入
 */
export function isDecisionWriteEnabled(): boolean {
  return amasFeatureFlags.writeEnabled;
}

/**
 * 检查是否启用真实数据读取
 */
export function isRealDataReadEnabled(): boolean {
  return amasFeatureFlags.readEnabled;
}

/**
 * 检查是否使用真实数据源
 */
export function useRealDataSource(): boolean {
  return amasFeatureFlags.aboutDataSource === 'real' && amasFeatureFlags.readEnabled;
}

/**
 * 检查是否使用虚拟数据源
 */
export function useVirtualDataSource(): boolean {
  return amasFeatureFlags.aboutDataSource === 'virtual' || !amasFeatureFlags.readEnabled;
}

/**
 * 获取当前特性开关状态（用于调试/监控）
 */
export function getFeatureFlagsStatus(): AmasFeatureFlags {
  return { ...amasFeatureFlags };
}

/**
 * 运行时更新特性开关（用于动态配置，谨慎使用）
 */
export function updateFeatureFlag<K extends keyof AmasFeatureFlags>(
  key: K,
  value: AmasFeatureFlags[K]
): void {
  (amasFeatureFlags as any)[key] = value;
  console.log(`[AmasFeatureFlags] Updated ${key} to ${value}`);
}

// ==================== 配置验证 ====================

/**
 * 验证配置一致性
 */
export function validateFeatureFlags(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // 如果读取启用但写入禁用，可能导致数据不完整
  if (amasFeatureFlags.readEnabled && !amasFeatureFlags.writeEnabled) {
    warnings.push(
      'readEnabled is true but writeEnabled is false. ' +
      'New decisions will not be recorded, only historical data will be shown.'
    );
  }

  // 如果数据源是 real 但读取禁用，会自动降级
  if (amasFeatureFlags.aboutDataSource === 'real' && !amasFeatureFlags.readEnabled) {
    warnings.push(
      'aboutDataSource is "real" but readEnabled is false. ' +
      'Will fallback to virtual data source.'
    );
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}

// ==================== 启动时日志 ====================

const validation = validateFeatureFlags();

console.log('[AmasFeatureFlags] Configuration loaded:');
console.log(`  - writeEnabled: ${amasFeatureFlags.writeEnabled}`);
console.log(`  - readEnabled: ${amasFeatureFlags.readEnabled}`);
console.log(`  - visualizationEnabled: ${amasFeatureFlags.visualizationEnabled}`);
console.log(`  - aboutDataSource: ${amasFeatureFlags.aboutDataSource}`);
console.log(`  - cacheTtlMs: ${amasFeatureFlags.cacheTtlMs}`);
console.log(`  - maxQueueSize: ${amasFeatureFlags.maxQueueSize}`);

if (!validation.valid) {
  console.warn('[AmasFeatureFlags] Warnings:');
  for (const warning of validation.warnings) {
    console.warn(`  - ${warning}`);
  }
}
