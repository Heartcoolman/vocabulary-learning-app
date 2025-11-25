/**
 * AMAS Enhanced Features Property Tests
 * **Feature: amas-enhanced-features**
 * **Validates: Requirements 1.1-5.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

interface TimeSlot { hour: number; score: number; confidence: number; }
type TrendState = 'up' | 'flat' | 'stuck' | 'down';
interface WordbookAllocation { wordbookId: string; wordbookName?: string; percentage: number; priority: number; }
interface StateHistoryItem { date: Date; attention: number; fatigue: number; motivation: number; memory: number; speed: number; stability: number; trendState?: string; }
interface TrendLine { points: Array<{ date: string; value: number }>; direction: 'up' | 'down' | 'flat'; changePercent: number; }
interface TrendReport { accuracyTrend: TrendLine; responseTimeTrend: TrendLine; motivationTrend: TrendLine; summary: string; recommendations: string[]; }
interface BadgeCondition { type: 'streak' | 'accuracy' | 'words_learned' | 'cognitive_improvement' | 'total_sessions'; value: number; params?: Record<string, unknown>; }
interface UserStats { consecutiveDays: number; totalWordsLearned: number; totalSessions: number; recentAccuracy: number; cognitiveImprovement: { memory: number; speed: number; stability: number; }; }
interface UserBadge { id: string; badgeId: string; name: string; description: string; iconUrl: string; tier: number; unlockedAt: Date; }
interface LearningPlan { id: string; userId: string; dailyTarget: number; estimatedCompletionDate: Date; wordbookDistribution: WordbookAllocation[]; weeklyMilestones: Array<{ week: number; target: number; description: string }>; }
interface CognitiveProfile { memory: number; speed: number; stability: number; }

function normalizeScore(score: number): number { if (typeof score !== 'number' || !Number.isFinite(score)) return 0; return Math.max(0, Math.min(1, score)); }
function calculateSlotConfidence(score: number, allScores: number[]): number { const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length; const stdDev = Math.sqrt(allScores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / allScores.length); if (stdDev === 0) return 0.5; return Math.max(0, Math.min(1, 0.5 + ((score - avg) / stdDev) * 0.2)); }
function getRecommendedSlots(timePref: number[]): TimeSlot[] { if (!Array.isArray(timePref) || timePref.length !== 24) return [{ hour: 9, score: 0.5, confidence: 0 }, { hour: 14, score: 0.4, confidence: 0 }, { hour: 20, score: 0.3, confidence: 0 }]; const slots: TimeSlot[] = timePref.map((score, hour) => ({ hour, score: normalizeScore(score), confidence: calculateSlotConfidence(score, timePref) })); slots.sort((a, b) => b.score - a.score); return slots.slice(0, 3); }
function isGoldenTime(currentHour: number, preferredSlots: TimeSlot[], threshold: number = 0.6): { isGolden: boolean; matchedSlot?: TimeSlot } { const matchedSlot = preferredSlots.find(slot => slot.hour === currentHour); const isGolden = matchedSlot !== undefined && matchedSlot.score >= threshold; return { isGolden, matchedSlot: isGolden ? matchedSlot : undefined }; }
function hasInsufficientData(sessionCount: number, minRequired: number = 20): boolean { return sessionCount < minRequired; }
function shouldShowInterventionPanel(state: TrendState): boolean { return state === 'stuck' || state === 'down'; }

function aggregateWeeklyTrend(dailyData: Array<{ date: Date; accuracy: number; responseTime: number; motivation: number }>): Array<{ week: number; avgAccuracy: number; avgResponseTime: number; avgMotivation: number }> { if (dailyData.length === 0) return []; const weeks: Map<number, typeof dailyData> = new Map(); const startDate = dailyData[0].date.getTime(); for (const item of dailyData) { const daysDiff = Math.floor((item.date.getTime() - startDate) / (24 * 60 * 60 * 1000)); const weekNum = Math.floor(daysDiff / 7) + 1; if (!weeks.has(weekNum)) weeks.set(weekNum, []); weeks.get(weekNum)!.push(item); } const result: Array<{ week: number; avgAccuracy: number; avgResponseTime: number; avgMotivation: number }> = []; for (const [week, items] of weeks) { result.push({ week, avgAccuracy: items.reduce((sum, i) => sum + i.accuracy, 0) / items.length, avgResponseTime: items.reduce((sum, i) => sum + i.responseTime, 0) / items.length, avgMotivation: items.reduce((sum, i) => sum + i.motivation, 0) / items.length }); } return result.sort((a, b) => a.week - b.week); }
function shouldSendNotification(trendHistory: TrendState[], threshold: number = 3): boolean { if (trendHistory.length <= threshold) return false; let consecutiveDown = 0; for (const state of trendHistory) { if (state === 'down') { consecutiveDown++; if (consecutiveDown > threshold) return true; } else { consecutiveDown = 0; } } return false; }
function generateTrendReport(history: Array<{ date: string; accuracy: number; responseTime: number; motivation: number }>): TrendReport { const calculateTrendLine = (points: Array<{ date: string; value: number }>, invertDirection: boolean = false): TrendLine => { if (points.length === 0) return { points: [], direction: 'flat', changePercent: 0 }; const firstValue = points[0]?.value || 0; const lastValue = points[points.length - 1]?.value || 0; const changePercent = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0; const adjustedChange = invertDirection ? -changePercent : changePercent; let direction: 'up' | 'down' | 'flat'; if (adjustedChange > 5) direction = 'up'; else if (adjustedChange < -5) direction = 'down'; else direction = 'flat'; return { points, direction, changePercent }; }; return { accuracyTrend: calculateTrendLine(history.map(h => ({ date: h.date, value: h.accuracy }))), responseTimeTrend: calculateTrendLine(history.map(h => ({ date: h.date, value: h.responseTime })), true), motivationTrend: calculateTrendLine(history.map(h => ({ date: h.date, value: h.motivation }))), summary: 'Summary', recommendations: ['Rec1', 'Rec2'] }; }
function checkBadgeEligibility(condition: BadgeCondition, stats: UserStats): boolean { switch (condition.type) { case 'streak': return stats.consecutiveDays >= condition.value; case 'accuracy': const minWords = (condition.params?.minWords as number) || 0; if (minWords > 0 && stats.totalWordsLearned < minWords) return false; return stats.recentAccuracy >= condition.value; case 'words_learned': return stats.totalWordsLearned >= condition.value; case 'total_sessions': return stats.totalSessions >= condition.value; case 'cognitive_improvement': const metric = condition.params?.metric as string; const threshold = condition.value; if (metric === 'all') { return stats.cognitiveImprovement.memory >= threshold && stats.cognitiveImprovement.speed >= threshold && stats.cognitiveImprovement.stability >= threshold; } return stats.cognitiveImprovement[metric as keyof typeof stats.cognitiveImprovement] >= threshold; default: return false; } }
function validateBadgeData(badge: Partial<UserBadge>): boolean { return typeof badge.id === 'string' && badge.id.length > 0 && typeof badge.name === 'string' && badge.name.length > 0 && typeof badge.description === 'string' && typeof badge.iconUrl === 'string' && typeof badge.tier === 'number' && badge.tier >= 1; }
function validateLearningPlan(plan: Partial<LearningPlan>): boolean { return typeof plan.dailyTarget === 'number' && plan.dailyTarget > 0 && plan.estimatedCompletionDate instanceof Date && Array.isArray(plan.weeklyMilestones) && Array.isArray(plan.wordbookDistribution); }
function calculateEstimatedCompletionDate(totalWords: number, dailyTarget: number, startDate: Date = new Date()): Date { const daysToComplete = Math.ceil(totalWords / dailyTarget); const completionDate = new Date(startDate); completionDate.setDate(completionDate.getDate() + daysToComplete); return completionDate; }
function shouldAdjustPlan(actualProgress: number, expectedProgress: number, threshold: number = 0.2): boolean { if (expectedProgress === 0) return false; const deviation = Math.abs(actualProgress - expectedProgress) / expectedProgress; return deviation > threshold; }
function calculateWordbookDistribution(wordbooks: Array<{ id: string; name: string; wordCount: number }>): WordbookAllocation[] { if (wordbooks.length === 0) return []; const sorted = [...wordbooks].sort((a, b) => b.wordCount - a.wordCount); const totalWeight = sorted.reduce((sum, _, index) => sum + (sorted.length - index), 0); let remainingPercentage = 100; return sorted.map((wb, index) => { const priority = index + 1; const weight = sorted.length - index; const percentage = index === sorted.length - 1 ? remainingPercentage : Math.round((weight / totalWeight) * 100); remainingPercentage -= percentage; return { wordbookId: wb.id, wordbookName: wb.name, percentage, priority }; }); }
function filterHistoryByDateRange(history: StateHistoryItem[], startDate: Date, endDate: Date): StateHistoryItem[] { return history.filter(item => item.date >= startDate && item.date <= endDate); }
function calculateDailyAverage(records: Array<{ attention: number; fatigue: number; motivation: number; memory: number; speed: number; stability: number }>): { attention: number; fatigue: number; motivation: number; memory: number; speed: number; stability: number } { if (records.length === 0) return { attention: 0, fatigue: 0, motivation: 0, memory: 0, speed: 0, stability: 0 }; const sum = records.reduce((acc, r) => ({ attention: acc.attention + r.attention, fatigue: acc.fatigue + r.fatigue, motivation: acc.motivation + r.motivation, memory: acc.memory + r.memory, speed: acc.speed + r.speed, stability: acc.stability + r.stability }), { attention: 0, fatigue: 0, motivation: 0, memory: 0, speed: 0, stability: 0 }); const count = records.length; return { attention: sum.attention / count, fatigue: sum.fatigue / count, motivation: sum.motivation / count, memory: sum.memory / count, speed: sum.speed / count, stability: sum.stability / count }; }
function calculateCognitiveGrowth(current: CognitiveProfile, past: CognitiveProfile): { memory: number; speed: number; stability: number } { return { memory: current.memory - past.memory, speed: current.speed - past.speed, stability: current.stability - past.stability }; }
function detectSignificantChanges(startValue: number, endValue: number, threshold: number = 0.2): { isSignificant: boolean; changePercent: number; direction: 'up' | 'down' } | null { if (startValue === 0) return null; const changePercent = (endValue - startValue) / Math.abs(startValue); const isSignificant = Math.abs(changePercent) >= threshold; const direction: 'up' | 'down' = changePercent > 0 ? 'up' : 'down'; return { isSignificant, changePercent: changePercent * 100, direction }; }

const timeSlotArb = fc.record({ hour: fc.integer({ min: 0, max: 23 }), score: fc.double({ min: 0, max: 1, noNaN: true }), confidence: fc.double({ min: 0, max: 1, noNaN: true }) });
const trendStateArb = fc.constantFrom<TrendState>('up', 'flat', 'stuck', 'down');
const cognitiveProfileArb = fc.record({ memory: fc.double({ min: 0, max: 1, noNaN: true }), speed: fc.double({ min: 0, max: 1, noNaN: true }), stability: fc.double({ min: 0, max: 1, noNaN: true }) });
const userStatsArb = fc.record({ consecutiveDays: fc.integer({ min: 0, max: 365 }), totalWordsLearned: fc.integer({ min: 0, max: 10000 }), totalSessions: fc.integer({ min: 0, max: 1000 }), recentAccuracy: fc.double({ min: 0, max: 1, noNaN: true }), cognitiveImprovement: cognitiveProfileArb });
const wordbookArb = fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1, maxLength: 50 }), wordCount: fc.integer({ min: 1, max: 5000 }) });
const stateHistoryItemArb = fc.record({ date: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }), attention: fc.double({ min: 0, max: 1, noNaN: true }), fatigue: fc.double({ min: 0, max: 1, noNaN: true }), motivation: fc.double({ min: 0, max: 1, noNaN: true }), memory: fc.double({ min: 0, max: 1, noNaN: true }), speed: fc.double({ min: 0, max: 1, noNaN: true }), stability: fc.double({ min: 0, max: 1, noNaN: true }) });

describe('AMAS Enhanced Features Property Tests', () => {
  describe('Property 1: Time preference data transformation', () => {
    it('**Feature: amas-enhanced-features, Property 1** - Validates: Requirements 1.1, 1.5', () => {
      fc.assert(fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 24, maxLength: 24 }), (timePref) => {
        const slots = getRecommendedSlots(timePref);
        expect(slots.length).toBe(3);
        for (let i = 1; i < slots.length; i++) expect(slots[i - 1].score).toBeGreaterThanOrEqual(slots[i].score);
        for (const slot of slots) { expect(slot.hour).toBeGreaterThanOrEqual(0); expect(slot.hour).toBeLessThanOrEqual(23); expect(slot.score).toBeGreaterThanOrEqual(0); expect(slot.score).toBeLessThanOrEqual(1); }
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 2: Golden time detection', () => {
    it('**Feature: amas-enhanced-features, Property 2** - Validates: Requirements 1.2', () => {
      fc.assert(fc.property(fc.integer({ min: 0, max: 23 }), fc.array(timeSlotArb, { minLength: 1, maxLength: 5 }), fc.double({ min: 0.1, max: 0.9, noNaN: true }), (hour, slots, threshold) => {
        const result = isGoldenTime(hour, slots, threshold);
        const expectedGolden = slots.some(s => s.hour === hour && s.score >= threshold);
        expect(result.isGolden).toBe(expectedGolden);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 3: Insufficient data threshold', () => {
    it('**Feature: amas-enhanced-features, Property 3** - Validates: Requirements 1.3', () => {
      fc.assert(fc.property(fc.integer({ min: 0, max: 100 }), (sessionCount) => {
        expect(hasInsufficientData(sessionCount, 20)).toBe(sessionCount < 20);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 4: TrendState to UI mapping', () => {
    it('**Feature: amas-enhanced-features, Property 4** - Validates: Requirements 2.1, 2.2', () => {
      fc.assert(fc.property(trendStateArb, (state) => {
        expect(shouldShowInterventionPanel(state)).toBe(state === 'stuck' || state === 'down');
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 5: Weekly trend aggregation', () => {
    it('**Feature: amas-enhanced-features, Property 5** - Validates: Requirements 2.3', () => {
      fc.assert(fc.property(fc.array(fc.record({ date: fc.integer({ min: 1704067200000, max: 1709164800000 }).map(ts => new Date(ts)), accuracy: fc.double({ min: 0, max: 1, noNaN: true }), responseTime: fc.double({ min: 100, max: 10000, noNaN: true }), motivation: fc.double({ min: 0, max: 1, noNaN: true }) }), { minLength: 1, maxLength: 28 }), (dailyData) => {
        const sortedData = [...dailyData].sort((a, b) => a.date.getTime() - b.date.getTime());
        const result = aggregateWeeklyTrend(sortedData);
        for (let i = 1; i < result.length; i++) expect(result[i].week).toBeGreaterThan(result[i - 1].week);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 6: Consecutive down days notification', () => {
    it('**Feature: amas-enhanced-features, Property 6** - Validates: Requirements 2.4', () => {
      fc.assert(fc.property(fc.array(trendStateArb, { minLength: 1, maxLength: 14 }), (trendHistory) => {
        const result = shouldSendNotification(trendHistory, 3);
        let maxConsecutiveDown = 0, currentConsecutive = 0;
        for (const state of trendHistory) { if (state === 'down') { currentConsecutive++; maxConsecutiveDown = Math.max(maxConsecutiveDown, currentConsecutive); } else currentConsecutive = 0; }
        expect(result).toBe(maxConsecutiveDown > 3);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 7: Trend report completeness', () => {
    it('**Feature: amas-enhanced-features, Property 7** - Validates: Requirements 2.5', () => {
      fc.assert(fc.property(fc.array(fc.record({ date: fc.integer({ min: 1704067200000, max: 1735689600000 }).map(ts => new Date(ts).toISOString()), accuracy: fc.double({ min: 0, max: 1, noNaN: true }), responseTime: fc.double({ min: 100, max: 10000, noNaN: true }), motivation: fc.double({ min: 0, max: 1, noNaN: true }) }), { minLength: 0, maxLength: 28 }), (history) => {
        const report = generateTrendReport(history);
        expect(report.accuracyTrend).toBeDefined();
        expect(report.responseTimeTrend).toBeDefined();
        expect(report.motivationTrend).toBeDefined();
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 8: Badge award on milestone', () => {
    it('**Feature: amas-enhanced-features, Property 8** - Validates: Requirements 3.1, 3.3', () => {
      fc.assert(fc.property(userStatsArb, fc.constantFrom<BadgeCondition['type']>('streak', 'accuracy', 'words_learned', 'total_sessions'), (stats, conditionType) => {
        let condition: BadgeCondition;
        switch (conditionType) { case 'streak': if (stats.consecutiveDays <= 0) return true; condition = { type: 'streak', value: stats.consecutiveDays }; break; case 'accuracy': condition = { type: 'accuracy', value: Math.max(0, stats.recentAccuracy - 0.01) }; break; case 'words_learned': if (stats.totalWordsLearned <= 0) return true; condition = { type: 'words_learned', value: stats.totalWordsLearned }; break; case 'total_sessions': if (stats.totalSessions <= 0) return true; condition = { type: 'total_sessions', value: stats.totalSessions }; break; default: condition = { type: 'streak', value: 1 }; }
        expect(checkBadgeEligibility(condition, stats)).toBe(true);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 9: Badge data completeness', () => {
    it('**Feature: amas-enhanced-features, Property 9** - Validates: Requirements 3.2, 3.5', () => {
      fc.assert(fc.property(fc.record({ id: fc.uuid(), badgeId: fc.uuid(), name: fc.string({ minLength: 1, maxLength: 50 }), description: fc.string({ minLength: 0, maxLength: 200 }), iconUrl: fc.webUrl(), tier: fc.integer({ min: 1, max: 5 }), unlockedAt: fc.date() }), (badge) => {
        expect(validateBadgeData(badge)).toBe(true);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 10: Badge eligibility calculation', () => {
    it('**Feature: amas-enhanced-features, Property 10** - Validates: Requirements 3.4', () => {
      fc.assert(fc.property(userStatsArb, (stats) => {
        expect(checkBadgeEligibility({ type: 'streak', value: 7 }, stats)).toBe(stats.consecutiveDays >= 7);
        expect(checkBadgeEligibility({ type: 'accuracy', value: 0.8 }, stats)).toBe(stats.recentAccuracy >= 0.8);
        expect(checkBadgeEligibility({ type: 'words_learned', value: 100 }, stats)).toBe(stats.totalWordsLearned >= 100);
        expect(checkBadgeEligibility({ type: 'total_sessions', value: 10 }, stats)).toBe(stats.totalSessions >= 10);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 11: Learning plan generation', () => {
    it('**Feature: amas-enhanced-features, Property 11** - Validates: Requirements 4.1, 4.4', () => {
      fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), fc.array(wordbookArb, { minLength: 1, maxLength: 5 }), (dailyTarget, wordbooks) => {
        const totalWords = wordbooks.reduce((sum, wb) => sum + wb.wordCount, 0);
        const daysToComplete = Math.ceil(totalWords / dailyTarget);
        const estimatedCompletionDate = new Date();
        estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + daysToComplete);
        const plan: Partial<LearningPlan> = { dailyTarget, estimatedCompletionDate, weeklyMilestones: [{ week: 1, target: dailyTarget * 7, description: 'Week 1' }], wordbookDistribution: calculateWordbookDistribution(wordbooks) };
        expect(validateLearningPlan(plan)).toBe(true);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 12: Completion date calculation', () => {
    it('**Feature: amas-enhanced-features, Property 12** - Validates: Requirements 4.2', () => {
      fc.assert(fc.property(fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 100 }), (totalWords, dailyTarget) => {
        const startDate = new Date('2024-06-01');
        const completionDate = calculateEstimatedCompletionDate(totalWords, dailyTarget, startDate);
        const expectedDays = Math.ceil(totalWords / dailyTarget);
        const expectedDate = new Date(startDate);
        expectedDate.setDate(expectedDate.getDate() + expectedDays);
        expect(completionDate.getTime()).toBe(expectedDate.getTime());
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 13: Plan adjustment on deviation', () => {
    it('**Feature: amas-enhanced-features, Property 13** - Validates: Requirements 4.3', () => {
      fc.assert(fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 1, max: 1000 }), (actualProgress, expectedProgress) => {
        const result = shouldAdjustPlan(actualProgress, expectedProgress, 0.2);
        const deviation = Math.abs(actualProgress - expectedProgress) / expectedProgress;
        expect(result).toBe(deviation > 0.2);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 14: Multi-wordbook distribution', () => {
    it('**Feature: amas-enhanced-features, Property 14** - Validates: Requirements 4.5', () => {
      fc.assert(fc.property(fc.array(wordbookArb, { minLength: 1, maxLength: 10 }), (wordbooks) => {
        const distribution = calculateWordbookDistribution(wordbooks);
        const totalPercentage = distribution.reduce((sum, wb) => sum + wb.percentage, 0);
        expect(totalPercentage).toBe(100);
        for (let i = 0; i < distribution.length; i++) { expect(distribution[i].priority).toBe(i + 1); expect(distribution[i].percentage).toBeGreaterThan(0); }
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 15: State history data retrieval', () => {
    it('**Feature: amas-enhanced-features, Property 15** - Validates: Requirements 5.1, 5.4', () => {
      fc.assert(fc.property(fc.array(stateHistoryItemArb, { minLength: 0, maxLength: 100 }), fc.date({ min: new Date('2024-01-01'), max: new Date('2024-06-30') }), fc.date({ min: new Date('2024-07-01'), max: new Date('2024-12-31') }), (history, startDate, endDate) => {
        const filtered = filterHistoryByDateRange(history, startDate, endDate);
        for (const item of filtered) { expect(item.date.getTime()).toBeGreaterThanOrEqual(startDate.getTime()); expect(item.date.getTime()).toBeLessThanOrEqual(endDate.getTime()); }
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 16: Daily state aggregation', () => {
    it('**Feature: amas-enhanced-features, Property 16** - Validates: Requirements 5.2', () => {
      fc.assert(fc.property(fc.array(fc.record({ attention: fc.double({ min: 0, max: 1, noNaN: true }), fatigue: fc.double({ min: 0, max: 1, noNaN: true }), motivation: fc.double({ min: 0, max: 1, noNaN: true }), memory: fc.double({ min: 0, max: 1, noNaN: true }), speed: fc.double({ min: 0, max: 1, noNaN: true }), stability: fc.double({ min: 0, max: 1, noNaN: true }) }), { minLength: 1, maxLength: 10 }), (records) => {
        const avg = calculateDailyAverage(records);
        const expectedAttention = records.reduce((sum, r) => sum + r.attention, 0) / records.length;
        expect(avg.attention).toBeCloseTo(expectedAttention, 10);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 17: Cognitive growth comparison', () => {
    it('**Feature: amas-enhanced-features, Property 17** - Validates: Requirements 5.3', () => {
      fc.assert(fc.property(cognitiveProfileArb, cognitiveProfileArb, (current, past) => {
        const growth = calculateCognitiveGrowth(current, past);
        expect(growth.memory).toBeCloseTo(current.memory - past.memory, 10);
        expect(growth.speed).toBeCloseTo(current.speed - past.speed, 10);
        expect(growth.stability).toBeCloseTo(current.stability - past.stability, 10);
        return true;
      }), { numRuns: 100 });
    });
  });

  describe('Property 18: Significant change detection', () => {
    it('**Feature: amas-enhanced-features, Property 18** - Validates: Requirements 5.5', () => {
      fc.assert(fc.property(fc.double({ min: 0.1, max: 1, noNaN: true }), fc.double({ min: 0.1, max: 1, noNaN: true }), (startValue, endValue) => {
        const result = detectSignificantChanges(startValue, endValue, 0.2);
        if (result === null) { expect(startValue).toBe(0); } else { const expectedChangePercent = ((endValue - startValue) / Math.abs(startValue)) * 100; const expectedIsSignificant = Math.abs(expectedChangePercent) >= 20; expect(result.isSignificant).toBe(expectedIsSignificant); }
        return true;
      }), { numRuns: 100 });
    });
  });
});




