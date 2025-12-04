/**
 * Profile E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#email');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/', { timeout: 15000 });
    await page.goto('/profile');
    await page.waitForURL('/profile');
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
      
      await page.fill('#oldPassword', 'password123');
      await page.fill('#newPassword', 'short');
      await page.fill('#confirmPassword', 'short');
      
      await page.click('button[type="submit"]:has-text("修改密码")');
      
      // Should show error
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('8');
    });

    test('should show error for password mismatch', async ({ page }) => {
      await page.click('button:has-text("修改密码")');
      
      await page.fill('#oldPassword', 'password123');
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
      page.on('dialog', dialog => dialog.accept());
      
      await page.click('button:has-text("退出登录")');
      
      await expect(page).toHaveURL('/login');
    });
  });
});
