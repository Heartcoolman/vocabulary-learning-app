/**
 * Express 类型扩展
 *
 * 扩展 Express.Request 以支持:
 * - requestId: 请求唯一标识
 * - log: pino 日志器实例
 */

import { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      /** 请求唯一标识，由日志中间件注入 */
      id?: string;
      /** pino 日志器实例，由 pino-http 中间件注入 */
      log?: Logger;
    }
  }
}

export {};
