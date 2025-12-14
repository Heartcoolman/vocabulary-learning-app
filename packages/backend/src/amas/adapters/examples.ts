/**
 * AMAS 接口和适配器使用示例
 *
 * 演示如何使用新的决策接口和适配器
 */

import { IDecisionPolicy, DecisionContext, DecisionResult } from '../interfaces';

import { LinUCBAdapter, ThompsonAdapter, EnsembleAdapter } from '../adapters';

import { Action, UserState } from '../types';
import { ACTION_SPACE } from '../config/action-space';

// ==================== 示例 1: 使用 LinUCB 适配器 ====================

/**
 * 示例：使用 LinUCB 适配器进行决策
 */
export function exampleLinUCBAdapter() {
  // 1. 创建 LinUCB 适配器
  const policy: IDecisionPolicy = new LinUCBAdapter({
    alpha: 0.5, // 探索系数
    lambda: 1.0, // 正则化系数
    dimension: 22, // 特征维度
  });

  // 2. 准备用户状态
  const userState: UserState = {
    A: 0.7, // 注意力
    F: 0.3, // 疲劳度
    C: { mem: 0.6, speed: 0.6, stability: 0.6 }, // 认知能力
    M: 0.2, // 动机
    conf: 0.5, // 置信度
    ts: Date.now(), // 时间戳
  };

  // 3. 准备决策上下文
  const context: DecisionContext = {
    recentErrorRate: 0.2,
    recentResponseTime: 2500,
    timeBucket: 14, // 下午2点
    userId: 'user-123',
    interactionCount: 50,
  };

  // 4. 选择最优动作
  const features: number[] = []; // LinUCB 内部构建特征
  const result: DecisionResult = policy.selectAction(userState, ACTION_SPACE, features, context);

  console.log('LinUCB 决策结果:', {
    action: result.action,
    confidence: result.confidence,
    explanation: result.explanation,
  });

  // 5. 更新模型（模拟反馈）
  const reward = 0.7; // 正面反馈
  policy.updateModel(result.action, reward, features, context);

  console.log('策略名称:', policy.getName());
  console.log('策略版本:', policy.getVersion());

  return result;
}

// ==================== 示例 2: 使用 Thompson Sampling 适配器 ====================

/**
 * 示例：使用 Thompson Sampling 适配器进行决策
 */
export function exampleThompsonAdapter() {
  // 1. 创建 Thompson Sampling 适配器
  const policy: IDecisionPolicy = new ThompsonAdapter({
    priorAlpha: 1.0,
    priorBeta: 1.0,
    enableSoftUpdate: false, // 使用二值化更新
  });

  // 2. 准备状态和上下文
  const userState: UserState = {
    A: 0.6,
    F: 0.4,
    C: { mem: 0.5, speed: 0.7, stability: 0.6 },
    M: -0.1,
    conf: 0.4,
    ts: Date.now(),
  };

  const context: DecisionContext = {
    recentErrorRate: 0.3,
    recentResponseTime: 3000,
    timeBucket: 20, // 晚上8点
    userId: 'user-456',
  };

  // 3. 选择动作
  const features: number[] = [];
  const result: DecisionResult = policy.selectAction(userState, ACTION_SPACE, features, context);

  console.log('Thompson Sampling 决策结果:', {
    action: result.action,
    confidence: result.confidence,
    explanation: result.explanation,
    meta: result.meta,
  });

  // 4. 更新模型
  const reward = -0.3; // 负面反馈
  policy.updateModel(result.action, reward, features, context);

  return result;
}

// ==================== 示例 3: 使用 Ensemble 适配器 ====================

/**
 * 示例：使用 Ensemble 适配器进行决策
 */
export function exampleEnsembleAdapter() {
  // 1. 创建 Ensemble 适配器
  const policy = new EnsembleAdapter();

  // 2. 准备状态和上下文
  const userState: UserState = {
    A: 0.8,
    F: 0.2,
    C: { mem: 0.7, speed: 0.6, stability: 0.7 },
    M: 0.5,
    conf: 0.6,
    ts: Date.now(),
  };

  const context: DecisionContext = {
    recentErrorRate: 0.15,
    recentResponseTime: 2000,
    timeBucket: 10, // 上午10点
    userId: 'user-789',
    interactionCount: 100,
  };

  // 3. 选择动作
  const features: number[] = [];
  const result: DecisionResult = policy.selectAction(userState, ACTION_SPACE, features, context);

  console.log('Ensemble 决策结果:', {
    action: result.action,
    confidence: result.confidence,
    explanation: result.explanation,
    phase: policy.getPhase(),
    weights: policy.getWeights(),
    coldStartProgress: policy.getColdStartProgress(),
  });

  // 4. 更新模型
  const reward = 0.8;
  policy.updateModel(result.action, reward, features, context);

  console.log('更新后权重:', policy.getWeights());

  return result;
}

