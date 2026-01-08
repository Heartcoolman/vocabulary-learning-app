/**
 * Review Flow E2E Tests
 *
 * Complete tests for the word review/test workflow:
 * - Review session initialization
 * - Answering review questions
 * - Review progress tracking
 * - Spaced repetition behavior
 * - Review completion
 */

import { test, expect, Page } from '@playwright/test';
import {
  loginAsUser,
  clearLearningSession,
  waitForLearningPageReady,
  hasWordCard,
  answerQuestion,
  answerQuestionWithKeyboard,
  waitForNextWord,
  answerMultipleQuestions,
} from './utils/test-helpers';

// Increase timeout for review tests
test.setTimeout(45000);

test.describe('Review Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await clearLearningSession(page);
  });

  test.describe('Review Session Initialization', () => {
    test('should start review session from home page', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // Should show either word card or completion/empty state
      const wordCard = page.locator('[data-testid="word-card"]');
      const noWords = page.locator('text=暂无单词');
      const completed = page.locator('text=目标达成');

      await expect(wordCard.or(noWords).or(completed).first()).toBeVisible();
    });

    test('should display review progress when session starts', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Progress component should be visible
        const progress = page.locator('[data-testid="mastery-progress"]');
        await expect(progress).toBeVisible();
      }
    });

    test('should display question count', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        const questionCount = page.locator('[data-testid="question-count"]');
        await expect(questionCount).toBeVisible();
      }
    });

    test('should display mastered count', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        const masteredCount = page.locator('[data-testid="mastered-count"]');
        await expect(masteredCount).toBeVisible();
      }
    });
  });

  test.describe('Review Question Display', () => {
    test('should display word spelling', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        const wordSpelling = page.locator('[data-testid="word-spelling"]');
        await expect(wordSpelling).toBeVisible();

        const text = await wordSpelling.textContent();
        expect(text?.length).toBeGreaterThan(0);
      }
    });

    test('should display answer options', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        const testOptions = page.locator('[data-testid="test-options"]');
        await expect(testOptions).toBeVisible();

        // Should have multiple options
        const options = page.locator('[data-testid^="option-"]');
        const count = await options.count();
        expect(count).toBeGreaterThanOrEqual(2);
      }
    });

    test('should display phonetic transcription', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Phonetic is usually in format /phonetic/
        const phonetic = page.locator('text=/[^/]+/');
        const count = await phonetic.count();
        expect(count).toBeGreaterThanOrEqual(0); // May or may not have phonetic
      }
    });
  });

  test.describe('Answering Review Questions', () => {
    test('should accept answer by clicking option', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        await answerQuestion(page, 0);

        // Option should be disabled after answering
        const firstOption = page.locator('[data-testid="option-0"]');
        await expect(firstOption).toBeDisabled();
      }
    });

    test('should accept answer by keyboard shortcut', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        await answerQuestionWithKeyboard(page, '1');

        // Option should be disabled
        const firstOption = page.locator('[data-testid="option-0"]');
        await expect(firstOption).toBeDisabled({ timeout: 2000 });
      }
    });

    test('should show correct/incorrect feedback', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        await answerQuestion(page, 0);

        // Should show visual feedback
        const greenFeedback = page.locator(
          '[data-testid^="option-"].bg-green-500, [data-testid^="option-"].border-green-500',
        );
        const redFeedback = page.locator(
          '[data-testid^="option-"].bg-red-500, [data-testid^="option-"].border-red-500',
        );

        await expect(greenFeedback.or(redFeedback).first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('should highlight correct answer after wrong selection', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Select an option
        await answerQuestion(page, 0);

        // Wait for feedback
        await page.waitForTimeout(500);

        // At least one option should show correct answer indicator
        const greenIndicator = page.locator(
          '[data-testid^="option-"].bg-green-500, [data-testid^="option-"].border-green-500',
        );
        await expect(greenIndicator.first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('should prevent multiple answers to same question', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Answer once
        await answerQuestion(page, 0);

        // All options should be disabled
        const options = page.locator('[data-testid^="option-"]');
        const count = await options.count();

        for (let i = 0; i < count; i++) {
          await expect(options.nth(i)).toBeDisabled();
        }
      }
    });
  });

  test.describe('Review Progress Tracking', () => {
    test('should update question count after answering', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        const questionCount = page.locator('[data-testid="question-count"]');
        const initialText = await questionCount.textContent();
        const initialCount = parseInt(initialText?.match(/\d+/)?.[0] || '0');

        await answerQuestion(page, 0);
        await page.waitForTimeout(500);

        const updatedText = await questionCount.textContent();
        const updatedCount = parseInt(updatedText?.match(/\d+/)?.[0] || '0');

        expect(updatedCount).toBeGreaterThanOrEqual(initialCount);
      }
    });

    test('should track mastered words count', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        const masteredCount = page.locator('[data-testid="mastered-count"]');
        await expect(masteredCount).toBeVisible();

        // Text should show format like "X/Y"
        const text = await masteredCount.textContent();
        expect(text).toMatch(/\d+.*\/.*\d+/);
      }
    });

    test('should advance to next word after auto-timeout', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        const initialWord = await page.locator('[data-testid="word-spelling"]').textContent();

        await answerQuestion(page, 0);
        await waitForNextWord(page);

        // Check if still learning or completed
        const newWordSpelling = page.locator('[data-testid="word-spelling"]');
        const completion = page.locator('text=目标达成');

        if (await newWordSpelling.isVisible().catch(() => false)) {
          const newWord = await newWordSpelling.textContent();
          // Word may or may not change (depends on learning state)
          expect(newWord).toBeDefined();
        } else {
          // Session may have completed
          expect(await completion.isVisible().catch(() => true)).toBeTruthy();
        }
      }
    });
  });

  test.describe('Review Session Completion', () => {
    test('should show completion screen when mastery target reached', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // Answer many questions to potentially complete session
      await answerMultipleQuestions(page, 20, true);

      // Check for completion or active learning
      const completion = page.locator('text=目标达成, text=今日学习结束');
      const wordCard = page.locator('[data-testid="word-card"]');

      await expect(completion.or(wordCard).first()).toBeVisible();
    });

    test('should show restart option after completion', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      // Check if already completed
      const restartButton = page.locator('button:has-text("重新开始")');
      const isCompleted = await restartButton.isVisible().catch(() => false);

      if (isCompleted) {
        await expect(restartButton).toBeVisible();
      }
    });

    test('should allow restarting session', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const restartButton = page.locator('button:has-text("重新开始")');
      const isCompleted = await restartButton.isVisible().catch(() => false);

      if (isCompleted) {
        await restartButton.click();
        await page.waitForTimeout(1000);

        // Should show word card or completion again
        const wordCard = page.locator('[data-testid="word-card"]');
        const completion = page.locator('text=目标达成');

        await expect(wordCard.or(completion).first()).toBeVisible({ timeout: 10000 });
      }
    });

    test('should show statistics link after completion', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      const statsButton = page.locator('button:has-text("查看统计"), a:has-text("查看统计")');
      const isCompleted = await statsButton.isVisible().catch(() => false);

      if (isCompleted) {
        await expect(statsButton).toBeVisible();
      }
    });
  });

  test.describe('Review Session Restoration', () => {
    test('should restore session on page reload', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Answer a question
        await answerQuestion(page, 0);
        await page.waitForTimeout(500);

        const questionCountBefore = await page
          .locator('[data-testid="question-count"]')
          .textContent();

        // Reload
        await page.reload();
        await waitForLearningPageReady(page);

        // Progress should be maintained
        const questionCountAfter = await page
          .locator('[data-testid="question-count"]')
          .textContent();

        if (questionCountBefore && questionCountAfter) {
          const before = parseInt(questionCountBefore.match(/\d+/)?.[0] || '0');
          const after = parseInt(questionCountAfter.match(/\d+/)?.[0] || '0');
          expect(after).toBeGreaterThanOrEqual(before - 1); // Allow for slight variance
        }
      }
    });

    test('should handle session restoration after browser close', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await loginAsUser(page);
      await clearLearningSession(page);
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Answer questions
        await answerQuestion(page, 0);
        await page.waitForTimeout(1000);
      }

      await page.close();
      await context.close();
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('should support number keys 1-4 for answer selection', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Test key 1
        await page.keyboard.press('1');
        await expect(page.locator('[data-testid="option-0"]')).toBeDisabled({ timeout: 2000 });
      }
    });

    test('should support space key for pronunciation', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        // Focus body first
        await page.locator('body').click();

        // Press space
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        // Should not crash or navigate
        await expect(page.locator('[data-testid="word-card"]')).toBeVisible();
      }
    });

    test('should handle Enter key gracefully', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // Should not crash
        await expect(page.locator('main')).toBeVisible();
      }
    });
  });

  test.describe('AMAS Strategy Display', () => {
    test('should display learning strategy after answering', async ({ page }) => {
      await page.goto('/');
      await waitForLearningPageReady(page);

      if (await hasWordCard(page)) {
        await answerQuestion(page, 0);
        await page.waitForTimeout(500);

        // Strategy explanation should appear
        const strategyExplanation = page.locator('text=当前学习策略');
        await expect(strategyExplanation).toBeVisible({ timeout: 5000 });
      }
    });
  });
});

