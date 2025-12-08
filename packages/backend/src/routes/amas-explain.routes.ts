import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateQuery, validateBody } from '../middleware/validate.middleware';
import { explainabilityService } from '../services/explainability.service';
import { AuthRequest } from '../types';

const router = Router();

const explainQuery = z.object({
  decisionId: z.string().optional(),
  latest: z.coerce.boolean().optional(),
});

const learningCurveQuery = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

const timelineQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const counterfactualBody = z.object({
  decisionId: z.string().optional(),
  overrides: z
    .object({
      attention: z.number().min(0).max(1).optional(),
      fatigue: z.number().min(0).max(1).optional(),
      motivation: z.number().min(-1).max(1).optional(),
      recentAccuracy: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

// 从 Zod schema 推断类型
type ExplainQuery = z.infer<typeof explainQuery>;
type LearningCurveQuery = z.infer<typeof learningCurveQuery>;
type TimelineQuery = z.infer<typeof timelineQuery>;
type CounterfactualBody = z.infer<typeof counterfactualBody>;

router.get(
  '/explain-decision',
  authMiddleware,
  validateQuery(explainQuery),
  async (req: AuthRequest, res, next) => {
    try {
      const { decisionId } = req.validatedQuery as ExplainQuery;
      const result = await explainabilityService.getDecisionExplanation(req.user!.id, decisionId);

      // 如果没有决策记录，返回空数据而不是404
      if (!result) {
        return res.json({
          success: true,
          data: null,
          message: '暂无决策记录，开始学习后将自动生成',
        });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/learning-curve',
  authMiddleware,
  validateQuery(learningCurveQuery),
  async (req: AuthRequest, res, next) => {
    try {
      const { days } = req.validatedQuery as LearningCurveQuery;
      const data = await explainabilityService.getLearningCurve(req.user!.id, days);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/decision-timeline',
  authMiddleware,
  validateQuery(timelineQuery),
  async (req: AuthRequest, res, next) => {
    try {
      const { limit, cursor } = req.validatedQuery as TimelineQuery;
      const data = await explainabilityService.getDecisionTimeline(req.user!.id, limit, cursor);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/counterfactual',
  authMiddleware,
  validateBody(counterfactualBody),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await explainabilityService.runCounterfactual(
        req.user!.id,
        req.validatedBody as CounterfactualBody,
      );

      if (!result) {
        return res
          .status(404)
          .json({
            success: false,
            message: 'Decision not found or counterfactual analysis not available',
          });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
