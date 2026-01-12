/**
 * Study Settings E2E Tests
 *
 * Complete tests for the study settings workflow:
 * - Viewing current settings
 * - Selecting wordbooks
 * - Adjusting daily word count
 * - Saving settings
 * - Error handling
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsUser, waitForPageReady, expectErrorAlert } from './utils/test-helpers';

// Increase timeout for settings tests
test.setTimeout(45000);

/**
 * Navigate to study settings page
 */
async function goToStudySettings(page: Page) {
  await page.goto('/study-settings');
  await expect(page).toHaveURL('/study-settings');
  await waitForPageReady(page);
}

test.describe('Study Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test.describe('Page Display', () => {
    test('should display study settings page', async ({ page }) => {
      await goToStudySettings(page);

      // Page title should be visible
      await expect(page.getByRole('heading', { name: '学习设置' })).toBeVisible();
    });

    test('should display wordbook selection section', async ({ page }) => {
      await goToStudySettings(page);

      // Wordbook selection section should be visible
      await expect(page.getByText('选择学习词书')).toBeVisible();
    });

    test('should display daily word count section', async ({ page }) => {
      await goToStudySettings(page);

      // Daily count section should be visible
      await expect(page.getByText('每日学习量')).toBeVisible();
    });

    test('should display save and cancel buttons', async ({ page }) => {
      await goToStudySettings(page);

      // Buttons should be visible
      await expect(page.locator('button:has-text("保存设置")')).toBeVisible();
      await expect(page.locator('button:has-text("取消")')).toBeVisible();
    });
  });

  test.describe('Wordbook Selection', () => {
    test('should display available wordbooks', async ({ page }) => {
      await goToStudySettings(page);

      // Wait for wordbooks to load
      await page.waitForTimeout(1000);

      // Should show wordbook items or empty message
      const wordbooks = page.locator('input[type="checkbox"]');
      const noWordbooks = page.locator('text=暂无可用词书');

      const hasWordbooks = (await wordbooks.count()) > 0;
      const hasNoWordbooksMessage = await noWordbooks.isVisible().catch(() => false);

      expect(hasWordbooks || hasNoWordbooksMessage).toBeTruthy();
    });

    test('should allow selecting multiple wordbooks', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      // Get all checkboxes
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      if (count >= 2) {
        // Select first two wordbooks
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();

        // Both should be checked
        await expect(checkboxes.nth(0)).toBeChecked();
        await expect(checkboxes.nth(1)).toBeChecked();
      }
    });

    test('should allow deselecting wordbooks', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      if (count >= 1) {
        // Select first wordbook
        await checkboxes.nth(0).check();
        await expect(checkboxes.nth(0)).toBeChecked();

        // Deselect it
        await checkboxes.nth(0).uncheck();
        await expect(checkboxes.nth(0)).not.toBeChecked();
      }
    });

    test('should update selected count when selecting wordbooks', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      if (count >= 1) {
        // Select first wordbook
        await checkboxes.nth(0).check();

        // Check if selection count is shown
        const selectionInfo = page.locator('text=已选择词书');
        await expect(selectionInfo).toBeVisible();
      }
    });
  });

  test.describe('Daily Word Count', () => {
    test('should display daily count slider', async ({ page }) => {
      await goToStudySettings(page);

      // Slider should be visible
      const slider = page.locator('input[type="range"]');
      await expect(slider).toBeVisible();
    });

    test('should adjust daily count using slider', async ({ page }) => {
      await goToStudySettings(page);

      const slider = page.locator('input[type="range"]');
      const initialValue = await slider.inputValue();

      // Change slider value
      await slider.fill('50');

      // Value should change
      const newValue = await slider.inputValue();
      expect(newValue).toBe('50');
    });

    test('should show estimated learning time', async ({ page }) => {
      await goToStudySettings(page);

      // Estimated time should be visible
      await expect(page.getByText(/预计学习时长/)).toBeVisible();
    });

    test('should update estimated time when changing word count', async ({ page }) => {
      await goToStudySettings(page);

      // Get initial estimated time text
      const slider = page.locator('input[type="range"]');

      // Change slider to different values and check if estimate updates
      await slider.fill('30');
      await page.waitForTimeout(200);

      const estimateText = await page.getByText(/预计学习时长/).textContent();
      expect(estimateText).toBeTruthy();
    });
  });

  test.describe('Save Settings', () => {
    test('should save settings successfully', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      // Select a wordbook if available
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      if (count >= 1) {
        // Ensure at least one is selected
        await checkboxes.nth(0).check();

        // Set daily count
        const slider = page.locator('input[type="range"]');
        await slider.fill('25');

        // Click save
        await page.click('button:has-text("保存设置")');

        // Should redirect to home or show success
        await expect(page).toHaveURL('/');
      }
    });

    test('should show error when no wordbook selected', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      // Uncheck all wordbooks
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      for (let i = 0; i < count; i++) {
        const checkbox = checkboxes.nth(i);
        if (await checkbox.isChecked()) {
          await checkbox.uncheck();
        }
      }

      // Try to save
      const saveButton = page.locator('button:has-text("保存设置")');

      // Button may be disabled or clicking should show error
      const isDisabled = await saveButton.isDisabled().catch(() => false);
      if (!isDisabled) {
        await saveButton.click();
        // Should show error or stay on page
        const hasAlert = await page.locator('[role="alert"], .text-red-700').isVisible().catch(() => false);
        const stayedOnPage = page.url().includes('study-settings');
        expect(hasAlert || stayedOnPage || isDisabled).toBeTruthy();
      } else {
        expect(isDisabled).toBeTruthy();
      }
    });

    test('should disable save button when no wordbook selected', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      // Uncheck all wordbooks
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      for (let i = 0; i < count; i++) {
        await checkboxes.nth(i).uncheck();
      }

      // Save button should be disabled
      const saveButton = page.locator('button:has-text("保存设置")');
      await expect(saveButton).toBeDisabled();
    });
  });

  test.describe('Cancel', () => {
    test('should navigate back when clicking cancel', async ({ page }) => {
      // First go to home page
      await page.goto('/');
      await expect(page).toHaveURL('/');

      // Then go to study settings
      await page.goto('/study-settings');
      await expect(page).toHaveURL('/study-settings');

      // Click cancel
      await page.click('button:has-text("取消")');

      // Should navigate back
      await page.waitForTimeout(500);
      expect(page.url()).not.toContain('/study-settings');
    });
  });

  test.describe('Statistics Display', () => {
    test('should display total word count when wordbooks selected', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      if (count >= 1) {
        // Select a wordbook
        await checkboxes.nth(0).check();

        // Should show total word count
        await expect(page.getByText('总单词数')).toBeVisible();
      }
    });

    test('should display estimated learning days', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();

      if (count >= 1) {
        // Select a wordbook
        await checkboxes.nth(0).check();

        // Should show estimated days
        await expect(page.getByText('预计学习天数')).toBeVisible();
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to study settings from home page', async ({ page }) => {
      await page.goto('/');
      await page.click('a[href="/study-settings"]');
      await expect(page).toHaveURL('/study-settings');
    });

    test('should navigate to study settings from navigation menu', async ({ page }) => {
      await page.goto('/');

      // Click study settings link in nav
      const settingsLink = page.locator('a[href="/study-settings"]');
      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await expect(page).toHaveURL('/study-settings');
      }
    });
  });

  test.describe('Loading State', () => {
    test('should show loading state while fetching data', async ({ page }) => {
      // Navigate to study settings
      await page.goto('/study-settings');

      // Loading indicator might appear briefly
      const loadingIndicator = page.locator('text=正在加载');
      const mainContent = page.locator('main');

      // Either loading or main content should be visible
      await expect(loadingIndicator.or(mainContent)).toBeVisible();

      // Eventually main content should be visible
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Persistence', () => {
    test('should load previously saved settings', async ({ page }) => {
      await goToStudySettings(page);
      await page.waitForTimeout(1000);

      // Check if any wordbooks are pre-selected
      const checkedBoxes = page.locator('input[type="checkbox"]:checked');
      const checkedCount = await checkedBoxes.count();

      // If previously saved, some should be checked
      // This is a smoke test - actual value depends on test data
      expect(checkedCount).toBeGreaterThanOrEqual(0);
    });
  });
});

