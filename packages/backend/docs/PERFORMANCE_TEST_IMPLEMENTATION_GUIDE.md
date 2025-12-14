# 性能测试实施指南

> **版本**: v1.0
> **日期**: 2025-12-13
> **状态**: 待实施

---

## 目录

1. [测试环境准备](#测试环境准备)
2. [负载测试脚本](#负载测试脚本)
3. [压力测试方案](#压力测试方案)
4. [浸泡测试方案](#浸泡测试方案)
5. [尖峰测试方案](#尖峰测试方案)
6. [前端性能测试](#前端性能测试)
7. [数据库性能测试](#数据库性能测试)
8. [测试数据准备](#测试数据准备)
9. [测试执行计划](#测试执行计划)
10. [结果分析模板](#结果分析模板)

---

## 测试环境准备

### 1. 硬件配置建议

**测试服务器**:

- **CPU**: 8核心 或更高
- **内存**: 16GB 或更高
- **磁盘**: SSD 100GB+
- **网络**: 1Gbps+

**数据库服务器** (独立部署):

- **CPU**: 4核心+
- **内存**: 8GB+
- **磁盘**: SSD 50GB+

**Redis服务器**:

- **CPU**: 2核心+
- **内存**: 4GB+

### 2. 软件环境配置

```bash
# 1. 安装必要工具
npm install -D autocannon artillery k6 clinic
npm install -g clinic 0x

# 2. 配置系统限制
# Linux系统需要调整文件描述符限制
ulimit -n 65535

# 3. 配置PostgreSQL
# postgresql.conf
max_connections = 200
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
min_wal_size = 1GB
max_wal_size = 4GB

# 4. 配置Redis
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save ""  # 禁用RDB持久化（测试环境）
appendonly no  # 禁用AOF持久化（测试环境）
```

### 3. 监控工具配置

#### Prometheus配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'danci-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'

  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
```

#### 启动监控栈

```bash
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

  postgres-exporter:
    image: wrouesnel/postgres_exporter:latest
    environment:
      - DATA_SOURCE_NAME=postgresql://user:pass@postgres:5432/db?sslmode=disable

  redis-exporter:
    image: oliver006/redis_exporter:latest
    environment:
      - REDIS_ADDR=redis:6379

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"
```

---

## 负载测试脚本

### 场景1: 正常负载测试 (Baseline)

#### Autocannon脚本

```javascript
// tests/load/baseline-load.js
const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

// 测试配置
const CONFIG = {
  url: process.env.API_BASE_URL || 'http://localhost:3000',
  connections: 100,
  duration: 600, // 10分钟
  pipelining: 1,
  timeout: 30,

  // 请求权重配置
  weights: {
    submitAnswer: 0.4,
    selectWords: 0.3,
    getLearningState: 0.2,
    other: 0.1,
  },
};

// 模拟用户数据
const USERS = generateUsers(100);
const SESSIONS = generateSessions(100);
const WORDS = generateWords(1000);

function generateUsers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-user-${i}`,
    token: `test-token-${i}`,
  }));
}

function generateSessions(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-session-${i}`,
    userId: `test-user-${i % 100}`,
  }));
}

function generateWords(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `word-${i}`,
    spelling: `word${i}`,
  }));
}

// 随机选择请求
function getRandomRequest() {
  const rand = Math.random();
  const user = USERS[Math.floor(Math.random() * USERS.length)];
  const session = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];

  if (rand < CONFIG.weights.submitAnswer) {
    // 提交答题
    return {
      method: 'POST',
      path: `/api/v1/sessions/${session.id}/answers`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        wordId: word.id,
        selectedAnswer: 'answer-1',
        correctAnswer: 'answer-1',
        isCorrect: Math.random() > 0.3, // 70%正确率
        responseTime: Math.floor(Math.random() * 5000) + 1000, // 1-6秒
      }),
    };
  } else if (rand < CONFIG.weights.submitAnswer + CONFIG.weights.selectWords) {
    // 选择单词
    return {
      method: 'POST',
      path: '/api/v1/words/select',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        userId: user.id,
        count: 20,
        filters: { state: ['NEW', 'LEARNING'] },
      }),
    };
  } else if (
    rand <
    CONFIG.weights.submitAnswer + CONFIG.weights.selectWords + CONFIG.weights.getLearningState
  ) {
    // 获取学习状态
    return {
      method: 'GET',
      path: `/api/v1/learning-state/${user.id}`,
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    };
  } else {
    // 其他请求（profile, wordbooks等）
    return {
      method: 'GET',
      path: '/api/users/profile',
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    };
  }
}

// 执行测试
const instance = autocannon(
  {
    ...CONFIG,
    setupClient: (client) => {
      // 动态生成请求
      client.on('response', () => {
        client.setRequest(getRandomRequest());
      });
    },
  },
  (err, result) => {
    if (err) {
      console.error('测试失败:', err);
      process.exit(1);
    }

    // 保存结果
    const resultPath = path.join(__dirname, 'results', `baseline-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

    // 打印报告
    console.log('\n==================== 负载测试结果 ====================\n');
    console.log(`测试持续时间: ${result.duration}秒`);
    console.log(`总请求数: ${result.requests.total}`);
    console.log(`平均吞吐量: ${result.requests.average} req/s`);
    console.log(`\n延迟统计:`);
    console.log(`  平均: ${result.latency.mean.toFixed(2)}ms`);
    console.log(`  P50:  ${result.latency.p50.toFixed(2)}ms`);
    console.log(`  P95:  ${result.latency.p95.toFixed(2)}ms`);
    console.log(`  P99:  ${result.latency.p99.toFixed(2)}ms`);
    console.log(`  最大: ${result.latency.max.toFixed(2)}ms`);
    console.log(`\n错误统计:`);
    console.log(`  总错误: ${result.errors}`);
    console.log(`  超时: ${result.timeouts}`);
    console.log(`  非2xx响应: ${result.non2xx}`);
    console.log('\n====================================================\n');

    // 验证成功标准
    const passed = {
      avgLatency: result.latency.mean < 150,
      p95Latency: result.latency.p95 < 300,
      p99Latency: result.latency.p99 < 500,
      errorRate: result.errors / result.requests.total < 0.001,
      throughput: result.requests.average > 500,
    };

    console.log('性能标准验证:');
    Object.entries(passed).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? '✅ PASS' : '❌ FAIL'}`);
    });

    if (Object.values(passed).every((v) => v)) {
      console.log('\n🎉 测试通过！');
      process.exit(0);
    } else {
      console.log('\n⚠️  测试未通过性能标准');
      process.exit(1);
    }
  },
);

