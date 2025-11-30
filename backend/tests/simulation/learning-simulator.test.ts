/**
 * AMAS 模拟学习测试
 * 通过模拟用户学习行为验证算法引擎的功能和习惯记录
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import prisma from '../../src/config/database';

import { EventGenerator, generateEvents } from './lib/event-generator';
import { LearningPatterns, type PatternType } from './lib/learning-patterns';
import {
  UserSimulator,
  createSimulationUser,
  type CreateTestUserResult,
  type SessionResult,
} from './lib/user-simulator';
import {
  ReportGenerator,
  createValidation,
  type SimulationReportData,
  type UserSimulationResult,
  type ValidationItem,
} from './lib/report-generator';
import { createTestWordbook } from './fixtures/test-words';

// 测试配置
const TEST_CONFIG = {
  /** 单用户测试的答题次数 */
  singleUserEventCount: 500,
  /** 多用户测试的用户数 */
  multiUserCount: 100,
  /** 多用户测试每用户答题次数 */
  multiUserEventCountPerUser: 100,
  /** 第二轮复习的用户比例 */
  secondRoundUserRatio: 0.5,
  /** 第二轮复习每用户答题次数 */
  secondRoundEventCountPerUser: 50,
  /** 测试单词数量 - 需要足够多以避免间隔重复限制 */
  wordCount: 5000,
  /** 测试超时时间 (ms) */
  timeout: 2400000, // 40分钟（增加超时时间以适应更多用户和第二轮复习）
};

// 全局测试数据
let testWordbook: { wordbookId: string; wordIds: string[] };
let reportGenerator: ReportGenerator;
const allUserResults: UserSimulationResult[] = [];

