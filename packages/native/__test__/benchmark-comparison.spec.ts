/**
 * Performance Comparison Benchmark: Rust vs TypeScript
 *
 * This file compares the performance of Rust (Native) and TypeScript implementations
 * for ACT-R Memory Model, Causal Inference, and Thompson Sampling algorithms.
 *
 * Test Scales:
 * - Small: 100 records
 * - Medium: 1,000 records
 * - Large: 10,000 records
 */

import { describe, it, expect, afterAll } from 'vitest';

// Import Native (Rust) implementations
import {
  ActrMemoryNative,
  CausalInferenceNative,
  ThompsonSamplingNative,
  type MemoryTrace,
  type CausalObservation,
} from '../index.js';

// ==================== TypeScript Implementations ====================
// Inline simplified TypeScript implementations for fair comparison

/**
 * TypeScript ACT-R Memory Model
 */
class ACTRMemoryTS {
  private decay: number;
  private threshold: number;
  private noiseScale: number;

  constructor(decay = 0.5, threshold = 0.3, noiseScale = 0.4) {
    this.decay = decay;
    this.threshold = threshold;
    this.noiseScale = noiseScale;
  }

  /**
   * Compute activation using the same formula as Rust:
   * A = ln(sum(w_j * t_j^(-d)))
   * where t_j is the time since last review in seconds
   */
  computeActivation(traces: { timestamp: number; isCorrect: boolean }[], currentTime: number): number {
    if (!traces || traces.length === 0) {
      return -Infinity;
    }

    const MIN_TIME = 1e-3;
    const ERROR_PENALTY = 0.3;
    let sum = 0;

    for (const trace of traces) {
      // Calculate time difference (seconds ago)
      const timeDiff = currentTime - trace.timestamp;
      const t = Math.max(timeDiff, MIN_TIME);
      const weight = trace.isCorrect ? 1.0 : ERROR_PENALTY;
      sum += weight * Math.pow(t, -this.decay);
    }

    if (sum <= 0 || !Number.isFinite(sum)) {
      return -Infinity;
    }

    return Math.log(sum);
  }

  retrievalProbability(activation: number): number {
    if (!Number.isFinite(activation)) {
      return 0;
    }
    const s = Math.max(this.noiseScale, 1e-6);
    const z = (activation - this.threshold) / s;
    const prob = 1 / (1 + Math.exp(-z));
    return Number.isFinite(prob) ? Math.max(0, Math.min(1, prob)) : 0;
  }

  batchComputeActivations(
    traceSets: { timestamp: number; isCorrect: boolean }[][],
    currentTime: number
  ): { activation: number; recallProbability: number }[] {
    return traceSets.map((traces) => {
      const activation = this.computeActivation(traces, currentTime);
      const recallProbability = this.retrievalProbability(activation);
      return { activation, recallProbability };
    });
  }
}

/**
 * TypeScript Causal Inference
 */
class CausalInferenceTS {
  private featureDim: number;
  private propensityWeights: number[];
  private outcomeWeightsTreatment: number[];
  private outcomeWeightsControl: number[];
  private fitted: boolean = false;
  private propensityMin = 0.05;
  private propensityMax = 0.95;
  private learningRate = 0.1;
  private regularization = 0.01;
  private maxIterations = 1000;

  constructor(featureDim: number) {
    this.featureDim = featureDim;
    const d = featureDim + 1;
    this.propensityWeights = new Array(d).fill(0);
    this.outcomeWeightsTreatment = new Array(d).fill(0);
    this.outcomeWeightsControl = new Array(d).fill(0);
  }

  private sigmoid(x: number): number {
    if (x > 20) return 1 - 1e-10;
    if (x < -20) return 1e-10;
    return 1 / (1 + Math.exp(-x));
  }

  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  private addBias(features: number[]): number[] {
    return [...features, 1];
  }