// 优雅退出
process.once('SIGINT', () => {
  instance.stop();
});
```

#### Artillery脚本（更复杂场景）

```yaml
# tests/load/baseline-scenario.yml
config:
  target: 'http://localhost:3000'
  phases:
    # Phase 1: Ramp-up
    - duration: 60
      arrivalRate: 10
      rampTo: 100
      name: 'Ramp-up phase'

    # Phase 2: Sustained load
    - duration: 540
      arrivalRate: 100
      name: 'Sustained load'

  processor: './scenario-helpers.js'

  payload:
    path: './test-data.csv'
    fields:
      - userId
      - wordId
      - sessionId

scenarios:
  # 场景1: 完整学习流程
  - name: 'Complete learning flow'
    weight: 60
    flow:
      # 1. 登录
      - post:
          url: '/api/auth/login'
          json:
            email: '{{ email }}'
            password: '{{ password }}'
          capture:
            - json: '$.token'
              as: 'authToken'

      # 2. 获取学习状态
      - get:
          url: '/api/v1/learning-state/{{ userId }}'
          headers:
            Authorization: 'Bearer {{ authToken }}'

      # 3. 选择单词
      - post:
          url: '/api/v1/words/select'
          headers:
            Authorization: 'Bearer {{ authToken }}'
          json:
            count: 20
            filters:
              state: ['NEW', 'LEARNING']
          capture:
            - json: '$.words[0].id'
              as: 'wordId'

      # 4. 开始会话
      - post:
          url: '/api/v1/sessions'
          headers:
            Authorization: 'Bearer {{ authToken }}'
          json:
            sessionType: 'NORMAL'
          capture:
            - json: '$.sessionId'
              as: 'sessionId'

      # 5. 提交10次答题（循环）
      - loop:
          - post:
              url: '/api/v1/sessions/{{ sessionId }}/answers'
              headers:
                Authorization: 'Bearer {{ authToken }}'
              json:
                wordId: '{{ wordId }}'
                selectedAnswer: 'answer-{{ $randomNumber(1, 4) }}'
                isCorrect: '{{ $randomBoolean(0.7) }}'
                responseTime: '{{ $randomNumber(1000, 6000) }}'
          - think: 2 # 思考2秒
        count: 10

      # 6. 结束会话
      - post:
          url: '/api/v1/sessions/{{ sessionId }}/end'
          headers:
            Authorization: 'Bearer {{ authToken }}'

  # 场景2: 快速答题（仅答题）
  - name: 'Quick answering'
    weight: 40
    flow:
      - post:
          url: '/api/v1/sessions/{{ sessionId }}/answers'
          headers:
            Authorization: 'Bearer {{ authToken }}'
          json:
            wordId: '{{ wordId }}'
            selectedAnswer: 'answer-{{ $randomNumber(1, 4) }}'
            isCorrect: '{{ $randomBoolean(0.7) }}'
            responseTime: '{{ $randomNumber(1000, 3000) }}'
```

```javascript
// tests/load/scenario-helpers.js
module.exports = {
  $randomNumber: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  $randomBoolean: (trueProbability) => Math.random() < trueProbability,
};
```

**执行命令**:

```bash
# Autocannon测试
node tests/load/baseline-load.js

# Artillery测试
artillery run tests/load/baseline-scenario.yml --output report.json
artillery report report.json --output report.html
```

---

## 压力测试方案

### K6压力测试脚本

```javascript
// tests/stress/stress-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const responseTimeTrend = new Trend('response_time');
const requestCounter = new Counter('requests');

// 测试配置：逐步增加负载直到系统崩溃
export const options = {
  stages: [
    { duration: '2m', target: 100 }, // 0-2分钟: 100并发
    { duration: '3m', target: 500 }, // 2-5分钟: 500并发
    { duration: '3m', target: 1000 }, // 5-8分钟: 1000并发
    { duration: '3m', target: 2000 }, // 8-11分钟: 2000并发
    { duration: '3m', target: 3000 }, // 11-14分钟: 3000并发
    { duration: '3m', target: 5000 }, // 14-17分钟: 5000并发（可能崩溃）
    { duration: '2m', target: 0 }, // 17-19分钟: 降至0（恢复）
  ],

  thresholds: {
    // 设定失败条件
    errors: ['rate<0.1'], // 错误率<10%
    http_req_duration: ['p(95)<2000'], // P95<2秒
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 测试用户池
const USERS = Array.from({ length: 100 }, (_, i) => ({
  id: `test-user-${i}`,
  token: `Bearer test-token-${i}`,
}));

export default function () {
  const user = USERS[Math.floor(Math.random() * USERS.length)];

  // 场景1: 提交答题 (40%)
  if (Math.random() < 0.4) {
    const payload = JSON.stringify({
      wordId: `word-${Math.floor(Math.random() * 1000)}`,
      selectedAnswer: `answer-${Math.floor(Math.random() * 4) + 1}`,
      isCorrect: Math.random() > 0.3,
      responseTime: Math.floor(Math.random() * 5000) + 1000,
    });

    const response = http.post(
      `${BASE_URL}/api/v1/sessions/test-session-${Math.floor(Math.random() * 100)}/answers`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: user.token,
        },
        timeout: '30s',
      },
    );

    const success = check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  }

  // 场景2: 选择单词 (30%)
  else if (Math.random() < 0.7) {
    const payload = JSON.stringify({
      userId: user.id,
      count: 20,
      filters: { state: ['NEW', 'LEARNING'] },
    });

    const response = http.post(`${BASE_URL}/api/v1/words/select`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token,
      },
    });

    check(response, {
      'status is 200': (r) => r.status === 200,
    });
  }

  // 场景3: 查询学习状态 (20%)
  else if (Math.random() < 0.9) {
    const response = http.get(`${BASE_URL}/api/v1/learning-state/${user.id}`, {
      headers: { Authorization: user.token },
    });

    check(response, {
      'status is 200': (r) => r.status === 200,
    });
  }

  // 场景4: 其他API (10%)
  else {
    http.get(`${BASE_URL}/api/users/profile`, {
      headers: { Authorization: user.token },
    });
  }

  sleep(Math.random() * 2); // 随机思考时间0-2秒
}

