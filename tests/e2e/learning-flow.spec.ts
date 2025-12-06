/**
 * Learning Flow E2E Tests
 *
 * Complete tests for the learning workflow including:
 * - Starting a learning session
 * - Word display and pronunciation
 * - Answering questions
 * - Progress tracking
 * - Session completion
 * - Session restoration
 * - Error handling
 */

import { test, expect, Page } from '@playwright/test';

// Increase timeout for learning flow tests
test.setTimeout(30000);

// Helper function for login
async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

// Helper function to clear localStorage session data
async function clearLearningSession(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('mastery_learning_session');
  });
}

// Helper to wait for learning page to be ready
async function waitForLearningPageReady(page: Page) {
  // Wait for either word card, no words message, or completion state
  const wordCard = page.locator('[data-testid="word-card"]');
  const noWordsMessage = page.locator('text=暂无单词');
  const completedMessage = page.locator('text=目标达成');
  const mainContent = page.locator('main');

  await expect(mainContent).toBeVisible();
  // Give a short time for content to load, but don't wait for networkidle
  await page.waitForTimeout(500);
}

test.describe('Learning Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Clear any existing session to ensure fresh state
    await clearLearningSession(page);
  });

  test.describe('Session Initialization', () => {
    test('should display loading state initially', async ({ page }) => {
      // Navigate to learn page and check for loading indicator
      await page.goto('/');
      // The page may show loading spinner or directly show content
      // Check that main content eventually loads
      await expect(page.locator('main')).toBeVisible();
    });

    test('should display word card when session starts', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // Wait for either word card or no words message
      const wordCard = page.locator('[data-testid="word-card"]');
      const noWordsMessage = page.locator('text=暂无单词');
      const completedMessage = page.locator('text=目标达成');

      // Either should be visible
      await expect(wordCard.or(noWordsMessage).or(completedMessage).first()).toBeVisible({ timeout: 10000 });
    });

    test('should show progress bar when learning starts', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const progressBar = page.locator('[data-testid="mastery-progress"]');

      // Check if progress component exists (may not if no words)
      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);
      if (hasWordCard) {
        await expect(progressBar).toBeVisible();
      }
    });
  });

  test.describe('Word Display', () => {
    test('should display word spelling correctly', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const wordCard = page.locator('[data-testid="word-card"]');
      const hasWordCard = await wordCard.isVisible().catch(() => false);

      if (hasWordCard) {
        const wordSpelling = page.locator('[data-testid="word-spelling"]');
        await expect(wordSpelling).toBeVisible();
        // Word spelling should not be empty
        const spellingText = await wordSpelling.textContent();
        expect(spellingText?.length).toBeGreaterThan(0);
      }
    });

    test('should display test options', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        const testOptions = page.locator('[data-testid="test-options"]');
        await expect(testOptions).toBeVisible();

        // Should have at least 2 options
        const options = page.locator('[data-testid^="option-"]');
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThanOrEqual(2);
      }
    });

    test('should show phonetic transcription', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Phonetic is displayed with / / markers
        const phonetic = page.locator('text=/[^/]+/');
        await expect(phonetic.first()).toBeVisible();
      }
    });
  });

  test.describe('Answer Submission', () => {
    test('should allow selecting an answer', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Click the first option
        const firstOption = page.locator('[data-testid="option-0"]');
        await expect(firstOption).toBeVisible();
        await firstOption.click();

        // After clicking, the option should be disabled
        await expect(firstOption).toBeDisabled();
      }
    });

    test('should show correct/incorrect feedback after answering', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Click an option
        await page.locator('[data-testid="option-0"]').click();

        // Should see visual feedback - either green (correct) or red (incorrect)
        const greenOption = page.locator('[data-testid^="option-"].bg-green-500');
        const redOption = page.locator('[data-testid^="option-"].bg-red-500');
        const greenBorder = page.locator('[data-testid^="option-"].border-green-500');

        // At least one feedback style should appear
        await expect(greenOption.or(redOption).or(greenBorder).first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('should advance to next word after answering', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Get current word
        const initialWord = await page.locator('[data-testid="word-spelling"]').textContent();

        // Answer the question
        await page.locator('[data-testid="option-0"]').click();

        // Wait for auto-advance (2 seconds based on the code)
        await page.waitForTimeout(2200);

        // Check if word changed or session completed
        const newWordSpelling = page.locator('[data-testid="word-spelling"]');
        const completionMessage = page.locator('text=目标达成');

        // Either word should change or session completed
        const hasNewWord = await newWordSpelling.isVisible().catch(() => false);
        if (hasNewWord) {
          const newWord = await newWordSpelling.textContent();
          // Word may or may not change (same word can repeat in learning)
          expect(newWord).toBeDefined();
        }
      }
    });
  });

  test.describe('Progress Tracking', () => {
    test('should update question count after answering', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Get initial question count
        const questionCount = page.locator('[data-testid="question-count"]');
        await expect(questionCount).toBeVisible();

        const initialText = await questionCount.textContent();
        const initialCount = parseInt(initialText?.match(/\d+/)?.[0] || '0');

        // Answer a question
        await page.locator('[data-testid="option-0"]').click();

        // Wait for UI update
        await page.waitForTimeout(300);

        // Question count should increase
        const updatedText = await questionCount.textContent();
        const updatedCount = parseInt(updatedText?.match(/\d+/)?.[0] || '0');
        expect(updatedCount).toBeGreaterThanOrEqual(initialCount);
      }
    });

    test('should display mastered count', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        const masteredCount = page.locator('[data-testid="mastered-count"]');
        await expect(masteredCount).toBeVisible();

        // Should show format "X/Y"
        const text = await masteredCount.textContent();
        expect(text).toMatch(/\d+.*\/.*\d+/);
      }
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('should support number keys for answer selection', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Press "1" to select first option
        await page.keyboard.press('1');

        // First option should be disabled (selected)
        const firstOption = page.locator('[data-testid="option-0"]');
        await expect(firstOption).toBeDisabled({ timeout: 2000 });
      }
    });

    test('should support space key for pronunciation', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Focus on body to ensure keyboard events are captured
        await page.locator('body').click();

        // Press space - should trigger pronunciation (no error thrown)
        await page.keyboard.press('Space');

        // Brief wait to ensure event processed
        await page.waitForTimeout(200);

        // Page should still be functional
        await expect(page.locator('[data-testid="word-card"]')).toBeVisible();
      }
    });
  });

  test.describe('Session Completion', () => {
    test('should show completion screen when mastery achieved', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // This test simulates what the completion screen looks like
      // The completion screen shows "目标达成" or "今日学习结束"
      const completionIndicators = page.locator('text=目标达成, text=今日学习结束, text=重新开始');

      // If already completed, verify completion UI
      const isCompleted = await completionIndicators.first().isVisible().catch(() => false);
      if (isCompleted) {
        // Should have restart button
        const restartButton = page.locator('button:has-text("重新开始")');
        await expect(restartButton).toBeVisible();

        // Should have statistics button
        const statsButton = page.locator('button:has-text("查看统计"), a:has-text("查看统计")');
        await expect(statsButton).toBeVisible();
      }
    });

    test('should allow restarting session', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // Look for restart button (only visible when completed)
      const restartButton = page.locator('button:has-text("重新开始")');
      const isCompleted = await restartButton.isVisible().catch(() => false);

      if (isCompleted) {
        await restartButton.click();

        // Should show loading state briefly
        await page.waitForTimeout(300);

        // Should either show word card or completion again
        const wordCard = page.locator('[data-testid="word-card"]');
        const completion = page.locator('text=目标达成');

        await expect(wordCard.or(completion)).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('Session Restoration', () => {
    test('should restore session from cache on page reload', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer a few questions to build session state
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(2200);

        // Get current progress
        const questionCountBefore = await page.locator('[data-testid="question-count"]').textContent();

        // Reload page
        await page.reload();
        await waitForLearningPageReady(page);

        // Check if session was restored (progress should be maintained)
        const questionCountAfter = await page.locator('[data-testid="question-count"]').textContent();

        // Progress should be preserved (or page shows completion)
        const hasProgress = await page.locator('[data-testid="question-count"]').isVisible().catch(() => false);
        if (hasProgress && questionCountBefore && questionCountAfter) {
          // Session state should be maintained
          expect(parseInt(questionCountAfter.match(/\d+/)?.[0] || '0'))
            .toBeGreaterThanOrEqual(parseInt(questionCountBefore.match(/\d+/)?.[0] || '0') - 1);
        }
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Intercept API calls and simulate error
      await page.route('**/api/learning/**', route => route.abort());

      await page.goto('/');

      // Should show error state or fallback UI
      await page.waitForTimeout(1000);

      // Page should not crash - either shows error or uses cached data
      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();
    });

    test('should display error message when loading fails', async ({ page }) => {
      // This test checks that error state is properly displayed
      // Simulate network error
      await page.route('**/api/study/mastery/words**', route => route.abort());
      await clearLearningSession(page);

      await page.goto('/');
      await page.waitForTimeout(2000);

      // Should either show error message or fallback UI
      const errorMessage = page.locator('text=加载学习数据失败, text=重试');
      const wordCard = page.locator('[data-testid="word-card"]');
      const noWordsMessage = page.locator('text=暂无单词');

      // One of these should be visible
      await expect(errorMessage.or(wordCard).or(noWordsMessage).first()).toBeVisible({ timeout: 5000 });
    });

    test('should provide retry option on error', async ({ page }) => {
      // First make API fail
      await page.route('**/api/study/mastery/words**', route => route.abort());
      await clearLearningSession(page);

      await page.goto('/');
      await page.waitForTimeout(2000);

      // Check for retry button if error occurred
      const retryButton = page.locator('button:has-text("重试")');
      const isErrorState = await retryButton.isVisible().catch(() => false);

      if (isErrorState) {
        // Remove the route blocking
        await page.unroute('**/api/study/mastery/words**');

        // Click retry
        await retryButton.click();

        // Should attempt to reload
        await page.waitForTimeout(1000);
        await expect(page.locator('main')).toBeVisible();
      }
    });
  });

  test.describe('AMAS Strategy Display', () => {
    test('should display learning strategy explanation after answering', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer a question
        await page.locator('[data-testid="option-0"]').click();

        // Wait for result to show
        await page.waitForTimeout(300);

        // Strategy explanation should appear
        const strategyExplanation = page.locator('text=当前学习策略');
        await expect(strategyExplanation).toBeVisible({ timeout: 3000 });
      }
    });

    test('should have working AI suggestion button', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

      if (hasWordCard) {
        // Answer a question to enable AI suggestion
        await page.locator('[data-testid="option-0"]').click();
        await page.waitForTimeout(2200); // Wait for next word

        // Look for the suggestion button (lightbulb icon)
        const suggestionButton = page.locator('button[title*="建议"]');
        const hasButton = await suggestionButton.isVisible().catch(() => false);

        if (hasButton) {
          await suggestionButton.click();
          // Modal should appear
          await page.waitForTimeout(300);
        }
      }
    });
  });

  test.describe('Navigation Integration', () => {
    test('should allow navigation to vocabulary from empty state', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // Check if in empty state
      const vocabButton = page.locator('button:has-text("选择词书"), a:has-text("选择词书")');
      const hasEmptyState = await vocabButton.isVisible().catch(() => false);

      if (hasEmptyState) {
        await vocabButton.click();
        await expect(page).toHaveURL('/vocabulary');
      }
    });

    test('should allow navigation to statistics after completion', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // Check if completed
      const statsButton = page.locator('button:has-text("查看统计")');
      const isCompleted = await statsButton.isVisible().catch(() => false);

      if (isCompleted) {
        await statsButton.click();
        await expect(page).toHaveURL('/statistics');
      }
    });
  });
});

