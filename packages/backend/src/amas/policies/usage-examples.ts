/**
 * 心流检测器和碎片时间策略使用示例
 *
 * 此文件展示如何使用新创建的模块：
 * 1. FlowDetector - 心流检测器
 * 2. MicroSessionPolicy - 碎片时间适配策略
 */

import { FlowDetector, FlowState } from '../models/flow-detector';
import { MicroSessionPolicy } from './micro-session-policy';
import { WordCandidate, SelectionContext, SelectionResult } from './word-selector.interface';
import { UserState, RawEvent } from '../types';

// ==================== 示例 1: 心流检测 ====================

/**
 * 示例：检测用户的心流状态
 */
function exampleFlowDetection() {
  console.log('=== 心流检测示例 ===\n');

  // 创建心流检测器
  const flowDetector = new FlowDetector();

  // 模拟用户状态
  const userState: UserState = {
    A: 0.8, // 注意力较高
    F: 0.3, // 疲劳度较低
    M: 0.6, // 动机较高
    C: {
      mem: 0.7,
      speed: 0.8,
      stability: 0.75,
    },
    conf: 0.85,
    ts: Date.now(),
  };

  // 模拟最近的学习事件（成功率约75%，处于最佳区间）
  const recentEvents: RawEvent[] = [
    {
      wordId: 'w1',
      isCorrect: true,
      responseTime: 2000,
      dwellTime: 3000,
      timestamp: Date.now(),
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 0.5,
    },
    {
      wordId: 'w2',
      isCorrect: true,
      responseTime: 2100,
      dwellTime: 3100,
      timestamp: Date.now(),
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 0.5,
    },
    {
      wordId: 'w3',
      isCorrect: false,
      responseTime: 3500,
      dwellTime: 4500,
      timestamp: Date.now(),
      pauseCount: 1,
      switchCount: 0,
      retryCount: 1,
      focusLossDuration: 0,
      interactionDensity: 0.4,
    },
    {
      wordId: 'w4',
      isCorrect: true,
      responseTime: 1900,
      dwellTime: 2900,
      timestamp: Date.now(),
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 0.6,
    },
    {
      wordId: 'w5',
      isCorrect: true,
      responseTime: 2200,
      dwellTime: 3200,
      timestamp: Date.now(),
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 0.5,
    },
    {
      wordId: 'w6',
      isCorrect: true,
      responseTime: 2000,
      dwellTime: 3000,
      timestamp: Date.now(),
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 0.5,
    },
    {
      wordId: 'w7',
      isCorrect: false,
      responseTime: 4000,
      dwellTime: 5000,
      timestamp: Date.now(),
      pauseCount: 1,
      switchCount: 1,
      retryCount: 2,
      focusLossDuration: 500,
      interactionDensity: 0.3,
    },
    {
      wordId: 'w8',
      isCorrect: true,
      responseTime: 2100,
      dwellTime: 3100,
      timestamp: Date.now(),
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 0.5,
    },
  ];

  // 检测心流状态
  const flowState: FlowState = flowDetector.detectFlow(userState, recentEvents);

  console.log('用户状态:');
  console.log(`  注意力: ${userState.A.toFixed(2)}`);
  console.log(`  疲劳度: ${userState.F.toFixed(2)}`);
  console.log(`  动机: ${userState.M.toFixed(2)}`);
  console.log(`\n心流检测结果:`);
  console.log(`  心流分数: ${flowState.score.toFixed(2)}`);
  console.log(`  状态分类: ${flowState.state}`);
  console.log(`  建议: ${flowState.recommendation}`);
  console.log('\n');

  // 测试不同场景
  console.log('=== 场景2: 焦虑状态（成功率过低）===');
  const anxiousEvents: RawEvent[] = recentEvents.map((e, i) => ({
    ...e,
    isCorrect: i < 3, // 只有前3个正确，成功率37.5%
  }));
  const anxiousState = flowDetector.detectFlow(userState, anxiousEvents);
  console.log(`  状态: ${anxiousState.state}, 分数: ${anxiousState.score.toFixed(2)}`);
  console.log(`  建议: ${anxiousState.recommendation}\n`);

  console.log('=== 场景3: 无聊状态（成功率过高）===');
  const boredEvents: RawEvent[] = recentEvents.map((e) => ({
    ...e,
    isCorrect: true, // 全部正确，成功率100%
  }));
  const boredState = flowDetector.detectFlow(userState, boredEvents);
  console.log(`  状态: ${boredState.state}, 分数: ${boredState.score.toFixed(2)}`);
  console.log(`  建议: ${boredState.recommendation}\n`);
}

