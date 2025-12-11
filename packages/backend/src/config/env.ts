/**
 * 后端环境变量配置
 *
 * 使用 Zod 进行运行时验证，确保环境变量的类型安全和完整性
 * 所有环境变量都通过此文件统一访问，避免直接使用 process.env
 */

import { config } from 'dotenv';
import { z } from 'zod';
import { startupLogger } from '../logger';

// 加载 .env 文件
config();

/**
 * 环境变量 Schema 定义
 */
const envSchema = z.object({
  // ============================================
  // 数据库配置
  // ============================================
  DATABASE_URL: z.string().url('DATABASE_URL 必须是有效的 URL'),

  // ============================================
  // JWT 配置
  // ============================================
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET 长度至少为 16 个字符')
    .refine(
      (val) => {
        // 生产环境不允许使用默认值
        if (process.env.NODE_ENV === 'production') {
          return (
            val !== 'default_secret_change_me' &&
            val !== 'dev_only_weak_secret_change_in_production'
          );
        }
        return true;
      },
      {
        message: '生产环境必须配置强随机 JWT_SECRET',
      },
    ),

  JWT_EXPIRES_IN: z.string().default('24h'),

  // ============================================
  // 服务器配置
  // ============================================
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(65535, 'PORT 必须在 1-65535 范围内')),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ============================================
  // CORS 配置
  // ============================================
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // ============================================
  // 反向代理配置
  // ============================================
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((val) => {
      if (val === 'false' || val === '0') return false;
      if (val === 'true' || val === '1') return 1;
      const num = parseInt(val, 10);
      return isNaN(num) ? val : num;
    }),

  // ============================================
  // Worker 配置
  // ============================================
  WORKER_LEADER: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // ============================================
  // AMAS 算法配置
  // ============================================
  DELAYED_REWARD_DELAY_MS: z
    .string()
    .default('86400000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(60000, 'DELAYED_REWARD_DELAY_MS 最小值为 60000（60秒）')),

  // ============================================
  // 速率限制配置
  // ============================================
  RATE_LIMIT_MAX: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  // ============================================
  // 日志配置
  // ============================================
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // ============================================
  // 监控配置
  // ============================================
  HEALTHCHECK_ENDPOINT: z.string().default('/health'),
  METRICS_ENDPOINT: z.string().optional(),

  // ============================================
  // Sentry 配置
  // ============================================
  SENTRY_DSN: z.string().url('SENTRY_DSN 必须是有效的 URL').optional(),
  APP_VERSION: z.string().optional(),

  // ============================================
  // Redis 配置（可选）
  // ============================================
  REDIS_URL: z.string().url('REDIS_URL 必须是有效的 URL').optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z
    .string()
    .default('6379')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(65535)),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().nonnegative().max(15, 'Redis DB 索引必须在 0-15 范围内')),

  // ============================================
  // 告警 Webhook 配置
  // ============================================
  ALERT_WEBHOOK_URL: z.string().url('ALERT_WEBHOOK_URL 必须是有效的 URL').optional(),
  SLACK_WEBHOOK_URL: z.string().url('SLACK_WEBHOOK_URL 必须是有效的 URL').optional(),

  // ============================================
  // AMAS Native 模块配置
  // ============================================
  AMAS_USE_NATIVE: z
    .string()
    .default('true')
    .transform((val) => val !== 'false'),

  // ============================================
  // 调试模式配置
  // ============================================
  DEBUG_MODE: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // ============================================
  // AMAS 遥测配置
  // ============================================
  AMAS_TELEMETRY_MODE: z.enum(['off', 'basic', 'detailed']).default('basic'),

  // ============================================
  // AMAS 数据可视化配置
  // ============================================
  AMAS_VISUALIZATION_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  AMAS_REAL_DATA_WRITE_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  AMAS_REAL_DATA_READ_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),

  // ============================================
  // LLM 顾问配置
  // ============================================
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'ollama', 'custom']).default('openai'),

  LLM_MODEL: z.string().optional(),

  LLM_API_KEY: z.string().optional(),

  LLM_BASE_URL: z.string().url('LLM_BASE_URL 必须是有效的 URL').optional(),

  LLM_TIMEOUT: z
    .string()
    .default('60000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  LLM_MAX_RETRIES: z
    .string()
    .default('2')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().nonnegative().max(5)),

  LLM_TEMPERATURE: z
    .string()
    .default('0.3')
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(0).max(2)),

  LLM_MAX_TOKENS: z
    .string()
    .default('4096')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  LLM_ADVISOR_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
});

