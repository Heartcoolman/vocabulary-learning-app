/**
 * 趋势分析路由
 * 提供学习趋势分析、预警和干预建议API
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { Router } from 'express';
import { trendAnalysisService } from '../services/trend-analysis.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/amas/trend
 * 获取当前趋势状态
 * Requirements: 2.1
 * 
 * 返回:
 * - state: 趋势状态 (up/flat/stuck/down)
 * - consecutiveDays: 连续天数
 * - lastChange: 最后变化时间
 */
router.get('/trend', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const result = await trendAnalysisService.getCurrentTrend(userId);

    res.json({
      success: true,
      data: {
        state: result.state,
        consecutiveDays: result.consecutiveDays,
        lastChange: result.lastChange.toISOString(),
        stateDescription: getTrendStateDescription(result.state)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/trend/history
 * 获取趋势历史数据
 * Requirements: 2.3
 * 
 * Query参数:
 * - days: 天数（默认28天，即4周）
 * 
 * 返回:
 * - 每日趋势数据数组，包含日期、状态、正确率、响应时间、动机值
 */
router.get('/trend/history', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const daysParam = req.query.days as string | undefined;
    const days = daysParam !== undefined ? parseInt(daysParam) : 28;

    // 验证天数范围
    if (isNaN(days) || days < 1 || days > 90) {
      return res.status(400).json({
        success: false,
        message: 'days参数必须在1-90之间'
      });
    }

    const history = await trendAnalysisService.getTrendHistory(userId, days);

    // 按周分组数据
    const weeklyData = groupByWeek(history);

    res.json({
      success: true,
      data: {
        daily: history.map(item => ({
          date: item.date.toISOString().split('T')[0],
          state: item.state,
          accuracy: item.accuracy,
          avgResponseTime: item.avgResponseTime,
          motivation: item.motivation
        })),
        weekly: weeklyData,
        totalDays: history.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/trend/report
 * 生成趋势报告
 * Requirements: 2.5
 * 
 * 返回:
 * - accuracyTrend: 正确率趋势
 * - responseTimeTrend: 响应时间趋势
 * - motivationTrend: 动机趋势
 * - summary: 总结
 * - recommendations: 建议列表
 */
router.get('/trend/report', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const report = await trendAnalysisService.generateTrendReport(userId);

    res.json({
      success: true,
      data: {
        accuracyTrend: report.accuracyTrend,
        responseTimeTrend: report.responseTimeTrend,
        motivationTrend: report.motivationTrend,
        summary: report.summary,
        recommendations: report.recommendations
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/trend/intervention
 * 检查是否需要干预
 * Requirements: 2.2, 2.4
 * 
 * 返回:
 * - needsIntervention: 是否需要干预
 * - type: 干预类型 (warning/suggestion/encouragement)
 * - message: 干预消息
 * - actions: 建议操作列表
 */
router.get('/trend/intervention', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const result = await trendAnalysisService.checkIntervention(userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 辅助函数 ====================

/**
 * 获取趋势状态描述
 */
function getTrendStateDescription(state: string): string {
  switch (state) {
    case 'up':
      return '上升趋势：学习状态持续改善';
    case 'flat':
      return '平稳趋势：学习状态保持稳定';
    case 'stuck':
      return '停滞状态：学习进入平台期';
    case 'down':
      return '下降趋势：学习状态有所下滑';
    default:
      return '未知状态';
  }
}

/**
 * 按周分组数据
 */
function groupByWeek(
  history: Array<{
    date: Date;
    state: string;
    accuracy: number;
    avgResponseTime: number;
    motivation: number;
  }>
): Array<{
  weekNumber: number;
  startDate: string;
  endDate: string;
  avgAccuracy: number;
  avgResponseTime: number;
  avgMotivation: number;
  dominantState: string;
}> {
  if (history.length === 0) return [];

  // 按周分组
  const weeks: Map<number, typeof history> = new Map();
  
  for (const item of history) {
    const weekNumber = getWeekNumber(item.date);
    if (!weeks.has(weekNumber)) {
      weeks.set(weekNumber, []);
    }
    weeks.get(weekNumber)!.push(item);
  }

  // 计算每周平均值
  const result = [];
  for (const [weekNumber, items] of weeks) {
    const avgAccuracy = items.reduce((sum, i) => sum + i.accuracy, 0) / items.length;
    const avgResponseTime = items.reduce((sum, i) => sum + i.avgResponseTime, 0) / items.length;
    const avgMotivation = items.reduce((sum, i) => sum + i.motivation, 0) / items.length;
    
    // 找出主导状态
    const stateCounts = new Map<string, number>();
    for (const item of items) {
      stateCounts.set(item.state, (stateCounts.get(item.state) || 0) + 1);
    }
    let dominantState = 'flat';
    let maxCount = 0;
    for (const [state, count] of stateCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantState = state;
      }
    }

    // 获取日期范围
    const dates = items.map(i => i.date).sort((a, b) => a.getTime() - b.getTime());
    
    result.push({
      weekNumber,
      startDate: dates[0].toISOString().split('T')[0],
      endDate: dates[dates.length - 1].toISOString().split('T')[0],
      avgAccuracy,
      avgResponseTime,
      avgMotivation,
      dominantState
    });
  }

  return result.sort((a, b) => a.weekNumber - b.weekNumber);
}

/**
 * 获取周数
 */
function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

export default router;
