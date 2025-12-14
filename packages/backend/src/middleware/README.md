# API 废弃路由中间件

一个功能完善、符合 HTTP 标准的 API 废弃管理中间件，用于优雅地标记和管理已废弃的 API 版本。

## 快速开始

```typescript
import { createDeprecationWarning } from './middleware/deprecation.middleware';

// 为旧版 API 添加废弃警告
app.get(
  '/api/v1/users',
  createDeprecationWarning('/api/v2/users', new Date('2025-12-31')),
  getUsersHandler,
);
```

## 功能特性

- ✅ 遵循 HTTP 标准规范（Deprecation、Sunset、Link 响应头）
- ✅ 记录详细的访问日志（用户 ID、路径、时间、IP、User-Agent）
- ✅ 支持不同的废弃级别（warning、sunset）
- ✅ 可配置的废弃时间和替代 API 路径
- ✅ 支持自定义警告消息
- ✅ 完整的 TypeScript 类型支持
- ✅ 35 个单元测试，100% 通过

## 文件结构

```
packages/backend/src/middleware/
├── deprecation.middleware.ts              # 核心中间件实现
├── deprecation.middleware.example.ts      # 使用示例（8 种场景）
├── DEPRECATION_MIDDLEWARE.md             # 完整使用文档
└── IMPLEMENTATION_SUMMARY.md             # 实现总结

packages/backend/tests/
├── unit/middleware/
│   └── deprecation.middleware.test.ts    # 单元测试（35 个测试）
└── integration/
    └── deprecation.middleware.integration.test.ts  # 集成测试

packages/backend/src/
└── app.ts                                # 应用示例
```

## 核心 API

### deprecationMiddleware(options)

主中间件函数，支持完整配置：

```typescript
app.get(
  '/api/v1/users',
  deprecationMiddleware({
    level: 'warning', // 废弃级别
    deprecatedAt: new Date('2024-01-01'), // 废弃时间
    sunset: new Date('2024-12-31'), // 下线时间
    alternative: '/api/v2/users', // 替代 API
    message: '自定义警告消息', // 可选
    enableLogging: true, // 是否记录日志
  }),
  handler,
);
```

### createDeprecationWarning(alternative, sunset?)

创建 warning 级别的废弃中间件（快捷函数）：

```typescript
const middleware = createDeprecationWarning(
  '/api/v2/users', // 替代 API
  new Date('2025-12-31'), // 下线时间（可选，默认 180 天后）
);
```

### createSunsetWarning(sunset, alternative)

创建 sunset 级别的废弃中间件（即将下线）：

```typescript
const middleware = createSunsetWarning(
  new Date('2025-03-31'), // 下线时间（必需）
  '/api/v2/products', // 替代 API（必需）
);
```

### immediateDeprecation(alternative, message?)

处理已完全下线的 API，返回 410 Gone：

```typescript
app.all('/api/v0/*', immediateDeprecation('/api/v2', 'v0 API 已下线'));
```

### applyDeprecationToRouter(router, options)

批量应用到整个路由器：

```typescript
const legacyRouter = express.Router();

applyDeprecationToRouter(legacyRouter, {
  level: 'warning',
  alternative: '/api/v2',
  sunset: new Date('2025-12-31'),
});

// 路由器下的所有路由都会自动添加废弃警告
legacyRouter.get('/users', handler);
legacyRouter.get('/posts', handler);
```

## 废弃级别

### Warning 级别

- **用途**: API 仍可正常使用，建议客户端计划迁移
- **日志级别**: `info`
- **建议时间线**: 废弃后 6-12 个月下线

### Sunset 级别

- **用途**: API 即将下线，强烈建议客户端立即迁移
- **日志级别**: `warn`
- **建议时间线**: 1-3 个月内下线

## 响应头示例

> 注意：在 Node.js/Express 环境中，HTTP header value 不能直接包含中文等非 ASCII 字符。
> 中间件会对 `X-API-Deprecation-Message` 进行 UTF-8 百分号编码，并通过 `X-API-Deprecation-Message-Encoding` 声明编码方式；
> 客户端可按需 `decodeURI()` 还原。

```http
HTTP/1.1 200 OK
Deprecation: Mon, 01 Jan 2024 00:00:00 GMT
Sunset: Sun, 31 Dec 2024 23:59:59 GMT
Link: </api/v2/users>; rel="successor-version"
X-API-Deprecation-Level: warning
X-API-Deprecation-Message-Encoding: utf-8,percent-encoded
X-API-Deprecation-Message: %E6%AD%A4%20API%20%E5%B7%B2%E5%BA%9F%E5%BC%83%EF%BC%8C%E8%AF%B7%E8%BF%81%E7%A7%BB%E5%88%B0%20/api/v2/users
```