/**
 * 环境变量类型
 */
export type Env = z.infer<typeof envSchema>;

/**
 * 验证并解析环境变量
 */
function validateEnv(): Env {
  try {
    const parsed = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
      TRUST_PROXY: process.env.TRUST_PROXY,
      WORKER_LEADER: process.env.WORKER_LEADER,
      DELAYED_REWARD_DELAY_MS: process.env.DELAYED_REWARD_DELAY_MS,
      RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
      LOG_LEVEL: process.env.LOG_LEVEL,
      HEALTHCHECK_ENDPOINT: process.env.HEALTHCHECK_ENDPOINT,
      METRICS_ENDPOINT: process.env.METRICS_ENDPOINT,
      SENTRY_DSN: process.env.SENTRY_DSN,
      APP_VERSION: process.env.APP_VERSION,
      REDIS_URL: process.env.REDIS_URL,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      REDIS_DB: process.env.REDIS_DB,
      // 告警配置
      ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL,
      SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
      // AMAS 配置
      AMAS_USE_NATIVE: process.env.AMAS_USE_NATIVE,
      DEBUG_MODE: process.env.DEBUG_MODE,
      AMAS_TELEMETRY_MODE: process.env.AMAS_TELEMETRY_MODE,
      AMAS_VISUALIZATION_ENABLED: process.env.AMAS_VISUALIZATION_ENABLED,
      AMAS_REAL_DATA_WRITE_ENABLED: process.env.AMAS_REAL_DATA_WRITE_ENABLED,
      AMAS_REAL_DATA_READ_ENABLED: process.env.AMAS_REAL_DATA_READ_ENABLED,
      // LLM 配置
      LLM_PROVIDER: process.env.LLM_PROVIDER,
      LLM_MODEL: process.env.LLM_MODEL,
      LLM_API_KEY: process.env.LLM_API_KEY,
      LLM_BASE_URL: process.env.LLM_BASE_URL,
      LLM_TIMEOUT: process.env.LLM_TIMEOUT,
      LLM_MAX_RETRIES: process.env.LLM_MAX_RETRIES,
      LLM_TEMPERATURE: process.env.LLM_TEMPERATURE,
      LLM_MAX_TOKENS: process.env.LLM_MAX_TOKENS,
      LLM_ADVISOR_ENABLED: process.env.LLM_ADVISOR_ENABLED,
    });

    // 开发环境警告
    if (parsed.NODE_ENV === 'development') {
      if (
        parsed.JWT_SECRET === 'default_secret_change_me' ||
        parsed.JWT_SECRET === 'dev_only_weak_secret_change_in_production'
      ) {
        startupLogger.warn('⚠️ 使用默认 JWT_SECRET，仅适用于开发环境');
        startupLogger.warn('⚠️ 生产环境部署前请务必修改为强随机字符串');
      }
    }

    // 生产环境检查
    if (parsed.NODE_ENV === 'production') {
      // 检查 Sentry 配置
      if (!parsed.SENTRY_DSN) {
        startupLogger.warn('⚠️ 生产环境未配置 SENTRY_DSN，错误追踪将不可用');
      }

      // 检查版本号
      if (!parsed.APP_VERSION) {
        startupLogger.warn('⚠️ 生产环境未配置 APP_VERSION，版本追踪将不可用');
      }

      // 检查 CORS 配置
      if (parsed.CORS_ORIGIN.includes('localhost')) {
        startupLogger.warn('⚠️ 生产环境使用了 localhost CORS 源，这可能是配置错误');
      }
    }

    startupLogger.info(`环境变量验证成功 (环境: ${parsed.NODE_ENV})`);
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      startupLogger.error('环境变量验证失败:');
      error.errors.forEach((err) => {
        startupLogger.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('环境变量配置错误，请检查 .env 文件');
    }
    throw error;
  }
}

/**
 * 导出验证后的环境变量
 *
 * @example
 * ```ts
 * import { env } from './config/env';
 *
 * console.log(`Server running on port ${env.PORT}`);
 * console.log(`JWT expires in ${env.JWT_EXPIRES_IN}`);
 * ```
 */
export const env = validateEnv();