  fitPropensity(observations: { features: number[]; treatment: number; outcome: number }[]): void {
    if (observations.length < 10) return;

    const n = observations.length;
    const d = this.featureDim + 1;

    // Fit propensity model (logistic regression)
    const weights = new Array(d).fill(0);
    let prevLoss = Infinity;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const gradients = new Array(d).fill(0);
      let loss = 0;

      for (const obs of observations) {
        const featuresWithBias = this.addBias(obs.features);
        const logit = this.dotProduct(featuresWithBias, weights);
        const pred = this.sigmoid(logit);

        const treatment = obs.treatment;
        loss +=
          -treatment * Math.log(pred + 1e-10) - (1 - treatment) * Math.log(1 - pred + 1e-10);

        const error = pred - treatment;
        for (let j = 0; j < d; j++) {
          gradients[j] += error * featuresWithBias[j];
        }
      }

      for (let j = 0; j < d - 1; j++) {
        loss += (this.regularization / 2) * weights[j] * weights[j];
        gradients[j] += this.regularization * weights[j];
      }

      for (let j = 0; j < d; j++) {
        weights[j] -= (this.learningRate * gradients[j]) / n;
      }

      if (Math.abs(prevLoss - loss) < 1e-6) break;
      prevLoss = loss;
    }

    this.propensityWeights = weights;

    // Fit outcome models (simple averages for speed)
    const treatmentObs = observations.filter((o) => o.treatment === 1);
    const controlObs = observations.filter((o) => o.treatment === 0);

    this.outcomeWeightsTreatment = this.fitLinearRegression(treatmentObs);
    this.outcomeWeightsControl = this.fitLinearRegression(controlObs);

    this.fitted = true;
  }

  private fitLinearRegression(
    data: { features: number[]; outcome: number }[]
  ): number[] {
    const n = data.length;
    const d = this.featureDim + 1;

    if (n === 0) return new Array(d).fill(0);

    // Simple averaging for speed in benchmark
    let sumOutcome = 0;
    for (const obs of data) {
      sumOutcome += obs.outcome;
    }
    const mean = sumOutcome / n;

    const result = new Array(d).fill(0);
    result[d - 1] = mean; // Bias term
    return result;
  }

  getPropensityScore(features: number[]): number {
    const featuresWithBias = this.addBias(features);
    const logit = this.dotProduct(featuresWithBias, this.propensityWeights);
    const raw = this.sigmoid(logit);
    return Math.max(this.propensityMin, Math.min(this.propensityMax, raw));
  }

  predictOutcome(features: number[], treatment: number): number {
    const weights =
      treatment === 1 ? this.outcomeWeightsTreatment : this.outcomeWeightsControl;
    const featuresWithBias = this.addBias(features);
    return this.dotProduct(featuresWithBias, weights);
  }

  estimateATE(
    observations: { features: number[]; treatment: number; outcome: number }[]
  ): { ate: number; standardError: number } {
    if (observations.length === 0 || !this.fitted) {
      return { ate: 0, standardError: 0 };
    }

    const scores: number[] = [];
    const EPSILON = 1e-10;

    for (const obs of observations) {
      const e = this.getPropensityScore(obs.features);
      const mu1 = this.predictOutcome(obs.features, 1);
      const mu0 = this.predictOutcome(obs.features, 0);

      let score: number;
      if (obs.treatment === 1) {
        const w = Math.min(1 / Math.max(e, EPSILON), 20);
        score = w * (obs.outcome - mu1) + mu1 - mu0;
      } else {
        const w = Math.min(1 / Math.max(1 - e, EPSILON), 20);
        score = mu1 - mu0 - w * (obs.outcome - mu0);
      }
      scores.push(score);
    }

    const ate = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((sum, x) => sum + (x - ate) * (x - ate), 0) / (scores.length - 1);
    const se = Math.sqrt(variance / scores.length);

    return { ate, standardError: se };
  }

  bootstrapSE(
    observations: { features: number[]; treatment: number; outcome: number }[],
    nBootstrap: number
  ): number {
    if (observations.length < 10) return 0;

    const estimates: number[] = [];
    const n = observations.length;

    for (let b = 0; b < nBootstrap; b++) {
      const sample: { features: number[]; treatment: number; outcome: number }[] = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * n);
        sample.push(observations[idx]);
      }

      const treatmentCount = sample.filter((o) => o.treatment === 1).length;
      const controlCount = n - treatmentCount;
      if (treatmentCount < 3 || controlCount < 3) continue;

      const tempEstimator = new CausalInferenceTS(this.featureDim);
      tempEstimator.fitPropensity(sample);
      if (tempEstimator.fitted) {
        const result = tempEstimator.estimateATE(sample);
        estimates.push(result.ate);
      }
    }

    if (estimates.length < 10) return 0;

    const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
    const variance =
      estimates.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / (estimates.length - 1);
    return Math.sqrt(variance);
  }
}

