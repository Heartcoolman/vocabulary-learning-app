/**
 * Navigation E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.describe('Deep Linking', () => {
    test('should handle direct URL access when logged in', async ({ page }) => {
      // Login first
      await page.goto('/login');
      await page.waitForSelector('#email');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });

      // Navigate directly to profile
      await page.goto('/profile');
      await expect(page).toHaveURL('/profile');
      await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible();
    });

    test('should redirect unauthenticated to login', async ({ page }) => {
      // Go to login page and clear cookies
      await page.goto('/login');
      await page.context().clearCookies();
      
      // Try to access protected route
      await page.goto('/vocabulary');
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Back Navigation', () => {
    test('should handle browser back button', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.waitForSelector('#email');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 15000 });

      // Navigate to profile
      await page.click('a[href="/profile"]');
      await expect(page).toHaveURL('/profile');
      
      // Go back
      await page.goBack();
      await expect(page).toHaveURL('/');
    });
  });
});
