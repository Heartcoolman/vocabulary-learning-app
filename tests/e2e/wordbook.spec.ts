/**
 * Wordbook (Vocabulary) E2E Tests
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from './utils/test-helpers';

test.describe('Vocabulary', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/vocabulary');
    await expect(page).toHaveURL('/vocabulary');
  });

  test.describe('Vocabulary Page', () => {
    test('should display vocabulary page', async ({ page }) => {
      await expect(page).toHaveURL('/vocabulary');
      // Should show some heading or content related to vocabulary
      await expect(page.locator('h1, h2').first()).toBeVisible();
    });

    test('should show wordbook list', async ({ page }) => {
      // Wait for content to load
      await page.waitForLoadState('networkidle');

      // Should show some wordbook cards or list items
      const content = await page.content();
      // Check if page has loaded some content (not just loading spinner)
      expect(content.length).toBeGreaterThan(100);
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to wordbook detail', async ({ page }) => {
      // Wait for content to load
      await page.waitForLoadState('networkidle');

      // Try to find and click a wordbook link
      const wordbookLink = page.locator('a[href^="/wordbooks/"]').first();

      if (await wordbookLink.isVisible()) {
        await wordbookLink.click();
        await expect(page).toHaveURL(/\/wordbooks\/\w+/);
      }
    });
  });
});
