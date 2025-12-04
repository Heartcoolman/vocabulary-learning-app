import { Request, Response, NextFunction } from 'express';
import { routeLogger } from '../logger';

export function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  (req as any).startTime = start;

  res.on('finish', () => {
    const duration = Date.now() - start;
    routeLogger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration
    }, 'HTTP 请求');
  });

  next();
}
