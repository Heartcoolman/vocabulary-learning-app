/**
 * AMAS 公开展示 API 路由
 *
 * 提供无需认证的公开接口，用于展示 AMAS 引擎能力
 * - 模拟决策
 * - 统计概览
 * - 算法分布
 * - 状态分布
 * - 近期决策
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  aboutService,
  SimulateRequest,
  FaultInjectionRequest
} from '../services/about.service';
import { logger } from '../logger';

const router = Router();

/**
 * 统一错误响应处理
 */
function handleError(res: Response, error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : '未知错误';
  logger.error({ err: error }, `[About API] ${context}: ${message}`);

  res.status(500).json({
    success: false,
    error: `${context}: ${message}`
  });
}

// ==================== 速率限制 ====================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT = 30; // 30 请求
const RATE_WINDOW = 60 * 1000; // 1 分钟

/**
 * 简单的速率限制中间件
 */
function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT) {
    res.status(429).json({
      success: false,
      error: '请求过于频繁，请稍后再试',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000)
    });
    return;
  }

  next();
}

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000);

// ==================== 路由定义 ====================

/**
 * POST /api/about/simulate
 * 模拟一次 AMAS 决策过程
 */
router.post('/simulate', rateLimit, (req: Request, res: Response) => {
  try {
    const body = req.body;

    // 参数校验
    if (!body || typeof body !== 'object') {
      res.status(400).json({
        success: false,
        error: '请求体必须是有效的 JSON 对象'
      });
      return;
    }

    // 构建请求
    const input: SimulateRequest = {
      attention: parseFloat(body.attention) || 0.6,
      fatigue: parseFloat(body.fatigue) || 0.3,
      motivation: parseFloat(body.motivation) || 0,
      cognitive: {
        memory: parseFloat(body.cognitive?.memory) || 0.5,
        speed: parseFloat(body.cognitive?.speed) || 0.5,
        stability: parseFloat(body.cognitive?.stability) || 0.5
      },
      scenario: body.scenario
    };

    // 验证范围
    if (input.attention < 0 || input.attention > 1) {
      res.status(400).json({
        success: false,
        error: 'attention 必须在 [0, 1] 范围内'
      });
      return;
    }

    if (input.fatigue < 0 || input.fatigue > 1) {
      res.status(400).json({
        success: false,
        error: 'fatigue 必须在 [0, 1] 范围内'
      });
      return;
    }

    if (input.motivation < -1 || input.motivation > 1) {
      res.status(400).json({
        success: false,
        error: 'motivation 必须在 [-1, 1] 范围内'
      });
      return;
    }

    const result = aboutService.simulate(input);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    handleError(res, error, '模拟决策失败');
  }
});

/**
 * GET /api/about/stats/overview
 * 获取今日决策数、活跃用户数等概览统计
 */
router.get('/stats/overview', (_req: Request, res: Response) => {
  try {
    const stats = aboutService.getOverviewStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    handleError(res, error, '获取概览统计失败');
  }
});

/**
 * GET /api/about/stats/algorithm-distribution
 * 获取各算法贡献占比
 */
router.get('/stats/algorithm-distribution', (_req: Request, res: Response) => {
  try {
    const distribution = aboutService.getAlgorithmDistribution();
    res.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    handleError(res, error, '获取算法分布失败');
  }
});

/**
 * GET /api/about/stats/state-distribution
 * 获取用户状态分布
 */
router.get('/stats/state-distribution', (_req: Request, res: Response) => {
  try {
    const distribution = aboutService.getStateDistribution();
    res.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    handleError(res, error, '获取状态分布失败');
  }
});

/**
 * GET /api/about/stats/recent-decisions
 * 获取最近 50 条脱敏决策记录
 */
router.get('/stats/recent-decisions', (_req: Request, res: Response) => {
  try {
    const decisions = aboutService.getRecentDecisions();
    res.json({
      success: true,
      data: decisions
    });
  } catch (error) {
    handleError(res, error, '获取近期决策失败');
  }
});

// ==================== Pipeline 可视化 API ====================

/**
 * GET /api/about/pipeline/snapshot
 * 获取管道实时可视化快照
 */
router.get('/pipeline/snapshot', (_req: Request, res: Response) => {
  try {
    const snapshot = aboutService.getPipelineSnapshot();
    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    handleError(res, error, '获取管道快照失败');
  }
});

/**
 * GET /api/about/pipeline/trace/:packetId
 * 获取单个数据包的处理轨迹
 */
router.get('/pipeline/trace/:packetId', (req: Request, res: Response) => {
  try {
    const { packetId } = req.params;

    if (!packetId || typeof packetId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'packetId 参数无效'
      });
      return;
    }

    const trace = aboutService.getPacketTrace(packetId);
    res.json({
      success: true,
      data: trace
    });
  } catch (error) {
    handleError(res, error, '获取数据包轨迹失败');
  }
});

/**
 * POST /api/about/pipeline/inject-fault
 * 注入故障测试
 */
router.post('/pipeline/inject-fault', rateLimit, (req: Request, res: Response) => {
  try {
    const body = req.body;

    // 参数校验
    if (!body || typeof body !== 'object') {
      res.status(400).json({
        success: false,
        error: '请求体必须是有效的 JSON 对象'
      });
      return;
    }

    const validFaultTypes = ['high_fatigue', 'low_attention', 'anomaly'];
    if (!validFaultTypes.includes(body.faultType)) {
      res.status(400).json({
        success: false,
        error: `faultType 必须是以下值之一: ${validFaultTypes.join(', ')}`
      });
      return;
    }

    const request: FaultInjectionRequest = {
      faultType: body.faultType,
      intensity: typeof body.intensity === 'number'
        ? Math.max(0, Math.min(1, body.intensity))
        : undefined
    };

    const result = aboutService.injectFault(request);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    handleError(res, error, '故障注入失败');
  }
});

export default router;
