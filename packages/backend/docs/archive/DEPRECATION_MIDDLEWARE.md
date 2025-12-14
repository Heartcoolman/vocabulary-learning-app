# API 废弃中间件使用文档

## 概述

API 废弃中间件（`deprecation.middleware.ts`）用于优雅地标记和管理已废弃的 API 版本。它遵循标准的 HTTP 废弃规范，帮助客户端平滑迁移到新版本 API。

## 功能特性

- ✅ 添加标准的 HTTP 废弃响应头（Deprecation、Sunset、Link）
- ✅ 记录废弃 API 的访问日志（包括用户 ID、路径、时间戳）
- ✅ 支持不同的废弃级别（warning、sunset）
- ✅ 可配置废弃时间和替代 API 路径
- ✅ 支持自定义警告消息
- ✅ 完整的单元测试覆盖

## 标准响应头

中间件遵循以下 HTTP 标准规范：

| 响应头                      | 规范                                                                                     | 说明                                       |
| --------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| `Deprecation`               | [RFC Draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header) | API 废弃时间（HTTP-date 格式）             |
| `Sunset`                    | [RFC 8594](https://datatracker.ietf.org/doc/html/rfc8594)                                | API 下线时间（HTTP-date 格式）             |
| `Link`                      | [RFC 8288](https://datatracker.ietf.org/doc/html/rfc8288)                                | 替代 API 链接（`rel="successor-version"`） |
| `X-API-Deprecation-Message` | 自定义                                                                                   | 人类可读的警告消息                         |
| `X-API-Deprecation-Level`   | 自定义                                                                                   | 废弃级别（`warning` 或 `sunset`）          |

## 快速开始

### 基础用法

```typescript
import { deprecationMiddleware } from './middleware/deprecation.middleware';

// 标记单个路由为已废弃
router.get(
  '/api/v1/users',
  deprecationMiddleware({
    level: 'warning',
    alternative: '/api/v2/users',
    sunset: new Date('2024-12-31'),
  }),
  getUsersHandler,
);
```

### 使用快捷函数

```typescript
import { createDeprecationWarning, createSunsetWarning } from './middleware/deprecation.middleware';

// 创建警告级别的废弃中间件
const warningMiddleware = createDeprecationWarning(
  '/api/v2/products', // 替代 API
  new Date('2024-12-31'), // 下线时间（可选）
);

router.get('/api/v1/products', warningMiddleware, getProductsHandler);

// 创建日落级别的废弃中间件（即将下线）
const sunsetMiddleware = createSunsetWarning(
  new Date('2024-06-30'), // 下线时间（必需）
  '/api/v2/orders', // 替代 API（必需）
);

router.get('/api/v1/orders', sunsetMiddleware, getOrdersHandler);
```

## 在 app.ts 中应用

### 方式 1：为特定路由应用

```typescript
// packages/backend/src/app.ts
import { deprecationMiddleware } from './middleware/deprecation.middleware';

// 为旧版本的路由添加废弃警告
app.use(
  '/api/records',
  deprecationMiddleware({
    level: 'warning',
    alternative: '/api/v1/records',
    sunset: new Date('2025-06-01'),
    message: 'records API 已迁移到 v1 版本，请尽快更新',
  }),
  recordRoutes,
);

// 为即将下线的路由添加日落警告
app.use(
  '/api/word-scores',
  deprecationMiddleware({
    level: 'sunset',
    sunset: new Date('2025-03-01'),
    alternative: '/api/v1/word-scores',
    message: 'word-scores API 将于 2025-03-01 下线',
  }),
  wordScoreRoutes,
);
```

### 方式 2：为整个路由器应用

```typescript
import { applyDeprecationToRouter } from './middleware/deprecation.middleware';
import express from 'express';

// 创建旧版本路由器
const legacyRouter = express.Router();

// 为整个路由器应用废弃警告
applyDeprecationToRouter(legacyRouter, {
  level: 'warning',
  alternative: '/api/v2',
  sunset: new Date('2025-12-31'),
  message: 'v1 API 已废弃，请迁移到 v2 版本',
});

// 添加路由
legacyRouter.get('/users', getUsersHandler);
legacyRouter.get('/posts', getPostsHandler);

app.use('/api/v1', legacyRouter);
```

### 方式 3：标记已下线的 API

```typescript
import { immediateDeprecation } from './middleware/deprecation.middleware';

// 对于已经下线的 API，返回 410 Gone
app.all('/api/v0/*', immediateDeprecation('/api/v2', 'v0 API 已完全下线，请使用 v2 API'));
```

## 完整配置示例

```typescript
import { deprecationMiddleware, DeprecationOptions } from './middleware/deprecation.middleware';

const config: DeprecationOptions = {
  // 废弃级别：warning（警告）或 sunset（即将下线）
  level: 'warning',

  // API 被标记为废弃的时间
  deprecatedAt: new Date('2024-01-01'),

  // API 计划下线的时间
  sunset: new Date('2024-12-31'),

  // 替代 API 的路径
  alternative: '/api/v2/users',

  // 自定义警告消息（可选）
  message: '此 API 已废弃，请迁移到 /api/v2/users',

  // 是否记录日志（默认为 true）
  enableLogging: true,
};

const middleware = deprecationMiddleware(config);
router.get('/api/v1/users', middleware, handler);
```

## 废弃级别说明

### Warning 级别

- **用途**：API 仍可正常使用，建议客户端计划迁移
- **日志级别**：`info`
- **建议时间线**：废弃后 6-12 个月下线
- **适用场景**：功能稳定的新版 API 已发布

```typescript
const warningMiddleware = deprecationMiddleware({
  level: 'warning',
  alternative: '/api/v2/resource',
  sunset: new Date('2025-06-01'),
});
```

### Sunset 级别

- **用途**：API 即将下线，强烈建议客户端立即迁移
- **日志级别**：`warn`
- **建议时间线**：1-3 个月内下线
- **适用场景**：接近下线时间，需要紧急提醒客户端

```typescript
const sunsetMiddleware = deprecationMiddleware({
  level: 'sunset',
  sunset: new Date('2025-03-01'),
  alternative: '/api/v2/resource',
});
```

## 日志格式

中间件会自动记录废弃 API 的访问情况：

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
  },
  "msg": "[Deprecation] 已废弃 API 被访问: GET /api/v1/users"
}
```

## 客户端响应示例

客户端收到的响应头：

```http
HTTP/1.1 200 OK
Deprecation: Mon, 01 Jan 2024 00:00:00 GMT
Sunset: Sun, 31 Dec 2024 23:59:59 GMT
Link: </api/v2/users>; rel="successor-version"
X-API-Deprecation-Level: warning
X-API-Deprecation-Message: 此 API 已废弃，请迁移到 /api/v2/users
```

客户端可以通过检查这些响应头来：

1. 识别 API 已废弃
2. 了解下线时间
3. 获取替代 API 路径
4. 显示警告消息给用户

## 最佳实践

### 1. 废弃流程建议

```
阶段 1：标记废弃（Warning）
  ↓ 6-12 个月