// ==================== 示例 2: 碎片时间选词策略 ====================

/**
 * 示例：使用碎片时间策略选择单词
 */
function exampleMicroSessionPolicy() {
  console.log('=== 碎片时间选词策略示例 ===\n');

  // 创建策略实例
  const policy = new MicroSessionPolicy(5); // 最多选5个词

  // 模拟候选单词
  const candidates: WordCandidate[] = [
    { wordId: 'word1', length: 5, forgettingRisk: 0.8, reviewCount: 1, memoryStrength: 0.3 },
    { wordId: 'word2', length: 12, forgettingRisk: 0.6, reviewCount: 3, memoryStrength: 0.5 },
    { wordId: 'word3', length: 7, forgettingRisk: 0.9, reviewCount: 0, memoryStrength: 0.1 },
    { wordId: 'word4', length: 15, forgettingRisk: 0.4, reviewCount: 5, memoryStrength: 0.7 },
    { wordId: 'word5', length: 6, forgettingRisk: 0.7, reviewCount: 2, memoryStrength: 0.4 },
    { wordId: 'word6', length: 9, forgettingRisk: 0.5, reviewCount: 4, memoryStrength: 0.6 },
    { wordId: 'word7', length: 8, forgettingRisk: 0.85, reviewCount: 1, memoryStrength: 0.25 },
    { wordId: 'word8', length: 4, forgettingRisk: 0.95, reviewCount: 0, memoryStrength: 0.05 },
  ];

  // 选词上下文
  const context: SelectionContext = {
    userId: 'user123',
    availableTimeMinutes: 5,
    isMicroSession: true,
    targetCount: 5,
    timestamp: Date.now(),
  };

  // 执行选词
  const result: SelectionResult = policy.selectWords(candidates, context);

  console.log('候选单词总数:', candidates.length);
  console.log('选中单词数:', result.selectedWordIds.length);
  console.log('选词理由:', result.reason);
  console.log('\n选中的单词详情:');

  result.selectedWordIds.forEach((wordId, index) => {
    const candidate = candidates.find((c) => c.wordId === wordId);
    const score = result.scores?.get(wordId);
    if (candidate) {
      console.log(`${index + 1}. ${wordId}:`);
      console.log(
        `   长度: ${candidate.length}, 遗忘风险: ${candidate.forgettingRisk?.toFixed(2)}`,
      );
      console.log(
        `   复习次数: ${candidate.reviewCount}, 记忆强度: ${candidate.memoryStrength?.toFixed(2)}`,
      );
      console.log(`   优先级分数: ${score?.toFixed(3)}`);
    }
  });

  // 展示所有单词的评分详情
  console.log('\n=== 所有单词评分详情 ===');
  const allScores = policy.scoreAll(candidates, context);
  allScores
    .sort((a, b) => b.score - a.score)
    .forEach((item, index) => {
      console.log(`${index + 1}. ${item.wordId} (总分: ${item.score.toFixed(3)})`);
      console.log(`   - 遗忘风险: ${item.details.forgettingRisk.toFixed(3)}`);
      console.log(`   - 短词奖励: ${item.details.shortWordBonus.toFixed(3)}`);
      console.log(`   - 记忆薄弱度: ${item.details.memoryWeakness.toFixed(3)}`);
    });
}

// ==================== 主函数 ====================

/**
 * 运行所有示例
 */
export function runExamples() {
  console.log('\n========================================');
  console.log('AMAS 新模块使用示例');
  console.log('========================================\n');

  exampleFlowDetection();
  console.log('\n========================================\n');
  exampleMicroSessionPolicy();

  console.log('\n========================================');
  console.log('示例运行完成');
  console.log('========================================\n');
}

// 如果直接运行此文件
if (require.main === module) {
  runExamples();
}
