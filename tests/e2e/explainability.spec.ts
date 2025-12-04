/**
 * Explainability E2E Tests
 * Tests for AMAS insights and analytics pages
 */

import { test, expect } from '@playwright/test';

test.describe('AMAS Insights', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test.describe('Statistics Page', () => {
    test('should display statistics page', async ({ page }) => {
      await page.goto('/statistics');
      await expect(page).toHaveURL('/statistics');
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Learning Time Page', () => {
    test('should display learning time page', async ({ page }) => {
      await page.goto('/learning-time');
      await expect(page).toHaveURL('/learning-time');
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Trend Report Page', () => {
    test('should display trend report page', async ({ page }) => {
      await page.goto('/trend-report');
      await expect(page).toHaveURL('/trend-report');
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Achievements Page', () => {
    test('should display achievements page', async ({ page }) => {
      await page.goto('/achievements');
      await expect(page).toHaveURL('/achievements');
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Plan Page', () => {
    test('should display plan page', async ({ page }) => {
      await page.goto('/plan');
      await expect(page).toHaveURL('/plan');
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Word Mastery Page', () => {
    test('should display word mastery page', async ({ page }) => {
      await page.goto('/word-mastery');
      await expect(page).toHaveURL('/word-mastery');
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Habit Profile Page', () => {
    test('should display habit profile page', async ({ page }) => {
      await page.goto('/habit-profile');
      await expect(page).toHaveURL('/habit-profile');
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Navigation via Dropdown', () => {
    test('should navigate to all insight pages from dropdown', async ({ page }) => {
      // Test statistics
      await page.click('button:has-text("学习洞察")');
      await page.click('a[href="/statistics"]');
      await expect(page).toHaveURL('/statistics');

      // Test learning time
      await page.click('button:has-text("学习洞察")');
      await page.click('a[href="/learning-time"]');
      await expect(page).toHaveURL('/learning-time');

      // Test trend report
      await page.click('button:has-text("学习洞察")');
      await page.click('a[href="/trend-report"]');
      await expect(page).toHaveURL('/trend-report');
    });
  });
});
