#!/usr/bin/env node
/**
 * WASM vs TypeScript 性能对比测试
 *
 * 运行: node scripts/wasm-benchmark.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// 生成模拟的MediaPipe关键点数据 (478个点)
function generateLandmarks() {
  const landmarks = [];
  for (let i = 0; i < 478; i++) {
    landmarks.push({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.1,
    });
  }
  return landmarks;
}

// TypeScript 实现 (与原始实现逻辑一致)
const TypeScriptImpl = {
  EARCalculator: class {
    constructor(smoothingFactor = 0.3) {
      this.smoothingFactor = smoothingFactor;
      this.lastEAR = 0.3;
    }

    calculate(landmarks) {
      if (!landmarks || landmarks.length < 400) {
        return { leftEAR: -1, rightEAR: -1, avgEAR: -1, isValid: false };
      }

      const LEFT_EYE = [33, 160, 158, 133, 153, 144];
      const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

      const computeEAR = (indices) => {
        const p = indices.map((i) => landmarks[i]);
        const dist = (a, b) =>
          Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + ((b.z || 0) - (a.z || 0)) ** 2);
        const v1 = dist(p[1], p[5]);
        const v2 = dist(p[2], p[4]);
        const h = dist(p[0], p[3]);
        return h < 0.001 ? -1 : (v1 + v2) / (2 * h);
      };

      const leftEAR = computeEAR(LEFT_EYE);
      const rightEAR = computeEAR(RIGHT_EYE);

      if (leftEAR < 0 || rightEAR < 0) {
        return { leftEAR, rightEAR, avgEAR: -1, isValid: false };
      }

      const rawAvg = (leftEAR + rightEAR) / 2;
      const smoothed = this.smoothingFactor * rawAvg + (1 - this.smoothingFactor) * this.lastEAR;
      this.lastEAR = smoothed;

      return { leftEAR, rightEAR, avgEAR: smoothed, isValid: true };
    }
  },

  PERCLOSCalculator: class {
    constructor(windowSizeSeconds = 60, earThreshold = 0.25, sampleRate = 10) {
      this.windowSizeMs = windowSizeSeconds * 1000;
      this.earThreshold = earThreshold;
      this.maxSamples = windowSizeSeconds * sampleRate;
      this.samples = [];
    }

    addSample(ear, timestamp) {
      const isClosed = ear > 0 && ear < this.earThreshold;
      this.samples.push({ ear, timestamp, isClosed });
      this.pruneOldSamples(timestamp);
    }

    pruneOldSamples(now) {
      const cutoff = now - this.windowSizeMs;
      this.samples = this.samples.filter((s) => s.timestamp >= cutoff);
      if (this.samples.length > this.maxSamples) {
        this.samples = this.samples.slice(-this.maxSamples);
      }
    }

    calculate() {
      if (this.samples.length === 0) {
        return { perclos: 0, totalFrames: 0, closedFrames: 0, windowDuration: 0, isValid: false };
      }
      const total = this.samples.length;
      const closed = this.samples.filter((s) => s.isClosed).length;
      const duration =
        total > 1 ? this.samples[total - 1].timestamp - this.samples[0].timestamp : 0;
      const minSamples = Math.floor(this.maxSamples * 0.3);
      return {
        perclos: total > 0 ? closed / total : 0,
        totalFrames: total,
        closedFrames: closed,
        windowDuration: duration,
        isValid: total >= minSamples,
      };
    }
  },

  BlinkDetector: class {
    constructor(earThreshold = 0.25, minDuration = 50, maxDuration = 400) {
      this.earThreshold = earThreshold;
      this.minDuration = minDuration;
      this.maxDuration = maxDuration;
      this.state = 'open';
      this.closeStartTime = 0;
      this.blinkEvents = [];
      this.windowSizeMs = 60000;
    }

    detectBlink(ear, timestamp) {
      const threshold = this.earThreshold;
      const closedThreshold = threshold * 0.8;
      let blinkEvent = null;

      switch (this.state) {
        case 'open':
          if (ear < threshold) {
            this.state = 'closing';
            this.closeStartTime = timestamp;
          }
          break;
        case 'closing':
          if (ear < closedThreshold) this.state = 'closed';
          else if (ear >= threshold) this.state = 'open';
          break;
        case 'closed':
          if (ear >= closedThreshold) this.state = 'opening';
          break;
        case 'opening':
          if (ear >= threshold) {
            const duration = timestamp - this.closeStartTime;
            if (duration >= this.minDuration && duration <= this.maxDuration) {
              blinkEvent = { timestamp, duration };
              this.blinkEvents.push(blinkEvent);
            }
            this.state = 'open';
          } else if (ear < closedThreshold) {
            this.state = 'closed';
          }
          break;
      }

      this.pruneOldEvents(timestamp);
      return blinkEvent;
    }

    pruneOldEvents(now) {
      const cutoff = now - this.windowSizeMs;
      this.blinkEvents = this.blinkEvents.filter((e) => e.timestamp >= cutoff);
    }

    getStats() {
      const count = this.blinkEvents.length;
      const avgDuration =
        count > 0 ? this.blinkEvents.reduce((sum, e) => sum + e.duration, 0) / count : 0;
      let blinkRate = 0;
      if (count >= 2) {
        const first = this.blinkEvents[0].timestamp;
        const last = this.blinkEvents[count - 1].timestamp;
        const durationMin = (last - first) / 60000;
        if (durationMin > 0) blinkRate = count / durationMin;
      }
      return { blinkRate, avgBlinkDuration: avgDuration, blinkCount: count };
    }
  },
};

// 加载WASM模块
async function loadWasm() {
  const wasmJsPath = join(projectRoot, 'public/wasm/visual_fatigue_wasm.js');
  const wasmBinaryPath = join(projectRoot, 'public/wasm/visual_fatigue_wasm_bg.wasm');

  // 读取并执行WASM JS
  const wasmJsCode = readFileSync(wasmJsPath, 'utf-8');

  // 创建一个模块环境
  const moduleCode =
    wasmJsCode + '\nexport { EARCalculator, PERCLOSCalculator, BlinkDetector, initSync };';

  // 使用data URL导入
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(moduleCode).toString('base64');
  const wasmModule = await import(dataUrl);

  // 同步初始化WASM
  const wasmBinary = readFileSync(wasmBinaryPath);
  wasmModule.initSync(wasmBinary);

  return wasmModule;
}

// 格式化数字
function formatNumber(n, decimals = 2) {
  return n.toFixed(decimals);
}

// 运行基准测试
async function runBenchmark(iterations = 10000) {
  console.log('\n🚀 WASM vs TypeScript 性能对比测试\n');
  console.log('='.repeat(60));

  // 加载WASM
  console.log('\n📦 加载WASM模块...');
  let wasmModule;
  try {
    wasmModule = await loadWasm();
    console.log('✅ WASM模块加载成功\n');
  } catch (e) {
    console.error('❌ WASM加载失败:', e.message);
    console.log('\n⚠️  将只运行TypeScript测试\n');
    wasmModule = null;
  }

  // 预生成测试数据
  console.log(`📊 生成 ${iterations.toLocaleString()} 组测试数据...`);
  const testData = [];
  for (let i = 0; i < iterations; i++) {
    testData.push({
      landmarks: generateLandmarks(),
      ear: 0.15 + Math.random() * 0.2,
      timestamp: Date.now() + i * 100,
    });
  }
  console.log('✅ 测试数据准备完成\n');

  const results = {};

  // 1. EAR Calculator 测试
  console.log('🔬 测试 EAR Calculator...');

  // TypeScript
  const tsEar = new TypeScriptImpl.EARCalculator(0.3);
  const tsEarStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    tsEar.calculate(testData[i].landmarks);
  }
  const tsEarTime = performance.now() - tsEarStart;

  // WASM
  let wasmEarTime = 0;
  if (wasmModule) {
    const wasmEar = new wasmModule.EARCalculator(0.3);
    const wasmEarStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const result = wasmEar.calculate(testData[i].landmarks);
      result.free();
    }
    wasmEarTime = performance.now() - wasmEarStart;
    wasmEar.free();
  }

  results.ear = { ts: tsEarTime, wasm: wasmEarTime };

  // 2. PERCLOS Calculator 测试
  console.log('🔬 测试 PERCLOS Calculator...');

  // TypeScript
  const tsPerclos = new TypeScriptImpl.PERCLOSCalculator(60, 0.25, 10);
  const tsPerclosStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    tsPerclos.addSample(testData[i].ear, testData[i].timestamp);
    tsPerclos.calculate();
  }
  const tsPerclosTime = performance.now() - tsPerclosStart;

  // WASM
  let wasmPerclosTime = 0;
  if (wasmModule) {
    const wasmPerclos = new wasmModule.PERCLOSCalculator(60.0, 0.25, 10);
    const wasmPerclosStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmPerclos.add_sample(testData[i].ear, testData[i].timestamp);
      const result = wasmPerclos.calculate();
      result.free();
    }
    wasmPerclosTime = performance.now() - wasmPerclosStart;
    wasmPerclos.free();
  }

  results.perclos = { ts: tsPerclosTime, wasm: wasmPerclosTime };

  // 3. Blink Detector 测试
  console.log('🔬 测试 Blink Detector...');

  // TypeScript
  const tsBlink = new TypeScriptImpl.BlinkDetector(0.25, 50, 400);
  const tsBlinkStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    tsBlink.detectBlink(testData[i].ear, testData[i].timestamp);
    tsBlink.getStats();
  }
  const tsBlinkTime = performance.now() - tsBlinkStart;

  // WASM
  let wasmBlinkTime = 0;
  if (wasmModule) {
    const wasmBlink = new wasmModule.BlinkDetector(0.25, 50.0, 400.0);
    const wasmBlinkStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const event = wasmBlink.detect_blink(testData[i].ear, testData[i].timestamp);
      if (event) event.free();
      const stats = wasmBlink.get_stats();
      stats.free();
    }
    wasmBlinkTime = performance.now() - wasmBlinkStart;
    wasmBlink.free();
  }

  results.blink = { ts: tsBlinkTime, wasm: wasmBlinkTime };

  // 显示结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果\n');

  const algorithms = [
    { key: 'ear', name: 'EAR Calculator' },
    { key: 'perclos', name: 'PERCLOS Calculator' },
    { key: 'blink', name: 'Blink Detector' },
  ];

  console.log('┌─────────────────────┬──────────────┬──────────────┬──────────┐');
  console.log('│ 算法                │ TypeScript   │ WASM         │ 加速比   │');
  console.log('├─────────────────────┼──────────────┼──────────────┼──────────┤');

  let totalTs = 0,
    totalWasm = 0;

  algorithms.forEach((algo) => {
    const r = results[algo.key];
    const speedup = wasmModule ? r.ts / r.wasm : 0;
    totalTs += r.ts;
    totalWasm += r.wasm;

    const tsStr = formatNumber(r.ts) + ' ms';
    const wasmStr = wasmModule ? formatNumber(r.wasm) + ' ms' : 'N/A';
    const speedupStr = wasmModule ? formatNumber(speedup) + 'x' : 'N/A';
    const emoji = speedup > 1 ? '🚀' : speedup > 0 ? '🐢' : '';

    console.log(
      `│ ${algo.name.padEnd(19)} │ ${tsStr.padStart(12)} │ ${wasmStr.padStart(12)} │ ${(speedupStr + ' ' + emoji).padStart(8)} │`,
    );
  });

  console.log('├─────────────────────┼──────────────┼──────────────┼──────────┤');

  const totalSpeedup = wasmModule ? totalTs / totalWasm : 0;
  const totalTsStr = formatNumber(totalTs) + ' ms';
  const totalWasmStr = wasmModule ? formatNumber(totalWasm) + ' ms' : 'N/A';
  const totalSpeedupStr = wasmModule ? formatNumber(totalSpeedup) + 'x' : 'N/A';
  const totalEmoji = totalSpeedup > 1 ? '🚀' : totalSpeedup > 0 ? '🐢' : '';

  console.log(
    `│ ${'总计'.padEnd(18)} │ ${totalTsStr.padStart(12)} │ ${totalWasmStr.padStart(12)} │ ${(totalSpeedupStr + ' ' + totalEmoji).padStart(8)} │`,
  );
  console.log('└─────────────────────┴──────────────┴──────────────┴──────────┘');

  // 详细统计
  console.log('\n📈 详细统计\n');
  console.log(`   迭代次数:          ${iterations.toLocaleString()}`);
  console.log(`   TypeScript 每次:   ${formatNumber((totalTs / iterations) * 1000, 3)} μs`);
  if (wasmModule) {
    console.log(`   WASM 每次:         ${formatNumber((totalWasm / iterations) * 1000, 3)} μs`);
    console.log(`   平均加速比:        ${formatNumber(totalSpeedup)}x`);
    console.log(
      `   节省时间:          ${formatNumber(totalTs - totalWasm)} ms (${formatNumber((1 - totalWasm / totalTs) * 100, 1)}%)`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成\n');

  return results;
}

// 运行测试
const iterations = parseInt(process.argv[2]) || 10000;
runBenchmark(iterations).catch(console.error);
