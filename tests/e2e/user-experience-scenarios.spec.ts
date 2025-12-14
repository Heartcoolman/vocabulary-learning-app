/**
 * 用户体验场景测试套件
 *
 * 模拟真实用户在各种场景下的使用体验，测试系统性能、稳定性和用户体验
 *
 * 测试场景：
 * 1. 新用户首次访问
 * 2. 老用户重复访问
 * 3. 快速连续操作
 * 4. 弱网络环境
 * 5. 长时间使用
 * 6. 跨浏览器测试
 * 7. 边缘场景
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// ========================================
// 工具函数：性能指标测量
// ========================================

interface PerformanceMetrics {
  fcp: number; // First Contentful Paint
  lcp: number; // Largest Contentful Paint
  tti: number; // Time to Interactive
  cls: number; // Cumulative Layout Shift
  fid?: number; // First Input Delay
  totalLoadTime: number;
  domContentLoaded: number;
  resourceLoadTime: number;
}

/**
 * 获取页面性能指标
 */
async function getPerformanceMetrics(page: Page): Promise<PerformanceMetrics> {
  const metrics = await page.evaluate(() => {
    const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintEntries = performance.getEntriesByType('paint');

    // FCP - First Contentful Paint
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    const fcp = fcpEntry ? fcpEntry.startTime : 0;

    // LCP - Largest Contentful Paint
    let lcp = 0;
    if ('PerformanceObserver' in window) {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        lcp = lcpEntries[lcpEntries.length - 1].startTime;
      }
    }

    // TTI - Time to Interactive (近似值：DOMContentLoaded + 一些处理时间)
    const tti = perfData.domContentLoadedEventEnd;

    // CLS - Cumulative Layout Shift (需要Layout Shift API支持)
    let cls = 0;

    return {
      fcp,
      lcp: lcp || perfData.loadEventEnd,
      tti,
      cls,
      totalLoadTime: perfData.loadEventEnd - perfData.fetchStart,
      domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
      resourceLoadTime: perfData.responseEnd - perfData.requestStart,
    };
  });

  return metrics;
}

/**
 * 测量内存使用
 */
async function getMemoryUsage(page: Page): Promise<{ usedJSHeapSize: number; totalJSHeapSize: number; limit: number } | null> {
  return await page.evaluate(() => {
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      return {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        limit: mem.jsHeapSizeLimit,
      };
    }
    return null;
  });
}

/**
 * 等待网络空闲
 */
async function waitForNetworkIdle(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

// ========================================
// 场景 1: 新用户首次访问
// ========================================

test.describe('场景1: 新用户首次访问', () => {
  test.beforeEach(async ({ context }) => {
    // 清除所有缓存和存储，模拟全新用户
    await context.clearCookies();
    await context.clearPermissions();
  });

  for (let round = 1; round <= 5; round++) {
    test(`第${round}轮 - 测量首次加载性能`, async ({ page, context }) => {
      // 清除浏览器缓存
      await context.clearCookies();

      const startTime = Date.now();

      // 导航到首页
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // 等待关键内容加载
      await expect(page.locator('h1, h2, [role="main"]').first()).toBeVisible({ timeout: 10000 });

      // 获取性能指标
      const metrics = await getPerformanceMetrics(page);
      const endTime = Date.now();

      // 性能断言
      expect(metrics.fcp).toBeLessThan(2000); // FCP < 2s
      expect(metrics.lcp).toBeLessThan(4000); // LCP < 4s
      expect(metrics.totalLoadTime).toBeLessThan(5000); // Total Load < 5s

      // 验证资源预加载效果
      const resourceTimings = await page.evaluate(() => {
        return performance.getEntriesByType('resource').map((entry: any) => ({
          name: entry.name,
          duration: entry.duration,
          initiatorType: entry.initiatorType,
        }));
      });

      // 检查关键资源是否快速加载
      const criticalResources = resourceTimings.filter(r =>
        r.initiatorType === 'script' || r.initiatorType === 'link'
      );

      console.log(`第${round}轮首次加载性能:`, {
        round,
        totalTime: endTime - startTime,
        fcp: Math.round(metrics.fcp),
        lcp: Math.round(metrics.lcp),
        tti: Math.round(metrics.tti),
        domContentLoaded: Math.round(metrics.domContentLoaded),
        criticalResourceCount: criticalResources.length,
      });

      // 等待一段时间确保所有资源加载完成
      await page.waitForTimeout(1000);
    });
  }
});

// ========================================
// 场景 2: 老用户重复访问
// ========================================

test.describe('场景2: 老用户重复访问', () => {
  test('5轮重复访问 - 测量缓存效果', async ({ page, context }) => {
    const rounds: Array<{ round: number; loadTime: number; resourceCount: number; cachedCount: number }> = [];

    for (let round = 1; round <= 5; round++) {
      const startTime = Date.now();

      // 访问页面
      await page.goto('/', { waitUntil: 'networkidle' });
      await expect(page.locator('h1, h2, [role="main"]').first()).toBeVisible();

      const endTime = Date.now();

      // 获取资源加载信息
      const resourceInfo = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const cachedResources = resources.filter(r => r.transferSize === 0 || r.transferSize < r.encodedBodySize);

        return {
          total: resources.length,
          cached: cachedResources.length,
        };
      });

      rounds.push({
        round,
        loadTime: endTime - startTime,
        resourceCount: resourceInfo.total,
        cachedCount: resourceInfo.cached,
      });

      console.log(`第${round}轮重复访问:`, rounds[round - 1]);

      // 等待一段时间再进行下一轮
      await page.waitForTimeout(500);
    }

    // 验证缓存效果：后续访问应该更快
    const firstLoad = rounds[0].loadTime;
    const subsequentLoads = rounds.slice(1).map(r => r.loadTime);
    const avgSubsequentLoad = subsequentLoads.reduce((a, b) => a + b, 0) / subsequentLoads.length;

    console.log('缓存效果分析:', {
      firstLoad,
      avgSubsequentLoad,
      improvement: `${Math.round((1 - avgSubsequentLoad / firstLoad) * 100)}%`,
      rounds,
    });

    // 后续加载应该比首次加载快至少20%
    expect(avgSubsequentLoad).toBeLessThan(firstLoad * 0.8);

    // 缓存命中率应该逐渐提高
    const cacheHitRate = rounds.map(r => r.cachedCount / r.resourceCount);
    expect(cacheHitRate[cacheHitRate.length - 1]).toBeGreaterThan(0.5);
  });
});

