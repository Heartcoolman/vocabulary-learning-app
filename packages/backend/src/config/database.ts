import { PrismaClient } from '@prisma/client';
import { recordDbQuery, DbQueryMetric } from '../monitoring/amas-metrics';

const DB_SAMPLE_RATE = 0.2;
const DB_SLOW_THRESHOLD_MS = 200;
const DB_MAX_QUEUE = 5000;
const DB_FLUSH_BATCH = 500;
const DB_FLUSH_INTERVAL_MS = 500;

const dbMetricQueue: DbQueryMetric[] = [];
let dbFlushTimer: NodeJS.Timeout | null = null;

function enqueueDbMetric(metric: DbQueryMetric): void {
  if (dbMetricQueue.length >= DB_MAX_QUEUE) return;
  dbMetricQueue.push(metric);
}

function startDbFlushLoop(): void {
  if (dbFlushTimer) return;
  dbFlushTimer = setInterval(() => {
    if (dbMetricQueue.length === 0) return;
    const batch = dbMetricQueue.splice(0, DB_FLUSH_BATCH);
    for (const metric of batch) {
      recordDbQuery(metric);
    }
  }, DB_FLUSH_INTERVAL_MS);
  if (dbFlushTimer.unref) dbFlushTimer.unref();
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'test') {
  prisma.$use(async (params, next) => {
    const start = process.hrtime.bigint();
    const result = await next(params);
    
    // Record metrics after query completes
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const isSlow = durationMs > DB_SLOW_THRESHOLD_MS;
    const shouldRecord = isSlow || Math.random() < DB_SAMPLE_RATE;
    
    if (shouldRecord) {
      const model = typeof params.model === 'string' ? params.model : undefined;
      const action = typeof params.action === 'string' ? params.action : undefined;

      startDbFlushLoop();
      setImmediate(() =>
        enqueueDbMetric({
          model,
          action,
          durationMs,
          slow: isSlow
        })
      );
    }
    
    return result;
  });
}

export default prisma;
