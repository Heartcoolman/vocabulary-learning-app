import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      validatedQuery?: Record<string, unknown>;
      validatedBody?: Record<string, unknown>;
      validatedParams?: Record<string, unknown>;
    }
  }
}

/**
 * 验证请求数据的中间件工厂
 * 支持验证 body、query、params
 */
export function validate(
  schema: ZodTypeAny,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      // 存储验证后的数据
      if (source === 'query') {
        req.validatedQuery = data as Record<string, unknown>;
      } else if (source === 'body') {
        req.validatedBody = data as Record<string, unknown>;
      } else {
        req.validatedParams = data as Record<string, unknown>;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: error.errors[0]?.message || '请求参数不合法',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * 验证查询参数的中间件
 */
export function validateQuery(schema: ZodTypeAny) {
  return validate(schema, 'query');
}

/**
 * 验证请求体的中间件
 */
export function validateBody(schema: ZodTypeAny) {
  return validate(schema, 'body');
}

/**
 * 验证路径参数的中间件
 */
export function validateParams(schema: ZodTypeAny) {
  return validate(schema, 'params');
}
