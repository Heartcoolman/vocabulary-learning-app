import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { loggerMiddleware } from './middleware/logger.middleware';
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


const app = express();

// 反向代理场景下启用真实 IP，保证限流/日志准确
app.set('trust proxy', 1);

// 安全中间件 - 配置严格的安全头
app.use(
  helmet({
    // 内容安全策略
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", env.CORS_ORIGIN], // 允许前端访问API
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
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
  })
);

// 速率限制
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

// 解析JSON并限制请求体大小（防止大包攻击）
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// 请求日志
app.use(loggerMiddleware);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