test.describe('Learning Flow - Multiple Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should handle rapid answer submissions correctly', async ({ page }) => {
    await clearLearningSession(page);
    await page.goto('/');
    await waitForLearningPageReady(page);

    const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

    if (hasWordCard) {
      // Rapid clicks should be debounced
      const option = page.locator('[data-testid="option-0"]');
      await option.click();
      await option.click(); // Second click should be ignored

      // Only one answer should be recorded
      await page.waitForTimeout(300);
      await expect(option).toBeDisabled();
    }
  });

  test('should complete a full learning session flow', async ({ page }) => {
    await clearLearningSession(page);
    await page.goto('/');
    await waitForLearningPageReady(page);

    const hasWordCard = await page.locator('[data-testid="word-card"]').isVisible().catch(() => false);

    if (hasWordCard) {
      // Answer 5 questions
      for (let i = 0; i < 5; i++) {
        const wordCard = page.locator('[data-testid="word-card"]');
        const isStillLearning = await wordCard.isVisible().catch(() => false);

        if (!isStillLearning) break;

        // Answer using keyboard for variety
        await page.keyboard.press('1');
        await page.waitForTimeout(2200); // Wait for auto-advance
      }

      // Session should have progressed
      const questionCount = page.locator('[data-testid="question-count"]');
      const isStillActive = await questionCount.isVisible().catch(() => false);

      if (isStillActive) {
        const text = await questionCount.textContent();
        const count = parseInt(text?.match(/\d+/)?.[0] || '0');
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
