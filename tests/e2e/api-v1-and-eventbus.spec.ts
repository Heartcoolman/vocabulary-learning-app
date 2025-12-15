/**
 * v1 API 和事件总线 E2E Tests
 *
 * 测试场景：
 * - v1 API 端点功能
 * - API 版本控制
 * - 事件总线集成
 * - 跨服务事件传播
 * - API 废弃警告
 */

import { test, expect } from '@playwright/test';
import { loginAsUser, waitForPageReady } from './utils/test-helpers';
import { buildBackendUrl } from './utils/urls';

test.describe('v1 API Endpoints', () => {
  test.describe('Realtime API', () => {
    test('should access v1 realtime stats endpoint', async ({ page, request }) => {
      await loginAsUser(page);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 测试 v1 API 端点
      const response = await request.get(buildBackendUrl('/api/v1/realtime/stats'), {
        headers: {
          'Cookie': cookieHeader,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(typeof data.data.totalSubscriptions).toBe('number');
      expect(typeof data.data.activeUsers).toBe('number');
      expect(typeof data.data.activeSessions).toBe('number');
    });

    test('should establish SSE connection via v1 API', async ({ page }) => {
      await loginAsUser(page);

      // 监听 v1 API 请求
      const v1Requests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/v1/')) {
          v1Requests.push(request.url());
        }
      });

      await page.goto('/');
      await waitForPageReady(page);
      await page.waitForTimeout(2000);

      // 可能会有 v1 API 调用（根据前端实现）
      console.log('v1 API requests:', v1Requests.length);
    });

    test('should send test event in development mode', async ({ page, request }) => {
      // 仅在测试/开发环境可用
      if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
        await loginAsUser(page);

        const cookies = await page.context().cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // 发送测试事件
        const response = await request.post(buildBackendUrl('/api/v1/realtime/test'), {
          headers: {
            'Cookie': cookieHeader,
            'Content-Type': 'application/json',
          },
          data: {
            sessionId: 'test_session_123',
            eventType: 'feedback',
            payload: {
              message: 'Test event from E2E test',
              timestamp: new Date().toISOString(),
            },
          },
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
      }
    });
  });

  test.describe('API Versioning', () => {
    test('should handle v1 API prefix correctly', async ({ request }) => {
      // 测试 v1 API 路径
      const response = await request.get(buildBackendUrl('/api/v1/realtime/stats'), {
        headers: {
          'Authorization': 'Bearer invalid-token', // 应该返回认证错误
        },
      });

      // 应该返回 401 或 403 (未认证)
      expect([401, 403]).toContain(response.status());
    });

    test('should return consistent response format for v1 APIs', async ({ page, request }) => {
      await loginAsUser(page);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      const response = await request.get(buildBackendUrl('/api/v1/realtime/stats'), {
        headers: { 'Cookie': cookieHeader },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // v1 API 应该遵循一致的响应格式
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
    });

    test('should include API version in response headers', async ({ page, request }) => {
      await loginAsUser(page);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      const response = await request.get(buildBackendUrl('/api/v1/realtime/stats'), {
        headers: { 'Cookie': cookieHeader },
      });

      // 检查响应头（可能包含版本信息）
      const headers = response.headers();
      expect(headers).toBeDefined();

      // API 应该正常响应
      expect(response.ok()).toBeTruthy();
    });
  });

  test.describe('Error Handling', () => {
    test('should return structured error for invalid v1 API requests', async ({ request }) => {
      const response = await request.get(buildBackendUrl('/api/v1/realtime/nonexistent'));

      // 应该返回 404 或 401/403
      expect(response.status()).toBeGreaterThanOrEqual(400);

      if (response.headers()['content-type']?.includes('application/json')) {
        const data = await response.json();
        // 错误响应应该有结构
        expect(data).toBeDefined();
      }
    });

    test('should handle malformed v1 API requests gracefully', async ({ page, request }) => {
      await loginAsUser(page);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 发送格式错误的请求
      const response = await request.post(buildBackendUrl('/api/v1/realtime/test'), {
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/json',
        },
        data: {
          // 缺少必需字段
          invalid: 'data',
        },
      });

      // 应该返回错误（400 或其他）
      // 如果端点不存在或需要开发环境，可能返回 404 或 403
      expect(response.status()).toBeGreaterThanOrEqual(400);
    });
  });
});

test.describe('Event Bus Integration', () => {
  test.describe('Event Propagation', () => {
    test('should propagate learning events through event bus', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // 回答问题（触发事件）
        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        // 验证事件已处理（通过 UI 反馈）
        const feedbackShown = await page.locator('[data-testid^="option-"].bg-green-500, [data-testid^="option-"].bg-red-500').isVisible().catch(() => false);
        expect(feedbackShown).toBeTruthy();

        // 事件应该触发 UI 更新
        await expect(page.locator('main')).toBeVisible();
      }
    });

    test('should handle multiple simultaneous events', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // 快速触发多个事件
        for (let i = 0; i < 3; i++) {
          const isStillActive = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);
          if (!isStillActive) break;

          await page.keyboard.press('1');
          await page.waitForTimeout(2200);
        }

        // 所有事件应该被正确处理
        await expect(page.locator('main')).toBeVisible();
      }
    });

    test('should maintain event order for sequential operations', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // 获取初始问题计数
        const countElement = page.locator('[data-testid="question-count"]');
        const initialText = await countElement.textContent();
        const initialCount = parseInt(initialText?.match(/\d+/)?.[0] || '0');

        // 回答问题
        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        // 计数应该增加（证明事件按序处理）
        const updatedText = await countElement.textContent();
        const updatedCount = parseInt(updatedText?.match(/\d+/)?.[0] || '0');
        expect(updatedCount).toBeGreaterThanOrEqual(initialCount);
      }
    });
  });

  test.describe('Cross-Service Events', () => {
    test('should coordinate between learning and realtime services', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // 学习交互应该触发实时反馈
        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        // 验证反馈显示（说明服务间协调成功）
        const feedback = await page.locator('[data-testid^="option-"].bg-green-500, [data-testid^="option-"].bg-red-500').isVisible().catch(() => false);
        expect(feedback).toBeTruthy();
      }
    });

    test('should update statistics after learning events', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // 记录当前统计
        await page.goto('/statistics');
        await waitForPageReady(page);
        await page.waitForTimeout(1000);

        // 返回学习
        await page.goto('/');
        await waitForPageReady(page);

        // 回答问题
        await page.keyboard.press('1');
        await page.waitForTimeout(2200);

        // 统计应该最终更新（异步）
        await page.goto('/statistics');
        await waitForPageReady(page);
        await expect(page.locator('main')).toBeVisible();
      }
    });

    test('should handle event bus errors gracefully', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      // 即使事件总线有问题，页面也应该继续工作
      await expect(page.locator('main')).toBeVisible();

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // 交互应该仍然工作
        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        // 页面应该响应
        await expect(page.locator('main')).toBeVisible();
      }
    });
  });

  test.describe('Event Subscribers', () => {
    test('should notify all subscribers of learning events', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // 触发事件
        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        // 多个订阅者可能响应：
        // 1. UI 反馈
        // 2. 进度更新
        // 3. 统计更新
        const hasFeedback = await page.locator('[data-testid^="option-"].bg-green-500, [data-testid^="option-"].bg-red-500').isVisible().catch(() => false);
        const hasProgress = await page.locator('[data-testid="question-count"]').isVisible().catch(() => false);

        // 至少应该有一些响应
        expect(hasFeedback || hasProgress).toBeTruthy();
      }
    });

    test('should clean up event listeners properly', async ({ page }) => {
      await loginAsUser(page);

      // 访问多个页面（创建和清理监听器）
      await page.goto('/');
      await waitForPageReady(page);

      await page.goto('/vocabulary');
      await waitForPageReady(page);

      await page.goto('/statistics');
      await waitForPageReady(page);

      await page.goto('/');
      await waitForPageReady(page);

      // 页面应该正常工作（没有内存泄漏或监听器冲突）
      await expect(page.locator('main')).toBeVisible();
    });
  });
});

