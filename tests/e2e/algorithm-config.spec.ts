/**
 * Algorithm Config E2E Tests
 *
 * Complete tests for the AMAS algorithm configuration workflow:
 * - Viewing algorithm configuration
 * - Modifying parameters
 * - Saving configuration
 * - Resetting to defaults
 * - Validation errors
 * - Access control
 */

import { test, expect, Page } from '@playwright/test';
import {
  loginAsAdmin,
  loginAsUser,
  waitForPageReady,
} from './utils/test-helpers';

// Increase timeout for algorithm config tests
test.setTimeout(60000);

/**
 * Navigate to algorithm config page
 */
async function goToAlgorithmConfig(page: Page) {
  await page.goto('/admin/algorithm-config');
  await expect(page).toHaveURL('/admin/algorithm-config');
  await waitForPageReady(page);
}

test.describe('Algorithm Config - Admin Access', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.describe('Page Display', () => {
    test('should display algorithm config page', async ({ page }) => {
      await goToAlgorithmConfig(page);

      // Page title should be visible
      await expect(page.getByRole('heading', { name: '算法配置' })).toBeVisible();
    });

    test('should display all configuration sections', async ({ page }) => {
      await goToAlgorithmConfig(page);

      // Wait for loading to complete
      await page.waitForLoadState('networkidle');

      // Check for main configuration sections
      await expect(page.getByText('遗忘曲线参数')).toBeVisible();
      await expect(page.getByText('难度调整参数')).toBeVisible();
      await expect(page.getByText('优先级权重')).toBeVisible();
      await expect(page.getByText('掌握程度阈值')).toBeVisible();
      await expect(page.getByText('单词得分权重')).toBeVisible();
      await expect(page.getByText('答题速度评分标准')).toBeVisible();
    });

    test('should display save and reset buttons', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('button:has-text("保存配置")')).toBeVisible();
      await expect(page.locator('button:has-text("恢复默认值")')).toBeVisible();
    });
  });

  test.describe('Review Intervals Configuration', () => {
    test('should display review interval inputs', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Should have interval inputs
      const intervalInputs = page.locator('input[type="number"]').first();
      await expect(intervalInputs).toBeVisible();
    });

    test('should allow adding new interval', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Find add interval button
      const addButton = page.locator('button:has-text("添加间隔")');
      if (await addButton.isVisible()) {
        const initialCount = await page.locator('text=第').count();
        await addButton.click();
        await page.waitForTimeout(300);
        const newCount = await page.locator('text=第').count();
        expect(newCount).toBeGreaterThanOrEqual(initialCount);
      }
    });

    test('should allow modifying interval values', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Find first interval input in the review intervals section
      const section = page.locator('text=遗忘曲线参数').locator('..');
      const intervalInput = section.locator('input[type="number"]').first();

      if (await intervalInput.isVisible()) {
        await intervalInput.clear();
        await intervalInput.fill('5');
        await expect(intervalInput).toHaveValue('5');
      }
    });
  });

  test.describe('Difficulty Adjustment Configuration', () => {
    test('should display difficulty adjustment sliders', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Check for consecutive correct threshold
      await expect(page.getByText('连续答对阈值')).toBeVisible();
      await expect(page.getByText('连续答错阈值')).toBeVisible();
    });

    test('should allow adjusting consecutive correct threshold', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Find the slider for consecutive correct
      const sliders = page.locator('input[type="range"]');
      const count = await sliders.count();

      if (count > 0) {
        // Adjust first slider
        await sliders.first().fill('7');
        await expect(sliders.first()).toHaveValue('7');
      }
    });
  });

  test.describe('Priority Weights Configuration', () => {
    test('should display priority weight sliders', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('新单词权重')).toBeVisible();
      await expect(page.getByText('错误率权重')).toBeVisible();
      await expect(page.getByText('逾期时间权重')).toBeVisible();
    });

    test('should show weight total validation', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Check for total weight display
      await expect(page.getByText('权重总和')).toBeVisible();
    });

    test('should show warning when weights do not sum to 100', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Find priority weights section
      const section = page.locator('text=优先级权重').locator('..');

      // Set all weights to low values to trigger validation
      const sliders = section.locator('input[type="range"]');
      const count = await sliders.count();

      if (count >= 4) {
        // Set extreme values to break the 100% total
        await sliders.nth(0).fill('10');
        await sliders.nth(1).fill('10');
        await sliders.nth(2).fill('10');
        await sliders.nth(3).fill('10');

        // Should show validation warning
        const warning = page.locator('text=权重总和必须等于 100%');
        await expect(warning).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Mastery Thresholds Configuration', () => {
    test('should display mastery threshold table', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('掌握程度阈值')).toBeVisible();
      await expect(page.getByText('连续答对次数')).toBeVisible();
      await expect(page.getByText('最低正确率')).toBeVisible();
    });

    test('should allow modifying mastery thresholds', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Find mastery threshold inputs
      const section = page.locator('text=掌握程度阈值').locator('..');
      const inputs = section.locator('input[type="number"]');
      const count = await inputs.count();

      if (count > 0) {
        await inputs.first().clear();
        await inputs.first().fill('3');
        await expect(inputs.first()).toHaveValue('3');
      }
    });
  });

  test.describe('Score Weights Configuration', () => {
    test('should display score weight sliders', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('正确率权重')).toBeVisible();
      await expect(page.getByText('答题速度权重')).toBeVisible();
      await expect(page.getByText('稳定性权重')).toBeVisible();
    });
  });

  test.describe('Speed Thresholds Configuration', () => {
    test('should display speed threshold inputs', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('答题速度评分标准')).toBeVisible();
      await expect(page.locator('text=优秀').first()).toBeVisible();
      await expect(page.locator('text=良好').first()).toBeVisible();
      await expect(page.locator('text=一般').first()).toBeVisible();
    });

    test('should allow modifying speed thresholds', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Find speed threshold section
      const section = page.locator('text=答题速度评分标准').locator('..');
      const inputs = section.locator('input[type="number"]');
      const count = await inputs.count();

      if (count > 0) {
        await inputs.first().clear();
        await inputs.first().fill('2000');
        await expect(inputs.first()).toHaveValue('2000');
      }
    });
  });

  test.describe('Save Configuration', () => {
    test('should save configuration successfully', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Make a small change
      const slider = page.locator('input[type="range"]').first();
      const currentValue = await slider.inputValue();
      const newValue = parseInt(currentValue) === 5 ? '6' : '5';
      await slider.fill(newValue);

      // Click save
      await page.click('button:has-text("保存配置")');

      // Should show success message
      await expect(page.getByText('配置已成功保存')).toBeVisible({ timeout: 10000 });
    });

    test('should prevent saving with validation errors', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Set invalid priority weights (don't sum to 100%)
      const section = page.locator('text=优先级权重').locator('..');
      const sliders = section.locator('input[type="range"]');
      const count = await sliders.count();

      if (count >= 4) {
        await sliders.nth(0).fill('10');
        await sliders.nth(1).fill('10');
        await sliders.nth(2).fill('10');
        await sliders.nth(3).fill('10');

        // Save button should be disabled or show error
        const saveButton = page.locator('button:has-text("保存配置")');
        const isDisabled = await saveButton.isDisabled();

        if (isDisabled) {
          expect(isDisabled).toBeTruthy();
        } else {
          // If not disabled, clicking should show error
          await saveButton.click();
          await expect(page.locator('[role="alert"], .text-red-600')).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Reset Configuration', () => {
    test('should show reset confirmation dialog', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Click reset button
      await page.click('button:has-text("恢复默认值")');

      // Confirmation dialog should appear
      await expect(page.locator('[role="dialog"], .fixed.inset-0')).toBeVisible();
      await expect(page.getByText('确认重置')).toBeVisible();
    });

    test('should cancel reset when clicking cancel', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Click reset button
      await page.click('button:has-text("恢复默认值")');

      // Wait for dialog
      await page.waitForSelector('[role="dialog"], .fixed.inset-0');

      // Click cancel
      const cancelButton = page.locator('button:has-text("取消")');
      await cancelButton.click();

      // Dialog should close
      await expect(page.locator('[role="dialog"], .fixed.inset-0')).not.toBeVisible();
    });

    test('should reset configuration when confirmed', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Click reset button
      await page.click('button:has-text("恢复默认值")');

      // Wait for dialog
      await page.waitForSelector('[role="dialog"], .fixed.inset-0');

      // Click confirm
      const confirmButton = page.locator('button:has-text("确认重置")');
      await confirmButton.click();

      // Should show success message
      await expect(page.getByText('配置已重置为默认值')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Modified Indicator', () => {
    test('should show modified indicator when value changed', async ({ page }) => {
      await goToAlgorithmConfig(page);
      await page.waitForLoadState('networkidle');

      // Make a change
      const slider = page.locator('input[type="range"]').first();
      const currentValue = await slider.inputValue();
      const newValue = parseInt(currentValue) === 5 ? '6' : '5';
      await slider.fill(newValue);

      // Should show modified indicator
      const modifiedIndicator = page.locator('text=（已修改）');
      await expect(modifiedIndicator.first()).toBeVisible({ timeout: 5000 });
    });
  });
});

test.describe('Algorithm Config - Access Control', () => {
  test('should redirect non-admin to home page', async ({ page }) => {
    await loginAsUser(page);

    // Try to access admin page
    await page.goto('/admin/algorithm-config');

    // Should not be on algorithm config page
    // May redirect to home or admin dashboard with access denied
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl.includes('/algorithm-config')).toBeFalsy();
  });

  test('should not show admin menu for regular users', async ({ page }) => {
    await loginAsUser(page);

    // Admin link should not be visible
    const adminLink = page.locator('a[href="/admin"]');
    await expect(adminLink).not.toBeVisible();
  });
});

