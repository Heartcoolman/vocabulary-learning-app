/**
 * 后端环境变量类型定义
 * 用于提供 process.env 的类型安全访问
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // ============================================
      // 数据库配置
      // ============================================
      /**
       * PostgreSQL 数据库连接字符串
       * @example "postgresql://user:password@localhost:5432/vocab_db"
       */
      DATABASE_URL: string;

      // ============================================
      // JWT 配置
      // ============================================
      /**
       * JWT 签名密钥
       * 生产环境必须设置强随机字符串
       */
      JWT_SECRET: string;

      /**
       * JWT 过期时间
       * @default "24h"
       * @example "24h", "7d", "30d"
       */
      JWT_EXPIRES_IN?: string;

      // ============================================
      // 服务器配置
      // ============================================
      /**
       * 服务器监听端口
       * @default "3000"
       */
      PORT?: string;

      /**
       * 运行环境
       * @default "development"
       */
      NODE_ENV?: 'development' | 'production' | 'test';

      // ============================================
      // CORS 配置
      // ============================================
      /**
       * 允许的跨域源
       * @default "http://localhost:5173"
       * @example "http://localhost:5173" 或 "https://example.com"
       */
      CORS_ORIGIN?: string;

      // ============================================
      // 反向代理配置
      // ============================================
      /**
       * 信任代理设置
       * 仅在受控反代后面时启用，设为代理层数(如"1")或"false"禁用
       * @default "false"
       * @warning 错误配置会导致攻击者伪造IP绕过限流
       */
      TRUST_PROXY?: string;

      // ============================================
      // Worker 配置（多实例部署）
      // ============================================
      /**
       * 是否为主节点
       * 仅主节点运行 cron 任务，多实例部署时仅一个实例设为 true
       * @default "false"
       */
      WORKER_LEADER?: string;

      // ============================================
      // AMAS 算法配置
      // ============================================
      /**
       * 延迟奖励默认延迟时间（毫秒）
       * @default "86400000"
       * @minimum 60000（60秒）
       */
      DELAYED_REWARD_DELAY_MS?: string;

      AMAS_DECISION_TIMEOUT_MS?: string;

      // ============================================
      // 速率限制配置
      // ============================================
      /**
       * 每个窗口期内的最大请求数
       * @default "100"
       */
      RATE_LIMIT_MAX?: string;

      /**
       * 速率限制窗口期时长（毫秒）
       * @default "60000"
       */
      RATE_LIMIT_WINDOW_MS?: string;

      // ============================================
      // 日志配置
      // ============================================
      /**
       * 日志级别
       * @default "info"
       */
      LOG_LEVEL?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

      // ============================================
      // 监控配置
      // ============================================
      /**
       * 健康检查端点
       * @default "/health"
       */
      HEALTHCHECK_ENDPOINT?: string;

      /**
       * 指标端点（如果启用）
       */
      METRICS_ENDPOINT?: string;

      // ============================================
      // Sentry 错误追踪配置
      // ============================================
      /**
       * Sentry DSN（可选）
       * @example "https://xxxx@xxxx.ingest.sentry.io/xxxx"
       */
      SENTRY_DSN?: string;

      /**
       * 应用版本号（可选）
       * 用于 Sentry release 追踪
       * @example "1.0.0"
       */
      APP_VERSION?: string;

      // ============================================
      // Redis 配置（可选）
      // ============================================
      /**
       * Redis 连接 URL（可选）
       * @example "redis://localhost:6379"
       */
      REDIS_URL?: string;

      /**
       * Redis 主机地址（可选）
       * @default "localhost"
       */
      REDIS_HOST?: string;

      /**
       * Redis 端口（可选）
       * @default "6379"
       */
      REDIS_PORT?: string;

      /**
       * Redis 密码（可选）
       */
      REDIS_PASSWORD?: string;

      /**
       * Redis 数据库索引（可选）
       * @default "0"
       */
      REDIS_DB?: string;
    }
  }
}

export {};