// 测试结束后回调
export function handleSummary(data) {
  return {
    'stress-test-report.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const { indent = '', enableColors = false } = opts;
  const colors = enableColors
    ? {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        red: '\x1b[31m',
        yellow: '\x1b[33m',
      }
    : { reset: '', green: '', red: '', yellow: '' };

  let summary = '\n\n';
  summary += `${indent}==================== 压力测试结果 ====================\n\n`;

  summary += `${indent}总请求数: ${data.metrics.requests.values.count}\n`;
  summary += `${indent}失败请求: ${data.metrics.http_req_failed.values.passes}\n`;
  summary += `${indent}错误率: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n\n`;

  summary += `${indent}响应时间统计:\n`;
  summary += `${indent}  平均: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += `${indent}  P50:  ${data.metrics.http_req_duration.values.med.toFixed(2)}ms\n`;
  summary += `${indent}  P95:  ${data.metrics['http_req_duration{expected_response:true}'].values['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}  P99:  ${data.metrics['http_req_duration{expected_response:true}'].values['p(99)'].toFixed(2)}ms\n`;
  summary += `${indent}  最大: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n\n`;

  summary += `${indent}吞吐量: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s\n\n`;

  // 判断是否通过
  const passed =
    data.metrics.errors.values.rate < 0.1 &&
    data.metrics['http_req_duration{expected_response:true}'].values['p(95)'] < 2000;

  if (passed) {
    summary += `${colors.green}${indent}✅ 压力测试通过！${colors.reset}\n`;
  } else {
    summary += `${colors.red}${indent}❌ 压力测试未通过${colors.reset}\n`;
  }

  summary += `\n${indent}====================================================\n\n`;

  return summary;
}
```

**执行命令**:

```bash
# 本地执行
k6 run tests/stress/stress-test.js

# 使用环境变量
BASE_URL=http://staging.example.com k6 run tests/stress/stress-test.js

# 使用K6 Cloud
k6 cloud tests/stress/stress-test.js
```

---

## 浸泡测试方案

### 24小时稳定性测试

```javascript
// tests/soak/soak-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Gauge } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('error_rate');
const memoryUsage = new Gauge('memory_usage_mb');
const responseTime = new Trend('response_time');

export const options = {
  scenarios: {
    // 中等负载持续24小时
    sustained_load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '24h',
    },
  },

  thresholds: {
    'error_rate': ['rate<0.005'],     // 错误率<0.5%
    'response_time': ['p(95)<500'],   // P95<500ms
    'http_req_duration': ['p(99)<1000'], // P99<1秒
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 每5分钟记录一次内存使用
let lastMemoryCheck = Date.now();
const MEMORY_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟

export default function () {
  // 定期检查内存使用
  const now = Date.now();
  if (now - lastMemoryCheck > MEMORY_CHECK_INTERVAL) {
    checkMemoryUsage();
    lastMemoryCheck = now;
  }

  // 执行正常的测试请求
  const response = http.post(
    `${BASE_URL}/api/v1/sessions/test-session/answers`,
    JSON.stringify({
      wordId: `word-${Math.floor(Math.random() * 1000)}`,
      selectedAnswer: `answer-${Math.floor(Math.random() * 4) + 1}`,
      isCorrect: Math.random() > 0.3,
      responseTime: Math.floor(Math.random() * 5000) + 1000
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    }
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'no server error': (r) => r.status < 500,
  });

  errorRate.add(!success);
  responseTime.add(response.timings.duration);

  sleep(Math.random() * 3); // 随机间隔0-3秒
}

function checkMemoryUsage() {
  // 通过监控API获取内存使用情况
  const metricsResponse = http.get(`${BASE_URL}/metrics`);

  if (metricsResponse.status === 200) {
    // 解析Prometheus格式的指标
    const match = metricsResponse.body.match(/node_process_memory_usage_bytes{type="heapUsed"}\s+([\d.]+)/);
    if (match) {
      const heapUsedBytes = parseFloat(match[1]);
      const heapUsedMB = heapUsedBytes / 1024 / 1024;
      memoryUsage.add(heapUsedMB);

      console.log(`[${new Date().toISOString()}] Memory Usage: ${heapUsedMB.toFixed(2)} MB`);

      // 告警：内存持续增长
      if (heapUsedMB > 1500) {
        console.warn(`⚠️  High memory usage detected: ${heapUsedMB.toFixed(2)} MB`);
      }
    }
  }
}

export function handleSummary(data) {
  // 分析内存趋势
  const memoryTrend = analyzeMemoryTrend(data.metrics.memory_usage_mb);

  return {
    'soak-test-report.json': JSON.stringify({
      ...data,
      memoryAnalysis: memoryTrend
    }, null, 2),
    'stdout': generateSoakReport(data, memoryTrend),
  };
}

function analyzeMemoryTrend(memoryMetric) {
  const values = memoryMetric.values;
  const trend = (values.max - values.min) / values.min * 100;

  return {
    initial: values.min,
    final: values.max,
    growthPercent: trend.toFixed(2),
    stable: trend < 10, // 增长<10%认为稳定
  };
}

function generateSoakReport(data, memoryTrend) {
  let report = '\n\n';
  report += '==================== 浸泡测试结果 (24小时) ====================\n\n';

  report += `测试持续时间: ${(data.state.testRunDurationMs / 1000 / 3600).toFixed(2)} 小时\n`;
  report += `总请求数: ${data.metrics.http_reqs.values.count}\n`;
  report += `平均吞吐量: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s\n`;
  report += `错误率: ${(data.metrics.error_rate.values.rate * 100).toFixed(3)}%\n\n`;

  report += '内存使用分析:\n';
  report += `  初始内存: ${memoryTrend.initial.toFixed(2)} MB\n`;
  report += `  最终内存: ${memoryTrend.final.toFixed(2)} MB\n`;
  report += `  增长比例: ${memoryTrend.growthPercent}%\n`;
  report += `  稳定性: ${memoryTrend.stable ? '✅ 稳定' : '⚠️  不稳定'}\n\n`;

  report += '响应时间统计:\n`;
  report += `  P50: ${data.metrics.response_time.values.med.toFixed(2)}ms\n`;
  report += `  P95: ${data.metrics.response_time.values['p(95)'].toFixed(2)}ms\n`;
  report += `  P99: ${data.metrics.response_time.values['p(99)'].toFixed(2)}ms\n\n`;

  // 判断测试结果
  const passed =
    data.metrics.error_rate.values.rate < 0.005 &&
    memoryTrend.stable &&
    data.metrics.response_time.values['p(95)'] < 500;

  if (passed) {
    report += '✅ 浸泡测试通过！系统长期运行稳定。\n';
  } else {
    report += '❌ 浸泡测试失败，发现稳定性问题：\n';
    if (data.metrics.error_rate.values.rate >= 0.005) {
      report += '   - 错误率过高\n';
    }
    if (!memoryTrend.stable) {
      report += '   - 内存持续增长（可能存在内存泄漏）\n';
    }
    if (data.metrics.response_time.values['p(95)'] >= 500) {
      report += '   - 性能退化明显\n';
    }
  }

  report += '\n===============================================================\n\n';

  return report;
}
```

**监控脚本** (配合浸泡测试):

```bash
#!/bin/bash
# tests/soak/monitor-soak-test.sh

LOG_FILE="soak-test-monitor-$(date +%Y%m%d-%H%M%S).log"

echo "开始监控浸泡测试 - $(date)" | tee -a $LOG_FILE
echo "监控间隔: 5分钟" | tee -a $LOG_FILE
echo "持续时间: 24小时" | tee -a $LOG_FILE
echo "======================================" | tee -a $LOG_FILE

# 记录初始状态
echo "\n初始系统状态:" | tee -a $LOG_FILE
free -m | tee -a $LOG_FILE
docker stats --no-stream | tee -a $LOG_FILE

# 监控循环（每5分钟）
for i in {1..288}; do  # 24小时 = 288个5分钟
  echo "\n[$(date)] 检查点 $i/288" | tee -a $LOG_FILE

  # 1. 系统资源
  echo "  - 内存使用:" | tee -a $LOG_FILE
  free -m | grep Mem | awk '{print "    Total: "$2" MB, Used: "$3" MB, Free: "$4" MB"}' | tee -a $LOG_FILE

  echo "  - CPU使用:" | tee -a $LOG_FILE
  top -bn1 | grep "Cpu(s)" | awk '{print "    "$0}' | tee -a $LOG_FILE

  # 2. 应用进程
  echo "  - Node.js进程:" | tee -a $LOG_FILE
  ps aux | grep node | grep -v grep | awk '{print "    PID: "$2", CPU: "$3"%, MEM: "$4"%, RSS: "$6" KB"}' | tee -a $LOG_FILE

  # 3. 数据库连接
  echo "  - PostgreSQL连接数:" | tee -a $LOG_FILE
  psql -U user -d db -c "SELECT count(*) FROM pg_stat_activity;" -t | tr -d ' ' | awk '{print "    "$0" connections"}' | tee -a $LOG_FILE

  # 4. Redis内存
  echo "  - Redis内存:" | tee -a $LOG_FILE
  redis-cli INFO memory | grep used_memory_human | awk -F: '{print "    "$2}' | tee -a $LOG_FILE

  # 5. 应用健康检查
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
  echo "  - 健康检查: $HEALTH_STATUS" | tee -a $LOG_FILE

  # 6. 检测异常
  if [ "$HEALTH_STATUS" != "200" ]; then
    echo "  ⚠️  健康检查失败！" | tee -a $LOG_FILE
    # 发送告警（可选）
    # curl -X POST https://hooks.slack.com/services/xxx -d '{"text":"浸泡测试健康检查失败"}'
  fi

  # 等待5分钟
  sleep 300
done

echo "\n浸泡测试监控完成 - $(date)" | tee -a $LOG_FILE
echo "日志文件: $LOG_FILE"
```

**执行命令**:

```bash
# 启动浸泡测试
k6 run tests/soak/soak-test.js &

# 启动监控脚本
bash tests/soak/monitor-soak-test.sh &

# 查看实时日志
tail -f soak-test-monitor-*.log
```

---

## 尖峰测试方案

### Spike测试脚本

```javascript
// tests/spike/spike-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('spike_error_rate');
const recoveryTime = new Trend('recovery_time');

export const options = {
  scenarios: {
    // 尖峰测试：每10分钟一个2分钟的流量尖峰
    spike_load: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        // 基准负载
        { duration: '8m', target: 100 },

        // 尖峰1: 快速增长到2000
        { duration: '30s', target: 2000 },
        { duration: '1m30s', target: 2000 },
        { duration: '30s', target: 100 }, // 快速恢复

        // 基准负载
        { duration: '7m30s', target: 100 },

        // 尖峰2
        { duration: '30s', target: 2000 },
        { duration: '1m30s', target: 2000 },
        { duration: '30s', target: 100 },

        // 基准负载
        { duration: '7m30s', target: 100 },

        // 尖峰3
        { duration: '30s', target: 2000 },
        { duration: '1m30s', target: 2000 },
        { duration: '30s', target: 100 },

        // 最终观察
        { duration: '10m', target: 100 },
      ],
    },
  },

  thresholds: {
    spike_error_rate: ['rate<0.05'], // 尖峰期间错误率<5%
    http_req_duration: ['p(95)<1000'], // P95<1秒
    recovery_time: ['max<60000'], // 恢复时间<60秒
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 跟踪当前阶段
let currentPhase = 'baseline';
let spikeStartTime = 0;
let recoveryStartTime = 0;

export default function () {
  const currentVUs = __VU;

  // 检测尖峰阶段
  if (currentVUs > 1500 && currentPhase !== 'spike') {
    currentPhase = 'spike';
    spikeStartTime = Date.now();
    console.log(`[${new Date().toISOString()}] 🔥 尖峰开始`);
  } else if (currentVUs < 500 && currentPhase === 'spike') {
    currentPhase = 'recovery';
    recoveryStartTime = Date.now();
    console.log(`[${new Date().toISOString()}] 🔄 开始恢复`);
  } else if (currentVUs < 200 && currentPhase === 'recovery') {
    const recoveryDuration = Date.now() - recoveryStartTime;
    recoveryTime.add(recoveryDuration);
    currentPhase = 'baseline';
    console.log(
      `[${new Date().toISOString()}] ✅ 恢复完成 (耗时${(recoveryDuration / 1000).toFixed(2)}秒)`,
    );
  }

  // 执行测试请求
  const response = http.post(
    `${BASE_URL}/api/v1/sessions/test-session/answers`,
    JSON.stringify({
      wordId: `word-${Math.floor(Math.random() * 1000)}`,
      selectedAnswer: `answer-${Math.floor(Math.random() * 4) + 1}`,
      isCorrect: Math.random() > 0.3,
      responseTime: Math.floor(Math.random() * 5000) + 1000,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      tags: { phase: currentPhase },
    },
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });

  if (currentPhase === 'spike') {
    errorRate.add(!success);
  }

  sleep(Math.random());
}

export function handleSummary(data) {
  const report = generateSpikeReport(data);

  return {
    'spike-test-report.json': JSON.stringify(data, null, 2),
    stdout: report,
  };
}

function generateSpikeReport(data) {
  let report = '\n\n';
  report += '==================== 尖峰测试结果 ====================\n\n';

  report += `尖峰期间错误率: ${(data.metrics.spike_error_rate.values.rate * 100).toFixed(2)}%\n`;
  report += `平均恢复时间: ${(data.metrics.recovery_time.values.avg / 1000).toFixed(2)}秒\n`;
  report += `最大恢复时间: ${(data.metrics.recovery_time.values.max / 1000).toFixed(2)}秒\n\n`;

  report += '不同阶段的响应时间:\n';
  // 注意: 需要按tag分组统计，这里简化处理
  report += `  基准期间 P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  report += `  尖峰期间 P95: ${(data.metrics.http_req_duration.values['p(95)'] * 1.5).toFixed(2)}ms (估算)\n`;
  report += `  恢复期间 P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n\n`;

  const passed =
    data.metrics.spike_error_rate.values.rate < 0.05 &&
    data.metrics.recovery_time.values.max < 60000;

  if (passed) {
    report += '✅ 尖峰测试通过！系统能快速应对流量突变。\n';
  } else {
    report += '❌ 尖峰测试失败：\n';
    if (data.metrics.spike_error_rate.values.rate >= 0.05) {
      report += '   - 尖峰期间错误率过高\n';
    }
    if (data.metrics.recovery_time.values.max >= 60000) {
      report += '   - 系统恢复时间过长\n';
    }
  }

  report += '\n=======================================================\n\n';

  return report;
}
```

**执行命令**:

```bash
k6 run tests/spike/spike-test.js
```

---

## 前端性能测试

### Lighthouse CI配置

```json
// .lighthouserc.json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:5173/",
        "http://localhost:5173/learning",
        "http://localhost:5173/dashboard"
      ],
      "numberOfRuns": 5,
      "settings": {
        "preset": "desktop",
        "throttling": {
          "rttMs": 40,
          "throughputKbps": 10240,
          "cpuSlowdownMultiplier": 1
        }
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["warn", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }],

        "first-contentful-paint": ["error", { "maxNumericValue": 2000 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 300 }],
        "speed-index": ["error", { "maxNumericValue": 3000 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

### Bundle大小分析

```javascript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 将依赖按包名分组
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@phosphor-icons')) {
              return 'icons';
            }
            if (id.includes('@tanstack')) {
              return 'tanstack';
            }
            return 'vendor';
          }
        },
      },
    },
    reportCompressedSize: true,
  },
});
```

**执行命令**:

```bash
# 构建并分析Bundle
npm run build

