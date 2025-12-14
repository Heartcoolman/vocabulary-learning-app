/**
 * Deprecation Middleware Integration Tests
 *
 * 演示废弃中间件在真实 Express 应用中的集成测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import {
  createDeprecationWarning,
  createSunsetWarning,
  immediateDeprecation,
} from '../../src/middleware/deprecation.middleware';

describe('Deprecation Middleware Integration', () => {
  let app: Express;

  beforeAll(() => {
    // 创建测试应用
    app = express();

    // 设置测试路由

    // 1. Warning 级别的废弃路由
    app.get(
      '/api/v1/users',
      createDeprecationWarning('/api/v2/users', new Date('2025-12-31')),
      (req, res) => {
        res.json({ users: ['user1', 'user2'] });
      },
    );

    // 2. Sunset 级别的废弃路由
    app.get(
      '/api/v1/products',
      createSunsetWarning(new Date('2025-03-31'), '/api/v2/products'),
      (req, res) => {
        res.json({ products: ['product1', 'product2'] });
      },
    );

    // 3. 已完全下线的路由
    app.all('/api/v0/*', immediateDeprecation('/api/v2', 'v0 API 已下线'));

    // 4. 正常的新版 API（无废弃警告）
    app.get('/api/v2/users', (req, res) => {
      res.json({ users: ['user1', 'user2', 'user3'] });
    });
  });

  describe('Warning 级别废弃 API', () => {
    it('应该返回成功响应和数据', async () => {
      const response = await request(app).get('/api/v1/users');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ users: ['user1', 'user2'] });
    });

    it('应该包含 Deprecation 响应头', async () => {
      const response = await request(app).get('/api/v1/users');

      expect(response.headers['deprecation']).toBeDefined();
      expect(response.headers['deprecation']).toMatch(/\w{3}, \d{2} \w{3} \d{4}/);
    });

    it('应该包含 Sunset 响应头', async () => {
      const response = await request(app).get('/api/v1/users');

      expect(response.headers['sunset']).toBeDefined();
      expect(response.headers['sunset']).toMatch(/\w{3}, \d{2} \w{3} \d{4}/);
    });

    it('应该包含 Link 响应头指向替代 API', async () => {
      const response = await request(app).get('/api/v1/users');

      expect(response.headers['link']).toBe('</api/v2/users>; rel="successor-version"');
    });

    it('应该包含自定义废弃响应头', async () => {
      const response = await request(app).get('/api/v1/users');

      expect(response.headers['x-api-deprecation-level']).toBe('warning');
      expect(response.headers['x-api-deprecation-message']).toBeDefined();
      const encoding = response.headers['x-api-deprecation-message-encoding'];
      const messageHeader = response.headers['x-api-deprecation-message'] as string;
      const message = encoding ? decodeURI(messageHeader) : messageHeader;
      expect(message).toContain('已废弃');
    });
  });

  describe('Sunset 级别废弃 API', () => {
    it('应该返回成功响应和数据', async () => {
      const response = await request(app).get('/api/v1/products');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ products: ['product1', 'product2'] });
    });

    it('应该标记为 sunset 级别', async () => {
      const response = await request(app).get('/api/v1/products');

      expect(response.headers['x-api-deprecation-level']).toBe('sunset');
    });

    it('应该包含所有必需的废弃响应头', async () => {
      const response = await request(app).get('/api/v1/products');

      expect(response.headers['deprecation']).toBeDefined();
      expect(response.headers['sunset']).toBeDefined();
      expect(response.headers['link']).toBe('</api/v2/products>; rel="successor-version"');
    });

    it('警告消息应该提到即将下线', async () => {
      const response = await request(app).get('/api/v1/products');

      const encoding = response.headers['x-api-deprecation-message-encoding'];
      const messageHeader = response.headers['x-api-deprecation-message'] as string;
      const message = encoding ? decodeURI(messageHeader) : messageHeader;
      expect(message).toContain('即将下线');
    });
  });

  describe('已完全下线的 API', () => {
    it('应该返回 410 Gone 状态码', async () => {
      const response = await request(app).get('/api/v0/anything');

      expect(response.status).toBe(410);
    });

    it('应该返回包含替代 API 的错误响应', async () => {
      const response = await request(app).get('/api/v0/legacy');

      expect(response.body).toMatchObject({
        success: false,
        code: 'API_GONE',
        alternative: '/api/v2',
      });
      expect(response.body.error).toBeDefined();
    });

    it('应该包含 Link 响应头', async () => {
      const response = await request(app).get('/api/v0/old-endpoint');

      expect(response.headers['link']).toBe('</api/v2>; rel="successor-version"');
    });

    it('不同的 HTTP 方法应该都返回 410', async () => {
      const methods = ['get', 'post', 'put', 'delete', 'patch'];

      for (const method of methods) {
        const response = await (request(app) as any)[method]('/api/v0/test');
        expect(response.status).toBe(410);
      }
    });
  });

  describe('正常的新版 API（无废弃）', () => {
    it('不应该包含废弃响应头', async () => {
      const response = await request(app).get('/api/v2/users');

      expect(response.status).toBe(200);
      expect(response.headers['deprecation']).toBeUndefined();
      expect(response.headers['sunset']).toBeUndefined();
      expect(response.headers['x-api-deprecation-level']).toBeUndefined();
      expect(response.headers['x-api-deprecation-message']).toBeUndefined();
    });

    it('应该正常返回数据', async () => {
      const response = await request(app).get('/api/v2/users');

      expect(response.body).toEqual({ users: ['user1', 'user2', 'user3'] });
    });
  });

  describe('响应头格式验证', () => {
    it('HTTP-date 格式应该符合 RFC 7231', async () => {
      const response = await request(app).get('/api/v1/users');

      const deprecation = response.headers['deprecation'];
      const sunset = response.headers['sunset'];

      // RFC 7231 HTTP-date 格式: "Sun, 06 Nov 1994 08:49:37 GMT"
      const httpDateRegex = /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

      expect(deprecation).toMatch(httpDateRegex);
      expect(sunset).toMatch(httpDateRegex);
    });

    it('Link 响应头应该符合 RFC 8288', async () => {
      const response = await request(app).get('/api/v1/users');

      const link = response.headers['link'];

      // RFC 8288 格式: "<URI>; rel="relation-type""
      expect(link).toMatch(/^<[^>]+>; rel=".+"$/);
      expect(link).toContain('rel="successor-version"');
    });
  });

  describe('CORS 和其他中间件兼容性', () => {
    let corsApp: Express;

    beforeAll(() => {
      corsApp = express();

      // 模拟 CORS 中间件
      corsApp.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        next();
      });

      // 添加废弃中间件
      corsApp.get('/api/v1/test', createDeprecationWarning('/api/v2/test'), (req, res) => {
        res.json({ data: 'test' });
      });
    });

    it('应该保留 CORS 响应头', async () => {
      const response = await request(corsApp).get('/api/v1/test');

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('应该同时包含 CORS 和废弃响应头', async () => {
      const response = await request(corsApp).get('/api/v1/test');

      // CORS 响应头
      expect(response.headers['access-control-allow-origin']).toBeDefined();

      // 废弃响应头
      expect(response.headers['deprecation']).toBeDefined();
      expect(response.headers['x-api-deprecation-level']).toBeDefined();
    });
  });

  describe('错误处理', () => {
    let errorApp: Express;

    beforeAll(() => {
      errorApp = express();

      // 添加会抛出错误的废弃路由
      errorApp.get('/api/v1/error', createDeprecationWarning('/api/v2/error'), (req, res) => {
        throw new Error('Internal error');
      });

      // 错误处理中间件
      errorApp.use((err: Error, req: any, res: any, next: any) => {
        res.status(500).json({ error: err.message });
      });
    });

    it('废弃响应头应该在错误发生前添加', async () => {
      const response = await request(errorApp).get('/api/v1/error');

      expect(response.status).toBe(500);
      // 即使路由处理器抛出错误，废弃响应头也应该存在
      expect(response.headers['deprecation']).toBeDefined();
      expect(response.headers['x-api-deprecation-level']).toBe('warning');
    });
  });
});

/**
 * 性能测试示例
 *
 * 验证废弃中间件不会显著影响响应时间
 */
