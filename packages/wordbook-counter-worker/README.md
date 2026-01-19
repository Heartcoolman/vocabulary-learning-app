# Wordbook Counter Worker

Cloudflare Worker，用于跨实例统计词库中心的下载次数。

## 功能

- 记录每个词书的下载次数到 Cloudflare KV
- 提供 API 供后端查询和增加计数
- 支持多个词库中心（通过 centerId 区分）

## 部署

```bash
cd packages/wordbook-counter-worker
npm install
npx wrangler deploy
```

## 配置

### 后端配置

在后端 `.env` 文件中添加：

```env
WORDBOOK_COUNTER_WORKER_SECRET="danci-wordbook-counter-public-secret-2026"
```

可选：自定义 Worker URL（默认使用内置地址）：

```env
WORDBOOK_COUNTER_WORKER_URL="https://your-worker.your-subdomain.workers.dev"
```

### 关于 API Secret

Worker 使用预设的公开 Secret 来防止随意的恶意请求：

- Secret 值：`danci-wordbook-counter-public-secret-2026`
- 已在 `wrangler.toml` 中配置，部署时自动生效
- 后端需配置相同的值才能成功调用 `/increment` 接口

## API

### GET /health

健康检查

```bash
curl https://wordbook-counter.lijiccc.workers.dev/health
```

### GET /counts

获取下载次数（无需认证）

```bash
curl "https://wordbook-counter.lijiccc.workers.dev/counts?centerId=xxx&ids=id1,id2,id3"
```

### POST /increment

增加下载次数（需要 X-API-Secret header）

```bash
curl -X POST "https://wordbook-counter.lijiccc.workers.dev/increment" \
  -H "Content-Type: application/json" \
  -H "X-API-Secret: danci-wordbook-counter-public-secret-2026" \
  -d '{"centerId":"xxx","wordbookId":"id1"}'
```

## 数据存储

使用 Cloudflare KV 存储，Key 格式：`{centerId}:{wordbookId}`
