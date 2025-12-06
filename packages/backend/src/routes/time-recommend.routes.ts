/**
 * 时间推荐路由
 * 提供智能学习时机推荐API
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */

import { Router } from 'express';
import { timeRecommendService } from '../services/time-recommend.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/amas/time-preferences
 * 获取用户时间偏好分析
 * Requirements: 1.1, 1.3, 1.5
 * 
 * 返回:
 * - 成功: 24小时偏好分布、推荐时间段、置信度、样本数量
 * - 数据不足: insufficientData标志和最小要求数量
 */
router.get('/time-preferences', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const result = await timeRecommendService.getTimePreferences(userId);

    // 检查是否数据不足
    if ('insufficientData' in result) {
      return res.json({
        success: true,
        data: {
          insufficientData: true,
          minRequired: result.minRequired,
          currentCount: result.currentCount,
          message: `需要至少${result.minRequired}次学习会话才能分析时间偏好，当前仅有${result.currentCount}次`
        }
      });
    }

    res.json({
      success: true,
      data: {
        timePref: result.timePref,
        preferredSlots: result.preferredSlots,
        confidence: result.confidence,
        sampleCount: result.sampleCount
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/golden-time
 * 检查当前是否为黄金学习时间
 * Requirements: 1.2
 * 
 * 返回:
 * - isGolden: 是否为黄金学习时间
 * - currentHour: 当前小时
 * - matchedSlot: 匹配的时间段（如果是黄金时间）
 */
router.get('/golden-time', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const result = await timeRecommendService.isGoldenTime(userId);

    res.json({
      success: true,
      data: {
        isGolden: result.isGolden,
        currentHour: result.currentHour,
        matchedSlot: result.matchedSlot,
        message: result.isGolden 
          ? '现在是您的黄金学习时间！' 
          : '当前不是您的最佳学习时段'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
