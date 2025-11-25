/**
 * 状态历史路由
 * 提供学习状态历史追踪和认知成长分析API
 * Requirements: 5.1, 5.3, 5.4, 5.5
 */

import { Router } from 'express';
import { stateHistoryService, DateRangeOption } from '../services/state-history.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/amas/history
 * 获取状态历史数据
 * Requirements: 5.1, 5.4
 * 
 * Query参数:
 * - range: 日期范围（7/30/90天，默认30天）
 * 
 * 返回:
 * - 状态历史数组，包含注意力、疲劳度、动机、记忆力、速度、稳定性
 */
router.get('/history', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const rangeParam = parseInt(req.query.range as string) || 30;

    // 验证范围参数
    const validRanges: DateRangeOption[] = [7, 30, 90];
    const range: DateRangeOption = validRanges.includes(rangeParam as DateRangeOption) 
      ? (rangeParam as DateRangeOption) 
      : 30;

    const history = await stateHistoryService.getStateHistory(userId, range);

    // 获取统计摘要
    const summary = await stateHistoryService.getHistorySummary(userId, range);

    res.json({
      success: true,
      data: {
        history: history.map(item => ({
          date: item.date.toISOString().split('T')[0],
          attention: item.attention,
          fatigue: item.fatigue,
          motivation: item.motivation,
          memory: item.memory,
          speed: item.speed,
          stability: item.stability,
          trendState: item.trendState
        })),
        summary: {
          recordCount: summary.recordCount,
          averages: {
            attention: Math.round(summary.avgAttention * 1000) / 1000,
            fatigue: Math.round(summary.avgFatigue * 1000) / 1000,
            motivation: Math.round(summary.avgMotivation * 1000) / 1000,
            memory: Math.round(summary.avgMemory * 1000) / 1000,
            speed: Math.round(summary.avgSpeed * 1000) / 1000,
            stability: Math.round(summary.avgStability * 1000) / 1000
          }
        },
        range,
        totalRecords: history.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/growth
 * 获取认知成长对比
 * Requirements: 5.3
 * 
 * 返回:
 * - 当前认知画像、30天前认知画像、变化值
 */
router.get('/growth', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const growth = await stateHistoryService.getCognitiveGrowth(userId);

    // 计算变化百分比
    const calculateChangePercent = (current: number, past: number): number => {
      if (past === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - past) / Math.abs(past)) * 10000) / 100;
    };

    res.json({
      success: true,
      data: {
        current: {
          memory: Math.round(growth.current.memory * 1000) / 1000,
          speed: Math.round(growth.current.speed * 1000) / 1000,
          stability: Math.round(growth.current.stability * 1000) / 1000
        },
        past: {
          memory: Math.round(growth.past.memory * 1000) / 1000,
          speed: Math.round(growth.past.speed * 1000) / 1000,
          stability: Math.round(growth.past.stability * 1000) / 1000
        },
        changes: {
          memory: {
            value: Math.round(growth.changes.memory * 1000) / 1000,
            percent: calculateChangePercent(growth.current.memory, growth.past.memory),
            direction: growth.changes.memory >= 0 ? 'up' : 'down'
          },
          speed: {
            value: Math.round(growth.changes.speed * 1000) / 1000,
            percent: calculateChangePercent(growth.current.speed, growth.past.speed),
            direction: growth.changes.speed >= 0 ? 'up' : 'down'
          },
          stability: {
            value: Math.round(growth.changes.stability * 1000) / 1000,
            percent: calculateChangePercent(growth.current.stability, growth.past.stability),
            direction: growth.changes.stability >= 0 ? 'up' : 'down'
          }
        },
        period: growth.period,
        periodLabel: `过去${growth.period}天`
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/changes
 * 获取显著变化
 * Requirements: 5.5
 * 
 * Query参数:
 * - range: 日期范围（7/30/90天，默认30天）
 * 
 * 返回:
 * - 显著变化列表，包含指标名称、变化百分比、方向、是否正面
 */
router.get('/changes', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const rangeParam = parseInt(req.query.range as string) || 30;

    // 验证范围参数
    const validRanges: DateRangeOption[] = [7, 30, 90];
    const range: DateRangeOption = validRanges.includes(rangeParam as DateRangeOption) 
      ? (rangeParam as DateRangeOption) 
      : 30;

    const changes = await stateHistoryService.getSignificantChanges(userId, range);

    res.json({
      success: true,
      data: {
        changes: changes.map(change => ({
          metric: change.metric,
          metricLabel: change.metricLabel,
          // changePercent 已在服务层转换为百分比，这里仅保留两位小数
          changePercent: Number(change.changePercent.toFixed(2)),
          direction: change.direction,
          isPositive: change.isPositive,
          startDate: change.startDate.toISOString().split('T')[0],
          endDate: change.endDate.toISOString().split('T')[0],
          description: getChangeDescription(change)
        })),
        range,
        hasSignificantChanges: changes.length > 0,
        summary: changes.length > 0
          ? `在过去${range}天内，有${changes.length}项指标发生显著变化`
          : `在过去${range}天内，各项指标保持稳定`
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 辅助函数 ====================

/**
 * 生成变化描述
 */
function getChangeDescription(change: {
  metricLabel: string;
  changePercent: number;
  direction: 'up' | 'down';
  isPositive: boolean;
}): string {
  const directionText = change.direction === 'up' ? '提升' : '下降';
  const percentText = Math.abs(Math.round(change.changePercent));
  const sentiment = change.isPositive ? '👍' : '⚠️';
  
  return `${sentiment} ${change.metricLabel}${directionText}了${percentText}%`;
}

export default router;
