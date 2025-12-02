/**
 * K6 Load Test for Monitoring System
 * 验证监控系统在高负载下的性能开销
 *
 * 运行方式: k6 run monitoring-load.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');
const totalRequests = new Counter('total_requests');

// 测试配置
export const options = {
  stages: [
    { duration: '30s', target: 50 },    // Warm up to 50 RPS
    { duration: '1m', target: 100 },    // Ramp to 100 RPS
    { duration: '1m', target: 500 },    // Ramp to 500 RPS
    { duration: '2m', target: 1000 },   // Ramp to 1000 RPS (目标)
    { duration: '2m', target: 1000 },   // Hold at 1000 RPS
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    // 成功标准
    'http_req_duration': ['p(95)<200', 'p(99)<500'], // P95 < 200ms, P99 < 500ms
    'http_req_failed': ['rate<0.01'],                // 错误率 < 1%
    'errors': ['rate<0.01'],                          // 自定义错误率 < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 模拟用户登录获取token（简化）
const userId = 'test-user-load-' + Math.floor(Math.random() * 10);
const headers = {
  'Content-Type': 'application/json',
};

export default function () {
  const scenarios = [
    testLearningSession,
    testMetricsEndpoint,
    testHealthCheck,
    testDecisionRecording,
  ];

  // 随机选择一个场景执行
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  sleep(0.1 + Math.random() * 0.5); // 100-600ms think time
}

/**
 * 场景 1: 学习会话（主要业务流程）
 */
function testLearningSession() {
  const res = http.get(`${BASE_URL}/api/learning/session`, {
    headers,
    tags: { name: 'LearningSession' },
  });

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  errorRate.add(!success);
  requestDuration.add(res.timings.duration);
  totalRequests.add(1);
}

/**
 * 场景 2: Prometheus metrics endpoint（监控开销）
 */
function testMetricsEndpoint() {
  const res = http.get(`${BASE_URL}/api/about/metrics/prometheus`, {
    headers,
    tags: { name: 'MetricsEndpoint' },
  });

  const success = check(res, {
    'metrics status is 200': (r) => r.status === 200,
    'metrics response < 100ms': (r) => r.timings.duration < 100,
    'contains metric lines': (r) => r.body && r.body.includes('amas_'),
  });

  errorRate.add(!success);
  requestDuration.add(res.timings.duration);
  totalRequests.add(1);
}

/**
 * 场景 3: Health check（轻量级）
 */
function testHealthCheck() {
  const res = http.get(`${BASE_URL}/health`, {
    headers,
    tags: { name: 'HealthCheck' },
  });

  const success = check(res, {
    'health status is 200': (r) => r.status === 200,
    'health response < 50ms': (r) => r.timings.duration < 50,
  });

  errorRate.add(!success);
  requestDuration.add(res.timings.duration);
  totalRequests.add(1);
}

/**
 * 场景 4: AMAS decision recording（写入密集）
 */
function testDecisionRecording() {
  const payload = JSON.stringify({
    userId,
    wordId: 'word-' + Math.floor(Math.random() * 1000),
    action: 'review',
    context: {
      attention: 0.7 + Math.random() * 0.3,
      fatigue: Math.random() * 0.5,
    },
  });

  const res = http.post(`${BASE_URL}/api/amas/decide`, payload, {
    headers,
    tags: { name: 'DecisionRecording' },
  });

  const success = check(res, {
    'decision status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'decision response < 150ms': (r) => r.timings.duration < 150,
  });

  errorRate.add(!success);
  requestDuration.add(res.timings.duration);
  totalRequests.add(1);
}

/**
 * Teardown: 输出最终报告
 */
export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const p99 = data.metrics.http_req_duration.values['p(99)'];
  const errorRate = data.metrics.http_req_failed.values.rate;
  const totalRequests = data.metrics.http_reqs.values.count;

  console.log('\n=== Load Test Summary ===');
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`P95 Latency: ${p95.toFixed(2)}ms`);
  console.log(`P99 Latency: ${p99.toFixed(2)}ms`);
  console.log(`Error Rate: ${(errorRate * 100).toFixed(2)}%`);
  console.log('=========================\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  // 简化的summary输出
  return `
  Load Test Results:
  - Total Requests: ${data.metrics.http_reqs.values.count}
  - P95 Latency: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
  - P99 Latency: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms
  - Error Rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%
  - Throughput: ${(data.metrics.http_reqs.values.rate).toFixed(2)} req/s
  `;
}
