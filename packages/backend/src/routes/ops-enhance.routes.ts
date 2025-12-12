/**
 * Ops Enhancement Routes
 * 运维增强相关路由
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  alertAnalysisService,
  weeklyReportService,
  behaviorInsightService,
} from '../services/ops-enhancement';

const router = Router();

// ==================== 告警分析路由 ====================

/**
 * POST /api/admin/alerts/analyze
 * 分析告警
 */
router.post('/alerts/analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { alert, includeHistoricalContext, maxRelatedAlerts } = req.body;

    const result = await alertAnalysisService.analyzeAlert(alert, {
      includeHistoricalContext,
      maxRelatedAlerts,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/alerts/analyses
 * 获取告警分析列表
 */
router.get('/alerts/analyses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, severity, limit, offset } = req.query;

    const result = await alertAnalysisService.getAnalyses({
      status: status as 'open' | 'investigating' | 'resolved' | 'ignored' | undefined,
      severity: severity as 'low' | 'medium' | 'high' | 'critical' | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/alerts/analyses/:id
 * 获取单个分析详情
 */
router.get('/alerts/analyses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await alertAnalysisService.getAnalysis(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '分析记录不存在',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/alerts/analyses/:id/status
 * 更新分析状态
 */
router.patch(
  '/alerts/analyses/:id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, resolution } = req.body;
      const resolvedBy = (req as unknown as { user?: { id: string } }).user?.id;

      await alertAnalysisService.updateStatus(id, status, resolution, resolvedBy);

      res.json({
        success: true,
        message: '状态已更新',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/admin/alerts/stats
 * 获取告警分析统计
 */
router.get('/alerts/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await alertAnalysisService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 周报路由 ====================

/**
 * POST /api/admin/reports/weekly/generate
 * 生成周报
 */
router.post('/reports/weekly/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endDate, includeDetailedMetrics } = req.body;
    const createdBy = (req as unknown as { user?: { id: string } }).user?.id;

    const result = await weeklyReportService.generateReport({
      endDate: endDate ? new Date(endDate) : undefined,
      includeDetailedMetrics,
      createdBy,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/reports/weekly
 * 获取周报列表
 */
router.get('/reports/weekly', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = req.query;

    const result = await weeklyReportService.getReports({
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/reports/weekly/latest
 * 获取最新周报
 */
router.get('/reports/weekly/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await weeklyReportService.getLatestReport();

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '暂无周报',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/reports/weekly/:id
 * 获取单个周报
 */
router.get('/reports/weekly/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await weeklyReportService.getReport(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '周报不存在',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/reports/health-trend
 * 获取健康度趋势
 */
router.get('/reports/health-trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { weeks } = req.query;

    const result = await weeklyReportService.getHealthTrend(
      weeks ? parseInt(weeks as string) : undefined,
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 用户行为洞察路由 ====================

/**
 * POST /api/admin/insights/generate
 * 生成用户行为洞察
 */
router.post('/insights/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { segment, daysToAnalyze } = req.body;
    const createdBy = (req as unknown as { user?: { id: string } }).user?.id;

    const result = await behaviorInsightService.generateInsight({
      segment,
      daysToAnalyze,
      createdBy,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/insights
 * 获取洞察列表
 */
router.get('/insights', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { segment, limit, offset } = req.query;

    const result = await behaviorInsightService.getInsights({
      segment: segment as
        | 'new_users'
        | 'active_learners'
        | 'at_risk'
        | 'high_performers'
        | 'struggling'
        | 'casual'
        | 'all'
        | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/insights/:id
 * 获取单个洞察详情
 */
router.get('/insights/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await behaviorInsightService.getInsight(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '洞察不存在',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/insights/segments
 * 获取可用的用户分群列表
 */
router.get('/segments', async (_req: Request, res: Response) => {
  const segments = [
    { id: 'new_users', name: '新用户', description: '注册7天内的用户' },
    { id: 'active_learners', name: '活跃学习者', description: '每日都有学习记录的用户' },
    { id: 'at_risk', name: '流失风险用户', description: '最近3天没有活动的用户' },
    { id: 'high_performers', name: '高绩效用户', description: '正确率超过80%的用户' },
    { id: 'struggling', name: '困难用户', description: '正确率低于50%的用户' },
    { id: 'casual', name: '休闲用户', description: '每周只学习1-2天的用户' },
    { id: 'all', name: '全部用户', description: '所有有学习记录的用户' },
  ];

  res.json({
    success: true,
    data: segments,
  });
});

export default router;