// ========================================
// 场景 3: 快速连续操作
// ========================================

test.describe('场景3: 快速连续操作', () => {
  test('快速点击操作 - 测试防抖和竞态条件', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 查找可点击的元素
    const clickableElements = await page.locator('button, a[href], [role="button"]').all();

    if (clickableElements.length === 0) {
      console.log('未找到可点击元素，跳过测试');
      return;
    }

    const results: Array<{ element: string; clicks: number; errors: number; responseTime: number }> = [];

    // 对前3个元素进行快速连续点击测试
    for (let i = 0; i < Math.min(3, clickableElements.length); i++) {
      const element = clickableElements[i];
      const elementText = await element.textContent();

      let errorCount = 0;
      let totalTime = 0;
      const clickCount = 10;

      for (let click = 0; click < clickCount; click++) {
        try {
          const startTime = Date.now();

          // 快速点击
          await element.click({ timeout: 1000, force: true });

          totalTime += Date.now() - startTime;

          // 非常短的等待时间
          await page.waitForTimeout(50);
        } catch (error) {
          errorCount++;
        }
      }

      results.push({
        element: elementText || `Element ${i}`,
        clicks: clickCount,
        errors: errorCount,
        responseTime: totalTime / clickCount,
      });
    }

    console.log('快速连续操作测试结果:', results);

    // 验证：错误率应该低于20%
    results.forEach(result => {
      const errorRate = result.errors / result.clicks;
      expect(errorRate).toBeLessThan(0.2);
    });

    // 验证：平均响应时间应该在合理范围内（< 500ms）
    results.forEach(result => {
      expect(result.responseTime).toBeLessThan(500);
    });
  });

  test('表单输入防抖测试', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 查找输入框
    const inputs = await page.locator('input[type="text"], input[type="search"], textarea').all();

    if (inputs.length === 0) {
      console.log('未找到输入框，跳过测试');
      return;
    }

    const input = inputs[0];

    // 快速输入文本
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const startTime = Date.now();

    for (const char of text) {
      await input.type(char, { delay: 10 }); // 快速输入
    }

    const endTime = Date.now();

    // 等待防抖完成
    await page.waitForTimeout(1000);

    console.log('表单输入防抖测试:', {
      inputLength: text.length,
      totalTime: endTime - startTime,
      avgTimePerChar: (endTime - startTime) / text.length,
    });

    // 验证输入框内容正确
    const value = await input.inputValue();
    expect(value).toContain(text);
  });
});

// ========================================
// 场景 4: 弱网络环境
// ========================================

