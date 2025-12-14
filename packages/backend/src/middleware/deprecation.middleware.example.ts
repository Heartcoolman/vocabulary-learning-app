/**
 * API 废弃中间件使用示例
 *
 * 此文件展示了如何在实际项目中使用废弃中间件
 */

import express, { Router } from 'express';
import {
  deprecationMiddleware,
  createDeprecationWarning,
  createSunsetWarning,
  immediateDeprecation,
  applyDeprecationToRouter,
} from '../middleware/deprecation.middleware';

// ============================================
// 示例 1: 单个路由添加废弃警告
// ============================================

const exampleRouter1 = Router();

// 标记特定路由为已废弃
exampleRouter1.get(
  '/api/v1/users',
  deprecationMiddleware({
    level: 'warning',
    deprecatedAt: new Date('2024-01-01'),
    sunset: new Date('2025-12-31'),
    alternative: '/api/v2/users',
    message: 'v1 用户 API 已废弃，请迁移到 v2 版本',
  }),
  (req, res) => {
    // 你的路由处理逻辑
    res.json({ message: '这是一个已废弃的 API' });
  },
);

// ============================================
// 示例 2: 使用快捷函数创建废弃中间件
// ============================================

const exampleRouter2 = Router();

// 创建警告级别的废弃中间件（API 仍可用，建议迁移）
const warningMiddleware = createDeprecationWarning(
  '/api/v2/products',
  new Date('2025-06-30'), // 下线时间
);

exampleRouter2.get('/api/v1/products', warningMiddleware, (req, res) => {
  res.json({ products: [] });
});

// 创建日落级别的废弃中间件（即将下线，强烈建议迁移）
const sunsetMiddleware = createSunsetWarning(
  new Date('2025-03-31'), // 下线时间
  '/api/v2/orders', // 替代 API
);

exampleRouter2.get('/api/v1/orders', sunsetMiddleware, (req, res) => {
  res.json({ orders: [] });
});

// ============================================
// 示例 3: 为整个路由器应用废弃警告
// ============================================

const legacyRouter = Router();

// 为整个 v1 路由器应用废弃警告
applyDeprecationToRouter(legacyRouter, {
  level: 'warning',
  alternative: '/api/v2',
  sunset: new Date('2025-12-31'),
  message: 'v1 API 已全面废弃，请迁移到 v2 版本',
});

// 这个路由器下的所有路由都会自动添加废弃警告
legacyRouter.get('/users', (req, res) => res.json({ users: [] }));
legacyRouter.get('/posts', (req, res) => res.json({ posts: [] }));
legacyRouter.get('/comments', (req, res) => res.json({ comments: [] }));

// ============================================
// 示例 4: 标记已完全下线的 API（返回 410 Gone）
// ============================================

const exampleRouter4 = Router();

// 对于已经下线的 API，直接返回 410 Gone
exampleRouter4.all(
  '/api/v0/*',
  immediateDeprecation('/api/v2', 'v0 API 已于 2024 年 12 月 31 日完全下线，请使用 v2 API'),
);

// ============================================
// 示例 5: 在主应用中使用（app.ts 风格）
// ============================================

function setupDeprecatedRoutes(app: express.Application) {
  // 方式 1：为特定路由组添加废弃警告
  app.use(
    '/api/records',
    createDeprecationWarning('/api/v1/records', new Date('2025-12-31')),
    exampleRouter1, // 实际的路由处理器
  );

  app.use(
    '/api/word-states',
    createDeprecationWarning('/api/v1/word-states', new Date('2025-12-31')),
    exampleRouter2,
  );

  // 方式 2：对即将下线的 API 使用 sunset 级别
  app.use(
    '/api/legacy-feature',
    createSunsetWarning(new Date('2025-03-01'), '/api/v2/new-feature'),
    exampleRouter4,
  );

  // 方式 3：已完全下线的 API
  app.all('/api/v0/*', immediateDeprecation('/api/v2'));
}

// ============================================
// 示例 6: 分阶段废弃策略
// ============================================

/**
 * 分三个阶段逐步废弃 API：
 *
 * 阶段 1 (2024-01 至 2024-10): Warning 级别
 * - API 正常工作
 * - 添加废弃警告响应头
 * - 记录使用情况
 *
 * 阶段 2 (2024-10 至 2024-12): Sunset 级别
 * - API 仍然工作
 * - 强烈警告即将下线
 * - 提高日志级别
 *
 * 阶段 3 (2025-01 起): 完全下线
 * - 返回 410 Gone
 * - 提供替代 API 信息
 */
function setupPhaseDeprecation(app: express.Application) {
  const now = new Date();
  const phase1End = new Date('2024-10-01');
  const phase2End = new Date('2024-12-31');

  if (now < phase1End) {
    // 阶段 1: Warning
    app.use(
      '/api/old-feature',
      createDeprecationWarning('/api/v2/new-feature', phase2End),
      exampleRouter1,
    );
  } else if (now < phase2End) {
    // 阶段 2: Sunset
    app.use(
      '/api/old-feature',
      createSunsetWarning(phase2End, '/api/v2/new-feature'),
      exampleRouter2,
    );
  } else {
    // 阶段 3: Gone
    app.all('/api/old-feature', immediateDeprecation('/api/v2/new-feature'));
  }
}

