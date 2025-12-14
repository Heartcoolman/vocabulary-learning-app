/**
 * Online Loop 使用示例
 *
 * 演示如何使用 OnlineLoop 处理学习事件
 */

import { OnlineLoop, OnlineLoopInput, OnlineLoopOutput } from './online-loop';
import { RawEvent, UserState } from '../types';

/**
 * 示例 1: 使用默认配置创建 OnlineLoop
 */
function example1_DefaultConfiguration() {
  // 创建 OnlineLoop 实例（使用默认配置）
  const onlineLoop = new OnlineLoop();

  console.log('✓ OnlineLoop 实例已创建（默认配置）');
  console.log('  - 特征构建器: FeatureBuilder');
  console.log('  - 决策策略: LinUCB');
  console.log('  - 奖励评估器: ImmediateReward');

  return onlineLoop;
}

/**
 * 示例 2: 处理单个学习事件
 */
async function example2_ProcessSingleEvent() {
  const onlineLoop = new OnlineLoop();

  // 构造测试事件
  const event: RawEvent = {
    wordId: 'word_123',
    isCorrect: true,
    responseTime: 2500,
    dwellTime: 1200,
    timestamp: Date.now(),
    pauseCount: 0,
    switchCount: 0,
    retryCount: 0,
    focusLossDuration: 0,
    interactionDensity: 2.5,
  };

  // 构造当前用户状态
  const currentState: UserState = {
    A: 0.7, // 注意力
    F: 0.3, // 疲劳度
    C: {
      // 认知能力
      mem: 0.6,
      speed: 0.7,
      stability: 0.65,
    },
    M: 0.4, // 动机
    conf: 0.8,
    ts: Date.now(),
  };

  // 构造输入
  const input: OnlineLoopInput = {
    event,
    currentState,
    userId: 'user_001',
    recentErrorRate: 0.25,
    recentResponseTime: 3000,
    timeBucket: new Date().getHours(),
    interactionCount: 42,
  };

  // 处理事件
  const output: OnlineLoopOutput = await onlineLoop.process(input);

  console.log('✓ 事件处理完成:');
  console.log('  - 处理耗时:', output.elapsedTime.toFixed(2), 'ms');
  console.log('  - 注意力:', output.updatedState.A.toFixed(3));
  console.log('  - 疲劳度:', output.updatedState.F.toFixed(3));
  console.log('  - 动机:', output.updatedState.M.toFixed(3));
  console.log('  - 推荐动作:', {
    interval_scale: output.decision.action.interval_scale,
    new_ratio: output.decision.action.new_ratio,
    difficulty: output.decision.action.difficulty,
    batch_size: output.decision.action.batch_size,
  });
  console.log('  - 即时奖励:', output.reward.value.toFixed(3));
  console.log('  - 性能详情:', output.meta);

  return output;
}

/**
 * 示例 3: 批量处理多个事件
 */
async function example3_BatchProcessing() {
  const onlineLoop = new OnlineLoop();
  const userId = 'user_002';

  // 初始状态
  let currentState: UserState = {
    A: 0.7,
    F: 0.2,
    C: { mem: 0.6, speed: 0.7, stability: 0.65 },
    M: 0.5,
    conf: 0.7,
    ts: Date.now(),
  };

  // 模拟 5 个连续学习事件
  const events: RawEvent[] = [
    {
      wordId: 'word_1',
      isCorrect: true,
      responseTime: 2000,
      dwellTime: 1000,
      timestamp: Date.now(),
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 3.0,
    },
    {
      wordId: 'word_2',
      isCorrect: true,
      responseTime: 2200,
      dwellTime: 1100,
      timestamp: Date.now() + 5000,
      pauseCount: 1,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 500,
      interactionDensity: 2.8,
    },
    {
      wordId: 'word_3',
      isCorrect: false,
      responseTime: 4500,
      dwellTime: 2000,
      timestamp: Date.now() + 10000,
      pauseCount: 2,
      switchCount: 1,
      retryCount: 1,
      focusLossDuration: 1500,
      interactionDensity: 1.5,
    },
    {
      wordId: 'word_4',
      isCorrect: true,
      responseTime: 2800,
      dwellTime: 1300,
      timestamp: Date.now() + 15000,
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 2.5,
    },
    {
      wordId: 'word_5',
      isCorrect: true,
      responseTime: 2400,
      dwellTime: 1150,
      timestamp: Date.now() + 20000,
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 200,
      interactionDensity: 2.7,
    },
  ];

  console.log('✓ 批量处理 5 个事件:');

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const input: OnlineLoopInput = {
      event,
      currentState,
      userId,
      recentErrorRate: 0.2,
      recentResponseTime: 2500,
      timeBucket: new Date().getHours(),
      interactionCount: 10 + i,
    };

    const output = await onlineLoop.process(input);

    console.log(`  事件 ${i + 1}:`);
    console.log(`    - 单词: ${event.wordId}, 正确: ${event.isCorrect}`);
    console.log(
      `    - 状态: A=${output.updatedState.A.toFixed(2)}, F=${output.updatedState.F.toFixed(2)}, M=${output.updatedState.M.toFixed(2)}`,
    );
    console.log(`    - 奖励: ${output.reward.value.toFixed(3)}`);
    console.log(`    - 耗时: ${output.elapsedTime.toFixed(2)}ms`);

    // 更新状态供下一个事件使用
    currentState = output.updatedState;
  }
}

