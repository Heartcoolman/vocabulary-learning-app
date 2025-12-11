/**
 * 系统调试路由
 * 提供调试控制面板API
 *
 * 安全限制：
 * - 仅在非生产环境或DEBUG_MODE=true时可用
 * - 仅ADMIN角色可访问
 */

import { Router, Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { debugService } from '../services/debug.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { FallbackReason } from '../amas/decision/fallback';
import { AMASFeatureFlags } from '../amas/config/feature-flags';
import { ServicesDebugConfig } from '../config/debug-config';
import { logger } from '../logger';

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
  };
}

const router = Router();

// ==================== 中间件 ====================

/**
 * 调试模式检查中间件
 */
function debugModeCheck(req: Request, res: Response, next: NextFunction): void {
  if (!debugService.isAvailable()) {
    res.status(403).json({
      success: false,
      error: '调试模式未启用，仅在开发/测试环境可用',
    });
    return;
  }
  next();
}

/**
 * 管理员权限检查中间件
 */
function adminCheck(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({
      success: false,
      error: '需要管理员权限',
    });
    return;
  }
  next();
}

// 应用全局中间件
router.use(authMiddleware);
router.use(debugModeCheck);
router.use(adminCheck);

// ==================== 状态查询 ====================

/**
 * GET /api/debug/status
 * 获取系统状态概览
 */
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const status = await debugService.getSystemStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to get system status');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/debug/health
 * 健康检查
 */
router.get('/health', async (req: AuthRequest, res: Response) => {
  try {
    const health = await debugService.healthCheck();
    res.json({ success: true, data: health });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Health check failed');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== 基础设施控制 ====================

/**
 * POST /api/debug/redis/toggle
 * 切换Redis缓存开关
 */
router.post('/redis/toggle', (req: AuthRequest, res: Response) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'enabled must be a boolean' });
      return;
    }
    debugService.toggleRedis(enabled, req.user?.id);
    res.json({ success: true, data: { enabled } });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to toggle Redis');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/db/simulate
 * 配置数据库模拟
 */
router.post('/db/simulate', (req: AuthRequest, res: Response) => {
  try {
    const options = req.body as {
      simulateSlowQuery?: boolean;
      slowQueryDelayMs?: number;
      simulateConnectionFailure?: boolean;
    };
    debugService.configureDbSimulation(options, req.user?.id);
    res.json({ success: true, data: options });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to configure DB simulation');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/llm/toggle
 * 切换LLM服务配置
 */
router.post('/llm/toggle', (req: AuthRequest, res: Response) => {
  try {
    const options = req.body as { enabled?: boolean; mockResponse?: boolean };
    debugService.toggleLlm(options, req.user?.id);
    res.json({ success: true, data: options });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to toggle LLM');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== AMAS控制 ====================

/**
 * GET /api/debug/amas/feature-flags
 * 获取AMAS功能开关
 */
router.get('/amas/feature-flags', (req: AuthRequest, res: Response) => {
  try {
    const flags = debugService.getAmasFeatureFlags();
    res.json({ success: true, data: flags });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to get feature flags');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/amas/feature-flags
 * 更新AMAS功能开关
 */
router.post('/amas/feature-flags', (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body as Partial<AMASFeatureFlags>;
    const result = debugService.updateAmasFeatureFlags(updates, req.user?.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to update feature flags');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/amas/feature-flags/reset
 * 重置AMAS功能开关
 */
router.post('/amas/feature-flags/reset', (req: AuthRequest, res: Response) => {
  try {
    const result = debugService.resetAmasFeatureFlags(req.user?.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to reset feature flags');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/amas/circuit/open
 * 强制打开熔断器
 */
router.post('/amas/circuit/open', (req: AuthRequest, res: Response) => {
  try {
    debugService.forceCircuitOpen(req.user?.id);
    res.json({ success: true, message: '熔断器已强制打开' });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to force circuit open');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/amas/circuit/reset
 * 重置熔断器
 */
router.post('/amas/circuit/reset', (req: AuthRequest, res: Response) => {
  try {
    debugService.resetCircuit(req.user?.id);
    res.json({ success: true, message: '熔断器已重置' });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to reset circuit');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/amas/fallback/test
 * 测试降级策略
 */
router.post('/amas/fallback/test', async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body as { reason: FallbackReason };
    const validReasons: FallbackReason[] = [
      'circuit_open',
      'timeout',
      'exception',
      'missing_features',
      'model_unavailable',
      'degraded_state',
    ];
    if (!validReasons.includes(reason)) {
      res.status(400).json({
        success: false,
        error: `Invalid reason. Must be one of: ${validReasons.join(', ')}`,
      });
      return;
    }
    const result = await debugService.testFallback(reason, req.user?.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to test fallback');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/amas/fallback/simulate
 * 设置模拟降级原因
 */
router.post('/amas/fallback/simulate', (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body as { reason: FallbackReason | null };
    debugService.setSimulateFallbackReason(reason, req.user?.id);
    res.json({
      success: true,
      message: reason ? `已设置模拟降级原因: ${reason}` : '已清除模拟降级',
    });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to simulate fallback');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== 服务控制 ====================

/**
 * GET /api/debug/services
 * 获取服务状态
 */
router.get('/services', (req: AuthRequest, res: Response) => {
  try {
    const services = debugService.getServicesStatus();
    res.json({ success: true, data: services });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to get services status');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/services/toggle
 * 批量切换服务开关
 */
router.post('/services/toggle', (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body as Partial<ServicesDebugConfig>;
    const result = debugService.toggleServices(updates, req.user?.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to toggle services');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== 全局控制 ====================

/**
 * POST /api/debug/reset
 * 重置所有调试配置
 */
router.post('/reset', (req: AuthRequest, res: Response) => {
  try {
    debugService.resetAll(req.user?.id);
    res.json({ success: true, message: '所有调试配置已重置' });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to reset all');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/debug/stop-simulations
 * 停止所有模拟
 */
router.post('/stop-simulations', (req: AuthRequest, res: Response) => {
  try {
    debugService.stopAllSimulations(req.user?.id);
    res.json({ success: true, message: '所有模拟已停止' });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to stop simulations');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== 审计日志 ====================

/**
 * GET /api/debug/audit-log
 * 获取审计日志
 */
router.get('/audit-log', (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = debugService.getAuditLog(limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to get audit log');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/debug/audit-log
 * 清除审计日志
 */
router.delete('/audit-log', (req: AuthRequest, res: Response) => {
  try {
    debugService.clearAuditLog(req.user?.id);
    res.json({ success: true, message: '审计日志已清除' });
  } catch (error) {
    logger.error({ error }, '[DEBUG] Failed to clear audit log');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
