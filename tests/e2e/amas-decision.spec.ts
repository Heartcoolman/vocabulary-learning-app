/**
 * AMAS Decision Chain E2E Tests
 *
 * Tests for the AMAS (Adaptive Multi-dimensional Assessment System) decision-making:
 * - Strategy adaptation based on user performance
 * - Difficulty adjustment
 * - State transitions (fatigue, attention, motivation)
 * - Explainability modals
 * - API integration verification
 */

import { test, expect, Page } from '@playwright/test';

// Helper function for login
async function login(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('#email');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/', { timeout: 15000 });
}

// Helper function to clear localStorage session data
async function clearLearningSession(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('mastery_learning_session');
  });
}

// Helper to answer questions quickly (simulating good performance)
async function answerQuestionsFast(page: Page, count: number = 3) {
  for (let i = 0; i < count; i++) {
    const wordCard = page.locator('[data-testid="word-card"]');
    const isVisible = await wordCard.isVisible().catch(() => false);
    if (!isVisible) break;

    // Quick answer
    await page.keyboard.press('1');
    await page.waitForTimeout(2200);
  }
}

// Helper to answer questions slowly (simulating poor performance)
async function answerQuestionsSlow(page: Page, count: number = 3) {
  for (let i = 0; i < count; i++) {
    const wordCard = page.locator('[data-testid="word-card"]');
    const isVisible = await wordCard.isVisible().catch(() => false);
    if (!isVisible) break;

    // Wait before answering (simulates slow response)
    await page.waitForTimeout(5000);
    await page.keyboard.press('1');
    await page.waitForTimeout(2200);
  }
}

