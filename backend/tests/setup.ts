import { config } from 'dotenv';
import { resolve } from 'path';

// 加载测试环境变量
config({ path: resolve(__dirname, '../.env.test') });
