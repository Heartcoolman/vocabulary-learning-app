import { describe, it, expect } from 'vitest';
import { LinUcbNative } from '../index.js';

describe('Cholesky 数值稳定性诊断', () => {
  it('应该统计1000次更新的失败率', () => {
    const linucb = new LinUcbNative(0.3, 1.0);
    const iterations = 1000;

    let warnings = 0;
    let failures = 0;
    const failedFeatures: number[][] = [];

    for (let i = 0; i < iterations; i++) {
      const state = {
        masteryLevel: Math.random(),
        recentAccuracy: Math.random(),
        studyStreak: Math.floor(Math.random() * 30),
        totalInteractions: Math.floor(Math.random() * 1000),
        averageResponseTime: Math.random() * 10000,
      };

      const difficulties = ['recognition', 'recall', 'spelling', 'listening', 'usage'];
      const action = {
        wordId: `word${i}`,
        difficulty: difficulties[Math.floor(Math.random() * 5)],
        scheduledAt: undefined,
      };

      const context = {
        timeOfDay: Math.random(),
        dayOfWeek: Math.floor(Math.random() * 7),
        sessionDuration: Math.random() * 7200,
        fatigueFactor: Math.random(),
      };

      // 记录更新前的状态
      const diagBefore = linucb.diagnose();

      // 执行更新
      linucb.update(state, action, Math.random() * 2 - 1, context);

      // 检查更新后的健康状态
      const diagAfter = linucb.diagnose();

      if (!diagAfter.isHealthy) {
        failures++;
        console.warn(`[迭代 ${i}] 健康检查失败:`, diagAfter);
      }

      // 检查对角线最小值是否过小
      if (diagAfter.minDiagonal < 1e-6) {
        warnings++;
        console.warn(`[迭代 ${i}] 对角线过小: ${diagAfter.minDiagonal}`);
      }

      // 检查条件数
      if (diagAfter.conditionNumber > 1e10) {
        warnings++;
        console.warn(`[迭代 ${i}] 条件数过大: ${diagAfter.conditionNumber}`);
      }
    }

    const failureRate = (failures / iterations) * 100;
    const warningRate = (warnings / iterations) * 100;

    console.log(`\n=== Cholesky 稳定性统计 ===`);
    console.log(`总迭代次数: ${iterations}`);
    console.log(`失败次数: ${failures} (${failureRate.toFixed(2)}%)`);
    console.log(`警告次数: ${warnings} (${warningRate.toFixed(2)}%)`);

    const finalDiag = linucb.diagnose();
    console.log(`\n最终诊断:`);
    console.log(`  健康状态: ${finalDiag.isHealthy}`);
    console.log(`  条件数: ${finalDiag.conditionNumber.toExponential(2)}`);
    console.log(`  最小对角线: ${finalDiag.minDiagonal.toExponential(2)}`);
    console.log(`  最大对角线: ${finalDiag.maxDiagonal.toExponential(2)}`);
    console.log(`  有NaN: ${finalDiag.hasNaN}, 有Inf: ${finalDiag.hasInf}`);

    // 验证失败率应该低于5%
    expect(failureRate).toBeLessThan(5);
  });

  it('应该检测特征向量第12维的异常', () => {
    const linucb = new LinUcbNative(0.3, 1.0);

    // 构造一个特征向量，第12维设置为极端值
    const problematicFeature = new Array(22).fill(0.1);
    problematicFeature[11] = 10.0; // 第12维（索引11）

    console.log('\n测试极端特征值:');
    console.log(`特征向量第12维: ${problematicFeature[11]}`);

    const diagBefore = linucb.diagnose();
    linucb.updateWithFloat64Array(new Float64Array(problematicFeature), 0.5);
    const diagAfter = linucb.diagnose();

    console.log(`更新前条件数: ${diagBefore.conditionNumber.toExponential(2)}`);
    console.log(`更新后条件数: ${diagAfter.conditionNumber.toExponential(2)}`);
    console.log(`健康状态: ${diagAfter.isHealthy}`);

    expect(diagAfter.isHealthy).toBe(true);
  });

  it('应该测试Givens旋转在(12,11)位置的稳定性', () => {
    const linucb = new LinUcbNative(0.3, 1.0);

    let unhealthyCount = 0;
    const diagHistory: Array<{ iteration: number; diag: any }> = [];

    for (let i = 0; i < 100; i++) {
      const feature = new Array(22).fill(0);
      feature[11] = Math.random() * 2; // 第12维
      feature[10] = Math.random() * 2; // 第11维

      linucb.updateWithFloat64Array(new Float64Array(feature), Math.random());

      const diag = linucb.diagnose();
      diagHistory.push({ iteration: i, diag });

      if (!diag.isHealthy || diag.minDiagonal < 1e-6) {
        unhealthyCount++;
        if (unhealthyCount <= 3) {
          console.warn(`[迭代 ${i}] 健康问题:`);
          console.warn(
            `  健康: ${diag.isHealthy}, 最小对角线: ${diag.minDiagonal.toExponential(2)}`,
          );
          console.warn(`  特征[11] = ${feature[11]}, 特征[10] = ${feature[10]}`);
        }
      }
    }

    const minDiagonals = diagHistory.map((h) => h.diag.minDiagonal);
    const minDiag = Math.min(...minDiagonals);
    const maxDiag = Math.max(...minDiagonals);
    const avgDiag = minDiagonals.reduce((a, b) => a + b, 0) / minDiagonals.length;

    console.log(`\n最小对角线统计 (100次更新):`);
    console.log(`  最小值: ${minDiag.toExponential(2)}`);
    console.log(`  最大值: ${maxDiag.toExponential(2)}`);
    console.log(`  平均值: ${avgDiag.toExponential(2)}`);
    console.log(
      `  不健康次数: ${unhealthyCount}/100 (${((unhealthyCount / 100) * 100).toFixed(2)}%)`,
    );

    expect(minDiag).toBeGreaterThan(1e-6);
    expect(unhealthyCount).toBeLessThan(5);
    expect(linucb.selfTest()).toBe(true);
  });

  it('应该测试不同magnitude的特征值', () => {
    const testCases = [
      { scale: 0.001, desc: '极小特征值' },
      { scale: 0.1, desc: '小特征值' },
      { scale: 1.0, desc: '正常特征值' },
      { scale: 10.0, desc: '大特征值' },
      { scale: 100.0, desc: '极大特征值' },
    ];

    console.log('\n不同magnitude特征值测试:');

    for (const testCase of testCases) {
      const linucb = new LinUcbNative(0.3, 1.0);

      for (let i = 0; i < 100; i++) {
        const feature = new Array(22).fill(testCase.scale);
        linucb.updateWithFloat64Array(new Float64Array(feature), Math.random());
      }

      const diag = linucb.diagnose();
      console.log(`${testCase.desc} (scale=${testCase.scale}):`);
      console.log(`  健康: ${diag.isHealthy}, 条件数: ${diag.conditionNumber.toExponential(2)}`);

      expect(diag.isHealthy).toBe(true);
    }
  });

  it('应该测试混合magnitude的特征向量', () => {
    const linucb = new LinUcbNative(0.3, 1.0);
    let failCount = 0;

    console.log('\n混合magnitude测试:');

    for (let i = 0; i < 200; i++) {
      const feature = new Array(22).fill(0);

      // 一半维度很小，一半维度很大
      for (let j = 0; j < 11; j++) {
        feature[j] = Math.random() * 0.01;
      }
      for (let j = 11; j < 22; j++) {
        feature[j] = Math.random() * 10.0;
      }

      linucb.updateWithFloat64Array(new Float64Array(feature), Math.random());

      const diag = linucb.diagnose();
      if (!diag.isHealthy) {
        failCount++;
        if (failCount <= 3) {
          console.warn(`[迭代 ${i}] 失败: 条件数=${diag.conditionNumber.toExponential(2)}`);
        }
      }
    }

    const failRate = (failCount / 200) * 100;
    console.log(`失败率: ${failCount}/200 (${failRate.toFixed(2)}%)`);

    expect(failRate).toBeLessThan(5);
  });
});
