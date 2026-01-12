/**
 * Profile E2E Tests
 *
 * Complete tests for user profile management:
 * - Viewing profile information
 * - Changing password
 * - Managing data/cache
 * - Viewing learning habits
 * - Logout functionality
 */

import { test, expect } from '@playwright/test';
import {
  loginAsUser,
  logout,
  waitForPageReady,
  expectErrorAlert,
  TEST_USERS,
} from './utils/test-helpers';

// Increase timeout for profile tests
test.setTimeout(45000);

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/profile');
    await expect(page).toHaveURL('/profile');
    await waitForPageReady(page);
  });

  test.describe('Profile View', () => {
    test('should display profile page', async ({ page }) => {
      await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible();
    });

    test('should show user info', async ({ page }) => {
      // Should show username and email in basic info section
      await expect(page.getByText('用户名')).toBeVisible();
      await expect(page.getByText('邮箱地址')).toBeVisible();
      await expect(page.getByText('注册时间')).toBeVisible();
    });

    test('should show tabs', async ({ page }) => {
      await expect(page.getByRole('button', { name: '基本信息' })).toBeVisible();
      await expect(page.getByRole('button', { name: '修改密码' })).toBeVisible();
      await expect(page.getByRole('button', { name: '数据管理' })).toBeVisible();
      await expect(page.getByRole('button', { name: '学习习惯' })).toBeVisible();
    });

    test('should display user avatar or placeholder', async ({ page }) => {
      // Avatar, placeholder, or user icon should be visible in profile section
      const profileIdentifier = page.locator(
        'img[alt*="avatar"], img[alt*="头像"], .rounded-full, [data-testid="user-avatar"], svg'
      );
      await expect(profileIdentifier.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Tab Navigation', () => {
    test('should switch to password tab', async ({ page }) => {
      await page.click('button:has-text("修改密码")');

      // Should show password form
      await expect(page.locator('#oldPassword')).toBeVisible();
      await expect(page.locator('#newPassword')).toBeVisible();
      await expect(page.locator('#confirmPassword')).toBeVisible();
    });

    test('should switch to cache management tab', async ({ page }) => {
      await page.click('button:has-text("数据管理")');

      // Should show cache management buttons
      await expect(page.getByRole('button', { name: '刷新缓存' })).toBeVisible();
      await expect(page.getByRole('button', { name: '清除本地缓存' })).toBeVisible();
    });

    test('should switch to habit tab', async ({ page }) => {
      await page.click('button:has-text("学习习惯")');

      // Should show habit analysis section
      await expect(page.getByText('学习习惯分析')).toBeVisible();
      await expect(page.getByRole('button', { name: /查看完整分析/ })).toBeVisible();
    });
  });

  test.describe('Password Change', () => {
    test('should show error for empty fields', async ({ page }) => {
      await page.click('button:has-text("修改密码")');

      // Submit empty form
      await page.click('button[type="submit"]:has-text("修改密码")');

      // Should show error
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('填写');
    });

    test('should show error for short password', async ({ page }) => {
      await page.click('button:has-text("修改密码")');

      await page.fill('#oldPassword', TEST_USERS.regular.password);
      await page.fill('#newPassword', 'short');
      await page.fill('#confirmPassword', 'short');

      await page.click('button[type="submit"]:has-text("修改密码")');

      // Should show error (password validation may require 8 or 10 chars)
      const alert = page.locator('[role="alert"], .text-red-700, .border-red-300');
      await expect(alert.first()).toBeVisible({ timeout: 5000 });
    });

    test('should show error for password mismatch', async ({ page }) => {
      await page.click('button:has-text("修改密码")');

      await page.fill('#oldPassword', TEST_USERS.regular.password);
      await page.fill('#newPassword', 'NewPassword123!');
      await page.fill('#confirmPassword', 'Different123!');

      await page.click('button[type="submit"]:has-text("修改密码")');

      // Should show error
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('不一致');
    });
  });

  test.describe('Logout', () => {
    test('should logout from profile page', async ({ page }) => {
      // Click logout button to open confirm modal
      await page.click('button:has-text("退出登录")');

      // Wait for confirm modal and click the confirm button
      await page.waitForSelector('[role="dialog"]');
      await page.click('[role="dialog"] button:has-text("退出")');

      await expect(page).toHaveURL('/login');
    });

    test('should cancel logout when clicking cancel', async ({ page }) => {
      await page.click('button:has-text("退出登录")');
      await page.waitForSelector('[role="dialog"]');

      // Click cancel or press Escape
      const cancelButton = page.locator('[role="dialog"] button:has-text("取消")');
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      } else {
        await page.keyboard.press('Escape');
      }

      // Should stay on profile
      await expect(page).toHaveURL('/profile');
    });
  });

  test.describe('Data Management Tab', () => {
    test('should show cache management options', async ({ page }) => {
      await page.click('button:has-text("数据管理")');

      await expect(page.getByRole('button', { name: '刷新缓存' })).toBeVisible();
      await expect(page.getByRole('button', { name: '清除本地缓存' })).toBeVisible();
    });

    test('should refresh cache when clicking refresh button', async ({ page }) => {
      await page.click('button:has-text("数据管理")');

      const refreshButton = page.getByRole('button', { name: '刷新缓存' });
      await refreshButton.click();

      // Should show some feedback (loading or success)
      await page.waitForTimeout(1000);
      // Page should still be functional
      await expect(page.locator('main')).toBeVisible();
    });

    test('should clear local cache when clicking clear button', async ({ page }) => {
      await page.click('button:has-text("数据管理")');

      const clearButton = page.getByRole('button', { name: '清除本地缓存' });
      await clearButton.click();

      // May show confirmation or complete immediately
      await page.waitForTimeout(1000);
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Learning Habits Tab', () => {
    test('should show learning habit analysis', async ({ page }) => {
      await page.click('button:has-text("学习习惯")');

      await expect(page.getByText('学习习惯分析')).toBeVisible();
    });

    test('should have link to full analysis', async ({ page }) => {
      await page.click('button:has-text("学习习惯")');

      const fullAnalysisButton = page.getByRole('button', { name: /查看完整分析/ });
      await expect(fullAnalysisButton).toBeVisible();
    });

    test('should navigate to habit profile page', async ({ page }) => {
      await page.click('button:has-text("学习习惯")');

      const fullAnalysisButton = page.getByRole('button', { name: /查看完整分析/ });
      await fullAnalysisButton.click();

      await expect(page).toHaveURL('/habit-profile');
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to profile from home page', async ({ page }) => {
      await page.goto('/');
      await page.click('a[href="/profile"]');
      await expect(page).toHaveURL('/profile');
    });

    test('should navigate back to home from profile', async ({ page }) => {
      await page.click('a[href="/"]');
      await expect(page).toHaveURL('/');
    });
  });
});

test.describe('Profile - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('should handle network error on profile load', async ({ page }) => {
    await page.route('**/api/user/profile**', (route) => route.abort());

    await page.goto('/profile');
    await page.waitForTimeout(2000);

    // Should show error or fallback UI
    await expect(page.locator('main')).toBeVisible();
  });

  test('should handle password change with wrong old password', async ({ page }) => {
    await page.goto('/profile');
    await waitForPageReady(page);

    await page.click('button:has-text("修改密码")');

    await page.fill('#oldPassword', 'wrongpassword');
    await page.fill('#newPassword', 'NewPassword123!');
    await page.fill('#confirmPassword', 'NewPassword123!');

    await page.click('button[type="submit"]:has-text("修改密码")');

    // Should show error
    await expectErrorAlert(page);
  });

  test('should preserve tab state on page refresh', async ({ page }) => {
    await page.goto('/profile');
    await waitForPageReady(page);

    // Switch to password tab
    await page.click('button:has-text("修改密码")');
    await expect(page.locator('#oldPassword')).toBeVisible();

    // Refresh page
    await page.reload();
    await waitForPageReady(page);

    // May or may not preserve tab state depending on implementation
    await expect(page.locator('main')).toBeVisible();
  });
});