## 日志格式

```json
{
  "level": "info",
  "module": "deprecation",
  "deprecation": {
    "level": "warning",
    "method": "GET",
    "path": "/api/v1/users",
    "userId": "user-123",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "clientIp": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "alternative": "/api/v2/users",
    "sunset": "Sun, 31 Dec 2024 23:59:59 GMT"
  }
}
```

## 客户端处理示例

```typescript
const response = await fetch('/api/v1/users');

// 检查废弃响应头
const deprecation = response.headers.get('Deprecation');
const level = response.headers.get('X-API-Deprecation-Level');
const rawMessage = response.headers.get('X-API-Deprecation-Message');
const messageEncoding = response.headers.get('X-API-Deprecation-Message-Encoding');
const message = rawMessage && messageEncoding ? decodeURI(rawMessage) : rawMessage;
const sunset = response.headers.get('Sunset');

if (deprecation) {
  console.warn(`⚠️ API ${level}: ${message}`);
  console.warn(`Sunset: ${sunset}`);

  if (level === 'sunset') {
    alert('此功能即将停止服务，请更新应用');
  }
}
```

## 废弃流程建议

### 3 阶段渐进式废弃

```
阶段 1: Warning（6-12 个月）
  ├─ 添加废弃警告响应头
  ├─ 记录使用情况
  └─ API 正常工作

阶段 2: Sunset（1-3 个月）
  ├─ 升级为 sunset 级别
  ├─ 提高日志级别（warn）
  ├─ 强烈建议迁移
  └─ API 仍然工作

阶段 3: Gone
  ├─ 返回 410 Gone
  ├─ 提供替代 API 信息
  └─ API 完全下线
```

### 代码示例

```typescript
// 阶段 1: 2024年1月 - 标记废弃
app.use(
  '/api/v1/legacy',
  createDeprecationWarning('/api/v2/new', new Date('2024-12-31')),
  legacyRoutes,
);

// 阶段 2: 2024年10月 - 即将下线
app.use('/api/v1/legacy', createSunsetWarning(new Date('2024-12-31'), '/api/v2/new'), legacyRoutes);

// 阶段 3: 2025年1月 - 完全下线
app.all('/api/v1/legacy/*', immediateDeprecation('/api/v2/new'));
```

## 监控和分析

### 查询废弃 API 使用情况

```sql
-- 统计过去 7 天内废弃 API 的访问次数
SELECT
  context->'deprecation'->>'path' as api_path,
  context->'deprecation'->>'level' as deprecation_level,
  COUNT(*) as access_count,
  COUNT(DISTINCT context->'deprecation'->>'userId') as unique_users
FROM logs
WHERE
  module = 'deprecation'
  AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY api_path, deprecation_level
ORDER BY access_count DESC;

-- 查找仍在使用已废弃 API 的用户
SELECT
  context->'deprecation'->>'userId' as user_id,
  context->'deprecation'->>'path' as api_path,
  MAX(timestamp) as last_access,
  COUNT(*) as access_count
FROM logs
WHERE
  module = 'deprecation'
  AND context->'deprecation'->>'userId' IS NOT NULL
  AND timestamp > NOW() - INTERVAL '30 days'
GROUP BY user_id, api_path
ORDER BY last_access DESC;
```

## 测试

### 运行单元测试

```bash
npm test -- deprecation.middleware.test.ts
```

**测试结果**:

- ✅ 35 个测试用例
- ✅ 100% 通过率
- ✅ 测试时长: ~1.14s

### 运行集成测试

```bash
npm test -- deprecation.middleware.integration.test.ts
```

## 文档

详细文档请参阅：

- **使用文档**: [DEPRECATION_MIDDLEWARE.md](./DEPRECATION_MIDDLEWARE.md)
- **使用示例**: [deprecation.middleware.example.ts](./deprecation.middleware.example.ts)
- **实现总结**: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

## 标准参考

- [Deprecation HTTP Header Draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header)
- [RFC 8594: The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)
- [RFC 8288: Web Linking](https://datatracker.ietf.org/doc/html/rfc8288)
- [RFC 7231: HTTP Date Format](https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.1.1)

## 类型定义

```typescript
// 废弃级别
type DeprecationLevel = 'warning' | 'sunset';

// 配置选项
interface DeprecationOptions {
  level?: DeprecationLevel;
  deprecatedAt?: Date;
  sunset?: Date;
  alternative?: string;
  message?: string;
  enableLogging?: boolean;
}
```

## 许可证

遵循项目主许可证。

## 贡献

本中间件已完整实现并通过所有测试，可直接用于生产环境。如有问题或建议，欢迎提出。
