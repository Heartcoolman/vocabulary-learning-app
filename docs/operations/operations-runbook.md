# Week 3 AMAS Monitoring System - Operations Runbook

**Version**: 1.0
**Last Updated**: 2024-12-03
**Owner**: Platform Engineering Team

## 1. System Overview

### Architecture Stack
```
┌─────────────────────────────────────────────┐
│          Application Layer (Express)         │
├─────────────────────────────────────────────┤
│  Middleware: metrics.middleware.ts (30ms)    │
├─────────────────────────────────────────────┤
│  MetricsCollector (0.01ms/evaluation)        │
├─────────────────────────────────────────────┤
│  AlertEngine → Webhook (rate-limited)        │
├─────────────────────────────────────────────┤
│  Persistence: decision_insights (async)      │
└─────────────────────────────────────────────┘
         ↓                    ↓
    TimescaleDB          Redis Cache
```

### Key Components
- **Metrics Collection**: Prometheus format at `/api/about/metrics/prometheus`
- **Alert Engine**: In-memory evaluation with webhook notifications
- **Decision Insights**: Async write, cache-first read pattern
- **Load Test Suite**: K6 scripts + shell runners

---

## 2. Daily Operations

### 2.1 Health Check Protocol

**Frequency**: Every 4 hours (automated cron recommended)

```bash
# Basic health check
curl http://localhost:3000/health

# Expected response
{"status":"ok","timestamp":"2024-12-03T10:00:00.000Z"}
```

### 2.2 Metrics Review

**Check Prometheus endpoint**:
```bash
curl http://localhost:3000/api/about/metrics/prometheus
```

**Key metrics to watch**:
```
# Queue depth (should be < 500)
amas_queue_size{type="decision"} 125

# Decision write latency (P99 < 500ms)
amas_decision_write_duration_bucket{le="500"} 950

# Error rate (should be < 1%)
http_errors_total{status="500"} 5
```

### 2.3 Active Alerts Check

```bash
curl http://localhost:3000/api/alerts/active | jq
```

**Expected output when healthy**:
```json
[]
```

**Example alert**:
```json
[
  {
    "id": "alert-abc123",
    "metric": "decision.latency.p99",
    "status": "firing",
    "severity": "high",
    "value": 550,
    "threshold": 500,
    "occurredAt": "2024-12-03T10:15:00.000Z",
    "message": "Decision latency P99 exceeds 500ms"
  }
]
```

---

## 3. Troubleshooting Guide

### 3.1 High Decision Latency (P99 > 500ms)

**Symptoms**:
- Alert: `decision.latency.p99` firing
- Slow API responses
- User complaints about lag

**Diagnosis**:
```bash
# 1. Check current metrics
curl http://localhost:3000/api/about/metrics/prometheus | grep decision_write_duration

# 2. Check database connection pool
# In Prisma logs, look for connection pool exhaustion

# 3. Check Redis cache hit rate
# Look for cache_hit vs cache_miss counters
```

**Resolution Steps**:
1. **Immediate**: Scale horizontally (add more workers)
2. **Short-term**: Increase database connection pool size
3. **Long-term**: Review slow queries with `EXPLAIN ANALYZE`

**Configuration changes**:
```typescript
// backend/src/config/database.ts
datasources: {
  db: {
    url: process.env.DATABASE_URL
    connectionLimit: 20 // Increase from default 10
  }
}
```

### 3.2 Alert Webhook Failures

**Symptoms**:
- Logs show `Webhook failed after 3 retries`
- Alerts not received in Slack/Teams

**Diagnosis**:
```bash
# Check webhook URL configuration
grep WEBHOOK_URL .env

# Test webhook manually
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message"}'
```

**Resolution**:
1. Verify webhook URL is correct
2. Check network connectivity to external service
3. Review rate limiting (max 12 per minute)
4. Validate webhook payload format

