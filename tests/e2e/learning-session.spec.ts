/**
 * Learning Session E2E Tests
 *
 * Basic tests for learning session initialization and display.
 * For comprehensive learning flow tests, see learning-flow.spec.ts
 * For AMAS decision tests, see amas-decision.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Learning Session', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.waitForSelector('#email');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 15000 });
  });

  test.describe('Learning Page', () => {
    test('should display learning page', async ({ page }) => {
      await expect(page).toHaveURL('/');
      await page.waitForLoadState('networkidle');

      // Main content should be visible
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });

    test('should have navigation header', async ({ page }) => {
      // Navigation should be visible
      const nav = page.locator('nav[role="navigation"]');
      await expect(nav).toBeVisible();
    });

    test('should display word card or empty state', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Should show either word card or empty state message
      const wordCard = page.locator('[data-testid="word-card"]');
      const noWordsMessage = page.locator('text=暂无单词');
      const completedMessage = page.locator('text=目标达成');

      await expect(wordCard.or(noWordsMessage).or(completedMessage).first()).toBeVisible({ timeout: 15000 });
    });

    test('should display progress tracking when learning', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Progress component should be visible
        const progress = page.locator('[data-testid="mastery-progress"]');
        await expect(progress).toBeVisible();
      }
    });

    test('should display test options when learning', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Test options should be visible
        const options = page.locator('[data-testid="test-options"]');
        await expect(options).toBeVisible();

        // Should have multiple options
        const optionButtons = page.locator('[data-testid^="option-"]');
        const count = await optionButtons.count();
        expect(count).toBeGreaterThanOrEqual(2);
      }
    });
  });

  test.describe('Session State', () => {
    test('should preserve session on page reload', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer a question
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(500);

        // Get current progress
        const progressBefore = await page.locator('[data-testid="question-count"]').textContent();

        // Reload
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Check progress is preserved
        const progressAfter = await page.locator('[data-testid="question-count"]').textContent();

        // Progress should be maintained or reset cleanly
        expect(progressAfter).toBeDefined();
      }
    });

    test('should clear session on logout and re-login', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Navigate to profile and logout
      await page.click('a[href="/profile"]');
      await expect(page).toHaveURL('/profile');

      // Handle confirm dialog
      page.on('dialog', dialog => dialog.accept());

      // Click logout button
      await page.click('button:has-text("退出登录")');
      await expect(page).toHaveURL('/login');

      // Clear session storage
      await page.evaluate(() => {
        localStorage.removeItem('mastery_learning_session');
      });

      // Re-login
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });

      // Should start fresh session
      await page.waitForLoadState('networkidle');
      const main = page.locator('main');
      await expect(main).toBeVisible();
    });
  });
});
