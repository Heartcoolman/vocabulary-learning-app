# Week 3 Day 13: Alert Monitoring and Webhook Integration - Configuration Guide

## Overview

The alert monitoring system evaluates metrics against predefined rules and sends notifications via webhooks when alerts fire or resolve.

## Environment Variables

Add the following environment variables to configure webhook notifications:

### Generic Webhook (JSON POST)

```bash
# Optional: Generic webhook endpoint for alert notifications
# Receives standard JSON payload with full alert details
ALERT_WEBHOOK_URL=https://your-monitoring-system.com/webhooks/alerts
```

**Payload Format:**
```json
{
  "id": "http_latency_p95_p0:1701234567890:firing",
  "ruleId": "http_latency_p95_p0",
  "metric": "http.request.duration.p95",
  "severity": "P0",
  "status": "firing",
  "message": "P0: http_request_duration p95 exceeded 1s",
  "value": 1.2345,
  "threshold": 1.0,
  "labels": {
    "component": "edge",
    "signal": "latency",
    "priority": "P0"
  },
  "occurredAt": "2025-12-02T10:30:00.000Z"
}
```

### Slack Webhook

```bash
# Optional: Slack incoming webhook URL for alert notifications
# Receives formatted Slack messages
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Message Format:**
```
🚨 [P0] http_latency_p95_p0
Status: FIRING | Metric: http.request.duration.p95 | Value: 1.2345 Threshold: 1
P0: http_request_duration p95 exceeded 1s
```

## Alert Rules

The system includes the following predefined rules:

### P0 (Critical)

1. **http_latency_p95_p0**: HTTP p95 latency > 1s
   - Threshold: 1.0 seconds
   - Consecutive periods: 2 (60 seconds)
   - Cooldown: 300 seconds (5 minutes)

2. **db_slow_queries_rate_p0**: Slow DB queries > 10/min
   - Threshold: 10 queries per minute
   - Consecutive periods: 1
   - Cooldown: 300 seconds

### P1 (Warning)

3. **http_5xx_rate_p1**: HTTP 5xx error rate > 1%
   - Threshold: 0.01 (1%)
   - Consecutive periods: 2
   - Cooldown: 180 seconds (3 minutes)

4. **http_5xx_rate_trend_p1**: HTTP 5xx rate rising quickly
   - Type: Trend detection
   - Min slope: +0.2% per minute
   - Window: 3 samples
   - Cooldown: 300 seconds

5. **decision_confidence_low_p1**: Decision confidence p50 < 0.5
   - Threshold: 0.5
   - Consecutive periods: 2
   - Cooldown: 180 seconds

## Rate Limiting

Webhooks are rate limited to prevent overwhelming endpoints during alert storms:

- **Max rate**: 12 notifications per minute per webhook
- **Behavior**: Excess notifications are dropped with a warning log

## Retry Policy

Failed webhook deliveries are retried automatically:

- **Retry count**: 3 attempts
- **Backoff**: Linear (500ms, 1000ms, 1500ms)
- **Timeout**: 2500ms per request

## API Endpoints

Query alert state programmatically:

### Get Active Alerts

```bash
GET /api/alerts/active
```

**Response:**
```json
{
  "count": 2,
  "alerts": [
    {
      "id": "http_latency_p95_p0:active",
      "ruleId": "http_latency_p95_p0",
      "metric": "http.request.duration.p95",
      "severity": "P0",
      "status": "firing",
      "message": "P0: http_request_duration p95 exceeded 1s",
      "value": 1.2345,
      "threshold": 1.0,
      "labels": { ... },
      "occurredAt": 1701234567890
    }
  ]
}
```

### Get Alert History

```bash
GET /api/alerts/history?limit=100
```

**Parameters:**
- `limit` (optional): Number of events to return (default: 100, max: 200)

**Response:**
```json
{
  "count": 150,
  "limit": 100,
  "alerts": [ ... ]
}
```

## Monitoring Behavior

- **Evaluation interval**: 30 seconds (with 5s jitter)
- **Performance overhead**: <10ms per evaluation cycle
- **History retention**: 200 most recent events (in-memory)
- **Leader-only**: Runs only on leader instance (controlled by `WORKER_LEADER=true`)

## Configuration in index.ts

Alert monitoring starts automatically when the server boots:

```typescript
// Starts on leader instances only
if (shouldRunWorkers) {
  startAlertMonitoring();
}
```

## Testing Webhooks

### Generic Webhook Test

Use a webhook testing service like webhook.site:

```bash
export ALERT_WEBHOOK_URL=https://webhook.site/your-unique-id
npm run dev
```

### Slack Webhook Test

1. Create a Slack app and enable incoming webhooks
2. Copy the webhook URL
3. Configure environment:

```bash
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
npm run dev
```

## Disabling Alerts

To disable alert monitoring without removing code:

```typescript
// In monitoring-service.ts constructor
const service = new MonitoringService({
  enabled: false
});
```

Or prevent startup in index.ts:

```typescript
if (shouldRunWorkers && process.env.ENABLE_ALERTS !== 'false') {
  startAlertMonitoring();
}
```

## Troubleshooting

### No alerts firing

1. Check metrics collection is active:
   ```bash
   curl http://localhost:3000/metrics
   ```

2. Verify alert monitoring started:
   ```
   [MonitoringService] Alert loop started (30000ms interval)
   ```

3. Check active alerts:
   ```bash
   curl http://localhost:3000/api/alerts/active
   ```

### Webhook delivery failures

Check logs for retry attempts:
```
[AlertEngine] Failed to send alert to slack webhook: Error: ...
```

Common causes:
- Invalid webhook URL
- Network connectivity issues
- Webhook endpoint timeout (>2.5s)
- Rate limiting by webhook provider

### Rate limiting warnings

```
[AlertEngine] Webhook rate limited, skipping notification
```

This is expected during alert storms. Adjust `maxPerMinute` in WebhookNotifier if needed.

## Performance Monitoring

Alert evaluation is designed to be lightweight (<10ms target):

- **Metric capture**: O(1) histogram reads, O(n) counter iteration (n = status codes)
- **Rule evaluation**: O(rules) with O(1) state lookup
- **Webhook delivery**: Fire-and-forget async

Monitor evaluation overhead in logs:
```
[MonitoringService] 3 alert state change(s) processed
```

## Next Steps

- Day 14: Implement batching and backpressure control in metrics-collector
- Day 15: Write integration tests and load testing for alert system