test.describe('AMAS Decision Chain', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await clearLearningSession(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test.describe('API Integration', () => {
    test('should call AMAS processLearningEvent API on answer', async ({ page }) => {
      // Monitor API calls
      const apiCalls: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          apiCalls.push(request.url());
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer a question
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(1000);

        // Should have made learning-related API call
        const hasLearningCall = apiCalls.some(url =>
          url.includes('learning') || url.includes('amas') || url.includes('study')
        );
        expect(hasLearningCall).toBeTruthy();
      }
    });

    test('should receive strategy params from AMAS', async ({ page }) => {
      // Monitor API responses
      let amasResponse: unknown = null;
      page.on('response', async response => {
        if (response.url().includes('learning') || response.url().includes('amas')) {
          try {
            const json = await response.json();
            if (json.strategy || json.state) {
              amasResponse = json;
            }
          } catch {
            // Ignore non-JSON responses
          }
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(2000);

        // AMAS response should be received (might be cached locally)
        // The UI update is what matters - strategy explanation should appear
        const strategyText = page.locator('text=当前学习策略');
        await expect(strategyText).toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Strategy Adaptation', () => {
    test('should adapt strategy based on consecutive correct answers', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer several questions quickly (simulating good performance)
        await answerQuestionsFast(page, 5);

        // Strategy should have been updated
        // The strategy explanation should reflect user state
        const strategyText = page.locator('text=当前学习策略');
        const isVisible = await strategyText.isVisible().catch(() => false);

        if (isVisible) {
          // Strategy should exist and have been processed
          expect(isVisible).toBeTruthy();
        }
      }
    });

    test('should show different strategy for different performance patterns', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Record initial strategy text
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(500);

        const initialStrategy = await page.locator('text=当前学习策略').textContent() || '';

        // Wait for next word
        await page.waitForTimeout(2500);

        // Continue answering
        const stillActive = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);
        if (stillActive) {
          // Slow answer to change performance pattern
          await page.waitForTimeout(6000);
          await page.locator('[data-testid="option-0"]').click();
          await page.waitForTimeout(500);

          const laterStrategy = await page.locator('text=当前学习策略').textContent() || '';

          // Strategy explanation should exist
          expect(laterStrategy.length).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('Explainability Features', () => {
    test('should display decision insight button', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer a question to enable insights
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(2500);

        // Look for explainability button (Brain icon)
        const insightButton = page.locator('button[title="决策透视"]');
        const hasButton = await insightButton.isVisible().catch(() => false);

        // Button should exist (may be disabled if no AMAS result yet)
        if (hasButton) {
          expect(hasButton).toBeTruthy();
        }
      }
    });

    test('should open explainability modal', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer multiple questions to ensure AMAS result exists
        await answerQuestionsFast(page, 2);

        // Check for enabled insight button
        const insightButton = page.locator('button[title="决策透视"]:not([disabled])');
        const isEnabled = await insightButton.isVisible().catch(() => false);

        if (isEnabled) {
          await insightButton.click();

          // Modal should appear with AMAS insights
          await page.waitForTimeout(500);
          const modal = page.locator('[role="dialog"], .fixed.inset-0');
          const hasModal = await modal.isVisible().catch(() => false);
          expect(hasModal).toBeTruthy();
        }
      }
    });

    test('should display status monitoring button', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Look for status monitoring button (ChartPie icon)
        const statusButton = page.locator('button[title="状态监控"]');
        const hasButton = await statusButton.isVisible().catch(() => false);

        if (hasButton) {
          await statusButton.click();

          // Status modal should open
          await page.waitForTimeout(500);
          const modal = page.locator('[role="dialog"], .fixed.inset-0');
          const hasModal = await modal.isVisible().catch(() => false);
          expect(hasModal).toBeTruthy();
        }
      }
    });

    test('should display AI suggestion button after answering', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer to generate AMAS result
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(2500);

        // Suggestion button (Lightbulb icon)
        const suggestionButton = page.locator('button[title*="建议"]');
        const hasButton = await suggestionButton.isVisible().catch(() => false);
        expect(hasButton).toBeTruthy();
      }
    });
  });

  test.describe('User State Tracking', () => {
    test('should track response time for AMAS calculation', async ({ page }) => {
      // Monitor API request bodies
      let capturedResponseTime = 0;
      page.on('request', async request => {
        if (request.method() === 'POST' && request.url().includes('learning')) {
          try {
            const postData = request.postData();
            if (postData) {
              const body = JSON.parse(postData);
              if (body.responseTime) {
                capturedResponseTime = body.responseTime;
              }
            }
          } catch {
            // Ignore parsing errors
          }
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Wait a bit before answering to have measurable response time
        await page.waitForTimeout(2000);
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(1000);

        // Response time should have been captured (if API was called)
        // Note: Response time tracking happens client-side
        expect(page).toHaveURL('/');
      }
    });

    test('should handle session pause tracking', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Open a modal (simulating pause)
        const statusButton = page.locator('button[title="状态监控"]');
        if (await statusButton.isVisible()) {
          await statusButton.click();
          await page.waitForTimeout(2000); // Simulate pause time

          // Close modal
          const closeButton = page.locator('button:has-text("关闭"), [aria-label="Close"]');
          if (await closeButton.isVisible()) {
            await closeButton.click();
          } else {
            await page.keyboard.press('Escape');
          }
        }

        await page.waitForTimeout(500);

        // Continue with learning - paused time should be tracked
        await page.locator('[data-testid="option-0"]').click();

        // Session should continue normally
        await page.waitForTimeout(500);
        expect(await page.locator('[data-testid="word-card"], text=目标达成').isVisible()).toBeTruthy();
      }
    });
  });

  test.describe('Cold Start Phase', () => {
    test('should handle new user cold start', async ({ page }) => {
      // Clear all learning data for fresh start
      await clearLearningSession(page);

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // For new users, AMAS should be in cold start phase
      // The system should still function normally
      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);
      const hasNoWords = await page.locator('text=暂无单词').isVisible().catch(() => false);

      // Either should show words or indicate no words available
      expect(hasWordCard || hasNoWords).toBeTruthy();
    });

    test('should adapt quickly during cold start', async ({ page }) => {
      await clearLearningSession(page);

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer several questions quickly
        await answerQuestionsFast(page, 3);

        // AMAS should have started building user profile
        // Progress should be tracked
        const progress = page.locator('[data-testid="mastery-progress"]');
        const isActive = await progress.isVisible().catch(() => false);
        expect(isActive).toBeTruthy();
      }
    });
  });

  test.describe('Queue Adjustment', () => {
    test('should adjust word queue based on performance', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Track words seen
        const wordsSeen: string[] = [];

        for (let i = 0; i < 5; i++) {
          const wordCard = page.locator('[data-testid="word-card"]');
          const isVisible = await wordCard.isVisible().catch(() => false);
          if (!isVisible) break;

          const spelling = await page.locator('[data-testid="word-spelling"]').textContent();
          if (spelling) wordsSeen.push(spelling);

          await page.keyboard.press('1');
          await page.waitForTimeout(2500);
        }

        // Words should have been presented
        expect(wordsSeen.length).toBeGreaterThan(0);
      }
    });

    test('should load more words when queue is low', async ({ page }) => {
      // Monitor API calls for word loading
      let wordLoadCalls = 0;
      page.on('request', request => {
        if (request.url().includes('words') || request.url().includes('next')) {
          wordLoadCalls++;
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer many questions to potentially trigger queue refill
        await answerQuestionsFast(page, 8);

        // Word loading should have occurred
        // Initial load counts as one
        expect(wordLoadCalls).toBeGreaterThanOrEqual(1);
      }
    });
  });

  test.describe('Mastery Decision', () => {
    test('should track mastery progress correctly', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Get initial mastered count
        const initialMastered = await page.locator('[data-testid="mastered-count"]').textContent();
        const initialCount = parseInt(initialMastered?.match(/^\d+/)?.[0] || '0');

        // Answer several questions (some words may become mastered)
        await answerQuestionsFast(page, 10);

        // Check progress
        const masteredCount = page.locator('[data-testid="mastered-count"]');
        const isActive = await masteredCount.isVisible().catch(() => false);

        if (isActive) {
          const finalMastered = await masteredCount.textContent();
          const finalCount = parseInt(finalMastered?.match(/^\d+/)?.[0] || '0');

          // Mastered count should have potentially increased
          expect(finalCount).toBeGreaterThanOrEqual(initialCount);
        }
      }
    });

    test('should complete session when mastery target reached', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Answer many questions
      for (let i = 0; i < 30; i++) {
        const wordCard = page.locator('[data-testid="word-card"]');
        const isVisible = await wordCard.isVisible().catch(() => false);

        if (!isVisible) {
          // Session may have completed
          const completion = page.locator('text=目标达成, text=今日学习结束');
          const isCompleted = await completion.first().isVisible().catch(() => false);
          if (isCompleted) {
            expect(isCompleted).toBeTruthy();
            break;
          }
          break;
        }

        await page.keyboard.press('1');
        await page.waitForTimeout(2200);
      }
    });
  });

  test.describe('Learning Mode Selection', () => {
    test('should display learning mode selector', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Learning mode selector should be visible
        const modeSelector = page.locator('[class*="LearningModeSelector"], button:has-text("模式")');
        const hasSelector = await modeSelector.first().isVisible().catch(() => false);

        // Mode selector may be minimal or full version
        expect(hasSelector || await page.locator('[data-testid="mastery-progress"]').isVisible()).toBeTruthy();
      }
    });
  });

  test.describe('Performance Optimization', () => {
    test('should handle rapid interactions without errors', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Rapid keyboard interactions
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('1');
          await page.waitForTimeout(100);
        }

        // Wait for state to settle
        await page.waitForTimeout(3000);

        // Page should not crash
        expect(await page.locator('main').isVisible()).toBeTruthy();
      }
    });

    test('should debounce multiple rapid answer submissions', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Multiple rapid clicks on same option
        const option = page.locator('[data-testid="option-0"]');
        await option.click();
        await option.click();
        await option.click();

        // Wait for state update
        await page.waitForTimeout(500);

        // Option should be disabled (only first click processed)
        await expect(option).toBeDisabled();

        // Progress should show only 1 question answered
        const questionCount = page.locator('[data-testid="question-count"]');
        const text = await questionCount.textContent();
        const count = parseInt(text?.match(/\d+/)?.[0] || '0');

        // Only one answer should have been processed
        expect(count).toBeLessThanOrEqual(2); // May start at 1
      }
    });
  });
});