describe('Deprecation Middleware Performance', () => {
  let app: Express;

  beforeAll(() => {
    app = express();

    // 带废弃中间件的路由
    app.get('/api/v1/perf-test', createDeprecationWarning('/api/v2/perf-test'), (req, res) => {
      res.json({ data: 'test' });
    });

    // 不带废弃中间件的路由（对照组）
    app.get('/api/v2/perf-test', (req, res) => {
      res.json({ data: 'test' });
    });
  });

  it('废弃中间件的开销应该可以忽略不计', async () => {
    const iterations = 100;

    // 测试带废弃中间件的路由
    const startWithDeprecation = Date.now();
    for (let i = 0; i < iterations; i++) {
      await request(app).get('/api/v1/perf-test');
    }
    const timeWithDeprecation = Date.now() - startWithDeprecation;

    // 测试不带废弃中间件的路由
    const startWithoutDeprecation = Date.now();
    for (let i = 0; i < iterations; i++) {
      await request(app).get('/api/v2/perf-test');
    }
    const timeWithoutDeprecation = Date.now() - startWithoutDeprecation;

    // 废弃中间件的开销应该小于 20%
    const overhead = (timeWithDeprecation - timeWithoutDeprecation) / timeWithoutDeprecation;
    expect(overhead).toBeLessThan(0.2);

    console.log(`性能测试结果 (${iterations} 次请求):`);
    console.log(`  带废弃中间件: ${timeWithDeprecation}ms`);
    console.log(`  不带废弃中间件: ${timeWithoutDeprecation}ms`);
    console.log(`  开销: ${(overhead * 100).toFixed(2)}%`);
  });
});
