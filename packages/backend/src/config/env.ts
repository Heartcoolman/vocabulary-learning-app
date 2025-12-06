import { config } from 'dotenv';
import { startupLogger } from '../logger';

config();

// 验证必需的环境变量
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 强制要求配置 DATABASE_URL
if (!DATABASE_URL) {
  startupLogger.error('配置错误：DATABASE_URL 环境变量未设置');
  startupLogger.error('请在 .env 文件中设置: DATABASE_URL=postgresql://user:password@host:port/dbname');
  process.exit(1);
}

// 生产环境强制要求配置 JWT_SECRET
if (NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET === 'default_secret_change_me')) {
  startupLogger.error('安全错误：生产环境必须配置强随机 JWT_SECRET');
  startupLogger.error('请在 .env 文件中设置: JWT_SECRET=<your_strong_random_secret>');
  process.exit(1);
}

// 开发环境警告弱密钥
if (NODE_ENV === 'development' && (!JWT_SECRET || JWT_SECRET === 'default_secret_change_me')) {
  startupLogger.warn('警告：使用默认 JWT_SECRET，仅适用于开发环境');
  startupLogger.warn('生产环境部署前请务必修改为强随机字符串');
}

export const env = {
  PORT: process.env.PORT || '3000',
  NODE_ENV,
  DATABASE_URL,
  JWT_SECRET: JWT_SECRET || 'dev_only_weak_secret_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // 反向代理配置：仅在受控反代后面时启用，设为代理层数(如1)或false禁用
  TRUST_PROXY: process.env.TRUST_PROXY || 'false',
  // Worker主节点标识：多实例部署时仅主节点运行cron任务
  WORKER_LEADER: process.env.WORKER_LEADER === 'true',
};