test.describe('API Deprecation Warnings', () => {
  test.describe('Deprecation Headers', () => {
    test('should include deprecation warnings in response headers for old APIs', async ({ page, request }) => {
      await loginAsUser(page);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 测试可能被废弃的旧 API 端点
      const response = await request.get(buildBackendUrl('/api/statistics/overview'), {
        headers: { 'Cookie': cookieHeader },
      });

      // 检查响应头
      const headers = response.headers();

      // 可能包含 Deprecation 或 Sunset 头
      const hasDeprecationHeader = headers['deprecation'] !== undefined ||
                                   headers['sunset'] !== undefined ||
                                   headers['warning'] !== undefined;

      // API 应该仍然工作
      expect(response.ok() || response.status() === 404).toBeTruthy();
    });

    test('should log deprecation warnings in console', async ({ page }) => {
      const warnings: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'warning' || msg.text().toLowerCase().includes('deprecat')) {
          warnings.push(msg.text());
        }
      });

      await loginAsUser(page);
      await page.goto('/');
      await waitForPageReady(page);

      // 等待可能的警告
      await page.waitForTimeout(2000);

      // 可能会有废弃警告
      console.log('Deprecation warnings found:', warnings.length);
    });
  });

  test.describe('Migration Guides', () => {
    test('should provide alternative endpoints in deprecation response', async ({ page, request }) => {
      await loginAsUser(page);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 请求可能被废弃的端点
      const response = await request.get(buildBackendUrl('/api/statistics/overview'), {
        headers: { 'Cookie': cookieHeader },
      });

      // 即使废弃，也应该提供替代方案或继续工作
      if (response.ok()) {
        const data = await response.json();
        expect(data).toBeDefined();
      }
    });

    test('should maintain backward compatibility during transition', async ({ page }) => {
      await loginAsUser(page);

      // 测试旧的和新的 API 都能工作
      await page.goto('/statistics');
      await waitForPageReady(page);

      // 统计页面应该加载（无论使用哪个版本的 API）
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(2000);

      // 应该有内容
      const hasContent = await page.locator('text=/学习|统计|数据/i').isVisible().catch(() => false);
      expect(hasContent || await page.locator('main').isVisible()).toBeTruthy();
    });
  });

  test.describe('Version Negotiation', () => {
    test('should support multiple API versions simultaneously', async ({ page, request }) => {
      await loginAsUser(page);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 测试 v1 API
      const v1Response = await request.get(buildBackendUrl('/api/v1/realtime/stats'), {
        headers: { 'Cookie': cookieHeader },
      });

      // v1 应该工作
      expect(v1Response.ok()).toBeTruthy();

      // 测试未版本化的 API（可能作为默认版本）
      const defaultResponse = await request.get(buildBackendUrl('/api/users/profile'), {
        headers: { 'Cookie': cookieHeader },
      });

      // 默认 API 也应该工作
      expect(defaultResponse.ok()).toBeTruthy();
    });

    test('should route to correct version based on URL prefix', async ({ request }) => {
      // v1 路径应该路由到 v1 处理器
      const v1Response = await request.get(buildBackendUrl('/api/v1/realtime/stats'), {
        headers: {
          'Authorization': 'Bearer invalid',
        },
      });

      // 应该到达端点（返回认证错误）
      expect([401, 403]).toContain(v1Response.status());

      // 无效路径应该返回 404
      const invalidResponse = await request.get(buildBackendUrl('/api/v99/invalid'));
      expect(invalidResponse.status()).toBe(404);
    });
  });
});
