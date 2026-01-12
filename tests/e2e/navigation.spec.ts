/**
 * Navigation E2E Tests
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from './utils/test-helpers';

test.describe('Navigation', () => {
  test.describe('Deep Linking', () => {
    test('should handle direct URL access when logged in', async ({ page }) => {
      // Login first
      await loginAsUser(page);

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
      await loginAsUser(page);

      // Navigate to profile
      await page.click('a[href="/profile"]');
      await expect(page).toHaveURL('/profile');

      // Go back
      await page.goBack();
      await expect(page).toHaveURL('/');
    });
  });
});