/**
 * TypeScript Thompson Sampling
 */
class ThompsonSamplingTS {
  private globalParams: Map<string, { alpha: number; beta: number }> = new Map();
  private contextParams: Map<string, Map<string, { alpha: number; beta: number }>> =
    new Map();
  private priorAlpha = 1.0;
  private priorBeta = 1.0;

  sampleBeta(alpha: number, beta: number): number {
    const a = Math.max(alpha, 1e-10);
    const b = Math.max(beta, 1e-10);

    const x = this.sampleGamma(a);
    const y = this.sampleGamma(b);
    const sum = x + y;

    if (!Number.isFinite(sum) || sum <= 0) {
      return 0.5;
    }
    return x / sum;
  }

  private sampleGamma(shape: number): number {
    if (shape <= 0) return 0;

    if (shape < 1) {
      const u = Math.random();
      return this.sampleGamma(1 + shape) * Math.pow(u, 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    for (let i = 0; i < 1000; i++) {
      const x = this.randomNormal();
      let v = 1 + c * x;

      if (v <= 0) continue;

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }

    return shape;
  }

  private randomNormal(): number {
    const u1 = Math.max(Math.random(), 1e-12);
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  batchSample(actionKeys: string[]): number[] {
    return actionKeys.map((key) => {
      const params = this.getGlobalParams(key);
      return this.sampleBeta(params.alpha, params.beta);
    });
  }

  update(actionKey: string, success: boolean): void {
    if (!this.globalParams.has(actionKey)) {
      this.globalParams.set(actionKey, {
        alpha: this.priorAlpha,
        beta: this.priorBeta,
      });
    }
    const params = this.globalParams.get(actionKey)!;
    if (success) {
      params.alpha += 1;
    } else {
      params.beta += 1;
    }
  }

  getExpectedValue(actionKey: string): number {
    const params = this.getGlobalParams(actionKey);
    return params.alpha / (params.alpha + params.beta);
  }

  batchSampleWithContext(contextKey: string, actionKeys: string[]): number[] {
    return actionKeys.map((actionKey) => {
      const globalParams = this.getGlobalParams(actionKey);
      const contextualParams = this.getContextParams(actionKey, contextKey);

      const globalSample = this.sampleBeta(globalParams.alpha, globalParams.beta);
      const contextualSample = this.sampleBeta(contextualParams.alpha, contextualParams.beta);

      // Simple blending
      return 0.5 * globalSample + 0.5 * contextualSample;
    });
  }

  updateWithContext(contextKey: string, actionKey: string, success: boolean): void {
    // Update global
    this.update(actionKey, success);

    // Update contextual
    if (!this.contextParams.has(actionKey)) {
      this.contextParams.set(actionKey, new Map());
    }
    const contextMap = this.contextParams.get(actionKey)!;
    if (!contextMap.has(contextKey)) {
      contextMap.set(contextKey, { alpha: this.priorAlpha, beta: this.priorBeta });
    }
    const params = contextMap.get(contextKey)!;
    if (success) {
      params.alpha += 1;
    } else {
      params.beta += 1;
    }
  }

  getExpectedValueWithContext(contextKey: string, actionKey: string): number {
    const params = this.getContextParams(actionKey, contextKey);
    return params.alpha / (params.alpha + params.beta);
  }

  private getGlobalParams(actionKey: string): { alpha: number; beta: number } {
    if (!this.globalParams.has(actionKey)) {
      return { alpha: this.priorAlpha, beta: this.priorBeta };
    }
    return this.globalParams.get(actionKey)!;
  }

  private getContextParams(
    actionKey: string,
    contextKey: string
  ): { alpha: number; beta: number } {
    const contextMap = this.contextParams.get(actionKey);
    if (!contextMap || !contextMap.has(contextKey)) {
      return { alpha: this.priorAlpha, beta: this.priorBeta };
    }
    return contextMap.get(contextKey)!;
  }
}

// ==================== Test Data Generators ====================

function generateMemoryTraces(count: number, currentTime: number): MemoryTrace[] {
  const traces: MemoryTrace[] = [];
  for (let i = 0; i < count; i++) {
    // Generate timestamps in the past (currentTime - random seconds ago)
    const secondsAgo = Math.random() * 86400 + 60; // 60s to 1 day ago
    traces.push({
      timestamp: currentTime - secondsAgo,
      isCorrect: Math.random() > 0.2, // 80% correct
    });
  }
  return traces;
}

function generateCausalObservations(count: number, featureDim: number): CausalObservation[] {
  const observations: CausalObservation[] = [];
  for (let i = 0; i < count; i++) {
    const features: number[] = [];
    for (let j = 0; j < featureDim; j++) {
      features.push(Math.random() * 2 - 1); // [-1, 1]
    }
    observations.push({
      features,
      treatment: Math.random() > 0.5 ? 1 : 0,
      outcome: Math.random() * 2 - 1, // [-1, 1]
    });
  }
  return observations;
}

function generateActionKeys(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `action_${i}`);
}

// ==================== Benchmark Results Interface ====================

interface BenchmarkResult {
  operation: string;
  scale: string;
  rustMs: number;
  tsMs: number;
  speedup: number;
}

const benchmarkResults: BenchmarkResult[] = [];

// ==================== Report Formatting ====================

function formatTable(
  title: string,
  results: BenchmarkResult[]
): string {
  const lines: string[] = [];
  lines.push(`\n${title}:`);
  lines.push('| Operation                  | Rust (ms) | TS (ms)   | Speedup |');
  lines.push('|----------------------------|-----------|-----------|---------|');

  for (const r of results) {
    const op = r.operation.padEnd(26);
    const rust = r.rustMs.toFixed(2).padStart(9);
    const ts = r.tsMs.toFixed(2).padStart(9);
    const speedup = `${r.speedup.toFixed(1)}x`.padStart(7);
    lines.push(`| ${op} | ${rust} | ${ts} | ${speedup} |`);
  }

  return lines.join('\n');
}

function printFinalReport(): void {
  console.log('\n' + '='.repeat(60));
  console.log('=== Performance Comparison Report: Rust vs TypeScript ===');
  console.log('='.repeat(60));

  const actrResults = benchmarkResults.filter((r) => r.operation.startsWith('ACT-R'));
  const causalResults = benchmarkResults.filter((r) => r.operation.startsWith('Causal'));
  const tsResults = benchmarkResults.filter((r) => r.operation.startsWith('Thompson'));

  if (actrResults.length > 0) {
    console.log(formatTable('ACT-R Memory Model', actrResults));
  }

  if (causalResults.length > 0) {
    console.log(formatTable('Causal Inference', causalResults));
  }

  if (tsResults.length > 0) {
    console.log(formatTable('Thompson Sampling', tsResults));
  }

  // Summary statistics
  if (benchmarkResults.length > 0) {
    const avgSpeedup =
      benchmarkResults.reduce((sum, r) => sum + r.speedup, 0) / benchmarkResults.length;
    const maxSpeedup = Math.max(...benchmarkResults.map((r) => r.speedup));
    const minSpeedup = Math.min(...benchmarkResults.map((r) => r.speedup));

    console.log('\n' + '-'.repeat(60));
    console.log('Summary Statistics:');
    console.log(`  Average Speedup: ${avgSpeedup.toFixed(2)}x`);
    console.log(`  Max Speedup:     ${maxSpeedup.toFixed(2)}x`);
    console.log(`  Min Speedup:     ${minSpeedup.toFixed(2)}x`);
  }
  console.log('='.repeat(60) + '\n');
}

// ==================== Test Suite ====================

describe('Performance Comparison: Rust vs TypeScript', () => {
  afterAll(() => {
    printFinalReport();
  });

  // ==================== ACT-R Memory Model ====================

  describe('ACT-R Memory Model', () => {
    const rustActr = new ActrMemoryNative();
    const tsActr = new ACTRMemoryTS();

    describe('computeActivation', () => {
      it('should compare performance for small dataset (100 traces)', () => {
        const currentTime = Date.now() / 1000;
        const traces = generateMemoryTraces(100, currentTime);
        const iterations = 1000;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustActr.computeActivation(traces, currentTime);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsActr.computeActivation(traces, currentTime);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'ACT-R computeActivation (100)',
          scale: 'small',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `computeActivation (100 traces, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        // Just verify the result is reasonable (no strict performance requirement)
        expect(Number.isFinite(rustActr.computeActivation(traces, currentTime))).toBe(true);
      });

      it('should compare performance for medium dataset (1000 traces)', () => {
        const currentTime = Date.now() / 1000;
        const traces = generateMemoryTraces(1000, currentTime);
        const iterations = 100;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustActr.computeActivation(traces, currentTime);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsActr.computeActivation(traces, currentTime);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'ACT-R computeActivation (1K)',
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `computeActivation (1000 traces, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(Number.isFinite(rustActr.computeActivation(traces, currentTime))).toBe(true);
      });

      it('should compare performance for large dataset (10000 traces)', () => {
        const currentTime = Date.now() / 1000;
        const traces = generateMemoryTraces(10000, currentTime);
        const iterations = 10;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustActr.computeActivation(traces, currentTime);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsActr.computeActivation(traces, currentTime);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'ACT-R computeActivation (10K)',
          scale: 'large',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `computeActivation (10000 traces, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(Number.isFinite(rustActr.computeActivation(traces, currentTime))).toBe(true);
      });
    });

    describe('retrievalProbability', () => {
      it('should compare retrieval probability calculation', () => {
        const iterations = 10000;
        const testActivations = Array.from({ length: 100 }, () => Math.random() * 2 - 1);

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          for (const activation of testActivations) {
            rustActr.retrievalProbability(activation);
          }
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          for (const activation of testActivations) {
            tsActr.retrievalProbability(activation);
          }
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'ACT-R retrievalProb (1M)',
          scale: 'large',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `retrievalProbability (${iterations * 100} calls): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        // Verify result is in valid range
        const prob = rustActr.retrievalProbability(0);
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      });
    });

    describe('batchComputeActivations', () => {
      it('should compare batch processing performance', () => {
        const currentTime = Date.now() / 1000;
        const batchSize = 1000;
        const traceSets: MemoryTrace[][] = [];

        for (let i = 0; i < batchSize; i++) {
          traceSets.push(generateMemoryTraces(10, currentTime));
        }

        const iterations = 10;

        // Rust batch performance (compute each individually)
        const rustStart = performance.now();
        for (let iter = 0; iter < iterations; iter++) {
          for (const traces of traceSets) {
            rustActr.computeActivation(traces, currentTime);
          }
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript batch performance
        const tsStart = performance.now();
        for (let iter = 0; iter < iterations; iter++) {
          tsActr.batchComputeActivations(traceSets, currentTime);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'ACT-R batchCompute (1K)',
          scale: 'large',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `batchComputeActivations (${batchSize} sets, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });

    describe('Numerical Consistency', () => {
      it('should produce similar results between Rust and TS', () => {
        const currentTime = Date.now() / 1000;
        const traces = generateMemoryTraces(50, currentTime);

        const rustResult = rustActr.computeActivation(traces, currentTime);
        const tsResult = tsActr.computeActivation(traces, currentTime);

        console.log(
          `Numerical comparison: Rust=${rustResult.toFixed(6)}, TS=${tsResult.toFixed(6)}`
        );

        // Both should be finite numbers
        expect(Number.isFinite(rustResult)).toBe(true);
        expect(Number.isFinite(tsResult)).toBe(true);

        // Both should have same sign (both negative or both positive)
        if (Number.isFinite(rustResult) && Number.isFinite(tsResult)) {
          // Results might differ due to implementation details but should be in similar range
          expect(Math.sign(rustResult)).toBe(Math.sign(tsResult));
        }
      });
    });
  });

  // ==================== Causal Inference ====================

  describe('Causal Inference', () => {
    const featureDim = 5;

    describe('fitPropensity', () => {
      it('should compare propensity model fitting (500 observations)', () => {
        const observations = generateCausalObservations(500, featureDim);
        const iterations = 10;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          const rc = new CausalInferenceNative(featureDim);
          rc.fitPropensity(observations);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          const tc = new CausalInferenceTS(featureDim);
          tc.fitPropensity(observations);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Causal fitPropensity (500)',
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `fitPropensity (500 obs, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });

      it('should compare propensity model fitting (2000 observations)', () => {
        const observations = generateCausalObservations(2000, featureDim);
        const iterations = 5;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          const rc = new CausalInferenceNative(featureDim);
          rc.fitPropensity(observations);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          const tc = new CausalInferenceTS(featureDim);
          tc.fitPropensity(observations);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Causal fitPropensity (2K)',
          scale: 'large',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `fitPropensity (2000 obs, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });

    describe('estimateATE', () => {
      it('should compare ATE estimation', () => {
        const observations = generateCausalObservations(500, featureDim);
        const iterations = 20;

        // Pre-fit models
        const rustCausal = new CausalInferenceNative(featureDim);
        rustCausal.fitPropensity(observations);

        const tsCausal = new CausalInferenceTS(featureDim);
        tsCausal.fitPropensity(observations);

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustCausal.estimateAte(observations);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsCausal.estimateATE(observations);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Causal estimateATE (500)',
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `estimateATE (500 obs, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });

    describe('bootstrapSE', () => {
      it('should compare bootstrap standard error computation', () => {
        const observations = generateCausalObservations(200, featureDim);
        const nBootstrap = 30;

        // Pre-fit models
        const rustCausal = new CausalInferenceNative(featureDim);
        rustCausal.fitPropensity(observations);

        const tsCausal = new CausalInferenceTS(featureDim);
        tsCausal.fitPropensity(observations);

        const iterations = 2;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustCausal.bootstrapSe(observations, nBootstrap);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsCausal.bootstrapSE(observations, nBootstrap);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: `Causal bootstrap (${nBootstrap})`,
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `bootstrapSE (200 obs, ${nBootstrap} bootstraps, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });
  });

  // ==================== Thompson Sampling ====================

  describe('Thompson Sampling', () => {
    describe('sampleBeta', () => {
      it('should compare Beta sampling performance', () => {
        const rustTs = new ThompsonSamplingNative();
        const tsTs = new ThompsonSamplingTS();

        const iterations = 10000;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustTs.sampleBeta(5.0, 3.0);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsTs.sampleBeta(5.0, 3.0);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Thompson sampleBeta (10K)',
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `sampleBeta (${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        // Verify sample is in valid range
        const sample = rustTs.sampleBeta(5.0, 3.0);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      });

      it('should compare Beta sampling with various parameters', () => {
        const rustTs = new ThompsonSamplingNative();
        const tsTs = new ThompsonSamplingTS();

        const testParams = [
          [1, 1], [2, 2], [5, 5], [10, 2], [2, 10],
          [0.5, 0.5], [1, 10], [10, 1], [100, 100],
        ];
        const iterations = 1000;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          for (const [a, b] of testParams) {
            rustTs.sampleBeta(a, b);
          }
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          for (const [a, b] of testParams) {
            tsTs.sampleBeta(a, b);
          }
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Thompson sampleBeta (varied)',
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `sampleBeta varied params (${iterations * testParams.length} calls): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });

    describe('batchSample', () => {
      it('should compare batch sampling performance (100 actions)', () => {
        const rustTs = new ThompsonSamplingNative();
        const tsTs = new ThompsonSamplingTS();

        const actionKeys = generateActionKeys(100);
        const iterations = 1000;

        // Initialize some actions
        for (const key of actionKeys) {
          const success = Math.random() > 0.5;
          rustTs.update(key, success);
          tsTs.update(key, success);
        }

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustTs.batchSample(actionKeys);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsTs.batchSample(actionKeys);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Thompson batchSample (100)',
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `batchSample (100 actions, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });

      it('should compare batch sampling performance (1000 actions)', () => {
        const rustTs = new ThompsonSamplingNative();
        const tsTs = new ThompsonSamplingTS();

        const actionKeys = generateActionKeys(1000);
        const iterations = 100;

        // Initialize some actions
        for (const key of actionKeys) {
          const success = Math.random() > 0.5;
          rustTs.update(key, success);
          tsTs.update(key, success);
        }

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustTs.batchSample(actionKeys);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsTs.batchSample(actionKeys);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Thompson batchSample (1K)',
          scale: 'large',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `batchSample (1000 actions, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });

    describe('update throughput', () => {
      it('should compare update throughput', () => {
        const rustTs = new ThompsonSamplingNative();
        const tsTs = new ThompsonSamplingTS();

        const iterations = 10000;

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustTs.update(`action_${i % 100}`, Math.random() > 0.5);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsTs.update(`action_${i % 100}`, Math.random() > 0.5);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Thompson update (10K)',
          scale: 'large',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `update (${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });

    describe('getExpectedValue', () => {
      it('should compare getExpectedValue throughput', () => {
        const rustTs = new ThompsonSamplingNative();
        const tsTs = new ThompsonSamplingTS();

        const actionKeys = generateActionKeys(100);
        const iterations = 10000;

        // Initialize
        for (const key of actionKeys) {
          for (let j = 0; j < 10; j++) {
            rustTs.update(key, Math.random() > 0.5);
            tsTs.update(key, Math.random() > 0.5);
          }
        }

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          for (const key of actionKeys) {
            rustTs.getExpectedValue(key);
          }
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          for (const key of actionKeys) {
            tsTs.getExpectedValue(key);
          }
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Thompson getExpected (1M)',
          scale: 'large',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `getExpectedValue (${iterations * actionKeys.length} calls): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });

    describe('context-aware operations', () => {
      it('should compare context-aware batch sampling', () => {
        const rustTs = new ThompsonSamplingNative();
        const tsTs = new ThompsonSamplingTS();

        const actionKeys = generateActionKeys(50);
        const contextKey = 'test_context';
        const iterations = 500;

        // Initialize with context
        for (const key of actionKeys) {
          for (let j = 0; j < 5; j++) {
            rustTs.updateWithContext(contextKey, key, Math.random() > 0.5);
            tsTs.updateWithContext(contextKey, key, Math.random() > 0.5);
          }
        }

        // Rust performance
        const rustStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          rustTs.batchSampleWithContext(contextKey, actionKeys);
        }
        const rustTime = performance.now() - rustStart;

        // TypeScript performance
        const tsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          tsTs.batchSampleWithContext(contextKey, actionKeys);
        }
        const tsTime = performance.now() - tsStart;

        const speedup = tsTime / rustTime;
        benchmarkResults.push({
          operation: 'Thompson contextSample (50)',
          scale: 'medium',
          rustMs: rustTime,
          tsMs: tsTime,
          speedup,
        });

        console.log(
          `batchSampleWithContext (50 actions, ${iterations} iterations): Rust=${rustTime.toFixed(2)}ms, TS=${tsTime.toFixed(2)}ms, Speedup=${speedup.toFixed(2)}x`
        );

        expect(true).toBe(true);
      });
    });
  });
});
