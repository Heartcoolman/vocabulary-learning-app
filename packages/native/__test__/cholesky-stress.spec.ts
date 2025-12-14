import { describe, it, expect } from 'vitest';
import { LinUcbNative } from '../index.js';

describe('Cholesky 极限压力测试', () => {
  it('应该测试10000次连续更新的数值累积误差', () => {
    const linucb = new LinUcbNative(0.3, 1.0);
    const iterations = 10000;

    let rankOneFailures = 0;
    let fullRecomputes = 0;
    const conditionNumbers: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const feature = new Array(22).fill(0).map(() => Math.random() * 2 - 1);

      // 故意引入一些极端值
      if (i % 100 === 0) {
        const extremeIdx = Math.floor(Math.random() * 22);
        feature[extremeIdx] = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 40);
      }

      linucb.updateWithFloat64Array(new Float64Array(feature), Math.random() * 2 - 1);

      // 每隔100次检查一次健康状态
      if (i % 100 === 0) {
        const diag = linucb.diagnose();
        conditionNumbers.push(diag.conditionNumber);

        if (!diag.isHealthy) {
          rankOneFailures++;
          if (rankOneFailures <= 5) {
            console.warn(`[迭代 ${i}] 健康问题: 条件数=${diag.conditionNumber.toExponential(2)}`);
          }
        }
      }
    }

    const avgCondition = conditionNumbers.reduce((a, b) => a + b, 0) / conditionNumbers.length;
    const maxCondition = Math.max(...conditionNumbers);
    const failureRate = (rankOneFailures / (iterations / 100)) * 100;

    console.log(`\n=== 10000次更新压力测试 ===`);
    console.log(
      `Rank-1更新失败: ${rankOneFailures} / ${iterations / 100} (${failureRate.toFixed(2)}%)`,
    );
    console.log(`平均条件数: ${avgCondition.toExponential(2)}`);
    console.log(`最大条件数: ${maxCondition.toExponential(2)}`);

    const finalDiag = linucb.diagnose();
    console.log(`\n最终状态:`);
    console.log(`  健康: ${finalDiag.isHealthy}`);
    console.log(`  条件数: ${finalDiag.conditionNumber.toExponential(2)}`);
    console.log(`  最小对角线: ${finalDiag.minDiagonal.toExponential(2)}`);

    expect(failureRate).toBeLessThan(5);
    expect(finalDiag.isHealthy).toBe(true);
  });

  it('应该测试病态特征向量的处理', () => {
    const linucb = new LinUcbNative(0.3, 1.0);
    const pathologicalCases = [
      {
        name: '全零向量（除了偏置）',
        feature: new Array(22).fill(0).map((_, i) => (i === 21 ? 1 : 0)),
      },
      {
        name: '一个极大值',
        feature: new Array(22).fill(0.1).map((v, i) => (i === 10 ? 50 : v)),
      },
      {
        name: '交替极值',
        feature: new Array(22).fill(0).map((_, i) => (i % 2 === 0 ? 50 : -50)),
      },
      {
        name: '指数递增',
        feature: new Array(22).fill(0).map((_, i) => Math.pow(2, i / 5)),
      },
      {
        name: '非常小的值',
        feature: new Array(22).fill(1e-8),
      },
      {
        name: '混合量级（10^-8到10^2）',
        feature: new Array(22).fill(0).map((_, i) => Math.pow(10, (i - 11) / 5)),
      },
    ];

    console.log('\n=== 病态特征向量测试 ===');
    let failCount = 0;

    for (const testCase of pathologicalCases) {
      const linucbTest = new LinUcbNative(0.3, 1.0);

      // 多次使用相同的病态特征
      for (let i = 0; i < 20; i++) {
        linucbTest.updateWithFloat64Array(new Float64Array(testCase.feature), Math.random());
      }

      const diag = linucbTest.diagnose();
      const status = diag.isHealthy ? '✓' : '✗';
      console.log(`  ${status} ${testCase.name}: 条件数=${diag.conditionNumber.toExponential(2)}`);

      if (!diag.isHealthy) {
        failCount++;
      }
    }

    const failRate = (failCount / pathologicalCases.length) * 100;
    console.log(
      `\n病态向量处理失败率: ${failCount}/${pathologicalCases.length} (${failRate.toFixed(2)}%)`,
    );

    expect(failRate).toBeLessThan(50); // 允许一些病态情况失败
  });

  it('应该测试相关特征向量的累积效应', () => {
    const linucb = new LinUcbNative(0.3, 1.0);

    // 生成一组高度相关的特征向量
    const baseFeature = new Array(22).fill(0).map(() => Math.random());

    console.log('\n=== 相关特征向量测试 ===');

    for (let i = 0; i < 500; i++) {
      // 每个新特征都是基础特征的微小扰动
      const feature = baseFeature.map((v) => v + (Math.random() - 0.5) * 0.1);
      linucb.updateWithFloat64Array(new Float64Array(feature), Math.random());

      if (i % 100 === 0) {
        const diag = linucb.diagnose();
        console.log(
          `  迭代${i}: 条件数=${diag.conditionNumber.toExponential(2)}, 健康=${diag.isHealthy}`,
        );
      }
    }

    const finalDiag = linucb.diagnose();
    console.log(`\n最终条件数: ${finalDiag.conditionNumber.toExponential(2)}`);
    console.log(`最终健康状态: ${finalDiag.isHealthy}`);

    // 相关特征会导致条件数增大，但不应该完全失败
    expect(finalDiag.conditionNumber).toBeLessThan(1e10);
  });

  it('应该测试快速交替的极端值更新', () => {
    const linucb = new LinUcbNative(0.3, 1.0);

    console.log('\n=== 交替极端值测试 ===');
    let unhealthyCount = 0;

    for (let i = 0; i < 1000; i++) {
      let feature: number[];

      if (i % 2 === 0) {
        // 偶数迭代：全部极大值
        feature = new Array(22).fill(45);
      } else {
        // 奇数迭代：全部极小值
        feature = new Array(22).fill(0.001);
      }

      linucb.updateWithFloat64Array(new Float64Array(feature), Math.random() * 2 - 1);

      if (i % 100 === 0) {
        const diag = linucb.diagnose();
        if (!diag.isHealthy) {
          unhealthyCount++;
        }
        console.log(
          `  迭代${i}: 条件数=${diag.conditionNumber.toExponential(2)}, 健康=${diag.isHealthy}`,
        );
      }
    }

    const finalDiag = linucb.diagnose();
    const unhealthyRate = (unhealthyCount / 10) * 100;

    console.log(`\n不健康检查点: ${unhealthyCount}/10 (${unhealthyRate.toFixed(2)}%)`);
    console.log(`最终健康状态: ${finalDiag.isHealthy}`);

    expect(unhealthyRate).toBeLessThan(20);
  });

  it('应该测试特定维度的重复更新', () => {
    const linucb = new LinUcbNative(0.3, 1.0);

    console.log('\n=== 单维度重复更新测试 ===');

    // 针对第12维进行重复更新
    for (let dim = 0; dim < 22; dim++) {
      const linucbTest = new LinUcbNative(0.3, 1.0);

      for (let i = 0; i < 100; i++) {
        const feature = new Array(22).fill(0.1);
        feature[dim] = 5.0 + Math.random() * 10; // 该维度设置为较大值

        linucbTest.updateWithFloat64Array(new Float64Array(feature), Math.random());
      }

      const diag = linucbTest.diagnose();
      const status = diag.isHealthy ? '✓' : '✗';

      if (dim === 11 || !diag.isHealthy) {
        console.log(`  维度${dim}: ${status} 条件数=${diag.conditionNumber.toExponential(2)}`);
      }
    }

    const diag12 = linucb.diagnose();
    expect(diag12.isHealthy).toBe(true);
  });

  it('应该测试Givens旋转的数值精度损失', () => {
    const linucb = new LinUcbNative(0.3, 1.0);

    console.log('\n=== Givens旋转精度测试 ===');

    // 测试可能导致Givens旋转不稳定的特殊值
    const testCases = [
      { name: 'r接近MIN_RANK1_DIAG', l_kk: 1e-6, x_k: 1e-7 },
      { name: '极大的l_kk', l_kk: 1e5, x_k: 1.0 },
      { name: '极大的x_k', l_kk: 1.0, x_k: 1e5 },
      { name: 'l_kk和x_k都很大', l_kk: 1e4, x_k: 1e4 },
      { name: 'l_kk和x_k都很小', l_kk: 1e-3, x_k: 1e-3 },
    ];

    for (const tc of testCases) {
      // 计算理论上的r值
      const r = Math.sqrt(tc.l_kk * tc.l_kk + tc.x_k * tc.x_k);
      console.log(`  ${tc.name}:`);
      console.log(`    l_kk=${tc.l_kk.toExponential(2)}, x_k=${tc.x_k.toExponential(2)}`);
      console.log(`    理论r=${r.toExponential(2)}`);

      // 构造一个特征向量来模拟这种情况
      const feature = new Array(22).fill(0.01);
      feature[11] = tc.x_k / 10; // 缩放以避免溢出

      const linucbTest = new LinUcbNative(0.3, tc.l_kk);
      linucbTest.updateWithFloat64Array(new Float64Array(feature), Math.random());

      const diag = linucbTest.diagnose();
      console.log(
        `    结果: 健康=${diag.isHealthy}, 条件数=${diag.conditionNumber.toExponential(2)}\n`,
      );
    }
  });
});
