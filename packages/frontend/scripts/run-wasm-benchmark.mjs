#!/usr/bin/env node
/**
 * 使用 Playwright 在浏览器中运行 WASM 性能测试
 */

import { chromium } from 'playwright';

const DEV_SERVER_URL = process.env.DEV_URL || 'http://localhost:5174';
const ITERATIONS = parseInt(process.argv[2]) || 10000;

async function runBenchmark() {
  console.log('\n🚀 WASM vs TypeScript 浏览器性能测试\n');
  console.log('='.repeat(60));
  console.log(`📍 服务器: ${DEV_SERVER_URL}`);
  console.log(`📊 迭代次数: ${ITERATIONS.toLocaleString()}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 监听控制台输出
  page.on('console', (msg) => {
    if (msg.type() === 'log' || msg.type() === 'warn') {
      console.log(`[Browser] ${msg.text()}`);
    }
  });

  try {
    // 访问测试页面
    console.log('📦 加载测试页面...');
    await page.goto(`${DEV_SERVER_URL}/wasm-benchmark.html`, { waitUntil: 'networkidle' });

    // 等待WASM加载
    await page.waitForFunction(
      () => {
        const status = document.getElementById('status');
        return status && status.textContent.includes('WASM模块加载成功');
      },
      { timeout: 30000 },
    );

    console.log('✅ WASM模块加载成功\n');

    // 设置迭代次数
    await page.fill('#iterations', String(ITERATIONS));

    // 运行测试
    console.log('🔬 运行性能测试...\n');
    await page.click('#runBtn');

    // 等待测试完成
    await page.waitForFunction(
      () => {
        const status = document.getElementById('status');
        return status && status.textContent.includes('测试完成');
      },
      { timeout: 300000 },
    );

    // 获取结果
    const results = await page.evaluate(() => {
      const rows = document.querySelectorAll('#resultsBody tr');
      const data = [];
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          data.push({
            name: cells[0].textContent.trim(),
            ts: cells[1].textContent.trim(),
            wasm: cells[2].textContent.trim(),
            speedup: cells[3].textContent.trim(),
          });
        }
      });
      return data;
    });

    // 获取详细数据
    const details = await page.evaluate(() => {
      const content = document.getElementById('detailsContent');
      if (!content) return {};
      const rows = content.querySelectorAll('.result-row');
      const data = {};
      rows.forEach((row) => {
        const label = row.querySelector('.label')?.textContent.trim();
        const value = row.querySelector('.value')?.textContent.trim();
        if (label && value) data[label] = value;
      });
      return data;
    });

    // 打印结果
    console.log('='.repeat(60));
    console.log('📊 测试结果\n');

    console.log('┌─────────────────────┬──────────────┬──────────────┬──────────────┐');
    console.log('│ 算法                │ TypeScript   │ WASM         │ 加速比       │');
    console.log('├─────────────────────┼──────────────┼──────────────┼──────────────┤');

    results.forEach((r) => {
      const name = r.name.padEnd(19);
      const ts = r.ts.padStart(12);
      const wasm = r.wasm.padStart(12);
      const speedup = r.speedup.padStart(12);
      console.log(`│ ${name} │ ${ts} │ ${wasm} │ ${speedup} │`);
    });

    console.log('└─────────────────────┴──────────────┴──────────────┴──────────────┘');

    // 打印详细数据
    console.log('\n📈 详细统计\n');
    Object.entries(details).forEach(([key, value]) => {
      console.log(`   ${key.padEnd(20)} ${value}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成\n');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
}

runBenchmark().catch(console.error);