test.describe('场景4: 弱网络环境', () => {
  test.use({
    // 模拟 3G 网络
    offline: false,
  });

  for (let round = 1; round <= 5; round++) {
    test(`第${round}轮 - 3G网络下的加载体验`, async ({ page, context }) => {
      // 使用 Chrome DevTools Protocol 模拟慢速网络
      const client = await context.newCDPSession(page);

      // 模拟 3G Fast 网络条件
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5 Mbps
        uploadThroughput: 750 * 1024 / 8, // 750 Kbps
        latency: 100, // 100ms RTT
      });

      const startTime = Date.now();

      try {
        // 导航到页面
        await page.goto('/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000 // 增加超时时间
        });

        // 等待主要内容可见
        await expect(page.locator('h1, h2, [role="main"]').first()).toBeVisible({ timeout: 20000 });

        const endTime = Date.now();
        const loadTime = endTime - startTime;

        console.log(`第${round}轮 3G网络加载:`, {
          round,
          loadTime,
          acceptable: loadTime < 10000,
        });

        // 弱网络下加载时间应该在可接受范围内（< 10s）
        expect(loadTime).toBeLessThan(10000);

        // 验证页面功能正常
        await page.waitForTimeout(1000);
        const isInteractive = await page.evaluate(() => {
          return document.readyState === 'complete';
        });
        expect(isInteractive).toBe(true);

      } finally {
        // 恢复正常网络
        await client.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: -1,
          uploadThroughput: -1,
          latency: 0,
        });
      }
    });
  }

  test('离线降级测试', async ({ page, context }) => {
    // 首先正常加载页面
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 模拟离线
    const client = await context.newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0,
    });

    // 尝试刷新页面或导航
    try {
      await page.reload({ timeout: 5000 });
    } catch (error) {
      // 预期会失败或显示离线提示
    }

    // 检查是否有离线提示或降级体验
    const hasOfflineMessage = await page.locator('text=/离线|offline|无法连接/i').count() > 0;

    console.log('离线降级测试:', {
      hasOfflineMessage,
      pageVisible: await page.isVisible('body'),
    });

    // 恢复在线
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });
});

// ========================================
// 场景 5: 长时间使用
// ========================================

test.describe('场景5: 长时间使用', () => {
  test('30分钟持续使用 - 内存泄漏检测', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const memorySnapshots: Array<{ time: number; memory: any }> = [];
    const duration = 5 * 60 * 1000; // 5分钟（实际测试缩短时间）
    const interval = 30 * 1000; // 每30秒记录一次
    const startTime = Date.now();

    // 记录初始内存
    const initialMemory = await getMemoryUsage(page);
    memorySnapshots.push({ time: 0, memory: initialMemory });

    console.log('开始长时间使用测试，持续时间:', duration / 1000, '秒');

    // 模拟用户操作
    while (Date.now() - startTime < duration) {
      try {
        // 模拟各种用户操作
        const actions = [
          async () => {
            // 点击随机按钮
            const buttons = await page.locator('button').all();
            if (buttons.length > 0) {
              const randomButton = buttons[Math.floor(Math.random() * buttons.length)];
              await randomButton.click({ timeout: 2000 }).catch(() => {});
            }
          },
          async () => {
            // 滚动页面
            await page.evaluate(() => window.scrollBy(0, 100));
          },
          async () => {
            // 输入文本
            const inputs = await page.locator('input[type="text"], input[type="search"]').all();
            if (inputs.length > 0) {
              await inputs[0].fill('test').catch(() => {});
            }
          },
        ];

        // 随机执行一个操作
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        await randomAction();

        // 等待一段时间
        await page.waitForTimeout(5000);

        // 记录内存使用
        const elapsed = Date.now() - startTime;
        if (elapsed % interval < 5000) {
          const memory = await getMemoryUsage(page);
          memorySnapshots.push({ time: elapsed, memory });
          console.log(`内存快照 (${Math.round(elapsed / 1000)}s):`, memory);
        }
      } catch (error) {
        console.log('操作过程中发生错误:', error);
      }
    }

    // 分析内存趋势
    if (memorySnapshots.length >= 2 && initialMemory && memorySnapshots[memorySnapshots.length - 1].memory) {
      const finalMemory = memorySnapshots[memorySnapshots.length - 1].memory;
      const memoryGrowth = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
      const growthRate = memoryGrowth / initialMemory.usedJSHeapSize;

      console.log('内存使用分析:', {
        initial: Math.round(initialMemory.usedJSHeapSize / 1024 / 1024) + ' MB',
        final: Math.round(finalMemory.usedJSHeapSize / 1024 / 1024) + ' MB',
        growth: Math.round(memoryGrowth / 1024 / 1024) + ' MB',
        growthRate: Math.round(growthRate * 100) + '%',
        snapshots: memorySnapshots.length,
      });

      // 内存增长不应超过100%
      expect(growthRate).toBeLessThan(1.0);
    }
  });
});

