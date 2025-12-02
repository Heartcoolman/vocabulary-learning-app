/**
 * AMAS 公开展示 API 路由
 *
 * 提供无需认证的公开接口，用于展示 AMAS 引擎能力
 * - 模拟决策
 * - 统计概览
 * - 算法分布
 * - 状态分布
 * - 近期决策
 *
 * 支持通过特性开关切换虚拟/真实数据源
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  aboutService,
  SimulateRequest,
  FaultInjectionRequest
} from '../services/about.service';
import { RealAboutService, createRealAboutService } from '../services/real-about.service';
import {
  useRealDataSource,
  useVirtualDataSource,
  getFeatureFlagsStatus,
  isDecisionWriteEnabled
} from '../config/amas-feature-flags';
import { getAllMetrics, getPrometheusMetrics } from '../monitoring/amas-metrics';
import { logger } from '../logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import { DecisionRecorderService } from '../amas/services/decision-recorder.service';
import { PipelineStageType, PipelineStageStatus } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const router = Router();

// 真实数据服务实例（惰性初始化）
let realAboutService: RealAboutService | null = null;
let decisionRecorder: DecisionRecorderService | null = null;

function getRealAboutService(): RealAboutService {
  if (!realAboutService) {
    realAboutService = createRealAboutService(prisma);
  }
  return realAboutService;
}

function getDecisionRecorder(): DecisionRecorderService {
  if (!decisionRecorder) {
    decisionRecorder = new DecisionRecorderService(prisma);
  }
  return decisionRecorder;
}

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

/**
 * 数据访问中间件：GET 路由公开访问，无论真实/虚拟数据源
 * 写入接口通过各自路由的 authMiddleware 单独保护
 */