阶段 2：即将下线（Sunset）
  ↓ 1-3 个月
阶段 3：完全下线（410 Gone）
```

### 2. 逐步迁移示例

```typescript
// 第一阶段：2024年1月 - 标记废弃
app.use(
  '/api/v1/legacy',
  createDeprecationWarning('/api/v2/new', new Date('2024-12-31')),
  legacyRoutes,
);

// 第二阶段：2024年10月 - 即将下线
app.use('/api/v1/legacy', createSunsetWarning(new Date('2024-12-31'), '/api/v2/new'), legacyRoutes);

// 第三阶段：2025年1月 - 完全下线
app.all('/api/v1/legacy/*', immediateDeprecation('/api/v2/new'));
```

### 3. 通知客户端

在废弃 API 前：

1. **提前通知**：至少提前 6 个月通过邮件、文档、发布说明通知客户
2. **添加中间件**：在 API 路由上应用废弃中间件
3. **监控使用情况**：通过日志监控哪些客户端仍在使用旧 API
4. **提供迁移指南**：编写详细的迁移文档和示例代码
5. **逐步收紧**：从 warning 升级到 sunset，最后完全下线

### 4. 监控废弃 API 使用情况

可以通过日志系统查询废弃 API 的使用情况：

```sql
-- 查询最近 7 天内使用废弃 API 的用户
SELECT
  context->>'deprecation'->>'userId' as user_id,
  context->>'deprecation'->>'path' as api_path,
  COUNT(*) as access_count