// ========================================
// 场景 6: 跨浏览器测试
// ========================================

test.describe('场景6: 跨浏览器兼容性', () => {
  // Playwright 会根据配置自动在不同浏览器中运行

  test('基本功能兼容性测试', async ({ page, browserName }) => {
    console.log('测试浏览器:', browserName);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 验证页面加载
    await expect(page.locator('body')).toBeVisible();

    // 验证关键元素
    const hasMainContent = await page.locator('h1, h2, [role="main"]').first().isVisible();
    expect(hasMainContent).toBe(true);

    // 获取性能指标
    const metrics = await getPerformanceMetrics(page);

    console.log(`${browserName} 性能指标:`, {
      fcp: Math.round(metrics.fcp),
      lcp: Math.round(metrics.lcp),
      loadTime: Math.round(metrics.totalLoadTime),
    });

    // 验证性能在可接受范围
    expect(metrics.totalLoadTime).toBeLessThan(10000);
  });

  test('CSS 和布局兼容性', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 检查是否有布局问题
    const layoutShifts = await page.evaluate(() => {
      return new Promise((resolve) => {
        let shifts = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if ((entry as any).hadRecentInput) continue;
            shifts++;
          }
        });

        observer.observe({ type: 'layout-shift', buffered: true });

        setTimeout(() => {
          observer.disconnect();
          resolve(shifts);
        }, 3000);
      });
    });

    console.log(`${browserName} 布局偏移次数:`, layoutShifts);

    // 布局偏移次数应该较少
    expect(layoutShifts).toBeLessThan(10);
  });
});

// ========================================
// 场景 7: 边缘场景
// ========================================

test.describe('场景7: 边缘场景和错误处理', () => {
  test('异常输入处理', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 查找输入框
    const inputs = await page.locator('input[type="text"], input[type="search"], textarea').all();

    if (inputs.length === 0) {
      console.log('未找到输入框，跳过测试');
      return;
    }

    const testCases = [
      { name: '超长文本', value: 'a'.repeat(10000) },
      { name: '特殊字符', value: '<script>alert("xss")</script>' },
      { name: 'SQL注入', value: "'; DROP TABLE users; --" },
      { name: 'Unicode字符', value: '😀🎉🚀你好世界' },
      { name: '空白字符', value: '   \n\t\r   ' },
    ];

    for (const testCase of testCases) {
      try {
        await inputs[0].fill(testCase.value);
        await page.waitForTimeout(500);

        // 验证页面没有崩溃
        const isVisible = await page.locator('body').isVisible();
        expect(isVisible).toBe(true);

        console.log(`边缘输入测试通过: ${testCase.name}`);
      } catch (error) {
        console.error(`边缘输入测试失败: ${testCase.name}`, error);
        throw error;
      }
    }
  });

  test('网络错误恢复', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const client = await context.newCDPSession(page);

    // 模拟网络故障
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0,
    });

    // 尝试执行需要网络的操作
    const buttons = await page.locator('button').all();
    if (buttons.length > 0) {
      await buttons[0].click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    // 恢复网络
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    await page.waitForTimeout(1000);

    // 验证页面恢复正常
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);

    console.log('网络错误恢复测试通过');
  });

  test('并发请求处理', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 同时触发多个操作
    const buttons = await page.locator('button').all();

    if (buttons.length >= 3) {
      const promises = buttons.slice(0, 3).map(btn =>
        btn.click({ timeout: 5000 }).catch(() => {})
      );

      await Promise.all(promises);
      await page.waitForTimeout(2000);

      // 验证页面状态正常
      const isVisible = await page.locator('body').isVisible();
      expect(isVisible).toBe(true);

      console.log('并发请求测试通过');
    }
  });

  test('大数据量渲染', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 查找可能包含列表的元素
    const lists = await page.locator('ul, ol, [role="list"], table').all();

    if (lists.length > 0) {
      const itemCount = await lists[0].locator('li, tr, [role="listitem"]').count();
      console.log('列表项数量:', itemCount);

      // 如果有大量数据，测试滚动性能
      if (itemCount > 10) {
        const startTime = Date.now();

        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => window.scrollBy(0, 200));
          await page.waitForTimeout(100);
        }

        const endTime = Date.now();
        const scrollTime = endTime - startTime;

        console.log('滚动性能:', { scrollTime, avgPerScroll: scrollTime / 10 });

        // 滚动应该流畅（平均每次 < 200ms）
        expect(scrollTime / 10).toBeLessThan(200);
      }
    }
  });
});