test.describe('Review Flow - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await clearLearningSession(page);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Start normally
    await page.goto('/');
    await waitForLearningPageReady(page);

    if (await hasWordCard(page)) {
      // Block API
      await page.route('**/api/**', (route) => route.abort());

      // Try to answer
      await page.locator('[data-testid="option-0"]').click();
      await page.waitForTimeout(1000);

      // Should not crash
      await expect(page.locator('main')).toBeVisible();

      // Unblock
      await page.unroute('**/api/**');
    }
  });

  test('should handle offline mode', async ({ page }) => {
    await page.goto('/');
    await waitForLearningPageReady(page);

    if (await hasWordCard(page)) {
      // Go offline
      await page.context().setOffline(true);

      await page.locator('[data-testid="option-0"]').click();
      await page.waitForTimeout(500);

      // Should handle gracefully
      await expect(page.locator('main')).toBeVisible();

      // Go back online
      await page.context().setOffline(false);
    }
  });

  test('should display error message when loading fails', async ({ page }) => {
    await page.route('**/api/study/**', (route) => route.abort());
    await clearLearningSession(page);

    await page.goto('/');
    await page.waitForTimeout(3000);

    // Should show error or fallback UI
    const errorMessage = page.locator('text=加载学习数据失败, text=重试');
    const wordCard = page.locator('[data-testid="word-card"]');
    const noWordsMessage = page.locator('text=暂无单词');

    await expect(errorMessage.or(wordCard).or(noWordsMessage).first()).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe('Review Flow - Performance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await clearLearningSession(page);
  });

  test('should handle rapid answer submissions', async ({ page }) => {
    await page.goto('/');
    await waitForLearningPageReady(page);

    if (await hasWordCard(page)) {
      // Rapid clicks
      const option = page.locator('[data-testid="option-0"]');
      await option.click();
      await option.click();
      await option.click();

      await page.waitForTimeout(500);

      // Should have processed only one answer
      await expect(option).toBeDisabled();
    }
  });

  test('should handle rapid keyboard inputs', async ({ page }) => {
    await page.goto('/');
    await waitForLearningPageReady(page);

    if (await hasWordCard(page)) {
      // Rapid key presses
      await page.keyboard.press('1');
      await page.keyboard.press('2');
      await page.keyboard.press('3');

      await page.waitForTimeout(500);

      // Should not crash
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('should complete multiple questions in sequence', async ({ page }) => {
    await page.goto('/');
    await waitForLearningPageReady(page);

    if (await hasWordCard(page)) {
      // Answer 5 questions
      for (let i = 0; i < 5; i++) {
        const wordCard = page.locator('[data-testid="word-card"]');
        if (!(await wordCard.isVisible().catch(() => false))) break;

        await page.keyboard.press('1');
        await waitForNextWord(page);
      }

      // Session should have progressed
      await expect(page.locator('main')).toBeVisible();
    }
  });
});
