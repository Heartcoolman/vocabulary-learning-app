import { NextFunction, Request, Response } from 'express';
import { recordHttpDrop, recordHttpRequest, HttpRequestMetric } from '../monitoring/amas-metrics';
import { env } from '../config/env';

const metricQueue: HttpRequestMetric[] = [];
const MAX_QUEUE_DEPTH = 10000;
const FLUSH_BATCH_SIZE = 500;
const FLUSH_INTERVAL_MS = 500;
const ERROR_4XX_SAMPLE_RATE = 0.1;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HEALTHCHECK_SAMPLE_PATTERN = new RegExp(
  `^(${escapeRegExp(env.HEALTHCHECK_ENDPOINT)}|\\/health)$`,
);

const SAMPLE_RULES: Array<{ pattern: RegExp; rate: number }> = [
  { pattern: /^\/api\/auth/, rate: 1.0 },
  { pattern: /^\/api\/learning/, rate: 1.0 },
  { pattern: /^\/api\/records?/, rate: 1.0 },
  { pattern: /^\/api\/about/, rate: 0.15 },
  { pattern: HEALTHCHECK_SAMPLE_PATTERN, rate: 0.02 },
  { pattern: /^\/api\/words\/list/, rate: 0.02 },
];

let flushTimer: NodeJS.Timeout | null = null;

function startFlushLoop(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (metricQueue.length === 0) return;
    const batch = metricQueue.splice(0, FLUSH_BATCH_SIZE);
    for (const metric of batch) {
      recordHttpRequest(metric);
    }
  }, FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();
}

function enqueue(metric: HttpRequestMetric): void {
  if (metricQueue.length >= MAX_QUEUE_DEPTH) {
    recordHttpDrop('queue_full');
    return;
  }
  metricQueue.push(metric);
}

function resolveSampleRate(path: string): number {
  for (const rule of SAMPLE_RULES) {
    if (rule.pattern.test(path)) return rule.rate;
  }
  return 0.1;
}

function normalizeRoute(req: Request): string {
  if (req.route?.path) {
    const base = req.baseUrl || '';
    const path = Array.isArray(req.route.path) ? req.route.path[0] : String(req.route.path);
    const route = `${base}${path}`.replace(/\/+/g, '/');
    return route.length > 64 ? route.substring(0, 64) : route;
  }

  if (req.baseUrl) {
    const route = req.baseUrl;
    return route.length > 64 ? route.substring(0, 64) : route;
  }

  return '/unknown';
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();
  startFlushLoop();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - startTime);
    const durationSeconds = durationNs / 1_000_000_000;
    const status = res.statusCode;
    const path = req.path || req.originalUrl || '';
    const route = normalizeRoute(req);

    const sampleRate = resolveSampleRate(path);
    const is5xxError = status >= 500;
    const is4xxError = status >= 400 && status < 500;
    const isUnknownRoute = route === '/unknown';

    const shouldRecord =
      is5xxError ||
      (is4xxError && !isUnknownRoute) ||
      (is4xxError && isUnknownRoute && Math.random() < ERROR_4XX_SAMPLE_RATE) ||
      sampleRate >= 1 ||
      Math.random() < sampleRate;

    if (!shouldRecord) return;

    const metric: HttpRequestMetric = {
      route,
      method: req.method,
      status,
      durationSeconds,
    };

    setImmediate(() => enqueue(metric));
  });

  next();
}

export function stopMetricsCollection(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  return new Promise<void>((resolve) => {
    setImmediate(() => {
      while (metricQueue.length > 0) {
        const batch = metricQueue.splice(0, FLUSH_BATCH_SIZE);
        for (const metric of batch) {
          recordHttpRequest(metric);
        }
      }
      resolve();
    });
  });
}
