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
       * @default "500"
       */
      RATE_LIMIT_MAX?: string;

      /**
       * 速率限制窗口期时长（毫秒）
       * @default "900000"
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

      // ============================================
      // SQLite 热备配置
      // ============================================
      /**
       * SQLite 热备数据库文件路径
       * @default "./data/fallback.db"
       */
      SQLITE_FALLBACK_PATH?: string;

      /**
       * 是否启用 SQLite 热备
       * @default "false"
       */
      SQLITE_FALLBACK_ENABLED?: string;

      /**
       * 启动时是否执行全量同步
       * @default "true"
       */
      SQLITE_SYNC_ON_STARTUP?: string;

      /**
       * SQLite 日志模式
       * @default "WAL"
       */
      SQLITE_JOURNAL_MODE?: 'WAL' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'OFF';

      /**
       * SQLite 同步模式
       * @default "FULL"
       */
      SQLITE_SYNCHRONOUS?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';

      // ============================================
      // 故障切换配置
      // ============================================
      /**
       * 健康检查间隔（毫秒）
       * @default "5000"
       */
      DB_HEALTH_CHECK_INTERVAL_MS?: string;

      /**
       * 健康检查超时（毫秒）
       * @default "3000"
       */
      DB_HEALTH_CHECK_TIMEOUT_MS?: string;

      /**
       * 故障判定阈值（连续失败次数）
       * @default "3"
       */
      DB_FAILURE_THRESHOLD?: string;

      /**
       * 恢复判定阈值（连续成功次数）
       * @default "5"
       */
      DB_RECOVERY_THRESHOLD?: string;

      /**
       * 最小恢复间隔（毫秒）
       * @default "30000"
       */
      DB_MIN_RECOVERY_INTERVAL_MS?: string;

      // ============================================
      // Fencing 机制配置
      // ============================================
      /**
       * 是否启用 Fencing 机制（Redis 分布式锁）
       * @default "false"
       */
      DB_FENCING_ENABLED?: string;

      /**
       * Fencing 锁键名
       * @default "danci:db:write_lock"
       */
      DB_FENCING_LOCK_KEY?: string;

      /**
       * Fencing 锁过期时间（毫秒）
       * @default "30000"
       */
      DB_FENCING_LOCK_TTL_MS?: string;

      /**
       * Fencing 锁续租间隔（毫秒）
       * @default "10000"
       */
      DB_FENCING_RENEW_INTERVAL_MS?: string;

      /**
       * Redis 不可用时是否拒绝获取锁
       * - "true": 严格模式，拒绝获取锁（防止 Split-Brain）
       * - "false": 宽松模式，回退到单实例模式
       * @default "false"
       * @warning 多实例部署时建议设置为 "true"
       */
      DB_FENCING_FAIL_ON_REDIS_UNAVAILABLE?: string;

      // ============================================
      // 同步配置
      // ============================================
      /**
       * 同步批次大小
       * @default "100"
       */
      DB_SYNC_BATCH_SIZE?: string;

      /**
       * 同步重试次数
       * @default "3"
       */
      DB_SYNC_RETRY_COUNT?: string;

      /**
       * 冲突解决策略
       * @default "sqlite_wins"
       */
      DB_CONFLICT_STRATEGY?: 'sqlite_wins' | 'postgres_wins' | 'manual';

      // ============================================
      // Worker 和功能开关配置
      // ============================================
      /**
       * 是否启用遗忘预警 Worker
       * @default "false"
       */
      ENABLE_FORGETTING_ALERT_WORKER?: string;

      /**
       * 遗忘预警 Worker 的 cron 调度表达式
       * @default "0 * * * *" (每小时)
       */
      FORGETTING_ALERT_SCHEDULE?: string;

      /**
       * AMAS 是否使用原生实现
       * @default "false"
       */
      AMAS_USE_NATIVE?: string;

      /**
       * 调试模式
       * @default "false"
       */
      DEBUG_MODE?: string;

      /**
       * AMAS 遥测模式
       * @default "off"
       */
      AMAS_TELEMETRY_MODE?: string;

      /**
       * AMAS 可视化是否启用
       * @default "false"
       */
      AMAS_VISUALIZATION_ENABLED?: string;

      /**
       * AMAS 真实数据写入是否启用
       * @default "false"
       */
      AMAS_REAL_DATA_WRITE_ENABLED?: string;

      /**
       * AMAS 真实数据读取是否启用
       * @default "false"
       */
      AMAS_REAL_DATA_READ_ENABLED?: string;

      // ============================================
      // Webhook 通知配置
      // ============================================
      /**
       * 告警 Webhook URL
       */
      ALERT_WEBHOOK_URL?: string;

      /**
       * Slack Webhook URL
       */
      SLACK_WEBHOOK_URL?: string;

      // ============================================
      // LLM 配置
      // ============================================
      /**
       * LLM 提供商
       * @example "openai", "anthropic", "azure"
       */
      LLM_PROVIDER?: string;

      /**
       * LLM 模型名称
       * @example "gpt-4", "claude-3-opus"
       */
      LLM_MODEL?: string;

      /**
       * LLM API 密钥
       */
      LLM_API_KEY?: string;

      /**
       * LLM API 基础 URL
       */
      LLM_BASE_URL?: string;

      /**
       * LLM 请求超时时间（毫秒）
       * @default "30000"
       */
      LLM_TIMEOUT?: string;

      /**
       * LLM 最大重试次数
       * @default "3"
       */
      LLM_MAX_RETRIES?: string;

      /**
       * LLM 温度参数
       * @default "0.7"
       */
      LLM_TEMPERATURE?: string;

      /**
       * LLM 最大 Token 数
       * @default "4096"
       */
      LLM_MAX_TOKENS?: string;

      /**
       * 是否启用 LLM 顾问
       * @default "false"
       */
      LLM_ADVISOR_ENABLED?: string;
    }
  }
}

export {};
