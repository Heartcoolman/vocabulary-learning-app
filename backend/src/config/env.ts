import { config } from 'dotenv';

config();

// 验证必需的环境变量
const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 生产环境强制要求配置 JWT_SECRET
if (NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET === 'default_secret_change_me')) {
  console.error('❌ 安全错误：生产环境必须配置强随机 JWT_SECRET');
  console.error('请在 .env 文件中设置: JWT_SECRET=<your_strong_random_secret>');
  process.exit(1);
}

// 开发环境警告弱密钥
if (NODE_ENV === 'development' && (!JWT_SECRET || JWT_SECRET === 'default_secret_change_me')) {
  console.warn('⚠️  警告：使用默认 JWT_SECRET，仅适用于开发环境');
  console.warn('生产环境部署前请务必修改为强随机字符串');
}

export const env = {
  PORT: process.env.PORT || '3000',
  NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: JWT_SECRET || 'dev_only_weak_secret_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