// ==================== 示例 4: 策略对比 ====================

/**
 * 示例：对比不同策略的决策结果
 */
export function examplePolicyComparison() {
  const policies: IDecisionPolicy[] = [
    new LinUCBAdapter({ alpha: 0.5 }),
    new ThompsonAdapter(),
    new EnsembleAdapter(),
  ];

  const userState: UserState = {
    A: 0.7,
    F: 0.3,
    C: { mem: 0.6, speed: 0.6, stability: 0.6 },
    M: 0.1,
    conf: 0.5,
    ts: Date.now(),
  };

  const context: DecisionContext = {
    recentErrorRate: 0.25,
    recentResponseTime: 2500,
    timeBucket: 15,
    userId: 'user-compare',
  };

  const features: number[] = [];

  console.log('\n=== 策略对比 ===\n');

  for (const policy of policies) {
    const result = policy.selectAction(userState, ACTION_SPACE, features, context);

    console.log(`${policy.getName()} v${policy.getVersion()}:`);
    console.log(
      `  动作: interval_scale=${result.action.interval_scale}, new_ratio=${result.action.new_ratio}, difficulty=${result.action.difficulty}`,
    );
    console.log(`  置信度: ${result.confidence.toFixed(3)}`);
    console.log(`  解释: ${result.explanation}`);
    console.log('');
  }
}

// ==================== 示例 5: 适配器高级功能 ====================

/**
 * 示例：使用适配器的高级功能
 */
export function exampleAdapterAdvancedFeatures() {
  // LinUCB 适配器高级功能
  const linucb = new LinUCBAdapter({ alpha: 1.0 });

  console.log('\n=== LinUCB 适配器高级功能 ===');
  console.log('当前 alpha:', linucb.getAlpha());
  console.log('更新次数:', linucb.getUpdateCount());

  // 动态调整探索系数
  linucb.setAlpha(0.3);
  console.log('调整后 alpha:', linucb.getAlpha());

  // Thompson Sampling 适配器高级功能
  const thompson = new ThompsonAdapter();

  console.log('\n=== Thompson Sampling 适配器高级功能 ===');
  console.log('更新次数:', thompson.getUpdateCount());

  // 查看某个动作的期望成功率
  const sampleAction = ACTION_SPACE[0];
  console.log('动作期望成功率:', thompson.getExpectedReward(sampleAction));
  console.log('动作样本量:', thompson.getSampleCount(sampleAction));

  // Ensemble 适配器高级功能
  const ensemble = new EnsembleAdapter();

  console.log('\n=== Ensemble 适配器高级功能 ===');
  console.log('当前阶段:', ensemble.getPhase());
  console.log('是否完成冷启动:', ensemble.isWarm());
  console.log('冷启动进度:', ensemble.getColdStartProgress().toFixed(2));
  console.log('当前权重:', ensemble.getWeights());
  console.log('更新次数:', ensemble.getUpdateCount());
}

// ==================== 运行所有示例 ====================

/**
 * 运行所有示例
 */
export function runAllExamples() {
  console.log('\n========================================');
  console.log('AMAS 接口和适配器使用示例');
  console.log('========================================\n');

  console.log('示例 1: LinUCB 适配器');
  exampleLinUCBAdapter();

  console.log('\n示例 2: Thompson Sampling 适配器');
  exampleThompsonAdapter();

  console.log('\n示例 3: Ensemble 适配器');
  exampleEnsembleAdapter();

  console.log('\n示例 4: 策略对比');
  examplePolicyComparison();

  console.log('\n示例 5: 适配器高级功能');
  exampleAdapterAdvancedFeatures();

  console.log('\n========================================');
  console.log('所有示例运行完成');
  console.log('========================================\n');
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples();
}