# 运行Lighthouse CI
npm install -g @lhci/cli
lhci autorun

# 查看Bundle分析报告
open dist/stats.html
```

---

## 数据库性能测试

### pgbench基准测试

```bash
#!/bin/bash
# tests/database/pgbench-test.sh

DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="vocab_db"
DB_USER="user"

echo "PostgreSQL性能基准测试"
echo "======================"

# 1. 初始化测试数据
echo "\n1. 初始化pgbench测试数据..."
pgbench -i -s 50 -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME

# 2. 只读测试
echo "\n2. 执行只读测试 (100并发, 2分钟)..."
pgbench -c 100 -j 4 -T 120 -S -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME > results/pgbench-readonly.txt

# 3. 读写混合测试
echo "\n3. 执行读写混合测试 (100并发, 2分钟)..."
pgbench -c 100 -j 4 -T 120 -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME > results/pgbench-readwrite.txt

# 4. 自定义查询测试
echo "\n4. 执行自定义查询测试..."
cat > /tmp/custom-query.sql <<'EOF'
\set userid random(1, 1000)
\set wordid random(1, 10000)

-- 模拟单词学习状态查询
SELECT wls.*, ws.*
FROM word_learning_states wls
LEFT JOIN word_scores ws ON wls."wordId" = ws."wordId" AND wls."userId" = ws."userId"
WHERE wls."userId" = (SELECT id FROM users LIMIT 1 OFFSET :userid)
  AND wls."wordId" = (SELECT id FROM words LIMIT 1 OFFSET :wordid);
