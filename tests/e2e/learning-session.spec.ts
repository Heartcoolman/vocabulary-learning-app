/**
 * Learning Session E2E Tests
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
  });
});