**Rate limiting check**:
```typescript
// backend/src/monitoring/alert-engine.ts
// Current config: maxPerMinute = 12

// If too many alerts, consider:
// 1. Increase cooldown period
// 2. Aggregate similar alerts
// 3. Use batching (future enhancement)
```

### 3.3 Decision Insights Write Failures

**Symptoms**:
- Error logs: `Failed to write decision insight`
- Cache reads falling back to computation

**Diagnosis**:
```bash
# 1. Check TimescaleDB connectivity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM decision_insights;"

# 2. Check for unique constraint violations
# Look for: "duplicate key value violates unique constraint"

# 3. Verify transaction log
# In application logs, search for [DecisionRecorder]
```

**Resolution**:
1. **Constraint violations**: Likely duplicate `decisionId` - review write logic
2. **Database full**: Check disk space, run vacuum
3. **Connection timeout**: Increase `statement_timeout`

**Emergency fallback**:
```typescript
// Temporarily disable decision insights writes
// backend/src/amas/services/decision-recorder.service.ts
async persistDecisionTrace(trace: DecisionTrace): Promise<void> {
  // Comment out writeDecisionInsight call
  // await this.writeDecisionInsight(trace, tx);
}
```

### 3.4 High Error Rate (> 1%)

**Symptoms**:
- Alert: `http.error_rate.5xx` firing
- Increased 500 status codes

**Diagnosis**:
```bash
# 1. Check error breakdown
curl http://localhost:3000/api/about/metrics/prometheus | grep http_errors_total

# 2. Review application logs
tail -n 100 logs/application.log | grep ERROR

# 3. Check database health
psql $DATABASE_URL -c "SELECT pg_is_in_recovery();"
```

**Common causes**:
- Database connection pool exhaustion
- Unhandled exceptions in async code
- Cache misses causing fallback failures
- TimescaleDB partitioning issues

---

## 4. Configuration Reference

### 4.1 Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/danci
DB_CONNECTION_POOL_SIZE=20

# Redis Cache
REDIS_URL=redis://localhost:6379
CACHE_TTL_AMAS_STATE=300  # 5 minutes

# Monitoring
METRICS_COLLECTION_INTERVAL=30000  # 30 seconds
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx
ALERT_WEBHOOK_MAX_PER_MINUTE=12

# Load Testing
BASE_URL=http://localhost:3000
LOAD_TEST_DURATION=120  # seconds
LOAD_TEST_CONCURRENCY=100
```

### 4.2 Alert Rules Configuration

**File**: [backend/src/monitoring/alert-rules.ts](../backend/src/monitoring/alert-rules.ts)

**Example rule modification**:
```typescript
{
  id: 'decision-latency-p99',
  metric: 'decision.latency.p99',
  type: 'threshold',
  threshold: 500,  // Adjust this value
  operator: '>',
  duration: 120000,  // 2 minutes (adjust if too sensitive)
  severity: 'high',
  message: 'Decision latency P99 exceeds 500ms',
  cooldown: 300000,  // 5 minutes between alerts
}
```

**After changes**:
```bash
# Restart application to reload rules
pm2 restart danci-backend
# Or
npm run restart
```

### 4.3 Cache Configuration

**File**: [backend/src/services/cache.service.ts](../backend/src/services/cache.service.ts)

```typescript
export const CacheTTL = {
  AMAS_STATE: 300,       // 5 minutes - decision insights
  AMAS_METRICS: 60,      // 1 minute - metrics data
  USER_STATE: 1800,      // 30 minutes - user profiles
};
```

**Cache invalidation**:
```bash
# Clear specific decision insight
redis-cli DEL decision_insight:abc123