EOF

pgbench -c 50 -j 4 -T 120 -f /tmp/custom-query.sql -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME > results/pgbench-custom.txt

echo "\n测试完成！结果已保存到 results/ 目录"

# 5. 分析结果
echo "\n=========== 测试结果汇总 ==========="
echo "\n只读测试:"
grep "tps" results/pgbench-readonly.txt
echo "\n读写混合测试:"
grep "tps" results/pgbench-readwrite.txt
echo "\n自定义查询测试:"
grep "tps" results/pgbench-custom.txt
```

### 慢查询分析脚本

```sql
-- tests/database/slow-query-analysis.sql

-- 启用慢查询日志
ALTER SYSTEM SET log_min_duration_statement = 100;
SELECT pg_reload_conf();

-- 安装pg_stat_statements扩展
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 查看慢查询TOP 20
SELECT
  substring(query, 1, 100) AS short_query,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_time_ms,
  ROUND(max_exec_time::numeric, 2) AS max_time_ms,
  ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
  ROUND((mean_exec_time * calls)::numeric, 2) AS total_time_ms,
  ROUND((100 * (mean_exec_time * calls) / sum(mean_exec_time * calls) OVER ())::numeric, 2) AS percentage
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 查看缺失索引建议
SELECT
  schemaname,
  tablename,
  attname,
  null_frac,
  avg_width,
  n_distinct,
  CASE
    WHEN null_frac > 0.5 THEN '建议添加部分索引 (WHERE ... IS NOT NULL)'
    WHEN n_distinct < 100 THEN '低基数，考虑使用部分索引或BRIN索引'
    WHEN avg_width > 100 THEN '字段较大，考虑使用TOAST或GIN索引'
    ELSE '建议添加B-tree索引'
  END AS recommendation
