/**
 * Authentication E2E Tests
 *
 * End-to-end tests for authentication flows
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Registration', () => {
    test('should register new user successfully', async ({ page }) => {
      await page.goto('/register');

      // Fill registration form
      await page.fill('[name="email"]', `test-${Date.now()}@example.com`);
      await page.fill('[name="username"]', `testuser${Date.now()}`);
      await page.fill('[name="password"]', 'TestPassword123!');
      await page.fill('[name="confirmPassword"]', 'TestPassword123!');

      // Submit
      await page.click('button[type="submit"]');

      // Should redirect to dashboard or login
      await expect(page).toHaveURL(/\/(dashboard|login)/);
    });

    test('should show error for duplicate email', async ({ page }) => {
      // This test requires a known existing user
      test.skip();
    });
  });

  test.describe('Login', () => {
    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('[name="email"]', 'test@example.com');
      await page.fill('[name="password"]', 'password123');

      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard|\/$/);
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('[name="email"]', 'wrong@example.com');
      await page.fill('[name="password"]', 'wrongpassword');

      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('.error, [role="alert"]')).toBeVisible();
    });
  });

  test.describe('Logout', () => {
    test('should logout and redirect to login', async ({ page }) => {
      // Login first
      await page.goto('/login');
      await page.fill('[name="email"]', 'test@example.com');
      await page.fill('[name="password"]', 'password123');
      await page.click('button[type="submit"]');

      // Wait for dashboard
      await page.waitForURL(/\/dashboard|\/$/);

      // Click logout
      await page.click('[data-testid="logout-button"], button:has-text("退出")');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing protected route', async ({ page }) => {
      // Clear any existing auth state
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());

      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
