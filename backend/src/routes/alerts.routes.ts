/**
 * Alert API Routes - Query Active Alerts and History
 *
 * Provides endpoints for monitoring system to expose alert state:
 * - GET /alerts/active: Currently firing alerts
 * - GET /alerts/history: Recent alert events
 *
 * Note: Requires admin authentication
 */

import { Router } from 'express';
import { alertMonitoringService } from '../monitoring/monitoring-service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { routeLogger } from '../logger';

const router = Router();

// 所有告警路由需要管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * GET /alerts/active
 * Returns all currently firing alerts.
 */
router.get('/active', (req, res) => {
  try {
    const activeAlerts = alertMonitoringService.getActiveAlerts();
    res.json({
      success: true,
      data: {
        count: activeAlerts.length,
        alerts: activeAlerts
      }
    });
  } catch (error) {
    routeLogger.error({ err: error }, 'Failed to get active alerts');
    res.status(500).json({ success: false, error: 'Failed to retrieve active alerts' });
  }
});

/**
 * GET /alerts/history?limit=100
 * Returns recent alert events (default: 100, max: 200).
 */
router.get('/history', (req, res) => {
  try {
    const limitParam = req.query.limit;
    let limit = 100; // 默认值

    if (limitParam !== undefined && limitParam !== '') {
      const parsed = parseInt(String(limitParam), 10);
      // 检查NaN和范围
      if (isNaN(parsed) || parsed < 1) {
        return res.status(400).json({
          success: false,
          error: 'limit参数必须是大于0的整数'
        });
      }
      limit = Math.min(parsed, 200);
    }

    const history = alertMonitoringService.getHistory(limit);
    res.json({
      success: true,
      data: {
        count: history.length,
        limit,
        alerts: history
      }
    });
  } catch (error) {
    routeLogger.error({ err: error }, 'Failed to get alert history');
    res.status(500).json({ success: false, error: 'Failed to retrieve alert history' });
  }
});

export default router;