FROM pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND (null_frac > 0.3 OR n_distinct < 1000)
ORDER BY tablename, attname;

-- 查看表膨胀情况
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  n_live_tup,
  n_dead_tup,
  ROUND((n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0))::numeric, 2) AS dead_pct,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

---

## 测试数据准备

### 数据生成脚本

```typescript
// tests/fixtures/generate-test-data.ts
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

interface TestDataConfig {
  users: number;
  wordsPerUser: number;
  answersPerUser: number;
}

async function generateTestData(config: TestDataConfig) {
  console.log('开始生成测试数据...');
  console.log(`  用户数: ${config.users}`);
  console.log(`  每用户单词数: ${config.wordsPerUser}`);
  console.log(`  每用户答题数: ${config.answersPerUser}`);

  // 1. 创建单词本
  console.log('\n1. 创建系统单词本...');
  const wordBook = await prisma.wordBook.create({
    data: {
      name: 'Performance Test Word Book',
      description: '性能测试专用单词本',
      type: 'SYSTEM',
      isPublic: true,
    },
  });

  // 2. 批量创建单词
  console.log('2. 批量创建单词...');
  const wordCount = config.users * config.wordsPerUser;
  const words = [];

  for (let i = 0; i < wordCount; i++) {
    words.push({
      wordBookId: wordBook.id,
      spelling: faker.word.noun() + i, // 确保唯一性
      phonetic: `/${faker.word.noun()}/`,
      meanings: [faker.lorem.sentence(), faker.lorem.sentence()],
      examples: [faker.lorem.paragraph(), faker.lorem.paragraph()],
    });

    // 每1000条批量插入一次
    if ((i + 1) % 1000 === 0) {
      await prisma.word.createMany({ data: words });
      words.length = 0;
      console.log(`  已创建 ${i + 1}/${wordCount} 个单词`);
    }
  }

  if (words.length > 0) {
    await prisma.word.createMany({ data: words });
  }

  // 3. 创建用户
  console.log('\n3. 批量创建用户...');
  const users = [];

  for (let i = 0; i < config.users; i++) {
    users.push({
      email: `test-user-${i}@example.com`,
      username: `test-user-${i}`,
      passwordHash: '$2b$10$dummyHashForTestingOnly', // 测试用密码哈希
    });
  }

  await prisma.user.createMany({ data: users });

  // 获取创建的用户ID
  const createdUsers = await prisma.user.findMany({
    where: { email: { startsWith: 'test-user-' } },
    select: { id: true },
  });

  // 4. 创建学习状态
  console.log('\n4. 批量创建学习状态...');
  const allWords = await prisma.word.findMany({
    where: { wordBookId: wordBook.id },
    select: { id: true },
  });

  const states = [];
  for (const user of createdUsers) {
    const userWords = allWords.slice(0, config.wordsPerUser);

    for (const word of userWords) {
      states.push({
        userId: user.id,
        wordId: word.id,
        state: faker.helpers.arrayElement(['NEW', 'LEARNING', 'REVIEWING', 'MASTERED']),
        masteryLevel: faker.number.int({ min: 0, max: 5 }),
        easeFactor: faker.number.float({ min: 1.3, max: 2.5 }),
        reviewCount: faker.number.int({ min: 0, max: 20 }),
        currentInterval: faker.number.int({ min: 1, max: 30 }),
      });
    }
  }

  // 批量插入（每5000条一批）
  for (let i = 0; i < states.length; i += 5000) {
    const batch = states.slice(i, i + 5000);
    await prisma.wordLearningState.createMany({ data: batch });
    console.log(`  已创建 ${Math.min(i + 5000, states.length)}/${states.length} 个学习状态`);
  }

  // 5. 创建答题记录
  console.log('\n5. 批量创建答题记录...');
  const records = [];

  for (const user of createdUsers) {
    const userWords = allWords.slice(0, config.wordsPerUser);

    for (let i = 0; i < config.answersPerUser; i++) {
      const word = faker.helpers.arrayElement(userWords);
      const isCorrect = Math.random() > 0.3; // 70%正确率

      records.push({
        userId: user.id,
        wordId: word.id,
        selectedAnswer: `answer-${faker.number.int({ min: 1, max: 4 })}`,
        correctAnswer: 'answer-1',
        isCorrect,
        timestamp: faker.date.recent({ days: 30 }),
        responseTime: faker.number.int({ min: 1000, max: 10000 }),
        dwellTime: faker.number.int({ min: 500, max: 3000 }),
      });
    }
  }

  // 批量插入（每5000条一批）
  for (let i = 0; i < records.length; i += 5000) {
    const batch = records.slice(i, i + 5000);
    await prisma.answerRecord.createMany({ data: batch, skipDuplicates: true });
    console.log(`  已创建 ${Math.min(i + 5000, records.length)}/${records.length} 条答题记录`);
  }

  console.log('\n✅ 测试数据生成完成！');
  console.log('\n数据统计:');
  console.log(`  用户数: ${config.users}`);
  console.log(`  单词数: ${wordCount}`);
  console.log(`  学习状态数: ${states.length}`);
  console.log(`  答题记录数: ${records.length}`);
}

// 执行
const config: TestDataConfig = {
  users: parseInt(process.env.TEST_USERS || '1000'),
  wordsPerUser: parseInt(process.env.TEST_WORDS_PER_USER || '50'),
  answersPerUser: parseInt(process.env.TEST_ANSWERS_PER_USER || '100'),
};

generateTestData(config)
  .catch((error) => {
    console.error('生成测试数据失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**执行命令**:

```bash
# 生成小规模测试数据 (100用户)
TEST_USERS=100 TEST_WORDS_PER_USER=50 TEST_ANSWERS_PER_USER=100 \
  tsx tests/fixtures/generate-test-data.ts

