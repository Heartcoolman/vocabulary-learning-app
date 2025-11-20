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
import recordRoutes from './routes/record.routes';

const app = express();

// 安全中间件
app.use(helmet());

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
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: '请求过于频繁，请稍后再试',
      code: 'TOO_MANY_REQUESTS'
    });
  },
});
app.use('/api/', limiter);

// 解析JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/records', recordRoutes);

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
