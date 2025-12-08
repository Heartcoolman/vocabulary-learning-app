/**
 * Express相关类型定义
 * 这些类型专门用于Backend，但定义在shared中便于类型一致性
 */

import { Request } from 'express';
import { AuthUser } from './user';

/**
 * 认证请求 - 扩展Express Request
 */
export interface AuthRequest extends Request {
  user?: AuthUser;
}
