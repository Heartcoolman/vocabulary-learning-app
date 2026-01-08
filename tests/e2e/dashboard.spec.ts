/**
 * Dashboard (Learning Page) E2E Tests
 * Note: The app uses "/" as the main learning page, not "/dashboard"
 */

import { test, expect } from '@playwright/test';

test.describe('Learning Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#email');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 15000 });
  });

  test.describe('Overview', () => {
    test('should display learning page', async ({ page }) => {
      await expect(page).toHaveURL('/');
      // Page should have loaded
      await page.waitForLoadState('networkidle');
    });

    test('should show main content', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Should have some main content
      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Navigation from Learning Page', () => {
    test('should navigate to vocabulary from learning page', async ({ page }) => {
      await page.click('a[href="/vocabulary"]');
      await expect(page).toHaveURL('/vocabulary');
    });

    test('should navigate to study settings', async ({ page }) => {
      await page.click('a[href="/study-settings"]');
      await expect(page).toHaveURL('/study-settings');
    });

    test('should navigate to history', async ({ page }) => {
      await page.click('a[href="/history"]');
      await expect(page).toHaveURL('/history');
    });
  });

  test.describe('Statistics Navigation', () => {
    test('should navigate to statistics page', async ({ page }) => {
      // Open insights dropdown
      await page.click('button:has-text("学习洞察")');
      await page.click('a[href="/statistics"]');
      await expect(page).toHaveURL('/statistics');
    });

    test('should navigate to achievements page', async ({ page }) => {
      // Open insights dropdown
      await page.click('button:has-text("学习洞察")');
      await page.click('a[href="/achievements"]');
      await expect(page).toHaveURL('/achievements');
    });

    test('should navigate to plan page', async ({ page }) => {
      // Open insights dropdown
      await page.click('button:has-text("学习洞察")');
      await page.click('a[href="/plan"]');
      await expect(page).toHaveURL('/plan');
    });
  });
});