/**
 * 示例 4: 性能监控
 */
async function example4_PerformanceMonitoring() {
  const onlineLoop = new OnlineLoop({
    enablePerformanceMonitoring: true,
    performanceWarningThreshold: 30, // 30ms 阈值
  });

  console.log('✓ 启用性能监控（阈值: 30ms）');

  // 模拟 100 个事件以测试性能
  const timings: number[] = [];

  for (let i = 0; i < 100; i++) {
    const event: RawEvent = {
      wordId: `word_${i}`,
      isCorrect: Math.random() > 0.3,
      responseTime: 2000 + Math.random() * 2000,
      dwellTime: 1000 + Math.random() * 1000,
      timestamp: Date.now(),
      pauseCount: Math.floor(Math.random() * 3),
      switchCount: Math.floor(Math.random() * 2),
      retryCount: 0,
      focusLossDuration: Math.random() * 2000,
      interactionDensity: 1 + Math.random() * 2,
    };

    const currentState: UserState = {
      A: 0.6 + Math.random() * 0.3,
      F: 0.2 + Math.random() * 0.4,
      C: {
        mem: 0.5 + Math.random() * 0.3,
        speed: 0.5 + Math.random() * 0.3,
        stability: 0.5 + Math.random() * 0.3,
      },
      M: -0.2 + Math.random() * 0.8,
      conf: 0.7 + Math.random() * 0.2,
      ts: Date.now(),
    };

    const input: OnlineLoopInput = {
      event,
      currentState,
      userId: `user_perf_test`,
      recentErrorRate: 0.2 + Math.random() * 0.3,
      recentResponseTime: 2500 + Math.random() * 1000,
      timeBucket: new Date().getHours(),
      interactionCount: i,
    };

    const output = await onlineLoop.process(input);
    timings.push(output.elapsedTime);
  }

  // 统计性能
  const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
  const maxTime = Math.max(...timings);
  const minTime = Math.min(...timings);
  const p95Time = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)];

  console.log('  性能统计 (100 个事件):');
  console.log(`    - 平均耗时: ${avgTime.toFixed(2)}ms`);
  console.log(`    - 最小耗时: ${minTime.toFixed(2)}ms`);
  console.log(`    - 最大耗时: ${maxTime.toFixed(2)}ms`);
  console.log(`    - P95 耗时: ${p95Time.toFixed(2)}ms`);

  // 性能报告
  const stats = onlineLoop.getPerformanceStats();
  console.log('  资源使用:');
  console.log(`    - 活跃用户: ${stats.activeUsers}`);
  console.log(`    - 特征窗口: ${stats.featureBuilderWindows}`);
}

/**
 * 示例 5: 模型更新（延迟奖励）
 */
async function example5_ModelUpdate() {
  const onlineLoop = new OnlineLoop();

  // 处理事件获取特征向量
  const event: RawEvent = {
    wordId: 'word_123',
    isCorrect: true,
    responseTime: 2500,
    dwellTime: 1200,
    timestamp: Date.now(),
    pauseCount: 0,
    switchCount: 0,
    retryCount: 0,
    focusLossDuration: 0,
    interactionDensity: 2.5,
  };

  const currentState: UserState = {
    A: 0.7,
    F: 0.3,
    C: { mem: 0.6, speed: 0.7, stability: 0.65 },
    M: 0.4,
    conf: 0.8,
    ts: Date.now(),
  };

  const input: OnlineLoopInput = {
    event,
    currentState,
    userId: 'user_003',
    recentErrorRate: 0.25,
    recentResponseTime: 3000,
    timeBucket: 14,
    interactionCount: 42,
  };

  const output = await onlineLoop.process(input);

  console.log('✓ 初始处理完成，获取特征向量');

  // 稍后接收到延迟奖励，更新模型
  const delayedReward = 0.8; // 延迟奖励值

  onlineLoop.updateModel(output.decision.action, delayedReward, output.features, {
    recentErrorRate: input.recentErrorRate,
    recentResponseTime: input.recentResponseTime,
    timeBucket: input.timeBucket,
    userId: input.userId,
  });

  console.log('✓ 模型已更新（延迟奖励: 0.8）');
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  console.log('\n========== Online Loop 使用示例 ==========\n');

  console.log('示例 1: 默认配置');
  example1_DefaultConfiguration();
  console.log('');

  console.log('示例 2: 处理单个事件');
  await example2_ProcessSingleEvent();
  console.log('');

  console.log('示例 3: 批量处理');
  await example3_BatchProcessing();
  console.log('');

  console.log('示例 4: 性能监控');
  await example4_PerformanceMonitoring();
  console.log('');

  console.log('示例 5: 模型更新');
  await example5_ModelUpdate();
  console.log('');

  console.log('========== 所有示例运行完毕 ==========\n');
}

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  example1_DefaultConfiguration,
  example2_ProcessSingleEvent,
  example3_BatchProcessing,
  example4_PerformanceMonitoring,
  example5_ModelUpdate,
};
