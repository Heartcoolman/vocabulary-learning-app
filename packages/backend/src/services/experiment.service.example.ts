/**
 * 阶段6 实验服务增强使用示例
 */

import { experimentService } from './experiment.service';

// ===== 示例1: 为用户分配实验变体 =====
async function assignUserToExperiment() {
  const userId = 'user-123';
  const experimentId = 'exp-abc';

  try {
    // 第一次调用 - 创建新分配
    const variantId1 = await experimentService.assignVariant(userId, experimentId);
    console.log(`用户 ${userId} 被分配到变体: ${variantId1}`);

    // 第二次调用 - 返回相同的分配（幂等性）
    const variantId2 = await experimentService.assignVariant(userId, experimentId);
    console.log(`再次调用，用户仍然在变体: ${variantId2}`);
    console.log(`分配一致: ${variantId1 === variantId2}`);
  } catch (error) {
    console.error('分配失败:', error);
  }
}

// ===== 示例2: 创建A/B实验并分配用户 =====
async function createExperimentAndAssignUsers() {
  try {
    // 创建实验
    const experiment = await experimentService.createExperiment({
      name: '学习策略A/B测试',
      description: '测试不同的学习策略参数',
      trafficAllocation: 'WEIGHTED',
      minSampleSize: 100,
      significanceLevel: 0.05,
      minimumDetectableEffect: 0.1,
      autoDecision: false,
      variants: [
        {
          id: 'control',
          name: '控制组',
          weight: 0.5,
          isControl: true,
          parameters: {
            difficulty: 'mid',
            new_ratio: 0.3,
          },
        },
        {
          id: 'treatment',
          name: '实验组',
          weight: 0.5,
          isControl: false,
          parameters: {
            difficulty: 'easy',
            new_ratio: 0.4,
          },
        },
      ],
    });

    console.log(`实验创建成功: ${experiment.id}`);

    // 启动实验
    await experimentService.startExperiment(experiment.id);
    console.log('实验已启动');

    // 为多个用户分配变体
    const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
    const assignments = await Promise.all(
      userIds.map(async (userId) => {
        const variantId = await experimentService.assignVariant(userId, experiment.id);
        return { userId, variantId };
      }),
    );

    console.log('用户分配结果:');
    assignments.forEach(({ userId, variantId }) => {
      console.log(`  ${userId} -> ${variantId}`);
    });

    // 验证分配的一致性哈希
    // 同一用户多次调用应返回相同的变体
    const userId = 'user-1';
    const variant1 = await experimentService.assignVariant(userId, experiment.id);
    const variant2 = await experimentService.assignVariant(userId, experiment.id);
    console.log(`\n一致性验证: ${variant1 === variant2 ? '通过' : '失败'}`);
  } catch (error) {
    console.error('示例执行失败:', error);
  }
}

// ===== 示例3: 权重分配验证 =====
async function testWeightedAllocation() {
  try {
    // 创建权重不均的实验
    const experiment = await experimentService.createExperiment({
      name: '权重分配测试',
      description: '测试权重分配是否正确',
      trafficAllocation: 'WEIGHTED',
      minSampleSize: 50,
      significanceLevel: 0.05,
      minimumDetectableEffect: 0.1,
      autoDecision: false,
      variants: [
        {
          id: 'control',
          name: '控制组',
          weight: 0.3, // 30%
          isControl: true,
          parameters: {},
        },
        {
          id: 'treatment',
          name: '实验组',
          weight: 0.7, // 70%
          isControl: false,
          parameters: {},
        },
      ],
    });

    await experimentService.startExperiment(experiment.id);

    // 模拟1000个用户分配
    const assignments: Record<string, number> = {
      control: 0,
      treatment: 0,
    };

    for (let i = 0; i < 1000; i++) {
      const userId = `test-user-${i}`;
      const variantId = await experimentService.assignVariant(userId, experiment.id);
      assignments[variantId]++;
    }

    console.log('\n权重分配统计 (1000个用户):');
    console.log(
      `  控制组 (期望30%): ${assignments.control} (${((assignments.control / 1000) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  实验组 (期望70%): ${assignments.treatment} (${((assignments.treatment / 1000) * 100).toFixed(1)}%)`,
    );
  } catch (error) {
    console.error('权重测试失败:', error);
  }
}

// ===== 示例4: 记录指标并查看统计 =====
async function recordMetricsAndViewStats() {
  try {
    const experimentId = 'exp-test';
    const controlVariantId = 'control';
    const treatmentVariantId = 'treatment';

    // 模拟记录一些指标
    // 控制组: 平均奖励 0.7
    for (let i = 0; i < 50; i++) {
      await experimentService.recordMetric(
        experimentId,
        controlVariantId,
        0.7 + (Math.random() - 0.5) * 0.2,
      );
    }

    // 实验组: 平均奖励 0.8
    for (let i = 0; i < 50; i++) {
      await experimentService.recordMetric(
        experimentId,
        treatmentVariantId,
        0.8 + (Math.random() - 0.5) * 0.2,
      );
    }

    // 查看实验状态
    const status = await experimentService.getExperimentStatus(experimentId);
    console.log('\n实验统计:');
    console.log(`  效应量: ${(status.effectSize * 100).toFixed(1)}%`);
    console.log(`  p值: ${status.pValue.toFixed(4)}`);
    console.log(`  是否显著: ${status.isSignificant ? '是' : '否'}`);
    console.log(`  建议: ${status.recommendation}`);
    console.log(`  原因: ${status.reason}`);
  } catch (error) {
    console.error('指标记录失败:', error);
  }
}

// 运行示例
if (require.main === module) {
  console.log('\n=== 阶段6 实验服务增强示例 ===\n');

  (async () => {
    await assignUserToExperiment();
    await createExperimentAndAssignUsers();
    await testWeightedAllocation();
    await recordMetricsAndViewStats();
  })();
}

export {
  assignUserToExperiment,
  createExperimentAndAssignUsers,
  testWeightedAllocation,
  recordMetricsAndViewStats,
};