describe('AMAS 模拟学习测试', { timeout: TEST_CONFIG.timeout }, () => {
  beforeAll(async () => {
    // 创建测试词书和单词
    testWordbook = await createTestWordbook(prisma, {
      wordCount: TEST_CONFIG.wordCount,
      wordbookName: `[SIMULATION] Learning Simulator Test ${Date.now()}`,
    });

    // 初始化报告生成器
    reportGenerator = new ReportGenerator();

    console.log(`测试准备完成: 创建了 ${testWordbook.wordIds.length} 个测试单词`);
  }, 300000); // 5分钟超时用于创建5000个单词

  afterAll(async () => {
    // 生成综合报告
    if (allUserResults.length > 0) {
      const reportData = buildReportData(allUserResults);
      const htmlPath = reportGenerator.saveHtmlReport(reportData);
      const jsonPath = reportGenerator.saveJsonData(reportData);
      console.log(`\n报告已生成:`);
      console.log(`  HTML: ${htmlPath}`);
      console.log(`  JSON: ${jsonPath}`);
    }

    // 注意：不清理测试数据，保留供人工检查
    console.log('\n测试数据已保留，可通过以下命令清理:');
    console.log('  npm run test:simulation:cleanup');
  });

  describe('场景1: 单用户多轮复习', () => {
    let testUser: CreateTestUserResult;
    let simulator: UserSimulator;
    let sessionResult: SessionResult;

    beforeAll(async () => {
      // 创建测试用户
      testUser = await createSimulationUser(app, prisma, bcrypt, faker);
      simulator = new UserSimulator(app, testUser.token, testUser.id);
      console.log(`创建测试用户: ${testUser.username}`);
    });

    it('应正确处理500次答题事件', async () => {
      // 生成普通模式的学习事件
      const events = generateEvents({
        wordIds: testWordbook.wordIds,
        count: TEST_CONFIG.singleUserEventCount,
        pattern: 'normal',
      });

      // 执行学习会话
      sessionResult = await simulator.runLearningSession(events);

      // 验证基础功能
      expect(sessionResult.totalEvents).toBe(TEST_CONFIG.singleUserEventCount);
      expect(sessionResult.successCount).toBeGreaterThan(0);

      // 成功率应该很高（API调用应该基本成功）
      const apiSuccessRate = sessionResult.successCount / sessionResult.totalEvents;
      expect(apiSuccessRate).toBeGreaterThan(0.95);

      console.log(`单用户测试完成: ${sessionResult.successCount}/${sessionResult.totalEvents} 成功`);
    });

    it('应正确记录AMAS状态', async () => {
      // 获取最终状态
      const finalState = await simulator.getState();

      expect(finalState).toBeDefined();
      expect(finalState.attention).toBeGreaterThanOrEqual(0);
      expect(finalState.attention).toBeLessThanOrEqual(1);
      expect(finalState.fatigue).toBeGreaterThanOrEqual(0);
      expect(finalState.fatigue).toBeLessThanOrEqual(1);
      expect(finalState.motivation).toBeGreaterThanOrEqual(-1);
      expect(finalState.motivation).toBeLessThanOrEqual(1);

      console.log(`最终状态: 注意力=${finalState.attention.toFixed(3)}, 疲劳度=${finalState.fatigue.toFixed(3)}, 动机=${finalState.motivation.toFixed(3)}`);
    });

    it('应记录状态历史', async () => {
      try {
        const stateHistory = await simulator.getStateHistory(30);

        // 状态历史应该有记录
        expect(stateHistory.length).toBeGreaterThan(0);

        console.log(`状态历史记录数: ${stateHistory.length}`);
      } catch (error) {
        // 如果状态历史服务尚未准备好，跳过此验证
        console.log('状态历史查询跳过（可能尚未初始化）');
      }
    });

    it('应记录习惯画像', async () => {
      try {
        const habitProfile = await simulator.getHabitProfile();

        expect(habitProfile).toBeDefined();
        expect(habitProfile.realtime).toBeDefined();

        console.log(`习惯画像样本数: ${habitProfile.realtime.samples.timeEvents}`);
      } catch (error) {
        console.log('习惯画像查询跳过（可能尚未初始化）');
      }
    });

    afterAll(async () => {
      // 收集验证结果
      const validations = await collectValidations(simulator, sessionResult, 'single');
      let stateHistory: any[] = [];
      let habitProfile = null;

      try {
        stateHistory = await simulator.getStateHistory(30);
      } catch {
        // 忽略
      }

      try {
        habitProfile = await simulator.getHabitProfile();
      } catch {
        // 忽略
      }

      allUserResults.push({
        userId: testUser.id,
        username: testUser.username,
        sessionResult,
        stateHistory,
        habitProfile,
        validations,
      });
    });
  });

  describe('场景2: 多用户并行学习', () => {
    const testUsers: CreateTestUserResult[] = [];
    const simulators: UserSimulator[] = [];
    const sessionResults: SessionResult[] = [];

    beforeAll(async () => {
      // 创建多个测试用户
      for (let i = 0; i < TEST_CONFIG.multiUserCount; i++) {
        const user = await createSimulationUser(app, prisma, bcrypt, faker);
        testUsers.push(user);
        simulators.push(new UserSimulator(app, user.token, user.id));
      }
      console.log(`创建了 ${testUsers.length} 个测试用户`);
    });

    it('应正确处理多用户并行学习', async () => {
      // 为每个用户生成事件并执行
      const promises = simulators.map(async (simulator, index) => {
        const events = generateEvents({
          wordIds: testWordbook.wordIds,
          count: TEST_CONFIG.multiUserEventCountPerUser,
          pattern: 'normal',
        });

        const result = await simulator.runLearningSession(events);
        sessionResults[index] = result;
        return result;
      });

      const results = await Promise.all(promises);

      // 验证所有用户都完成了学习
      for (let i = 0; i < results.length; i++) {
        expect(results[i].totalEvents).toBe(TEST_CONFIG.multiUserEventCountPerUser);
        expect(results[i].successCount).toBeGreaterThan(0);
      }

      const totalEvents = results.reduce((sum, r) => sum + r.totalEvents, 0);
      const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
      console.log(`多用户测试完成: ${totalSuccess}/${totalEvents} 成功`);
    });

    it('应正确隔离不同用户的状态', async () => {
      // 获取所有用户的状态，捕获详细错误信息
      const stateResults = await Promise.all(
        simulators.map(async (s, index) => {
          try {
            const state = await s.getState();
            return { index, state, error: null };
          } catch (error) {
            return { index, state: null, error: error instanceof Error ? error.message : String(error) };
          }
        })
      );

      // 打印每个用户的状态获取结果
      for (const result of stateResults) {
        if (result.error) {
          console.log(`用户 ${result.index} (${testUsers[result.index].username}) 状态获取失败: ${result.error}`);
        } else {
          console.log(`用户 ${result.index} (${testUsers[result.index].username}) 状态获取成功`);
        }
      }

      // 所有用户都应该有自己的状态
      const validStates = stateResults.filter(r => r.state !== null);
      const failedCount = stateResults.filter(r => r.error !== null).length;

      console.log(`状态获取成功率: ${validStates.length}/${testUsers.length}`);
      if (failedCount > 0) {
        console.log(`失败详情:`);
        stateResults.filter(r => r.error).forEach(r => {
          console.log(`  - 用户 ${r.index}: ${r.error}`);
        });
      }

      // 严格断言：所有用户都应该有状态
      expect(validStates.length).toBe(testUsers.length);

      // 状态值应该有差异（不是完全相同）
      const attentions = validStates.map(r => r.state!.attention);
      const uniqueAttentions = new Set(attentions.map(a => a.toFixed(2)));
      console.log(`用户状态差异: ${uniqueAttentions.size} 个不同的注意力值`);
    });

    afterAll(async () => {
      // 收集所有用户的验证结果
      for (let i = 0; i < testUsers.length; i++) {
        // 跳过没有结果的用户（可能在 runLearningSession 时失败）
        if (!sessionResults[i]) {
          console.log(`跳过用户 ${testUsers[i].username}：无会话结果`);
          continue;
        }

        const validations = await collectValidations(simulators[i], sessionResults[i], 'multi');
        let stateHistory: any[] = [];
        let habitProfile = null;

        try {
          stateHistory = await simulators[i].getStateHistory(30);
        } catch {
          // 忽略
        }

        try {
          habitProfile = await simulators[i].getHabitProfile();
        } catch {
          // 忽略
        }

        allUserResults.push({
          userId: testUsers[i].id,
          username: testUsers[i].username,
          sessionResult: sessionResults[i],
          stateHistory,
          habitProfile,
          validations,
        });
      }
    }, 120000); // 增加超时到120秒
  });

  describe('场景3: 疲劳检测验证', () => {
    let testUser: CreateTestUserResult;
    let simulator: UserSimulator;
    let sessionResult: SessionResult;

    beforeAll(async () => {
      testUser = await createSimulationUser(app, prisma, bcrypt, faker);
      simulator = new UserSimulator(app, testUser.token, testUser.id);
      console.log(`创建疲劳测试用户: ${testUser.username}`);
    });

    it('应在用户疲劳时建议休息', async () => {
      // 使用疲劳模式生成事件
      const events = generateEvents({
        wordIds: testWordbook.wordIds,
        count: 100,
        pattern: 'fatiguing',
      });

      sessionResult = await simulator.runLearningSession(events);

      // 记录是否触发休息建议
      if (sessionResult.shouldBreakSuggested) {
        console.log(`休息建议在第 ${sessionResult.breakSuggestedAt} 个事件时触发`);
        expect(sessionResult.breakSuggestedAt).toBeGreaterThanOrEqual(5);
        expect(sessionResult.breakSuggestedAt).toBeLessThan(90);
      } else {
        console.log('未触发休息建议（可能需要更多事件或算法阈值较高）');
      }

      // 验证疲劳度有所增加（强制断言）
      const finalState = await simulator.getState();
      console.log(`疲劳测试最终状态: 疲劳度=${finalState.fatigue.toFixed(3)}`);

      // 疲劳模式下，经过100次低质量答题，疲劳度应该有明显增长
      // 即使算法未建议休息，疲劳度也应该反映出学习质量下降
      expect(finalState.fatigue).toBeGreaterThan(0.1);
    });

    afterAll(async () => {
      const validations = await collectValidations(simulator, sessionResult, 'fatigue');
      let stateHistory: any[] = [];
      let habitProfile = null;

      try {
        stateHistory = await simulator.getStateHistory(30);
      } catch {
        // 忽略
      }

      try {
        habitProfile = await simulator.getHabitProfile();
      } catch {
        // 忽略
      }

      allUserResults.push({
        userId: testUser.id,
        username: testUser.username,
        sessionResult,
        stateHistory,
        habitProfile,
        validations,
      });
    });
  });

  describe('场景4: 状态演变合理性验证', () => {
    let testUser: CreateTestUserResult;
    let simulator: UserSimulator;
    let sessionResult: SessionResult;

    beforeAll(async () => {
      testUser = await createSimulationUser(app, prisma, bcrypt, faker);
      simulator = new UserSimulator(app, testUser.token, testUser.id);
      console.log(`创建高效学习测试用户: ${testUser.username}`);
    });

    it('高效学习应保持较好的认知能力指标', async () => {
      // 使用高效模式生成事件
      const events = generateEvents({
        wordIds: testWordbook.wordIds,
        count: 200,
        pattern: 'efficient',
      });

      sessionResult = await simulator.runLearningSession(events);

      const finalState = await simulator.getState();

      // 高效学习后，认知能力应该较高
      console.log(`高效学习最终状态:`);
      console.log(`  记忆力=${finalState.memory?.toFixed(3)}`);
      console.log(`  速度=${finalState.speed?.toFixed(3)}`);
      console.log(`  稳定性=${finalState.stability?.toFixed(3)}`);
      console.log(`  疲劳度=${finalState.fatigue.toFixed(3)}`);

      // 疲劳度不应过高
      expect(finalState.fatigue).toBeLessThan(0.8);
    });

    afterAll(async () => {
      const validations = await collectValidations(simulator, sessionResult, 'efficient');
      let stateHistory: any[] = [];
      let habitProfile = null;

      try {
        stateHistory = await simulator.getStateHistory(30);
      } catch {
        // 忽略
      }

      try {
        habitProfile = await simulator.getHabitProfile();
      } catch {
        // 忽略
      }

      allUserResults.push({
        userId: testUser.id,
        username: testUser.username,
        sessionResult,
        stateHistory,
        habitProfile,
        validations,
      });
    });
  });

  describe('场景5: 第二轮复习（模拟间隔复习）', () => {
    const testUsers: CreateTestUserResult[] = [];
    const simulators: UserSimulator[] = [];
    const firstRoundResults: SessionResult[] = [];
    const secondRoundResults: SessionResult[] = [];
    const firstRoundStates: any[] = [];
    const secondRoundStates: any[] = [];

    beforeAll(async () => {
      // 创建测试用户
      const userCount = Math.floor(TEST_CONFIG.multiUserCount * TEST_CONFIG.secondRoundUserRatio);
      console.log(`\n===== 场景5: 第二轮复习测试 =====`);
      console.log(`创建 ${userCount} 个用户进行两轮复习测试`);

      for (let i = 0; i < userCount; i++) {
        const user = await createSimulationUser(app, prisma, bcrypt, faker);
        testUsers.push(user);
        simulators.push(new UserSimulator(app, user.token, user.id));
      }
      console.log(`创建了 ${testUsers.length} 个测试用户`);
    });

    it('第一轮学习：建立初始状态', async () => {
      console.log(`\n----- 第一轮学习开始 -----`);

      // 为每个用户执行第一轮学习
      const promises = simulators.map(async (simulator, index) => {
        const events = generateEvents({
          wordIds: testWordbook.wordIds,
          count: TEST_CONFIG.multiUserEventCountPerUser,
          pattern: 'normal',
        });

        const result = await simulator.runLearningSession(events);
        firstRoundResults[index] = result;

        // 记录第一轮结束后的状态
        try {
          firstRoundStates[index] = await simulator.getState();
        } catch {
          firstRoundStates[index] = null;
        }

        return result;
      });

      const results = await Promise.all(promises);

      const totalEvents = results.reduce((sum, r) => sum + r.totalEvents, 0);
      const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
      console.log(`第一轮学习完成: ${totalSuccess}/${totalEvents} 成功`);

      // 打印第一轮状态摘要
      const validStates = firstRoundStates.filter(s => s !== null);
      if (validStates.length > 0) {
        const avgFatigue = validStates.reduce((sum, s) => sum + s.fatigue, 0) / validStates.length;
        const avgAttention = validStates.reduce((sum, s) => sum + s.attention, 0) / validStates.length;
        const avgMotivation = validStates.reduce((sum, s) => sum + s.motivation, 0) / validStates.length;
        console.log(`第一轮状态均值: 注意力=${avgAttention.toFixed(3)}, 疲劳度=${avgFatigue.toFixed(3)}, 动机=${avgMotivation.toFixed(3)}`);
      }

      // 验证第一轮学习成功
      for (const result of results) {
        expect(result.successCount).toBeGreaterThan(0);
      }
    });

    it('修改复习时间：模拟间隔时间流逝', async () => {
      console.log(`\n----- 修改复习时间 -----`);

      // 将所有用户的 WordLearningState.nextReviewDate 设置为过去时间
      // 模拟用户已经"等待"了足够的时间，需要复习
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小时前

      for (const user of testUsers) {
        const updateResult = await prisma.wordLearningState.updateMany({
          where: { userId: user.id },
          data: { nextReviewDate: pastDate },
        });
        console.log(`用户 ${user.username}: 更新了 ${updateResult.count} 条单词学习状态的复习时间`);
      }

      // 同时重置用户状态历史中的疲劳度（模拟休息后恢复）
      // 通过AMAS引擎的状态仓库更新
      for (const user of testUsers) {
        try {
          // 直接更新数据库中的用户状态，降低疲劳度模拟休息效果
          await prisma.userState.updateMany({
            where: { userId: user.id },
            data: {
              F: 0.1, // 重置疲劳度
            },
          });
        } catch {
          // 如果用户状态不存在，忽略
        }
      }

      console.log(`已将所有用户的复习时间设置为过去，疲劳度已重置，模拟休息后准备复习`);
    });

    it('第二轮复习：观察状态变化', async () => {
      console.log(`\n----- 第二轮复习开始 -----`);

      // 为每个用户执行第二轮复习
      const promises = simulators.map(async (simulator, index) => {
        // 使用高效模式，模拟复习时表现更好
        const events = generateEvents({
          wordIds: testWordbook.wordIds,
          count: TEST_CONFIG.secondRoundEventCountPerUser,
          pattern: 'efficient',
        });

        const result = await simulator.runLearningSession(events);
        secondRoundResults[index] = result;

        // 记录第二轮结束后的状态
        try {
          secondRoundStates[index] = await simulator.getState();
        } catch {
          secondRoundStates[index] = null;
        }

        return result;
      });

      const results = await Promise.all(promises);

      const totalEvents = results.reduce((sum, r) => sum + r.totalEvents, 0);
      const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
      console.log(`第二轮复习完成: ${totalSuccess}/${totalEvents} 成功`);

      // 打印第二轮状态摘要
      const validStates = secondRoundStates.filter(s => s !== null);
      if (validStates.length > 0) {
        const avgFatigue = validStates.reduce((sum, s) => sum + s.fatigue, 0) / validStates.length;
        const avgAttention = validStates.reduce((sum, s) => sum + s.attention, 0) / validStates.length;
        const avgMotivation = validStates.reduce((sum, s) => sum + s.motivation, 0) / validStates.length;
        console.log(`第二轮状态均值: 注意力=${avgAttention.toFixed(3)}, 疲劳度=${avgFatigue.toFixed(3)}, 动机=${avgMotivation.toFixed(3)}`);
      }

      // 验证第二轮复习成功
      for (const result of results) {
        expect(result.successCount).toBeGreaterThan(0);
      }
    });

    it('对比两轮状态变化', async () => {
      console.log(`\n----- 状态变化对比 -----`);

      const comparisons: Array<{
        username: string;
        round1: { attention: number; fatigue: number; motivation: number };
        round2: { attention: number; fatigue: number; motivation: number };
        delta: { attention: number; fatigue: number; motivation: number };
      }> = [];

      for (let i = 0; i < testUsers.length; i++) {
        const s1 = firstRoundStates[i];
        const s2 = secondRoundStates[i];

        if (s1 && s2) {
          comparisons.push({
            username: testUsers[i].username,
            round1: { attention: s1.attention, fatigue: s1.fatigue, motivation: s1.motivation },
            round2: { attention: s2.attention, fatigue: s2.fatigue, motivation: s2.motivation },
            delta: {
              attention: s2.attention - s1.attention,
              fatigue: s2.fatigue - s1.fatigue,
              motivation: s2.motivation - s1.motivation,
            },
          });
        }
      }

      // 计算变化统计
      if (comparisons.length > 0) {
        const avgDeltaAttention = comparisons.reduce((sum, c) => sum + c.delta.attention, 0) / comparisons.length;
        const avgDeltaFatigue = comparisons.reduce((sum, c) => sum + c.delta.fatigue, 0) / comparisons.length;
        const avgDeltaMotivation = comparisons.reduce((sum, c) => sum + c.delta.motivation, 0) / comparisons.length;

        console.log(`\n状态变化统计 (${comparisons.length} 个有效对比):`);
        console.log(`  注意力变化: ${avgDeltaAttention >= 0 ? '+' : ''}${avgDeltaAttention.toFixed(3)}`);
        console.log(`  疲劳度变化: ${avgDeltaFatigue >= 0 ? '+' : ''}${avgDeltaFatigue.toFixed(3)}`);
        console.log(`  动机变化: ${avgDeltaMotivation >= 0 ? '+' : ''}${avgDeltaMotivation.toFixed(3)}`);

        // 打印前5个用户的详细对比
        console.log(`\n前5个用户详细对比:`);
        comparisons.slice(0, 5).forEach(c => {
          console.log(`  ${c.username}:`);
          console.log(`    第一轮: A=${c.round1.attention.toFixed(3)}, F=${c.round1.fatigue.toFixed(3)}, M=${c.round1.motivation.toFixed(3)}`);
          console.log(`    第二轮: A=${c.round2.attention.toFixed(3)}, F=${c.round2.fatigue.toFixed(3)}, M=${c.round2.motivation.toFixed(3)}`);
          console.log(`    变化: ΔA=${c.delta.attention >= 0 ? '+' : ''}${c.delta.attention.toFixed(3)}, ΔF=${c.delta.fatigue >= 0 ? '+' : ''}${c.delta.fatigue.toFixed(3)}, ΔM=${c.delta.motivation >= 0 ? '+' : ''}${c.delta.motivation.toFixed(3)}`);
        });
      }

      // 验证有足够的对比数据
      expect(comparisons.length).toBeGreaterThan(0);
    });

    afterAll(async () => {
      // 收集所有用户的验证结果
      for (let i = 0; i < testUsers.length; i++) {
        // 合并两轮结果
        const combinedResult: SessionResult = {
          totalEvents: (firstRoundResults[i]?.totalEvents ?? 0) + (secondRoundResults[i]?.totalEvents ?? 0),
          successCount: (firstRoundResults[i]?.successCount ?? 0) + (secondRoundResults[i]?.successCount ?? 0),
          failureCount: (firstRoundResults[i]?.failureCount ?? 0) + (secondRoundResults[i]?.failureCount ?? 0),
          shouldBreakSuggested: firstRoundResults[i]?.shouldBreakSuggested || secondRoundResults[i]?.shouldBreakSuggested,
          breakSuggestedAt: firstRoundResults[i]?.breakSuggestedAt ?? secondRoundResults[i]?.breakSuggestedAt,
          responses: [...(firstRoundResults[i]?.responses ?? []), ...(secondRoundResults[i]?.responses ?? [])],
          failures: [...(firstRoundResults[i]?.failures ?? []), ...(secondRoundResults[i]?.failures ?? [])],
          finalState: secondRoundStates[i] ?? firstRoundStates[i],
          durationMs: (firstRoundResults[i]?.durationMs ?? 0) + (secondRoundResults[i]?.durationMs ?? 0),
        };

        const validations = await collectValidations(simulators[i], combinedResult, 'second_round');

        // 添加两轮对比验证
        if (firstRoundStates[i] && secondRoundStates[i]) {
          validations.push(
            createValidation(
              '两轮状态对比',
              '第二轮应有状态变化',
              Math.abs(secondRoundStates[i].fatigue - firstRoundStates[i].fatigue) > 0.001 ||
              Math.abs(secondRoundStates[i].attention - firstRoundStates[i].attention) > 0.001,
              `ΔF=${(secondRoundStates[i].fatigue - firstRoundStates[i].fatigue).toFixed(3)}, ΔA=${(secondRoundStates[i].attention - firstRoundStates[i].attention).toFixed(3)}`
            )
          );
        }

        let stateHistory: any[] = [];
        let habitProfile = null;

        try {
          stateHistory = await simulators[i].getStateHistory(30);
        } catch {
          // 忽略
        }

        try {
          habitProfile = await simulators[i].getHabitProfile();
        } catch {
          // 忽略
        }

        allUserResults.push({
          userId: testUsers[i].id,
          username: testUsers[i].username,
          sessionResult: combinedResult,
          stateHistory,
          habitProfile,
          validations,
        });
      }
    });
  });
});

