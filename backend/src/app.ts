import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { httpLoggerMiddleware } from './logger/http';
import { logger } from './logger';
import { errorHandler } from './middleware/error.middleware';
import prisma from './config/database';
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


const app = express();

// 反向代理配置：仅在明确配置且受控反代后面时启用
// 攻击者可伪造 X-Forwarded-For 绕过限流，因此默认禁用
if (env.TRUST_PROXY && env.TRUST_PROXY !== 'false') {
  const proxyValue = env.TRUST_PROXY === 'true' ? 1 : parseInt(env.TRUST_PROXY, 10) || false;
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
  })
);

// CORS配置
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24小时预检请求缓存
  })
);

// 速率限制（测试环境禁用）
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 500, // 限制500个请求（从100放宽到500）
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试',
        code: 'TOO_MANY_REQUESTS'
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
        code: 'TOO_MANY_AUTH_REQUESTS'
      });
    },
  });
  app.use('/api/auth', authLimiter);
}

// 解析JSON并限制请求体大小（防止大包攻击）
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// HTTP 请求监控（采样）
if (process.env.NODE_ENV !== 'test') {
  const { metricsMiddleware } = require('./middleware/metrics.middleware');
  app.use(metricsMiddleware);
}

// 健康检查（包含数据库连接验证）
app.get('/health', async (req, res) => {
  const checks: { database: string; timestamp: string; status: string } = {
    database: 'unknown',
    timestamp: new Date().toISOString(),
    status: 'ok'
  };

  try {
    // 验证数据库连接和基本查询能力
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'connected';
  } catch (error) {
    checks.database = 'disconnected';
    checks.status = 'degraded';
    logger.error({ err: error }, '健康检查：数据库连接失败');
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/words', wordRoutes);
app.use('/api/wordbooks', wordBookRoutes);
app.use('/api/study-config', studyConfigRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/word-states', wordStateRoutes);
app.use('/api/word-scores', wordScoreRoutes);
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
app.use('/api/learning', learningRoutes);
app.use('/api/amas', amasExplainRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/learning-objectives', learningObjectivesRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/admin/logs', logViewerRoutes);
app.use('/api/llm-advisor', llmAdvisorRoutes);
app.use('/api/users/profile', profileRoutes);


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
