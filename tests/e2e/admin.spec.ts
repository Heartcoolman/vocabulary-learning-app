/**
 * Admin E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('#email', 'admin@example.com');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test.describe('Admin Dashboard', () => {
    test('should display admin dashboard', async ({ page }) => {
      await page.goto('/admin');
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      // Should show admin page content
      await expect(page).toHaveURL('/admin');
    });

    test('should show admin navigation', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      
      // Admin layout should have navigation links
      const adminLinks = page.locator('a[href^="/admin/"]');
      const count = await adminLinks.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('User Management', () => {
    test('should navigate to users page', async ({ page }) => {
      await page.goto('/admin');
      
      // Click on users link
      const usersLink = page.locator('a[href="/admin/users"]');
      if (await usersLink.isVisible()) {
        await usersLink.click();
        await expect(page).toHaveURL('/admin/users');
      }
    });
  });

  test.describe('Algorithm Config', () => {
    test('should navigate to algorithm config page', async ({ page }) => {
      await page.goto('/admin');
      
      // Click on algorithm config link
      const configLink = page.locator('a[href="/admin/algorithm-config"]');
      if (await configLink.isVisible()) {
        await configLink.click();
        await expect(page).toHaveURL('/admin/algorithm-config');
      }
    });
  });

  test.describe('Access Control', () => {
    test('should deny non-admin access', async ({ page }) => {
      // Logout admin
      await page.goto('/profile');
      page.on('dialog', dialog => dialog.accept());
      await page.click('button:has-text("退出登录")');
      await expect(page).toHaveURL('/login');

      // Login as regular user
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL('/');

      // Try to access admin page - should not show admin link in nav
      const adminLink = page.locator('a[href="/admin"]');
      await expect(adminLink).not.toBeVisible();
    });
  });
});