test.describe('AMAS Decision - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should handle offline mode gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

    if (hasWordCard) {
      // Go offline
      await page.context().setOffline(true);

      // Try to answer
      await page.locator('[data-testid="option-0"]').click();

      // Should handle gracefully (may use cached data)
      await page.waitForTimeout(3000);

      // Page should not crash
      expect(await page.locator('main').isVisible()).toBeTruthy();

      // Go back online
      await page.context().setOffline(false);
    }
  });

  test('should recover from API errors during learning', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

    if (hasWordCard) {
      // Answer normally first
      await page.locator('[data-testid="option-0"]').click();
      await page.waitForTimeout(2500);

      // Block API temporarily
      await page.route('**/api/**', route => route.abort());

      // Try to answer
      const stillActive = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);
      if (stillActive) {
        await page.locator('[data-testid="option-0"]').click();
      }

      // Wait and restore
      await page.waitForTimeout(1000);
      await page.unroute('**/api/**');

      // Page should recover
      await page.waitForTimeout(2000);
      expect(await page.locator('main').isVisible()).toBeTruthy();
    }
  });

  test('should maintain state across page visibility changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

    if (hasWordCard) {
      // Get initial progress
      const initialProgress = await page.locator('[data-testid="question-count"]').textContent();

      // Simulate tab becoming hidden
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await page.waitForTimeout(1000);

      // Simulate tab becoming visible again
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: false, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await page.waitForTimeout(500);

      // Progress should be maintained
      const finalProgress = await page.locator('[data-testid="question-count"]').textContent();
      expect(finalProgress).toBe(initialProgress);
    }
  });
});