function realDataProtection(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

// ==================== 路由定义 ====================

/**
 * POST /api/about/simulate
 * 模拟一次 AMAS 决策过程
 * 公开接口，用于演示系统决策能力
 */
router.post('/simulate', rateLimit, async (req: Request, res: Response) => {
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

    // 如果启用了写入，记录仿真决策到数据库
    if (isDecisionWriteEnabled()) {
      try {
        const decisionId = createId();
        const now = new Date();

        const memberVotes =
          result.decisionProcess.votes && Object.keys(result.decisionProcess.votes).length > 0
            ? { ...result.decisionProcess.votes }
            : undefined;

        await getDecisionRecorder().record({
          decisionId,
          timestamp: now,
          decisionSource: result.decisionProcess.decisionSource,
          coldstartPhase: result.decisionProcess.phase,
          weightsSnapshot: { ...result.decisionProcess.weights },
          memberVotes,
          selectedAction: { ...result.outputStrategy },
          confidence: result.inputState.conf,
          reward: undefined,
          isSimulation: true,
          traceVersion: 1,
          totalDurationMs: undefined,
          stages: [
            {
              stage: 'PERCEPTION' as PipelineStageType,
              stageName: '感知层',
              status: 'SUCCESS' as PipelineStageStatus,
              startedAt: now,
              endedAt: now,
              durationMs: 0,
              inputSummary: { rawInput: input },
              outputSummary: { state: result.inputState }
            },
            {
              stage: 'MODELING' as PipelineStageType,
              stageName: '建模层',
              status: 'SKIPPED' as PipelineStageStatus,
              startedAt: now,
              endedAt: now,
              durationMs: 0,
              inputSummary: { state: result.inputState },
              outputSummary: { reason: '模拟模式跳过认知建模' }
            },
            {
              stage: 'LEARNING' as PipelineStageType,
              stageName: '学习层',
              status: 'SKIPPED' as PipelineStageStatus,
              startedAt: now,
              endedAt: now,
              durationMs: 0,
              inputSummary: { weights: result.decisionProcess.weights },
              outputSummary: { reason: '模拟模式跳过在线学习' }
            },
            {
              stage: 'DECISION' as PipelineStageType,
              stageName: '决策层',
              status: 'SUCCESS' as PipelineStageStatus,
              startedAt: now,
              endedAt: now,
              durationMs: 0,
              inputSummary: { state: result.inputState },
              outputSummary: { strategy: result.outputStrategy }
            },
            {
              stage: 'EVALUATION' as PipelineStageType,
              stageName: '评估层',
              status: 'SKIPPED' as PipelineStageStatus,
              startedAt: now,
              endedAt: now,
              durationMs: 0,
              inputSummary: { strategy: result.outputStrategy },
              outputSummary: { reason: '模拟模式无延迟奖励' }
            },
            {
              stage: 'OPTIMIZATION' as PipelineStageType,
              stageName: '优化层',
              status: 'SKIPPED' as PipelineStageStatus,
              startedAt: now,
              endedAt: now,
              durationMs: 0,
              inputSummary: {},
              outputSummary: { reason: '模拟模式跳过参数优化' }
            }
          ]
        });
      } catch (recordError) {
        logger.warn({ err: recordError }, '[Simulate] Failed to record simulation decision');
      }
    }

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
router.get('/stats/overview', realDataProtection, async (_req: Request, res: Response) => {
  try {
    let stats;

    if (useRealDataSource()) {
      stats = await getRealAboutService().getOverviewStats();
    } else {
      stats = aboutService.getOverviewStats();
    }

    res.json({
      success: true,
      data: stats,
      source: useRealDataSource() ? 'real' : 'virtual'
    });
  } catch (error) {
    handleError(res, error, '获取概览统计失败');
  }
});

/**
 * GET /api/about/stats/algorithm-distribution
 * 获取各算法贡献占比
 */
router.get('/stats/algorithm-distribution', realDataProtection, async (_req: Request, res: Response) => {
  try {
    let distribution;

    if (useRealDataSource()) {
      distribution = await getRealAboutService().getAlgorithmDistribution();
    } else {
      distribution = aboutService.getAlgorithmDistribution();
    }

    res.json({
      success: true,
      data: distribution,
      source: useRealDataSource() ? 'real' : 'virtual'
    });
  } catch (error) {
    handleError(res, error, '获取算法分布失败');
  }
});

/**
 * GET /api/about/stats/state-distribution
 * 获取用户状态分布
 */
router.get('/stats/state-distribution', realDataProtection, async (_req: Request, res: Response) => {
  try {
    let distribution;

    if (useRealDataSource()) {
      distribution = await getRealAboutService().getStateDistribution();
    } else {
      distribution = aboutService.getStateDistribution();
    }

    res.json({
      success: true,
      data: distribution,
      source: useRealDataSource() ? 'real' : 'virtual'
    });
  } catch (error) {
    handleError(res, error, '获取状态分布失败');
  }
});

/**
 * GET /api/about/stats/recent-decisions
 * 获取最近决策记录
 * 查询参数: ?mixed=true 同时返回真实和模拟数据
 */
router.get('/stats/recent-decisions', realDataProtection, async (req: Request, res: Response) => {
  try {
    const includeMixed = req.query.mixed === 'true';

    if (includeMixed && useRealDataSource()) {
      // 混合模式：同时返回真实和模拟数据
      const [realDecisions, virtualDecisions] = await Promise.all([
        getRealAboutService().getRecentDecisions(),
        Promise.resolve(aboutService.getRecentDecisions())
      ]);

      res.json({
        success: true,
        data: {
          real: realDecisions,
          virtual: virtualDecisions
        },
        source: 'mixed'
      });
    } else if (useRealDataSource()) {
      const decisions = await getRealAboutService().getRecentDecisions();
      res.json({
        success: true,
        data: decisions,
        source: 'real'
      });
    } else {
      const decisions = aboutService.getRecentDecisions();
      res.json({
        success: true,
        data: decisions,
        source: 'virtual'
      });
    }
  } catch (error) {
    handleError(res, error, '获取近期决策失败');
  }
});

/**
 * GET /api/about/decision/:decisionId
 * 获取决策详情
 * 查询参数: ?source=virtual 获取模拟数据详情
 */
router.get('/decision/:decisionId', realDataProtection, async (req: Request, res: Response) => {
  try {
    const { decisionId } = req.params;
    const source = req.query.source as string | undefined;

    if (!decisionId || typeof decisionId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'decisionId 参数无效'
      });
      return;
    }

    // 如果请求虚拟数据详情
    if (source === 'virtual') {
      const detail = aboutService.getDecisionDetail(decisionId);
      if (!detail) {
        res.status(404).json({
          success: false,
          error: '未找到指定模拟决策'
        });
        return;
      }
      res.json({
        success: true,
        data: detail,
        source: 'virtual'
      });
      return;
    }

    // 真实数据需要启用真实数据源
    if (!useRealDataSource()) {
      res.status(400).json({
        success: false,
        error: '真实决策详情需要启用真实数据源'
      });
      return;
    }

    const detail = await getRealAboutService().getDecisionDetail(decisionId);

    if (!detail) {
      res.status(404).json({
        success: false,
        error: '未找到指定决策'
      });
      return;
    }

    res.json({
      success: true,
      data: detail,
      source: 'real'
    });
  } catch (error) {
    handleError(res, error, '获取决策详情失败');
  }
});

// ==================== Pipeline 可视化 API ====================

/**
 * GET /api/about/pipeline/snapshot
 * 获取管道实时可视化快照
 */
router.get('/pipeline/snapshot', realDataProtection, async (_req: Request, res: Response) => {
  try {
    let snapshot;

    if (useRealDataSource()) {
      snapshot = await getRealAboutService().getPipelineSnapshot();
    } else {
      snapshot = aboutService.getPipelineSnapshot();
    }

    res.json({
      success: true,
      data: snapshot,
      source: useRealDataSource() ? 'real' : 'virtual'
    });
  } catch (error) {
    handleError(res, error, '获取管道快照失败');
  }
});

/**
 * GET /api/about/pipeline/trace/:packetId
 * 获取单个数据包的处理轨迹
 */
router.get('/pipeline/trace/:packetId', realDataProtection, async (req: Request, res: Response) => {
  try {
    const { packetId } = req.params;

    if (!packetId || typeof packetId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'packetId 参数无效'
      });
      return;
    }

    let trace;

    if (useRealDataSource()) {
      trace = await getRealAboutService().getPacketTrace(packetId);
    } else {
      trace = aboutService.getPacketTrace(packetId);
    }

    res.json({
      success: true,
      data: trace,
      source: useRealDataSource() ? 'real' : 'virtual'
    });
  } catch (error) {
    handleError(res, error, '获取数据包轨迹失败');
  }
});

