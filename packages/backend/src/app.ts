import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { httpLoggerMiddleware } from './logger/http';
import { logger } from './logger';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import wordRoutes from './routes/word.routes';
import wordBookRoutes from './routes/wordbook.routes';
import studyConfigRoutes from './routes/study-config.routes';
import adminRoutes from './routes/admin.routes';
import recordRoutes from './routes/record.routes';
import wordStateRoutes from './routes/word-state.routes';
import wordScoreRoutes from './routes/word-score.routes';
import algorithmConfigRoutes from './routes/algorithm-config.routes';
import amasRoutes from './routes/amas.routes';
import timeRecommendRoutes from './routes/time-recommend.routes';
import trendAnalysisRoutes from './routes/trend-analysis.routes';
import badgeRoutes from './routes/badge.routes';
import planRoutes from './routes/plan.routes';
import stateHistoryRoutes from './routes/state-history.routes';
import habitProfileRoutes from './routes/habit-profile.routes';
import evaluationRoutes from './routes/evaluation.routes';
import optimizationRoutes from './routes/optimization.routes';
import aboutRoutes from './routes/about.routes';
import wordMasteryRoutes from './routes/word-mastery.routes';
import learningRoutes from './routes/learning.routes';
import amasExplainRoutes from './routes/amas-explain.routes';
import alertsRoutes from './routes/alerts.routes';
import profileRoutes from './routes/profile.routes';
import learningObjectivesRoutes from './routes/learning-objectives.routes';
import logsRoutes from './routes/logs.routes';
import logViewerRoutes from './routes/log-viewer.routes';
import llmAdvisorRoutes from './routes/llm-advisor.routes';
import experimentRoutes from './routes/experiment.routes';
import trackingRoutes from './routes/tracking.routes';
import healthRoutes from './routes/health.routes';
import notificationRoutes from './routes/notification.routes';
import preferenceRoutes from './routes/preference.routes';
import learningSessionRoutes from './routes/learning-session.routes';
import wordContextRoutes from './routes/word-context.routes';
import v1Routes from './routes/v1';
import { createDeprecationWarning } from './middleware/deprecation.middleware';
import visualFatigueRoutes from './routes/visual-fatigue.routes';
import debugRoutes from './routes/debug.routes';
import contentEnhanceRoutes from './routes/content-enhance.routes';
import opsEnhanceRoutes from './routes/ops-enhance.routes';
import { csrfTokenMiddleware, csrfValidationMiddleware } from './middleware/csrf.middleware';

const app = express();

// 反向代理配置：仅在明确配置且受控反代后面时启用
// 攻击者可伪造 X-Forwarded-For 绕过限流，因此默认禁用
if (env.TRUST_PROXY !== false) {
  // TRUST_PROXY 已在 env.ts 中转换为 number | string | false
  // number: 直接使用 (跳过的代理数量)
  // string: 转换为数字或传递给 express (如 'loopback', 'linklocal' 等)
  const proxyValue =
    typeof env.TRUST_PROXY === 'number'
      ? env.TRUST_PROXY
      : parseInt(String(env.TRUST_PROXY), 10) || env.TRUST_PROXY;
  if (proxyValue) {
    app.set('trust proxy', proxyValue);
    logger.info({ trustProxy: proxyValue }, 'Trust proxy enabled');
  }
}

// 请求日志 - 前置以捕获所有请求（包括解析失败的请求）
// 注入 requestId 并启用结构化日志
app.use(httpLoggerMiddleware);

// 安全中间件 - 配置严格的安全头
app.use(
  helmet({
    // 内容安全策略
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // 移除 'unsafe-inline' 以加强 XSS 防护
        // 如果前端使用 CSS-in-JS，需要配置 nonce 或 hash
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        // 限定 connectSrc 为受控白名单
        connectSrc: ["'self'", env.CORS_ORIGIN].filter(Boolean),
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        // 禁止在 base 标签中使用外部 URI
        baseUri: ["'self'"],
        // 禁止表单提交到外部地址
        formAction: ["'self'"],
      },
    },
    // 跨域嵌入策略
    crossOriginEmbedderPolicy: false, // 允许加载跨域资源
    // 引用策略
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // HSTS
    hsts: {
      maxAge: 31536000, // 1年
      includeSubDomains: true,
      preload: true,
    },
  }),
);

// CORS配置
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-ID',
      'X-CSRF-Token',
    ],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24小时预检请求缓存
  }),
);