// ============================================
// 示例 7: 带条件的废弃警告
// ============================================

const exampleRouter7 = Router();

// 仅在生产环境显示废弃警告
const conditionalDeprecationMiddleware = deprecationMiddleware({
  level: 'warning',
  alternative: '/api/v2/resource',
  sunset: new Date('2025-12-31'),
  enableLogging: process.env.NODE_ENV === 'production', // 开发环境不记录日志
});

exampleRouter7.get('/api/v1/resource', conditionalDeprecationMiddleware, (req, res) => {
  res.json({ data: 'resource' });
});

// ============================================
// 示例 8: 自定义废弃消息
// ============================================

const exampleRouter8 = Router();

exampleRouter8.get(
  '/api/v1/complex-feature',
  deprecationMiddleware({
    level: 'warning',
    alternative: '/api/v2/complex-feature',
    sunset: new Date('2025-06-30'),
    message: `
      复杂功能 API 已废弃。
      新版本提供了更好的性能和更多功能。
      迁移指南：https://docs.example.com/migration-guide
      技术支持：support@example.com
    `.trim(),
  }),
  (req, res) => {
    res.json({ feature: 'complex' });
  },
);

// ============================================
// 导出示例路由器（用于测试）
// ============================================

export {
  exampleRouter1,
  exampleRouter2,
  legacyRouter,
  exampleRouter4,
  exampleRouter7,
  exampleRouter8,
  setupDeprecatedRoutes,
  setupPhaseDeprecation,
};

// ============================================
// 客户端处理示例（JavaScript/TypeScript）
// ============================================

/**
 * 客户端如何处理废弃 API 的响应头
 *
 * ```typescript
 * async function callApi(url: string) {
 *   const response = await fetch(url);
 *
 *   // 检查废弃响应头
 *   const deprecation = response.headers.get('Deprecation');
 *   const sunset = response.headers.get('Sunset');
 *   const alternative = response.headers.get('Link');
 *   const rawMessage = response.headers.get('X-API-Deprecation-Message');
 *   const messageEncoding = response.headers.get('X-API-Deprecation-Message-Encoding');
 *   const message = rawMessage && messageEncoding ? decodeURI(rawMessage) : rawMessage;
 *   const level = response.headers.get('X-API-Deprecation-Level');
 *
 *   if (deprecation) {
 *     console.warn('⚠️ API Deprecation Warning:');
 *     console.warn(`  Level: ${level}`);
 *     console.warn(`  Message: ${message}`);
 *     console.warn(`  Deprecated at: ${deprecation}`);
 *
 *     if (sunset) {
 *       console.warn(`  Sunset: ${sunset}`);
 *     }
 *
 *     if (alternative) {
 *       const match = alternative.match(/<([^>]+)>/);
 *       if (match) {
 *         console.warn(`  Alternative: ${match[1]}`);
 *       }
 *     }
 *
 *     // 根据级别采取不同的行动
 *     if (level === 'sunset') {
 *       // 日落级别：显示强烈警告给用户
 *       alert('此功能即将停止服务，请联系开发团队更新应用');
 *     }
 *   }
 *
 *   return response.json();
 * }
 * ```
 */

// ============================================
// 监控和分析建议
// ============================================

/**
 * 监控废弃 API 使用情况的 SQL 查询示例：
 *
 * -- 统计过去 7 天内废弃 API 的访问次数
 * SELECT
 *   context->'deprecation'->>'path' as api_path,
 *   context->'deprecation'->>'level' as deprecation_level,
 *   COUNT(*) as access_count,
 *   COUNT(DISTINCT context->'deprecation'->>'userId') as unique_users
 * FROM logs
 * WHERE
 *   module = 'deprecation'
 *   AND timestamp > NOW() - INTERVAL '7 days'
 * GROUP BY api_path, deprecation_level
 * ORDER BY access_count DESC;
 *
 * -- 查找仍在使用已废弃 API 的用户
 * SELECT
 *   context->'deprecation'->>'userId' as user_id,
 *   context->'deprecation'->>'path' as api_path,
 *   MAX(timestamp) as last_access,
 *   COUNT(*) as access_count
 * FROM logs
 * WHERE
 *   module = 'deprecation'
 *   AND context->'deprecation'->>'userId' IS NOT NULL
 *   AND timestamp > NOW() - INTERVAL '30 days'
 * GROUP BY user_id, api_path
 * ORDER BY last_access DESC;
 *
 * -- 按 IP 地址统计（用于识别哪些客户端需要更新）
 * SELECT
 *   context->'deprecation'->>'clientIp' as client_ip,
 *   context->'deprecation'->>'userAgent' as user_agent,
 *   COUNT(DISTINCT context->'deprecation'->>'path') as deprecated_apis_used,
 *   MAX(timestamp) as last_access
 * FROM logs
 * WHERE
 *   module = 'deprecation'
 *   AND timestamp > NOW() - INTERVAL '7 days'
 * GROUP BY client_ip, user_agent
 * ORDER BY deprecated_apis_used DESC, last_access DESC;
 */