FROM logs
WHERE
  module = 'deprecation'
  AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY user_id, api_path
ORDER BY access_count DESC;
```

## 测试

### 运行单元测试

```bash
npm test -- deprecation.middleware.test.ts
```

### 测试覆盖率

```bash
npm run test:coverage -- deprecation.middleware.test.ts
```

### 手动测试示例

```bash
# 测试废弃 API
curl -i http://localhost:3000/api/v1/users

# 查看响应头
# Deprecation: Mon, 01 Jan 2024 00:00:00 GMT
# Sunset: Sun, 31 Dec 2024 23:59:59 GMT
# Link: </api/v2/users>; rel="successor-version"
# X-API-Deprecation-Level: warning
# X-API-Deprecation-Message: 此 API 已废弃...
```

## 常见问题

### Q1: 什么时候应该标记 API 为废弃？

**A**: 当满足以下条件时：

- 新版本 API 已经稳定并投入生产
- 新版本 API 提供了相同或更好的功能
- 有足够的时间让客户端迁移（建议至少 6 个月）

### Q2: warning 和 sunset 级别的区别？

**A**:

- **Warning**: 温和提示，API 仍可正常使用，建议客户端计划迁移（使用 info 日志）
- **Sunset**: 强烈警告，API 即将下线，强烈建议客户端立即迁移（使用 warn 日志）

### Q3: 如何处理没有直接替代的 API？

**A**:

```typescript
deprecationMiddleware({
  level: 'warning',
  message: '此功能已被重新设计，请参考文档了解新的实现方式',
  // 不设置 alternative 字段
});
```

### Q4: 可以只记录日志而不添加响应头吗？

**A**: 不建议这样做。标准的废弃响应头是让客户端感知 API 废弃的最佳方式。如果确实需要，可以：

```typescript
// 不推荐：只记录日志
logger.info({ path: req.path }, 'Legacy API accessed');

// 推荐：使用完整的废弃中间件
deprecationMiddleware({ ... })
```

### Q5: 如何在开发环境禁用废弃警告？

**A**:

```typescript
const deprecationConfig = {
  level: 'warning',
  alternative: '/api/v2/users',
  enableLogging: process.env.NODE_ENV !== 'development',
};
```

## 相关资源

- [RFC 8594: The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)
- [Deprecation HTTP Header Draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header)
- [RFC 8288: Web Linking](https://datatracker.ietf.org/doc/html/rfc8288)
- [API Versioning Best Practices](https://www.troyhunt.com/your-api-versioning-is-wrong-which-is/)

## 维护说明

### 添加新的废弃级别

如果需要添加新的废弃级别（例如 `deprecated-experimental`），需要修改：

1. `DeprecationLevel` 类型定义
2. `logDeprecationUsage` 函数中的日志级别映射
3. 单元测试中的测试用例

### 扩展日志字段

如果需要记录额外的信息（例如 API 响应时间），可以扩展 `DeprecationLogEntry` 接口。

## 许可证

本中间件遵循项目主许可证。