// 速率限制（测试环境禁用）
if (env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 500, // 限制500个请求（从100放宽到500）
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试',
        code: 'TOO_MANY_REQUESTS',
      });
    },
  });
  app.use('/api/', limiter);

  // 针对登录/注册的更严格限流，缓解暴力破解
  const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 30, // 限制30个请求
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: '认证请求过于频繁，请稍后再试',
        code: 'TOO_MANY_AUTH_REQUESTS',
      });
    },
  });
  app.use('/api/auth', authLimiter);
}

// Cookie 解析（用于 HttpOnly Cookie 认证）
app.use(cookieParser());

// CSRF 防护中间件
// csrfTokenMiddleware: 设置 CSRF cookie
// csrfValidationMiddleware: 验证 POST/PUT/DELETE/PATCH 请求的 CSRF token
app.use(csrfTokenMiddleware);
app.use('/api', csrfValidationMiddleware);

// 解析JSON并限制请求体大小（防止大包攻击）
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// HTTP 请求监控（采样）
if (env.NODE_ENV !== 'test') {
  const { metricsMiddleware } = require('./middleware/metrics.middleware');
  app.use(metricsMiddleware);
}

// 健康检查（包含数据库连接验证）
// 兼容性: 该端点由 healthRoutes 统一提供（GET /health）

// v1 版本化 API 路由（推荐使用）
app.use('/api/v1', v1Routes);

// 旧版 API 路由 - 添加废弃警告
// 这些路由将在 v1 版本化 API 完全稳定后逐步废弃
// 2026年6月30日为计划下线时间

// 认证路由 - 已迁移到 /api/v1/auth
app.use('/api/auth', createDeprecationWarning('/api/v1/auth', new Date('2026-06-30')), authRoutes);

// 用户路由 - 已迁移到 /api/v1/users
app.use(
  '/api/users',
  createDeprecationWarning('/api/v1/users', new Date('2026-06-30')),
  userRoutes,
);

// 单词路由 - 已迁移到 /api/v1/words
app.use(
  '/api/words',
  createDeprecationWarning('/api/v1/words', new Date('2026-06-30')),
  wordRoutes,
);

// 学习路由 - 已迁移到 /api/v1/learning
app.use(
  '/api/learning',
  createDeprecationWarning('/api/v1/learning', new Date('2026-06-30')),
  learningRoutes,
);

// 答题记录路由 - 已迁移到 /api/v1/learning/records
app.use(
  '/api/records',
  createDeprecationWarning('/api/v1/learning/records', new Date('2026-06-30')),
  recordRoutes,
);

// 单词状态路由 - 已迁移到 /api/v1/learning（部分功能整合）
app.use(
  '/api/word-states',
  createDeprecationWarning('/api/v1/learning', new Date('2026-06-30')),
  wordStateRoutes,
);

// 单词分数路由 - 已迁移到 /api/v1/learning（部分功能整合）
app.use(
  '/api/word-scores',
  createDeprecationWarning('/api/v1/learning', new Date('2026-06-30')),
  wordScoreRoutes,
);

// 未迁移的路由（暂不添加废弃警告）
app.use('/api/wordbooks', wordBookRoutes);
app.use('/api/study-config', studyConfigRoutes);
app.use('/api/admin', adminRoutes);

// 其他未迁移的功能路由
app.use('/api/algorithm-config', algorithmConfigRoutes);
app.use('/api/amas', amasRoutes);
app.use('/api/amas', timeRecommendRoutes);
app.use('/api/amas', trendAnalysisRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/amas', stateHistoryRoutes);
app.use('/api/habit-profile', habitProfileRoutes);
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/optimization', optimizationRoutes);
app.use('/api/about', aboutRoutes);
app.use('/api/word-mastery', wordMasteryRoutes);
app.use('/api/amas', amasExplainRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/learning-objectives', learningObjectivesRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/admin/logs', logViewerRoutes);
app.use('/api/llm-advisor', llmAdvisorRoutes);
app.use('/api/users/profile', profileRoutes);
app.use('/api/experiments', experimentRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/preferences', preferenceRoutes);
app.use('/api/learning-sessions', learningSessionRoutes);
app.use('/api/word-contexts', wordContextRoutes);
app.use('/api/visual-fatigue', visualFatigueRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/admin/content', contentEnhanceRoutes);
app.use('/api/admin/ops', opsEnhanceRoutes);

// 健康检查路由（独立于 /api 路径，便于负载均衡器访问）
app.use('/health', healthRoutes);

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在',
    code: 'NOT_FOUND',
  });
});

// 错误处理
app.use(errorHandler);

export default app;