/**
 * POST /api/about/pipeline/inject-fault
 * 注入故障测试
 * 需要管理员权限（安全敏感操作）
 */
router.post('/pipeline/inject-fault', authMiddleware, adminMiddleware, rateLimit, (req: AuthRequest, res: Response) => {
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

// ==================== 监控与诊断 API ====================

/**
 * GET /api/about/metrics
 * 获取 AMAS 决策流水线监控指标（JSON 格式）
 */
router.get('/metrics', realDataProtection, (_req: Request, res: Response) => {
  try {
    const metrics = getAllMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    handleError(res, error, '获取监控指标失败');
  }
});

/**
 * GET /api/about/metrics/prometheus
 * 获取 Prometheus 格式的监控指标
 */
router.get('/metrics/prometheus', realDataProtection, (_req: Request, res: Response) => {
  try {
    const metrics = getPrometheusMetrics();
    res.type('text/plain').send(metrics);
  } catch (error) {
    handleError(res, error, '获取 Prometheus 指标失败');
  }
});

/**
 * GET /api/about/feature-flags
 * 获取当前特性开关状态
 */
router.get('/feature-flags', realDataProtection, (_req: Request, res: Response) => {
  try {
    const flags = getFeatureFlagsStatus();
    res.json({
      success: true,
      data: flags
    });
  } catch (error) {
    handleError(res, error, '获取特性开关状态失败');
  }
});

/**
 * GET /api/about/health
 * 健康检查端点 (需要登录)
 * - 普通用户: 只返回基本状态
 * - 管理员: 返回详细诊断信息
 */
router.get('/health', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';

    // 检查数据库连接
    let dbHealthy = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const basicInfo = {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString()
    };

    // 管理员可见详细信息
    if (isAdmin) {
      const flags = getFeatureFlagsStatus();
      res.json({
        success: true,
        data: {
          ...basicInfo,
          database: dbHealthy ? 'connected' : 'disconnected',
          dataSource: useRealDataSource() ? 'real' : 'virtual',
          features: {
            writeEnabled: flags.writeEnabled,
            readEnabled: flags.readEnabled
          }
        }
      });
    } else {
      // 普通用户只看到基本状态
      res.json({
        success: true,
        data: basicInfo
      });
    }
  } catch (error) {
    handleError(res, error, '健康检查失败');
  }
});

export default router;