# Clear all AMAS cache
redis-cli KEYS "decision_insight:*" | xargs redis-cli DEL
```

---

## 5. Performance Targets & SLOs

### 5.1 Service Level Objectives

| Metric | Target | Alert Threshold | Measurement |
|--------|--------|-----------------|-------------|
| **Throughput** | 1000 req/s | < 800 req/s | 5m avg |
| **P95 Latency** | < 200ms | > 250ms | 5m window |
| **P99 Latency** | < 500ms | > 600ms | 5m window |
| **Error Rate** | < 1% | > 2% | 5m window |
| **Monitoring Overhead** | < 100ms | > 150ms | Per request |
| **Cache Hit Rate** | > 80% | < 60% | 15m avg |

### 5.2 Capacity Planning

**Current capacity** (single instance):
- Max throughput: ~1200 req/s
- Max concurrent users: ~500
- Database connections: 20
- Memory usage: ~512MB

**Scaling triggers**:
- CPU > 70% sustained for 5 minutes → Add instance
- Memory > 80% → Restart + investigate leak
- P95 latency > 200ms → Horizontal scale or optimize

---

## 6. Monitoring the Monitor

### 6.1 MetricsCollector Self-Check

**Verify metrics collection is working**:
```bash
# Should show non-zero values
curl http://localhost:3000/api/about/metrics/prometheus | grep amas_queue_size
```

**If metrics are stale**:
```typescript
// Check collection interval
// backend/src/monitoring/monitoring-service.ts
private collectionInterval = 30000; // 30s

// Verify collector is running
console.log(monitoringService.isRunning());
```

### 6.2 AlertEngine Health

**Check alert engine status**:
```bash
# Should return active alerts count
curl http://localhost:3000/api/alerts/active | jq 'length'
```

**Alert history size**:
```bash
# Should be <= 200 (max buffer size)
curl http://localhost:3000/api/alerts/history | jq 'length'
```

### 6.3 Decision Insights Write Rate

**Monitor write success rate**:
```sql
-- Check recent writes
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) as insights_written
FROM decision_insights
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Expected**: ~100-500 insights per hour depending on traffic

---

## 7. Emergency Procedures

### 7.1 System Overload (CPU > 90%)

**Immediate actions**:
```bash
# 1. Stop non-critical services
pm2 stop delayed-reward-worker

# 2. Disable monitoring temporarily
export DISABLE_METRICS_COLLECTION=true
pm2 restart danci-backend

# 3. Scale horizontally
docker-compose up -d --scale backend=3
```

### 7.2 Database Connection Pool Exhausted

**Symptoms**:
- Errors: `Connection pool timeout`
- All requests hanging

**Emergency fix**:
```bash
# 1. Kill idle connections
psql $DATABASE_URL -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes';
"

# 2. Restart application
pm2 restart danci-backend

# 3. Increase pool size (if recurring)
# Edit .env:
DB_CONNECTION_POOL_SIZE=30
```

### 7.3 Alert Storm (> 50 alerts in 1 minute)

**Immediate actions**:
```bash
# 1. Silence webhook notifications temporarily
export ALERT_WEBHOOK_URL=""
pm2 restart danci-backend

# 2. Review active alerts
curl http://localhost:3000/api/alerts/active

# 3. Identify root cause metric
# Look for common metric in alerts

# 4. Adjust alert rule cooldown
# Edit backend/src/monitoring/alert-rules.ts
# Increase cooldown to 10 minutes for problematic rule
```

### 7.4 Data Loss Prevention

**Backup decision insights**:
```bash
# Daily backup (set up cron)
pg_dump $DATABASE_URL \
  --table=decision_insights \
  --data-only \
  --file=decision_insights_$(date +%Y%m%d).sql

# Restore if needed
psql $DATABASE_URL < decision_insights_20241203.sql
```

---

## 8. Routine Maintenance

### 8.1 Weekly Tasks

**Monday**:
- [ ] Review alert history for patterns
- [ ] Check database growth rate
- [ ] Verify backup integrity

```bash
# Database size check
psql $DATABASE_URL -c "
  SELECT
    pg_size_pretty(pg_database_size('danci')) as db_size,
    pg_size_pretty(pg_total_relation_size('decision_insights')) as insights_size;
"
```