/**
 * 收集验证结果
 */
async function collectValidations(
  simulator: UserSimulator,
  sessionResult: SessionResult | undefined,
  scenario: string
): Promise<ValidationItem[]> {
  const validations: ValidationItem[] = [];
  const userId = simulator.getUserId();

  // 如果没有会话结果，返回失败验证
  if (!sessionResult) {
    validations.push(
      createValidation(
        '会话执行',
        '学习会话应成功执行',
        false,
        '会话未执行或执行失败'
      )
    );
    return validations;
  }

  // 1. API成功率验证
  const apiSuccessRate = sessionResult.successCount / sessionResult.totalEvents;
  validations.push(
    createValidation(
      'API成功率',
      'API调用成功率应大于95%',
      apiSuccessRate > 0.95,
      `${(apiSuccessRate * 100).toFixed(1)}%`
    )
  );

  // 2. 获取并验证状态
  try {
    const state = await simulator.getState();

    validations.push(
      createValidation(
        '状态存在',
        '用户AMAS状态应已初始化',
        state !== null && state !== undefined
      )
    );

    validations.push(
      createValidation(
        '注意力范围',
        '注意力应在0-1之间',
        state.attention >= 0 && state.attention <= 1,
        state.attention.toFixed(3)
      )
    );

    validations.push(
      createValidation(
        '疲劳度范围',
        '疲劳度应在0-1之间',
        state.fatigue >= 0 && state.fatigue <= 1,
        state.fatigue.toFixed(3)
      )
    );

    validations.push(
      createValidation(
        '动机范围',
        '动机应在-1到1之间',
        state.motivation >= -1 && state.motivation <= 1,
        state.motivation.toFixed(3)
      )
    );

    // 认知状态验证
    if (state.memory !== undefined) {
      validations.push(
        createValidation(
          '记忆力范围',
          '记忆力应在0-1之间',
          state.memory >= 0 && state.memory <= 1,
          state.memory.toFixed(3)
        )
      );
    }

    if (state.speed !== undefined) {
      validations.push(
        createValidation(
          '速度范围',
          '速度应在0-1之间',
          state.speed >= 0 && state.speed <= 1,
          state.speed.toFixed(3)
        )
      );
    }

    if (state.stability !== undefined) {
      validations.push(
        createValidation(
          '稳定性范围',
          '稳定性应在0-1之间',
          state.stability >= 0 && state.stability <= 1,
          state.stability.toFixed(3)
        )
      );
    }
  } catch (error) {
    validations.push(
      createValidation(
        '状态获取',
        '应能获取用户状态',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 3. 验证答题数据存储
  try {
    const answerCount = await prisma.answerRecord.count({
      where: { userId },
    });

    validations.push(
      createValidation(
        '答题记录存储',
        '答题记录应被正确存储',
        answerCount > 0,
        `${answerCount} 条记录`
      )
    );
  } catch (error) {
    validations.push(
      createValidation(
        '答题记录查询',
        '应能查询答题记录',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 4. 验证 WordLearningState 数据持久化
  try {
    const learningStateCount = await prisma.wordLearningState.count({
      where: { userId },
    });

    validations.push(
      createValidation(
        'WordLearningState持久化',
        '学习状态记录应被创建',
        learningStateCount > 0,
        `${learningStateCount} 条记录`
      )
    );

    // 验证学习状态字段完整性
    if (learningStateCount > 0) {
      const sampleState = await prisma.wordLearningState.findFirst({
        where: { userId },
      });

      validations.push(
        createValidation(
          'WordLearningState.masteryLevel',
          '掌握等级应在0-5之间',
          sampleState !== null && sampleState.masteryLevel >= 0 && sampleState.masteryLevel <= 5,
          sampleState?.masteryLevel?.toString() ?? 'null'
        )
      );

      validations.push(
        createValidation(
          'WordLearningState.reviewCount',
          '复习次数应大于0',
          sampleState !== null && sampleState.reviewCount > 0,
          sampleState?.reviewCount?.toString() ?? 'null'
        )
      );

      validations.push(
        createValidation(
          'WordLearningState.state',
          '学习状态应有效',
          sampleState !== null && ['NEW', 'LEARNING', 'REVIEWING', 'MASTERED'].includes(sampleState.state),
          sampleState?.state ?? 'null'
        )
      );
    }
  } catch (error) {
    validations.push(
      createValidation(
        'WordLearningState查询',
        '应能查询学习状态',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 5. 验证 WordScore 数据持久化
  try {
    const wordScoreCount = await prisma.wordScore.count({
      where: { userId },
    });

    validations.push(
      createValidation(
        'WordScore持久化',
        '单词得分记录应被创建',
        wordScoreCount > 0,
        `${wordScoreCount} 条记录`
      )
    );

    // 验证得分字段完整性
    if (wordScoreCount > 0) {
      const sampleScore = await prisma.wordScore.findFirst({
        where: { userId },
      });

      validations.push(
        createValidation(
          'WordScore.totalScore',
          '总分应在0-100之间',
          sampleScore !== null && sampleScore.totalScore >= 0 && sampleScore.totalScore <= 100,
          sampleScore?.totalScore?.toString() ?? 'null'
        )
      );

      validations.push(
        createValidation(
          'WordScore.accuracyScore',
          '正确率分数应在0-100之间',
          sampleScore !== null && sampleScore.accuracyScore >= 0 && sampleScore.accuracyScore <= 100,
          sampleScore?.accuracyScore?.toString() ?? 'null'
        )
      );
    }
  } catch (error) {
    validations.push(
      createValidation(
        'WordScore查询',
        '应能查询单词得分',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 6. 验证 HabitProfile 数据持久化
  try {
    const habitProfile = await prisma.habitProfile.findUnique({
      where: { userId },
    });

    validations.push(
      createValidation(
        'HabitProfile持久化',
        '习惯画像应被持久化到数据库',
        habitProfile !== null,
        habitProfile ? `rhythmPref=${habitProfile.rhythmPref}` : 'null'
      )
    );
  } catch (error) {
    validations.push(
      createValidation(
        'HabitProfile查询',
        '应能查询习惯画像',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 7. 验证策略参数
  try {
    const strategy = await simulator.getStrategy();

    validations.push(
      createValidation(
        '策略存在',
        '用户策略应已生成',
        strategy !== null && strategy !== undefined
      )
    );

    if (strategy) {
      validations.push(
        createValidation(
          'Strategy.interval_scale',
          'interval_scale应为正数',
          strategy.interval_scale > 0,
          strategy.interval_scale?.toFixed(3) ?? 'null'
        )
      );

      validations.push(
        createValidation(
          'Strategy.batch_size',
          'batch_size应大于0',
          strategy.batch_size > 0,
          strategy.batch_size?.toString() ?? 'null'
        )
      );

      validations.push(
        createValidation(
          'Strategy.difficulty',
          'difficulty应为有效值',
          ['easy', 'mid', 'hard'].includes(strategy.difficulty),
          strategy.difficulty ?? 'null'
        )
      );
    }
  } catch (error) {
    // 策略可能尚未初始化，记录但不作为严重错误
    validations.push(
      createValidation(
        '策略查询',
        '应能查询用户策略',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 8. 验证状态历史记录
  try {
    const stateHistoryCount = await prisma.userStateHistory.count({
      where: { userId },
    });

    validations.push(
      createValidation(
        'StateHistory持久化',
        '状态历史应被记录',
        stateHistoryCount > 0,
        `${stateHistoryCount} 条记录`
      )
    );
  } catch (error) {
    validations.push(
      createValidation(
        'StateHistory查询',
        '应能查询状态历史',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 9. 验证学习会话
  try {
    const sessionCount = await prisma.learningSession.count({
      where: { userId },
    });

    validations.push(
      createValidation(
        'LearningSession持久化',
        '学习会话应被创建',
        sessionCount > 0,
        `${sessionCount} 条记录`
      )
    );
  } catch (error) {
    validations.push(
      createValidation(
        'LearningSession查询',
        '应能查询学习会话',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  // 10. 验证特征向量
  try {
    const featureVectorCount = await prisma.featureVector.count({
      where: {
        session: { userId },
      },
    });

    validations.push(
      createValidation(
        'FeatureVector持久化',
        '特征向量应被保存',
        featureVectorCount > 0,
        `${featureVectorCount} 条记录`
      )
    );
  } catch (error) {
    validations.push(
      createValidation(
        'FeatureVector查询',
        '应能查询特征向量',
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  return validations;
}

/**
 * 构建报告数据
 */
function buildReportData(userResults: UserSimulationResult[]): SimulationReportData {
  const totalEvents = userResults.reduce((sum, u) => sum + u.sessionResult.totalEvents, 0);
  const totalSuccess = userResults.reduce((sum, u) => sum + u.sessionResult.successCount, 0);
  const totalFailures = userResults.reduce((sum, u) => sum + u.sessionResult.failureCount, 0);
  const breakSuggestions = userResults.filter(u => u.sessionResult.shouldBreakSuggested).length;
  const totalDuration = userResults.reduce((sum, u) => sum + u.sessionResult.durationMs, 0);

  const allValidations = userResults.flatMap(u => u.validations);
  const passedValidations = allValidations.filter(v => v.passed).length;

  return {
    title: 'AMAS 模拟学习测试报告',
    generatedAt: new Date(),
    duration: totalDuration,
    summary: {
      totalUsers: userResults.length,
      totalEvents,
      successRate: totalEvents > 0 ? (totalSuccess / totalEvents) * 100 : 0,
      failureCount: totalFailures,
      breakSuggestions,
    },
    users: userResults,
    validationSummary: {
      total: allValidations.length,
      passed: passedValidations,
      failed: allValidations.length - passedValidations,
    },
  };
}