# 生成大规模测试数据 (10000用户)
TEST_USERS=10000 TEST_WORDS_PER_USER=100 TEST_ANSWERS_PER_USER=500 \
  tsx tests/fixtures/generate-test-data.ts
```

---

## 测试执行计划

### 测试矩阵

| 测试类型           | 场景                 | 持续时间 | 并发数   | 执行频率   | 负责人   |
| ------------------ | -------------------- | -------- | -------- | ---------- | -------- |
| **单元性能测试**   | AMAS算法、数据库查询 | 即时     | N/A      | 每次提交   | 开发团队 |
| **API基准测试**    | 关键API端点          | 5分钟    | 100      | 每日       | QA团队   |
| **正常负载测试**   | 混合场景             | 10分钟   | 100      | 每周       | QA团队   |
| **峰值负载测试**   | 混合场景             | 20分钟   | 1000     | 每月       | 性能团队 |
| **压力测试**       | 查找崩溃点           | 20分钟   | 100-5000 | 发版前     | 性能团队 |
| **浸泡测试**       | 长期稳定性           | 24小时   | 200      | 重大发版前 | 性能团队 |
| **尖峰测试**       | 流量突变             | 1小时    | 100-2000 | 发版前     | 性能团队 |
| **前端性能测试**   | Lighthouse           | 10分钟   | N/A      | 每周       | 前端团队 |
| **数据库性能测试** | pgbench              | 10分钟   | 100      | 每月       | DBA团队  |

### 测试环境规划

#### 开发环境 (Development)

- **用途**: 日常开发、单元测试
- **配置**: 低配 (2核4GB)
- **数据量**: 小规模 (100用户、5000单词)

#### 测试环境 (Testing)

- **用途**: 功能测试、集成测试
- **配置**: 中配 (4核8GB)
- **数据量**: 中等规模 (1000用户、50000单词)

#### 预发布环境 (Staging)

- **用途**: 性能测试、压力测试
- **配置**: 接近生产 (8核16GB)
- **数据量**: 接近生产 (10000用户、500000单词)

#### 生产环境 (Production)

- **用途**: 实际运行
- **配置**: 高配 (16核32GB+)
- **数据量**: 真实数据

### 执行流程

```mermaid
graph TD
    A[代码提交] --> B[CI/CD触发]
    B --> C[单元性能测试]
    C -->|通过| D[构建测试环境]
    C -->|失败| Z[阻止部署]
    D --> E[部署到测试环境]
    E --> F[API基准测试]
    F -->|通过| G{是否重大变更?}
    F -->|失败| Z
    G -->|是| H[执行完整性能测试套件]
    G -->|否| I[仅执行快速测试]
    H --> J[负载测试]
    H --> K[压力测试]
    H --> L[浸泡测试]
    I --> M[正常负载测试]
    J --> N[分析结果]
    K --> N
    L --> N
    M --> N
    N -->|通过| O[部署到预发布]
    N -->|失败| P[性能问题分析]
    P --> Q[优化代码]
    Q --> A
    O --> R[生产环境监控]
```

---

## 结果分析模板

### 性能测试报告模板

```markdown
# 性能测试报告

**测试日期**: 2025-12-13
**测试版本**: v1.2.0
**测试环境**: Staging
**测试人员**: 张三

## 执行摘要

### 测试概况

- **测试类型**: 正常负载测试、压力测试
- **持续时间**: 30分钟
- **并发数**: 100-5000
- **总请求数**: 1,234,567

### 关键发现

- ✅ 正常负载测试通过，所有指标在预期范围内
- ⚠️ 压力测试发现系统在3000并发时响应时间显著增加
- ❌ 浸泡测试发现内存持续增长，疑似存在内存泄漏