**Friday**:
- [ ] Run load tests to validate performance
- [ ] Review week's incident log
- [ ] Update runbook if new issues discovered

```bash
# Run weekly load test
cd backend/tests/load
./run-load-test.sh
```

### 8.2 Monthly Tasks

- [ ] Review and adjust alert thresholds based on actual usage
- [ ] Clean up old decision insights (> 90 days)
- [ ] Performance benchmark comparison
- [ ] Dependency updates and security patches

```sql
-- Clean old insights
DELETE FROM decision_insights
WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum after delete
VACUUM ANALYZE decision_insights;
```

### 8.3 Quarterly Tasks

- [ ] Comprehensive load test with peak traffic simulation
- [ ] Disaster recovery drill
- [ ] Capacity planning review
- [ ] Alert rule effectiveness audit

---

## 9. Load Testing Procedures

### 9.1 Pre-Production Load Test

**Before running**:
1. Ensure test environment mirrors production
2. Clear cache and reset counters
3. Notify team of load test window

**Execution**:
```bash
cd backend/tests/load

# Set environment
export BASE_URL=https://staging.danci.com
export DURATION=300  # 5 minutes
export CONCURRENCY=200

# Run test
./run-load-test.sh

# Review results
cat load-test-summary.txt
```

**Success criteria**:
- P95 latency < 200ms ✓
- P99 latency < 500ms ✓
- Error rate < 1% ✓
- No alerts fired during test ✓

### 9.2 Production Load Test

**Only run during low-traffic windows** (e.g., 2-4 AM local time)

```bash
# Conservative production test
export BASE_URL=https://api.danci.com
export DURATION=120
export CONCURRENCY=50  # Start low

./run-load-test.sh

# Gradually increase if passing
export CONCURRENCY=100
./run-load-test.sh
```

---

## 10. Incident Response Template

### Incident Log Format

```markdown
**Incident ID**: INC-2024-12-03-001
**Severity**: High / Medium / Low
**Started**: 2024-12-03 10:15:00 UTC
**Resolved**: 2024-12-03 10:45:00 UTC
**Duration**: 30 minutes

**Symptoms**:
- High decision latency (P99 = 850ms)
- 15 alerts fired

**Root Cause**:
- Database connection pool exhausted due to long-running queries

**Resolution**:
1. Killed idle connections
2. Increased connection pool size to 30
3. Optimized slow query in word-mastery.service.ts

**Prevention**:
- Added query timeout of 5s
- Set up connection pool monitoring alert
- Scheduled weekly query performance review
```

### Escalation Path

1. **L1 - On-call Engineer**: Initial diagnosis (15 min)
2. **L2 - Senior Engineer**: If unresolved after 30 min
3. **L3 - Platform Lead**: If customer-impacting after 1 hour
4. **Emergency**: If data loss risk or complete outage

---

## 11. Contact Information

**On-Call Rotation**: [Link to PagerDuty/OpsGenie]

**Escalation**:
- Platform Team Lead: [email/phone]
- Database Admin: [email/phone]
- Infrastructure: [email/phone]

**External Services**:
- Slack Webhook: `ALERT_WEBHOOK_URL` in `.env`
- Database Provider: [support link]
- Cloud Provider: [support link]

---

## 12. Changelog

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2024-12-03 | 1.0 | Initial runbook creation | Platform Team |

---

## Quick Reference Commands

```bash
# Health check
curl http://localhost:3000/health

# View metrics
curl http://localhost:3000/api/about/metrics/prometheus

# Check alerts
curl http://localhost:3000/api/alerts/active | jq

# Run load test
cd backend/tests/load && ./run-load-test.sh

# Database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('danci'));"

# Clear cache
redis-cli FLUSHDB

# Restart services
pm2 restart danci-backend

# View logs
pm2 logs danci-backend --lines 100
```

---

**End of Runbook**