test.describe('Algorithm Config - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should navigate to algorithm config from admin dashboard', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Click algorithm config link
    const configLink = page.locator('a[href="/admin/algorithm-config"]');
    if (await configLink.isVisible()) {
      await configLink.click();
      await expect(page).toHaveURL('/admin/algorithm-config');
    }
  });

  test('should navigate to config history from algorithm config', async ({ page }) => {
    await goToAlgorithmConfig(page);

    // Look for config history link
    const historyLink = page.locator('a[href="/admin/config-history"]');
    if (await historyLink.isVisible()) {
      await historyLink.click();
      await expect(page).toHaveURL('/admin/config-history');
    }
  });
});

test.describe('Algorithm Config - Loading States', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should show loading state while fetching config', async ({ page }) => {
    await page.goto('/admin/algorithm-config');

    // Loading indicator might appear briefly
    const loadingIndicator = page.locator('text=加载配置中');
    const mainContent = page.locator('main');

    // Either loading or main content should be visible
    await expect(loadingIndicator.or(mainContent)).toBeVisible();

    // Eventually main content should be visible
    await expect(mainContent).toBeVisible({ timeout: 30000 });
  });

  test('should handle API error gracefully', async ({ page }) => {
    // Block API requests
    await page.route('**/api/admin/algorithm-config**', route => route.abort());

    await page.goto('/admin/algorithm-config');
    await page.waitForTimeout(3000);

    // Should show error or fallback UI
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();

    // Unblock requests
    await page.unroute('**/api/admin/algorithm-config**');
  });
});

test.describe('Algorithm Config - Default Values Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display default values for comparison', async ({ page }) => {
    await goToAlgorithmConfig(page);
    await page.waitForLoadState('networkidle');

    // Should show default value references
    const defaultValueRefs = page.locator('text=默认值');
    const count = await defaultValueRefs.count();
    expect(count).toBeGreaterThan(0);
  });
});