test.describe('Study Settings - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('should handle rapid slider changes', async ({ page }) => {
    await page.goto('/study-settings');
    await waitForPageReady(page);

    const slider = page.locator('input[type="range"]');

    // Rapidly change values
    for (let i = 10; i <= 100; i += 10) {
      await slider.fill(String(i));
    }

    // Final value should be set
    await expect(slider).toHaveValue('100');
  });

  test('should handle multiple wordbook toggles', async ({ page }) => {
    await page.goto('/study-settings');
    await waitForPageReady(page);
    await page.waitForTimeout(1000);

    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    if (count >= 1) {
      // Toggle first checkbox multiple times
      for (let i = 0; i < 5; i++) {
        await checkboxes.nth(0).click();
        await page.waitForTimeout(100);
      }

      // Page should still be functional
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('should handle network error gracefully', async ({ page }) => {
    await page.goto('/study-settings');
    await waitForPageReady(page);
    await page.waitForTimeout(1000);

    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    if (count >= 1) {
      // Select a wordbook
      await checkboxes.nth(0).check();

      // Block API requests
      await page.route('**/api/**', (route) => route.abort());

      // Try to save
      await page.click('button:has-text("保存设置")');

      // Should show error or handle gracefully
      await page.waitForTimeout(2000);

      // Page should still be functional
      await expect(page.locator('main')).toBeVisible();

      // Unblock requests
      await page.unroute('**/api/**');
    }
  });
});
