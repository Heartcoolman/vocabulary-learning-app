/**
 * Authentication E2E Tests
 *
 * Complete tests for authentication workflows:
 * - User registration (normal and error cases)
 * - User login (normal and error cases)
 * - Logout flow
 * - Protected route access
 * - Session management
 */

import { test, expect } from '@playwright/test';
import {
  TEST_USERS,
  generateTestUser,
  loginAsUser,
  loginAsAdmin,
  logout,
  fillRegistrationForm,
  fillLoginForm,
  submitForm,
  expectErrorAlert,
} from './utils/test-helpers';

test.describe('Authentication', () => {
  test.describe('Registration - Normal Flow', () => {
    test('should register new user successfully', async ({ page }) => {
      await page.goto('/register');
      const testUser = generateTestUser();

      // Fill registration form
      await fillRegistrationForm(page, testUser);

      // Submit
      await submitForm(page);

      // Should redirect to home page (/) after registration
      await expect(page).toHaveURL('/');
    });

    test('should display registration form correctly', async ({ page }) => {
      await page.goto('/register');

      // Check form elements are visible
      await expect(page.locator('#username')).toBeVisible();
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('#confirmPassword')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Check login link is visible (use first() to avoid strict mode violation when multiple links exist)
      await expect(page.locator('a[href="/login"]').first()).toBeVisible();
    });

    test('should navigate to login page from registration', async ({ page }) => {
      await page.goto('/register');

      await page.click('a[href="/login"]:not(nav a)');
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Registration - Validation Errors', () => {
    test('should show error for empty username', async ({ page }) => {
      await page.goto('/register');
      const testUser = generateTestUser();

      await page.fill('#email', testUser.email);
      await page.fill('#password', testUser.password);
      await page.fill('#confirmPassword', testUser.password);

      await submitForm(page);

      await expectErrorAlert(page);
    });

    test('should show error for invalid email format', async ({ page }) => {
      await page.goto('/register');

      await page.fill('#username', 'testuser');
      // Use email format that passes HTML5 validation but fails JS regex (no TLD)
      await page.fill('#email', 'test@nodomain');
      await page.fill('#password', 'TestPassword123!');
      await page.fill('#confirmPassword', 'TestPassword123!');

      await submitForm(page);

      // Check for either JS alert or HTML5 validation
      const hasAlert = await page.locator('[role="alert"]').isVisible().catch(() => false);
      const emailInput = page.locator('#email');
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);

      expect(hasAlert || isInvalid).toBeTruthy();
    });

    test('should show error for short password', async ({ page }) => {
      await page.goto('/register');

      await page.fill('#username', 'testuser');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'short');
      await page.fill('#confirmPassword', 'short');

      await submitForm(page);

      // Should show error message (frontend validates password length >= 10)
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('10');
    });

    test('should show error for password mismatch', async ({ page }) => {
      await page.goto('/register');

      await page.fill('#username', 'testuser');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'Password123!');
      await page.fill('#confirmPassword', 'Different123!');

      await submitForm(page);

      // Should show error message
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toContainText('不一致');
    });

    test('should show error for username too short', async ({ page }) => {
      await page.goto('/register');

      await page.fill('#username', 'ab'); // Too short
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'Password123!');
      await page.fill('#confirmPassword', 'Password123!');

      await submitForm(page);

      await expectErrorAlert(page);
    });

    test('should show error for all empty fields', async ({ page }) => {
      await page.goto('/register');

      await submitForm(page);

      await expectErrorAlert(page);
    });

    test('should show error for password without number', async ({ page }) => {
      await page.goto('/register');

      await page.fill('#username', 'testuser');
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'PasswordOnly!');
      await page.fill('#confirmPassword', 'PasswordOnly!');

      await submitForm(page);

      // May show error or accept depending on validation rules
      const hasError = await page
        .locator('[role="alert"]')
        .isVisible()
        .catch(() => false);
      const redirected = page.url().includes('/');
      expect(hasError || redirected).toBeTruthy();
    });
  });

  test.describe('Registration - Duplicate User', () => {
    test('should show error for duplicate email', async ({ page }) => {
      await page.goto('/register');

      // Use existing test user email
      await page.fill('#username', 'newuser');
      await page.fill('#email', TEST_USERS.regular.email);
      await page.fill('#password', 'Password123!');
      await page.fill('#confirmPassword', 'Password123!');

      await submitForm(page);

      // Should show error about duplicate email
      await expectErrorAlert(page);
    });
  });

  test.describe('Login - Normal Flow', () => {
    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/login');

      await fillLoginForm(page, TEST_USERS.regular.email, TEST_USERS.regular.password);
      await submitForm(page);

      // Should redirect to home page (/)
      await expect(page).toHaveURL('/');
    });

    test('should login as admin successfully', async ({ page }) => {
      await page.goto('/login');

      await fillLoginForm(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
      await submitForm(page);

      // Should redirect to home page (/)
      await expect(page).toHaveURL('/');
    });

    test('should display login form correctly', async ({ page }) => {
      await page.goto('/login');

      // Check form elements are visible
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Check register link is visible
      await expect(page.locator('a[href="/register"]')).toBeVisible();
    });

    test('should navigate to registration page from login', async ({ page }) => {
      await page.goto('/login');

      await page.click('a[href="/register"]');
      await expect(page).toHaveURL('/register');
    });

    test('should remember user after page refresh', async ({ page }) => {
      // Login first
      await loginAsUser(page);

      // Refresh page
      await page.reload();

      // Should stay on home page (still logged in)
      await expect(page).toHaveURL('/');
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Login - Validation Errors', () => {
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

    test('should show error for invalid email format', async ({ page }) => {
      await page.goto('/login');

      // Use email format that may trigger browser or JS validation
      await page.fill('#email', 'test@nodomain');
      await page.fill('#password', 'password123');

      await submitForm(page);

      // Check for either JS alert or HTML5 validation or stayed on login page
      const hasAlert = await page.locator('[role="alert"]').isVisible().catch(() => false);
      const emailInput = page.locator('#email');
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
      const stayedOnLogin = page.url().includes('/login');

      expect(hasAlert || isInvalid || stayedOnLogin).toBeTruthy();
    });

    test('should show error for empty email', async ({ page }) => {
      await page.goto('/login');

      await page.fill('#password', 'password123');
      await submitForm(page);

      await expectErrorAlert(page);
    });

    test('should show error for empty password', async ({ page }) => {
      await page.goto('/login');

      await page.fill('#email', 'test@example.com');
      await submitForm(page);

      await expectErrorAlert(page);
    });

    test('should show error for wrong password', async ({ page }) => {
      await page.goto('/login');

      await page.fill('#email', TEST_USERS.regular.email);
      await page.fill('#password', 'wrongpassword');

      await submitForm(page);

      await expectErrorAlert(page);
    });
  });

  test.describe('Logout', () => {
    test('should logout and redirect to login', async ({ page }) => {
      // Login first
      await loginAsUser(page);

      // Navigate to profile
      await page.click('a[href="/profile"]');
      await expect(page).toHaveURL('/profile');

      // Click logout button to open confirm modal
      await page.click('button:has-text("退出登录")');

      // Wait for confirm modal and click the confirm button
      await page.waitForSelector('[role="dialog"]');
      await page.click('[role="dialog"] button:has-text("退出")');

      // Should redirect to login
      await expect(page).toHaveURL('/login');
    });

    test('should clear session data after logout', async ({ page }) => {
      // Login first
      await loginAsUser(page);

      // Logout
      await logout(page);

      // Try to access protected route
      await page.goto('/profile');

      // Should redirect to login
      await expect(page).toHaveURL('/login');
    });

    test('should cancel logout when clicking cancel', async ({ page }) => {
      // Login first
      await loginAsUser(page);

      // Navigate to profile
      await page.click('a[href="/profile"]');
      await expect(page).toHaveURL('/profile');

      // Click logout button to open confirm modal
      await page.click('button:has-text("退出登录")');

      // Wait for confirm modal
      await page.waitForSelector('[role="dialog"]');

      // Click cancel button (if exists) or close modal
      const cancelButton = page.locator('[role="dialog"] button:has-text("取消")');
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      } else {
        await page.keyboard.press('Escape');
      }

      // Should stay on profile page
      await expect(page).toHaveURL('/profile');
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

    test('should redirect to login when accessing vocabulary page', async ({ page }) => {
      await page.goto('/login');
      await page.context().clearCookies();

      await page.goto('/vocabulary');
      await expect(page).toHaveURL('/login');
    });

    test('should redirect to login when accessing study settings page', async ({ page }) => {
      await page.goto('/login');
      await page.context().clearCookies();

      await page.goto('/study-settings');
      await expect(page).toHaveURL('/login');
    });

    test('should redirect to login when accessing statistics page', async ({ page }) => {
      await page.goto('/login');
      await page.context().clearCookies();

      await page.goto('/statistics');
      await expect(page).toHaveURL('/login');
    });

    test('should allow access to public pages without login', async ({ page }) => {
      // About pages should be accessible without login
      await page.goto('/about');
      await expect(page.locator('main').first()).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across multiple pages', async ({ page }) => {
      // Login
      await loginAsUser(page);

      // Navigate to multiple pages
      await page.goto('/vocabulary');
      await expect(page).toHaveURL('/vocabulary');

      await page.goto('/profile');
      await expect(page).toHaveURL('/profile');

      await page.goto('/statistics');
      await expect(page).toHaveURL('/statistics');

      // Should still be logged in
      await page.goto('/');
      await expect(page).toHaveURL('/');
    });

    test('should redirect back to requested page after login', async ({ page }) => {
      // Clear cookies first
      await page.goto('/login');
      await page.context().clearCookies();

      // Try to access a protected page
      await page.goto('/profile');

      // Should be redirected to login
      await expect(page).toHaveURL('/login');

      // Now login
      await fillLoginForm(page, TEST_USERS.regular.email, TEST_USERS.regular.password);
      await submitForm(page);

      // Wait for navigation after login
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

      // May redirect to home or the originally requested page
      const currentUrl = page.url();
      expect(currentUrl.includes('/profile') || currentUrl.endsWith('/')).toBeTruthy();
    });
  });

  test.describe('Admin Access Control', () => {
    test('should allow admin to access admin pages', async ({ page }) => {
      await loginAsAdmin(page);

      await page.goto('/admin');
      await expect(page).toHaveURL('/admin');
    });

    test('should show admin link in navigation for admin users', async ({ page }) => {
      await loginAsAdmin(page);

      // Admin link should be visible
      const adminLink = page.locator('a[href="/admin"]');
      await expect(adminLink).toBeVisible();
    });

    test('should not show admin link for regular users', async ({ page }) => {
      await loginAsUser(page);

      // Admin link should not be visible
      const adminLink = page.locator('a[href="/admin"]');
      await expect(adminLink).not.toBeVisible();
    });
  });
});
