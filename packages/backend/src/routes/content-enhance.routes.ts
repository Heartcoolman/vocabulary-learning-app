/**
 * Content Enhancement Routes
 * 内容增强相关路由
 */

import { Router, Request, Response, NextFunction } from 'express';
import { wordQualityService, contentEnhanceService } from '../services/content-enhancement';

const router = Router();

// ==================== 词库质量检查路由 ====================

/**
 * POST /api/admin/wordbooks/:id/quality-check
 * 启动词库质量检查
 */
router.post(
  '/wordbooks/:id/quality-check',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: wordBookId } = req.params;
      const { checkType, batchSize, maxIssues } = req.body;
      const createdBy = (req as unknown as { user?: { id: string } }).user?.id;

      const result = await wordQualityService.startQualityCheck(wordBookId, {
        checkType,
        batchSize,
        maxIssues,
        createdBy,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/admin/wordbooks/:id/quality-checks
 * 获取词库质量检查历史
 */
router.get(
  '/wordbooks/:id/quality-checks',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: wordBookId } = req.params;
      const { limit, offset } = req.query;

      const result = await wordQualityService.getCheckHistory(wordBookId, {
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
  },
);

/**
 * GET /api/admin/quality-checks/:id
 * 获取质量检查详情
 */
router.get('/quality-checks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await wordQualityService.getCheckDetail(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '检查记录不存在',
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
 * GET /api/admin/wordbooks/:id/issues
 * 获取词库未解决的问题列表
 */
router.get('/wordbooks/:id/issues', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: wordBookId } = req.params;
    const { severity, limit, offset } = req.query;

    const result = await wordQualityService.getOpenIssues(wordBookId, {
      severity: severity as 'error' | 'warning' | 'suggestion' | undefined,
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
 * POST /api/admin/issues/:id/fix
 * 标记问题为已修复
 */
router.post('/issues/:id/fix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const fixedBy = (req as unknown as { user?: { id: string } }).user?.id || 'admin';

    await wordQualityService.markIssueFixed(id, fixedBy);

    res.json({
      success: true,
      message: '问题已标记为已修复',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/issues/:id/ignore
 * 忽略问题
 */
router.post('/issues/:id/ignore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await wordQualityService.ignoreIssue(id);

    res.json({
      success: true,
      message: '问题已忽略',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/issues/batch-fix
 * 批量应用修复
 */
router.post('/issues/batch-fix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { issueIds } = req.body;
    const appliedBy = (req as unknown as { user?: { id: string } }).user?.id || 'admin';

    const result = await wordQualityService.applyFixes(issueIds, appliedBy);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/wordbooks/:id/quality-stats
 * 获取词库质量统计
 */
router.get(
  '/wordbooks/:id/quality-stats',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: wordBookId } = req.params;

      const stats = await wordQualityService.getQualityStats(wordBookId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ==================== 内容增强路由 ====================

/**
 * POST /api/admin/words/enhance
 * 批量内容增强
 */
router.post('/words/enhance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wordBookId, enhanceType, batchSize, maxWords, overwrite } = req.body;
    const createdBy = (req as unknown as { user?: { id: string } }).user?.id;

    const result = await contentEnhanceService.enhanceWords(wordBookId, {
      enhanceType,
      batchSize,
      maxWords,
      overwrite,
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
 * GET /api/admin/words/:id/enhancement-preview
 * 预览单词增强
 */
router.get(
  '/words/:id/enhancement-preview',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: wordId } = req.params;
      const { enhanceType } = req.query;

      const result = await contentEnhanceService.previewEnhance(
        wordId,
        (enhanceType as 'meanings' | 'examples' | 'mnemonics' | 'usage_notes') || 'meanings',
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/admin/content-variants
 * 获取待审核的内容变体
 */
router.get('/content-variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wordBookId, field, limit, offset } = req.query;

    const result = await contentEnhanceService.getPendingVariants({
      wordBookId: wordBookId as string,
      field: field as 'meanings' | 'examples' | 'mnemonics' | 'usage_notes' | undefined,
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
 * POST /api/admin/content-variants/:id/approve
 * 审批内容变体
 */
router.post(
  '/content-variants/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { applyToWord } = req.body;
      const approvedBy = (req as unknown as { user?: { id: string } }).user?.id || 'admin';

      await contentEnhanceService.approveVariant(id, approvedBy, applyToWord);

      res.json({
        success: true,
        message: '变体已审批',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/admin/content-variants/:id/reject
 * 拒绝内容变体
 */
router.post(
  '/content-variants/:id/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      await contentEnhanceService.rejectVariant(id);

      res.json({
        success: true,
        message: '变体已拒绝',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/admin/content-variants/batch-approve
 * 批量审批内容变体
 */
router.post(
  '/content-variants/batch-approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { variantIds, applyToWord } = req.body;
      const approvedBy = (req as unknown as { user?: { id: string } }).user?.id || 'admin';

      const result = await contentEnhanceService.batchApprove(variantIds, approvedBy, applyToWord);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/admin/enhance-tasks
 * 获取增强任务历史
 */
router.get('/enhance-tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = req.query;

    const result = await contentEnhanceService.getTaskHistory({
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

export default router;