### 性能对比

| 指标            | 目标       | 当前      | 变化      | 状态    |
| --------------- | ---------- | --------- | --------- | ------- |
| API平均响应时间 | <150ms     | 120ms     | -10ms     | ✅ 改善 |
| P95响应时间     | <300ms     | 280ms     | +20ms     | ✅ 通过 |
| 吞吐量          | >500 req/s | 650 req/s | +50 req/s | ✅ 改善 |
| 错误率          | <0.1%      | 0.05%     | -0.02%    | ✅ 改善 |
| 缓存命中率      | >85%       | 88%       | +3%       | ✅ 改善 |

## 详细测试结果

### 1. 正常负载测试 (100并发)

**配置**:

- 持续时间: 10分钟
- 并发用户: 100
- 请求分布: 40%答题 + 30%选词 + 20%查询 + 10%其他

**结果**:
```

总请求数: 180,000
平均吞吐量: 300 req/s
平均响应时间: 120ms
P50: 100ms
P95: 280ms
P99: 450ms
错误数: 90 (0.05%)

```

**分析**:
- ✅ 所有指标均在预期范围内
- ✅ 响应时间稳定，无明显波动
- ✅ 错误率低于0.1%阈值

### 2. 压力测试 (100-5000并发)

**配置**:
- 持续时间: 20分钟
- 并发增长: 每3分钟+500
- 崩溃阈值: 错误率>10% 或 响应时间>5秒

**结果**:
```

崩溃点: 3500并发
最大吞吐量: 1200 req/s
崩溃时错误率: 12%
崩溃时响应时间: 6.5秒

```

**瓶颈识别**:
1. **数据库连接池耗尽**
   - 现象: 3000并发时数据库连接数达到上限
   - 影响: 新请求等待连接，响应时间激增
   - 建议: 增加连接池大小或优化查询

2. **CPU使用率达到90%**
   - 现象: AMAS算法计算占用大量CPU
   - 影响: 请求处理变慢
   - 建议: 使用Worker线程或Native扩展

### 3. 浸泡测试 (24小时)

**配置**:
- 持续时间: 24小时
- 并发用户: 200

**结果**:
```

总请求数: 5,184,000
平均吞吐量: 60 req/s
错误率: 0.3%

内存使用:
初始: 450 MB
最终: 1250 MB
增长: +178%

响应时间:
初始P95: 280ms
最终P95: 520ms
退化: +86%

```

**问题**:
- ❌ **内存持续增长** - 疑似内存泄漏
- ❌ **性能退化明显** - 响应时间增加86%

**定位**:
使用Node.js堆快照分析，发现：
- `userRecentEvents` Map对象持续增长
- 未及时清理过期事件数据
- 建议: 添加LRU淘汰机制，限制Map大小

## 性能瓶颈分析

### CPU瓶颈
- **位置**: AMAS引擎 - LinUCB矩阵运算
- **占用**: 单次处理30-40ms
- **建议**: 使用Rust/C++扩展加速

### I/O瓶颈
- **位置**: 数据库查询 - 单词选择接口
- **耗时**: 150-200ms (含多表JOIN)
- **建议**: 添加复合索引，优化查询

### 内存瓶颈
- **位置**: AMAS服务 - 用户事件缓存
- **增长**: 24小时增长178%
- **建议**: 实现LRU缓存，定期清理

## 优化建议

### 高优先级 (P0)
1. **修复内存泄漏** (AMAS事件缓存)
   - 预期收益: 消除内存增长
   - 实施难度: 低
   - 预计工时: 1天

2. **添加数据库索引** (word_learning_states表)
   - 预期收益: 查询加速40-60%
   - 实施难度: 低
   - 预计工时: 2天

3. **增加连接池大小**
   - 预期收益: 提升并发处理能力30%
   - 实施难度: 低
   - 预计工时: 0.5天

### 中优先级 (P1)
4. **AMAS算法优化** (Native扩展)
   - 预期收益: CPU时间减少70%
   - 实施难度: 高
   - 预计工时: 2周

5. **缓存策略优化**
   - 预期收益: 缓存命中率提升至90%+
   - 实施难度: 中
   - 预计工时: 3天

## 下一步行动

1. **立即修复**: P0级别问题（内存泄漏、索引缺失）
2. **计划实施**: P1级别优化（AMAS Native化）
3. **持续监控**: 生产环境性能指标
4. **定期复测**: 每月执行完整性能测试

## 附录

### 测试脚本
- 正常负载: `tests/load/baseline-load.js`
- 压力测试: `tests/stress/stress-test.js`
- 浸泡测试: `tests/soak/soak-test.js`

### 原始数据
- 详细结果: `results/performance-test-20251213.json`
- 监控日志: `logs/soak-test-monitor-20251213.log`

---

**报告人**: 张三
**审核人**: 李四
**日期**: 2025-12-13
```

---

## 总结

本实施指南提供了完整的性能测试方案，包括：

1. **5种负载测试场景** - 覆盖正常、峰值、压力、浸泡、尖峰
2. **前端性能测试** - Lighthouse CI + Bundle分析
3. **数据库性能测试** - pgbench + 慢查询分析
4. **完整的测试脚本** - 可直接执行的测试代码
5. **测试数据生成** - 自动化生成大规模测试数据
6. **结果分析模板** - 标准化的性能报告

### 快速开始

```bash
# 1. 准备测试环境
docker-compose -f docker-compose.monitoring.yml up -d

# 2. 生成测试数据
TEST_USERS=1000 tsx tests/fixtures/generate-test-data.ts

# 3. 执行基准测试
node tests/load/baseline-load.js

# 4. 执行压力测试
k6 run tests/stress/stress-test.js

# 5. 查看监控
open http://localhost:3001  # Grafana
```

按照本指南执行测试，可以全面评估系统性能并识别瓶颈。
