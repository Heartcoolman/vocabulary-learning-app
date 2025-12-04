/**
 * Authentication E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Registration', () => {
    test('should register new user successfully', async ({ page }) => {
      await page.goto('/register');

      // Fill registration form (order: username, email, password, confirmPassword)
      const timestamp = Date.now();
      await page.fill('#username', `testuser${timestamp}`);
      await page.fill('#email', `test-${timestamp}@example.com`);
      await page.fill('#password', 'TestPassword123!');
      await page.fill('#confirmPassword', 'TestPassword123!');

      // Submit
      await page.click('button[type="submit"]');

      // Should redirect to home page (/) after registration
      await expect(page).toHaveURL('/');
    });

    test('should show error for short password', async ({ page }) => {
      await page.goto('/register');

      await page.fill('#username', 'testuser');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'short');
      await page.fill('#confirmPassword', 'short');

      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('8');
    });

    test('should show error for password mismatch', async ({ page }) => {
      await page.goto('/register');

      await page.fill('#username', 'testuser');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'Password123!');
      await page.fill('#confirmPassword', 'Different123!');

      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('不一致');
    });
  });

  test.describe('Login', () => {
    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');

      await page.click('button[type="submit"]');

      // Should redirect to home page (/)
      await expect(page).toHaveURL('/');
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('#email', 'wrong@example.com');
      await page.fill('#password', 'wrongpassword');

      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('[role="alert"]')).toBeVisible();
    });

    test('should show error for empty fields', async ({ page }) => {
      await page.goto('/login');

      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('填写');
    });
  });

  test.describe('Logout', () => {
    test('should logout and redirect to login', async ({ page }) => {
      // Login first
      await page.goto('/login');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');
      await page.click('button[type="submit"]');

      // Wait for home page
      await expect(page).toHaveURL('/');

      // Navigate to profile
      await page.click('a[href="/profile"]');
      await expect(page).toHaveURL('/profile');

      // Handle confirm dialog
      page.on('dialog', dialog => dialog.accept());

      // Click logout button
      await page.click('button:has-text("退出登录")');

      // Should redirect to login
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing protected route', async ({ page }) => {
      // Use a fresh context - go to login first then clear cookies
      await page.goto('/login');
      await page.context().clearCookies();
      
      // Now try to access protected route
      await page.goto('/profile');

      // Should redirect to login
      await expect(page).toHaveURL('/login');
    });
  });
});
