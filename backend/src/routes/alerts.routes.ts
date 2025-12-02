/**
 * Alert API Routes - Query Active Alerts and History
 *
 * Provides endpoints for monitoring system to expose alert state:
 * - GET /alerts/active: Currently firing alerts
 * - GET /alerts/history: Recent alert events
 */

import { Router } from 'express';
import { alertMonitoringService } from '../monitoring/monitoring-service';

const router = Router();

/**
 * GET /alerts/active
 * Returns all currently firing alerts.
 */
router.get('/active', (req, res) => {
  try {
    const activeAlerts = alertMonitoringService.getActiveAlerts();
    res.json({
      count: activeAlerts.length,
      alerts: activeAlerts
    });
  } catch (error) {
    console.error('[AlertAPI] Failed to get active alerts:', error);
    res.status(500).json({ error: 'Failed to retrieve active alerts' });
  }
});

/**
 * GET /alerts/history?limit=100
 * Returns recent alert events (default: 100, max: 200).
 */
router.get('/history', (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 200);
    const history = alertMonitoringService.getHistory(limit);
    res.json({
      count: history.length,
      limit,
      alerts: history
    });
  } catch (error) {
    console.error('[AlertAPI] Failed to get alert history:', error);
    res.status(500).json({ error: 'Failed to retrieve alert history' });
  }
});

export default router;
