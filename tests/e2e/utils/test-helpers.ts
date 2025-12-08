/**
 * E2E Test Helpers
 * Common utility functions for E2E tests
 */

import { Page, expect } from '@playwright/test';

/**
 * Test user credentials
 */
export const TEST_USERS = {
  regular: {
    email: 'test@example.com',
    password: 'password123',
    username: 'testuser',
  },
  admin: {
    email: 'admin@example.com',
    password: 'admin123',
    username: 'admin',
  },
} as const;

/**
 * Generate unique test user data
 */
export function generateTestUser() {
  const timestamp = Date.now();
  return {
    username: `testuser${timestamp}`,
    email: `test-${timestamp}@example.com`,
    password: 'TestPassword123!',
  };
}

/**
 * Login as regular user
 */
export async function loginAsUser(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('#email');
  await page.fill('#email', TEST_USERS.regular.email);
  await page.fill('#password', TEST_USERS.regular.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 15000 });
}

/**
 * Login as admin user
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('#email');
  await page.fill('#email', TEST_USERS.admin.email);
  await page.fill('#password', TEST_USERS.admin.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 15000 });
}

/**
 * Logout current user
 */
export async function logout(page: Page) {
  await page.goto('/profile');
  await page.waitForURL('/profile');

  // Click logout button to open confirm modal
  await page.click('button:has-text("退出登录")');

  // Wait for confirm modal and click confirm
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("退出")');

  await expect(page).toHaveURL('/login');
}

/**
 * Clear learning session data from localStorage
 */
export async function clearLearningSession(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('mastery_learning_session');
  });
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.locator('main').waitFor({ state: 'visible' });
}

/**
 * Wait for learning page to be ready
 */
export async function waitForLearningPageReady(page: Page) {
  const wordCard = page.locator('[data-testid="word-card"]');
  const noWordsMessage = page.locator('text=暂无单词');
  const completedMessage = page.locator('text=目标达成');
  const mainContent = page.locator('main');

  await expect(mainContent).toBeVisible();
  await page.waitForTimeout(500);

  // Wait for one of the possible states
  await expect(
    wordCard.or(noWordsMessage).or(completedMessage).first()
  ).toBeVisible({ timeout: 15000 });
}

/**
 * Check if word card is displayed
 */
export async function hasWordCard(page: Page): Promise<boolean> {
  return await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);
}

/**
 * Answer a learning question
 */
export async function answerQuestion(page: Page, optionIndex: number = 0) {
  const option = page.locator(`[data-testid="option-${optionIndex}"]`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(option).toBeDisabled({ timeout: 3000 });
}

/**
 * Answer question using keyboard
 */
export async function answerQuestionWithKeyboard(page: Page, key: string = '1') {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

/**
 * Wait for next word after answering
 */
export async function waitForNextWord(page: Page) {
  await page.waitForTimeout(2200); // Default auto-advance time
}

/**
 * Answer multiple questions
 */
export async function answerMultipleQuestions(page: Page, count: number, fast: boolean = true) {
  for (let i = 0; i < count; i++) {
    const wordCard = page.locator('[data-testid="word-card"]');
    const isVisible = await wordCard.isVisible().catch(() => false);
    if (!isVisible) break;

    if (!fast) {
      await page.waitForTimeout(3000); // Simulate slow response
    }

    await page.keyboard.press('1');
    await waitForNextWord(page);
  }
}

/**
 * Navigate to a page via navigation menu
 */
export async function navigateViaMenu(page: Page, path: string) {
  await page.click(`a[href="${path}"]`);
  await expect(page).toHaveURL(path);
}

/**
 * Navigate to insight pages via dropdown
 */
export async function navigateViaInsightsDropdown(page: Page, path: string) {
  await page.click('button:has-text("学习洞察")');
  await page.click(`a[href="${path}"]`);
  await expect(page).toHaveURL(path);
}

/**
 * Check for error alert
 */
export async function expectErrorAlert(page: Page, textPattern?: string | RegExp) {
  const alert = page.locator('[role="alert"]');
  await expect(alert).toBeVisible({ timeout: 5000 });
  if (textPattern) {
    await expect(alert).toContainText(textPattern);
  }
}

/**
 * Check for success message
 */
export async function expectSuccessMessage(page: Page, textPattern?: string | RegExp) {
  const successIndicator = page.locator('.text-green-600, .bg-green-50, [role="status"]');
  await expect(successIndicator.first()).toBeVisible({ timeout: 5000 });
  if (textPattern) {
    await expect(successIndicator.first()).toContainText(textPattern);
  }
}

/**
 * Fill registration form
 */
export async function fillRegistrationForm(
  page: Page,
  data: { username: string; email: string; password: string; confirmPassword?: string }
) {
  await page.fill('#username', data.username);
  await page.fill('#email', data.email);
  await page.fill('#password', data.password);
  await page.fill('#confirmPassword', data.confirmPassword || data.password);
}

/**
 * Fill login form
 */
export async function fillLoginForm(page: Page, email: string, password: string) {
  await page.fill('#email', email);
  await page.fill('#password', password);
}

/**
 * Submit form
 */
export async function submitForm(page: Page) {
  await page.click('button[type="submit"]');
}

/**
 * Wait for modal to appear
 */
export async function waitForModal(page: Page) {
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
}

/**
 * Close modal
 */
export async function closeModal(page: Page) {
  const closeButton = page.locator('button:has-text("关闭"), [aria-label="Close"]');
  if (await closeButton.isVisible()) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Escape');
  }
}

/**
 * Check if element exists and is visible
 */
export async function isElementVisible(page: Page, selector: string): Promise<boolean> {
  return await page.locator(selector).isVisible().catch(() => false);
}

/**
 * Get text content of element
 */
export async function getTextContent(page: Page, selector: string): Promise<string | null> {
  return await page.locator(selector).textContent().catch(() => null);
}

/**
 * Intercept and mock API response
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: object,
  status: number = 200
) {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Block API requests
 */
export async function blockApiRequests(page: Page, urlPattern: string | RegExp) {
  await page.route(urlPattern, (route) => route.abort());
}

/**
 * Unblock API requests
 */
export async function unblockApiRequests(page: Page, urlPattern: string | RegExp) {
  await page.unroute(urlPattern);
}

/**
 * Simulate network offline
 */
export async function goOffline(page: Page) {
  await page.context().setOffline(true);
}

/**
 * Simulate network online
 */
export async function goOnline(page: Page) {
  await page.context().setOffline(false);
}

/**
 * Take screenshot with descriptive name
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screenshots/${name}.png` });
}
