/**
 * LLM Advisor API Routes
 * LLM 顾问 API 路由
 */

import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { validateQuery, validateParams } from '../middleware/validate.middleware';
import { llmWeeklyAdvisor } from '../amas/optimization/llm-advisor';
import { triggerLLMAnalysis, getLLMAdvisorWorkerStatus } from '../workers/llm-advisor.worker';
import { llmConfig, getConfigSummary } from '../config/llm.config';
import { llmProviderService } from '../services/llm-provider.service';
import { AuthRequest } from '../types';
import { amasLogger } from '../logger';

/**
 * 获取建议列表的查询参数验证
 */
const suggestionsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'partial']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * 建议ID参数验证
 */
const suggestionIdParamSchema = z.object({
  id: z.string().uuid('无效的建议ID格式'),
});

const router = Router();

// 所有路由需要管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * GET /api/llm-advisor/config
 * 获取 LLM 配置状态
 */
router.get('/config', async (req: AuthRequest, res, next) => {
  try {
    const config = getConfigSummary(llmConfig);
    const workerStatus = await getLLMAdvisorWorkerStatus();

    res.json({
      success: true,
      data: {
        config,
        worker: {
          enabled: workerStatus.enabled,
          autoAnalysisEnabled: workerStatus.autoAnalysisEnabled,
          isRunning: workerStatus.isRunning,
          schedule: workerStatus.schedule,
          pendingCount: workerStatus.pendingCount
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/llm-advisor/health
 * 检查 LLM 服务健康状态
 */
router.get('/health', async (req: AuthRequest, res, next) => {
  try {
    if (!llmConfig.enabled) {
      return res.json({
        success: true,
        data: {
          status: 'disabled',
          message: 'LLM 顾问未启用'
        }
      });
    }

    const health = await llmProviderService.healthCheck();
    res.json({
      success: true,
      data: {
        status: health.ok ? 'healthy' : 'unhealthy',
        message: health.message
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/llm-advisor/suggestions
 * 获取建议列表
 */
router.get('/suggestions', validateQuery(suggestionsQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const { status, limit, offset } = req.validatedQuery as {
      status?: 'pending' | 'approved' | 'rejected' | 'partial';
      limit?: number;
      offset?: number;
    };

    const result = await llmWeeklyAdvisor.getSuggestions({
      status,
      limit,
      offset
    });

    res.json({
      success: true,
      data: result.items,
      total: result.total
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/llm-advisor/suggestions/:id
 * 获取单个建议详情
 */
router.get('/suggestions/:id', validateParams(suggestionIdParamSchema), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.validatedParams as { id: string };

    const suggestion = await llmWeeklyAdvisor.getSuggestion(id);
    if (!suggestion) {
      return res.status(404).json({
        success: false,
        message: '建议不存在'
      });
    }

    res.json({
      success: true,
      data: suggestion
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm-advisor/suggestions/:id/approve
 * 审批通过建议
 */
router.post('/suggestions/:id/approve', validateParams(suggestionIdParamSchema), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.validatedParams as { id: string };
    const { selectedItems, notes } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(selectedItems)) {
      return res.status(400).json({
        success: false,
        message: 'selectedItems 必须是数组'
      });
    }

    const updated = await llmWeeklyAdvisor.approveSuggestion({
      suggestionId: id,
      approvedBy: userId,
      selectedItems,
      notes
    });

    amasLogger.info({
      suggestionId: id,
      approvedBy: userId,
      selectedCount: selectedItems.length
    }, '[LLMAdvisorRoutes] 建议已审批');

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm-advisor/suggestions/:id/reject
 * 拒绝建议
 */
router.post('/suggestions/:id/reject', validateParams(suggestionIdParamSchema), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.validatedParams as { id: string };
    const { notes } = req.body;
    const userId = req.user!.id;

    const updated = await llmWeeklyAdvisor.rejectSuggestion(id, userId, notes);

    amasLogger.info({
      suggestionId: id,
      rejectedBy: userId
    }, '[LLMAdvisorRoutes] 建议已拒绝');

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm-advisor/trigger
 * 手动触发 LLM 分析
 */
router.post('/trigger', async (req: AuthRequest, res, next) => {
  try {
    if (!llmConfig.enabled) {
      return res.status(400).json({
        success: false,
        message: 'LLM 顾问未启用，请设置 LLM_ADVISOR_ENABLED=true'
      });
    }

    const userId = req.user!.id;
    amasLogger.info({ triggeredBy: userId }, '[LLMAdvisorRoutes] 手动触发 LLM 分析');

    const suggestionId = await triggerLLMAnalysis();

    res.json({
      success: true,
      data: {
        suggestionId,
        message: '分析已完成'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/llm-advisor/latest
 * 获取最新的建议
 */
router.get('/latest', async (req: AuthRequest, res, next) => {
  try {
    const suggestion = await llmWeeklyAdvisor.getLatestSuggestion();

    res.json({
      success: true,
      data: suggestion
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/llm-advisor/pending-count
 * 获取待审核建议数量
 */
router.get('/pending-count', async (req: AuthRequest, res, next) => {
  try {
    const count = await llmWeeklyAdvisor.getPendingCount();

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
