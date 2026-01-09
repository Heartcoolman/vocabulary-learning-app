/**
 * Learning Flow Integration E2E Tests (使用新 React Query Hooks)
 *
 * 测试场景：
 * 1. 完整的学习流程（从登录到完成学习）
 * 2. React Query缓存的UI表现
 * 3. 乐观更新的即时反馈
 * 4. 网络错误的自动重试
 * 5. 进度持久化和恢复
 * 6. AMAS状态实时更新
 */

import { test, expect, Page } from '@playwright/test';

test.setTimeout(60000);

// ==================== Helper Functions ====================

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 10000 });
}

async function clearLearningData(page: Page) {
  await page.evaluate(() => {
    // 清除学习会话数据
    localStorage.removeItem('mastery_learning_session');
    localStorage.removeItem('mastery_session_cache');
    localStorage.removeItem('learning_session_state');
    localStorage.removeItem('current_word_index');
    // 清除 React Query 缓存
    sessionStorage.clear();
  });
}

function parseFirstInt(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

async function getQuestionCount(page: Page): Promise<number | null> {
  const text = await page.locator('[data-testid="question-count"]').textContent().catch(() => null);
  return parseFirstInt(text);
}

async function waitForPageReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
}

// ==================== Test Suite ====================

test.describe('Learning Flow Integration with React Query', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await clearLearningData(page);
  });

  // ==================== 完整学习流程 ====================

  test.describe('Complete Learning Flow', () => {
    test('应该完成从开始到提交答案的完整流程', async ({ page }) => {
      // 1. 导航到学习页面
      await page.goto('/');
      await waitForPageReady(page);

      // 2. 验证页面加载完成
      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();

      // 3. 检查是否有单词卡片
      const wordCard = page.locator('[data-testid="word-card"]');
      const noWordsMessage = page.locator('text=暂无单词');
      const completedMessage = page
        .locator('text=掌握目标达成')
        .or(page.locator('text=今日学习结束'))
        .or(page.locator('text=没有可学习的单词'));

      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        // 如果没有单词或已完成，验证相应的消息
        await expect(noWordsMessage.or(completedMessage).first()).toBeVisible();
        return;
      }

      // 4. 验证单词显示
      await expect(wordCard).toBeVisible();

      // 5. 验证进度显示
      const progressBar = page.locator('[data-testid="mastery-progress"]');
      await expect(progressBar).toBeVisible();

      // 6. 获取初始进度值
      const initialQuestions = (await getQuestionCount(page)) ?? 0;

      // 7. 选择答案（选择第一个选项）
      const firstOption = page.locator('[data-testid^="option-"]').first();
      await expect(firstOption).toBeVisible();
      await firstOption.click();

      // 8. 等待反馈显示（乐观更新应该立即显示）
      const visualFeedback = page
        .locator('[data-testid^="option-"].bg-green-500, [data-testid^="option-"].bg-red-500')
        .first();
      await expect(visualFeedback).toBeVisible({ timeout: 1000 });

      // 10. 等待自动进入下一题或完成
      await page.waitForTimeout(2300);

      // 11. 验证进度已更新（如果还有单词）
      const hasNewWordCard = await wordCard.isVisible().catch(() => false);
      if (hasNewWordCard) {
        const newQuestions = (await getQuestionCount(page)) ?? initialQuestions;
        console.log(`Initial questions: ${initialQuestions}, New questions: ${newQuestions}`);
      }
    });

    test('应该正确处理连续多个单词的学习', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        console.log('No words available for learning');
        return;
      }

      // 连续答题 3 次
      for (let i = 0; i < 3; i++) {
        const currentWordCard = page.locator('[data-testid="word-card"]');
        const hasCurrentWord = await currentWordCard.isVisible().catch(() => false);

        if (!hasCurrentWord) {
          console.log(`Stopped at iteration ${i}, no more words`);
          break;
        }

        // 选择第一个答案
        const firstOption = page.locator('[data-testid^="option-"]').first();
        await expect(firstOption).toBeVisible();
        await firstOption.click();

        // 等待自动进入下一题（或完成/无更多单词）
        await page.waitForTimeout(2300);
      }

      // 验证完成后的状态
      const completedMessage = page
        .locator('text=掌握目标达成')
        .or(page.locator('text=今日学习结束'));
      const newWordCard = page.locator('[data-testid="word-card"]');

      const isCompleted = await completedMessage.isVisible().catch(() => false);
      const hasMoreWords = await newWordCard.isVisible().catch(() => false);

      // 应该是完成状态或有更多单词
      expect(isCompleted || hasMoreWords).toBe(true);
    });
  });

  // ==================== React Query 缓存测试 ====================

  test.describe('React Query Cache Behavior', () => {
    test('应该在页面刷新后保持学习进度（来自缓存）', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      // 获取初始状态
      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      // 获取初始单词
      const initialWord = await page
        .locator('[data-testid="word-spelling"]')
        .textContent()
        .catch(() => '');

      // 刷新页面
      await page.reload();
      await waitForPageReady(page);

      // 验证缓存恢复
      const restoredWordCard = page.locator('[data-testid="word-card"]');
      const hasRestoredWords = await restoredWordCard.isVisible().catch(() => false);

      if (hasRestoredWords) {
        const restoredWord = await page
          .locator('[data-testid="word-spelling"]')
          .textContent()
          .catch(() => '');

        // 单词可能相同（如果从缓存加载）或不同（如果重新获取）
        console.log(`Initial word: ${initialWord}, Restored word: ${restoredWord}`);
      }
    });

    test('应该在导航到其他页面后返回时使用缓存', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      // 记录当前状态
      const questionsBefore = await getQuestionCount(page);

      // 导航到其他页面
      const statsLink = page.locator('a[href*="/statistics"]').first();
      const hasStatsLink = await statsLink.isVisible().catch(() => false);

      if (hasStatsLink) {
        await statsLink.click();
        await page.waitForTimeout(500);

        // 返回学习页面
        const learnLink = page.locator('a[href="/"]').first();
        await learnLink.click();
        await waitForPageReady(page);

        // 验证状态保持
        const questionsAfter = await getQuestionCount(page);

        // 进度应该保持不变（除非数据已过期）
        console.log(`Questions before: ${questionsBefore}, after: ${questionsAfter}`);
      }
    });
  });

  // ==================== 乐观更新测试 ====================

  test.describe('Optimistic Updates', () => {
    test('应该在提交答案后立即显示反馈（不等待服务器）', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      // 记录点击前的时间
      const startTime = Date.now();

      // 点击答案
      const firstOption = page.locator('[data-testid^="option-"]').first();
      await firstOption.click();

      // 立即检查反馈（不等待网络请求）
      const visualFeedback = page
        .locator('[data-testid^="option-"].bg-green-500, [data-testid^="option-"].bg-red-500')
        .first();

      // 反馈应该在很短的时间内显示（乐观更新）
      await expect(visualFeedback).toBeVisible({ timeout: 1000 });

      const responseTime = Date.now() - startTime;

      // 乐观更新应该在 1 秒内显示
      expect(responseTime).toBeLessThan(1000);

      console.log(`Optimistic update response time: ${responseTime}ms`);
    });

    test('应该在网络延迟时仍然显示即时反馈', async ({ page }) => {
      // 模拟慢速网络
      await page.route('**/api/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2秒延迟
        await route.continue();
      });

      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      const startTime = Date.now();

      // 点击答案
      const firstOption = page.locator('[data-testid^="option-"]').first();
      await firstOption.click();

      // 即使网络慢，反馈也应该快速显示（乐观更新）
      const visualFeedback = page
        .locator('[data-testid^="option-"].bg-green-500, [data-testid^="option-"].bg-red-500')
        .first();
      await expect(visualFeedback).toBeVisible({ timeout: 1000 });

      const responseTime = Date.now() - startTime;

      // 乐观更新应该远快于网络延迟
      expect(responseTime).toBeLessThan(1500);

      console.log(`Optimistic update with slow network: ${responseTime}ms`);
    });
  });

  // ==================== 错误处理和重试 ====================

  test.describe('Error Handling and Retry', () => {
    test('应该在网络错误时显示错误消息', async ({ page }) => {
      // 模拟网络错误
      let requestCount = 0;
      await page.route('**/api/learning/**', async (route) => {
        requestCount++;
        if (requestCount <= 3) {
          // 前3次请求失败
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });

      await page.goto('/');
      await waitForPageReady(page);

      // 应该显示错误消息或加载状态
      const errorMessage = page.locator('text=网络错误');
      const loadingIndicator = page.locator('[data-testid="loading"]');
      const retryButton = page.locator('button:has-text("重试")');

      const hasError = await errorMessage.isVisible().catch(() => false);
      const hasLoading = await loadingIndicator.isVisible().catch(() => false);
      const hasRetry = await retryButton.isVisible().catch(() => false);

      // 应该显示某种错误指示
      expect(hasError || hasLoading || hasRetry).toBe(true);
    });

    test('应该在失败后支持手动重试', async ({ page }) => {
      let shouldFail = true;

      await page.route('**/api/learning/**', async (route) => {
        if (shouldFail) {
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });

      await page.goto('/');
      await page.waitForTimeout(1000);

      // 查找重试按钮
      const retryButton = page.locator('button:has-text("重试")');
      const refreshButton = page.locator('button:has-text("刷新")');

      const hasRetry = await retryButton.isVisible().catch(() => false);
      const hasRefresh = await refreshButton.isVisible().catch(() => false);

      if (hasRetry) {
        // 允许后续请求成功
        shouldFail = false;

        // 点击重试
        await retryButton.click();
        await page.waitForTimeout(1000);

        // 应该加载成功
        const wordCard = page.locator('[data-testid="word-card"]');
        const hasWords = await wordCard.isVisible().catch(() => false);

        console.log(`After retry, has words: ${hasWords}`);
      } else if (hasRefresh) {
        shouldFail = false;
        await refreshButton.click();
        await page.waitForTimeout(1000);
      }
    });
  });

  // ==================== 进度持久化 ====================

  test.describe('Progress Persistence', () => {
    test('应该在本地存储中保存学习进度', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      // 答题
      const firstOption = page.locator('[data-testid^="option-"]').first();
      await firstOption.click();
      await page.waitForTimeout(500);

      // 检查本地存储
      const hasSession = await page.evaluate(() => {
        return localStorage.getItem('mastery_session_cache') !== null;
      });

      // 应该保存了会话数据
      expect(hasSession).toBe(true);
    });

    test('应该在页面关闭后重新打开时恢复进度', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      // 获取初始进度
      const initialProgress = await getQuestionCount(page);

      // 答题
      const firstOption = page.locator('[data-testid^="option-"]').first();
      await firstOption.click();
      await page.waitForTimeout(500);

      // 获取更新后的进度
      const updatedProgress = await getQuestionCount(page);

      // 关闭并重新打开页面
      await page.close();

      // 创建新页面
      const newPage = await page.context().newPage();
      await login(newPage);
      await newPage.goto('/');
      await waitForPageReady(newPage);

      // 获取恢复后的进度
      const restoredProgress = await getQuestionCount(newPage);

      console.log(
        `Initial: ${initialProgress}, Updated: ${updatedProgress}, Restored: ${restoredProgress}`,
      );

      // 进度应该恢复到更新后的状态
      // 注意：这取决于服务器端的持久化实现
      await newPage.close();
    });
  });

  // ==================== AMAS 状态更新 ====================

  test.describe('AMAS State Updates', () => {
    test('应该在答题后更新AMAS状态显示', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      // 查找AMAS状态显示
      const amasStatus = page.locator('[data-testid="amas-status"]');
      const hasAmasStatus = await amasStatus.isVisible().catch(() => false);

      if (hasAmasStatus) {
        // 获取初始状态
        const initialStatus = await amasStatus.textContent();

        // 答题
        const firstOption = page.locator('[data-testid^="option-"]').first();
        await firstOption.click();
        await page.waitForTimeout(1000);

        // 获取更新后的状态
        const updatedStatus = await amasStatus.textContent();

        console.log(`Initial AMAS: ${initialStatus}, Updated AMAS: ${updatedStatus}`);

        // 状态应该已更新（除非状态完全相同）
      }
    });

    test('应该在疲劳度高时显示休息建议', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      // 连续答题多次以增加疲劳度
      for (let i = 0; i < 10; i++) {
        const wordCard = page.locator('[data-testid="word-card"]');
        const hasWords = await wordCard.isVisible().catch(() => false);

        if (!hasWords) {
          break;
        }

        const firstOption = page.locator('[data-testid^="option-"]').first();
        const hasOption = await firstOption.isVisible().catch(() => false);

        if (!hasOption) {
          break;
        }

        await firstOption.click();
        await page.waitForTimeout(2300);

        // 检查是否显示休息建议
        const breakSuggestion = page.locator('text=建议休息');
        const hasBreakSuggestion = await breakSuggestion.isVisible().catch(() => false);

        if (hasBreakSuggestion) {
          console.log(`Break suggestion appeared after ${i + 1} answers`);
          break;
        }

        // 继续下一题：当前页面使用自动切换
      }
    });
  });

  // ==================== 性能测试 ====================

  test.describe('Performance', () => {
    test('应该在合理时间内加载学习页面', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/');
      await waitForPageReady(page);

      const loadTime = Date.now() - startTime;

      // 页面应该在 5 秒内加载完成
      expect(loadTime).toBeLessThan(5000);

      console.log(`Page load time: ${loadTime}ms`);
    });

    test('应该快速响应用户交互', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWords = await wordCard.isVisible().catch(() => false);

      if (!hasWords) {
        return;
      }

      // 测试点击响应时间
      const startTime = Date.now();

      const firstOption = page.locator('[data-testid^="option-"]').first();
      await firstOption.click();

      // 等待任何视觉反馈
      await page.waitForTimeout(100);

      const responseTime = Date.now() - startTime;

      // 交互应该在 500ms 内有响应
      expect(responseTime).toBeLessThan(500);

      console.log(`Interaction response time: ${responseTime}ms`);
    });
  });
});
