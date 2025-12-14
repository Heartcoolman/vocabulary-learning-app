/**
 * T5.5 情绪检测器使用示例
 */

import { emotionDetector, BehaviorSignals } from './emotion-detector';

// ===== 示例1: 检测受挫情绪 =====
function detectFrustration() {
  const signals: BehaviorSignals = {
    consecutiveWrong: 4, // 连续错误多
    avgResponseTime: 6000,
    responseTimeVariance: 5000000, // 方差大
    skipCount: 3, // 跳过多
    dwellTimeRatio: 0.8,
    baselineResponseTime: 5000,
  };

  const result = emotionDetector.detectEmotion(null, signals);
  console.log('检测到受挫:', result);
  // 预期输出: { emotion: 'frustrated', confidence: ~0.7-0.9 }
}

// ===== 示例2: 检测焦虑情绪 =====
function detectAnxiety() {
  const signals: BehaviorSignals = {
    consecutiveWrong: 1,
    avgResponseTime: 3500, // 反应快
    responseTimeVariance: 3000000, // 方差大
    skipCount: 0,
    dwellTimeRatio: 0.3, // 停留时间短
    baselineResponseTime: 5000,
  };

  const result = emotionDetector.detectEmotion(null, signals);
  console.log('检测到焦虑:', result);
  // 预期输出: { emotion: 'anxious', confidence: ~0.8 }
}

// ===== 示例3: 检测无聊情绪 =====
function detectBoredom() {
  const signals: BehaviorSignals = {
    consecutiveWrong: 2,
    avgResponseTime: 7500, // 反应慢
    responseTimeVariance: 500000, // 方差小
    skipCount: 2, // 跳过一些
    dwellTimeRatio: 1.0,
    baselineResponseTime: 5000,
  };

  const result = emotionDetector.detectEmotion(null, signals);
  console.log('检测到无聊:', result);
  // 预期输出: { emotion: 'bored', confidence: ~0.7-0.9 }
}

// ===== 示例4: 检测疲劳情绪 =====
function detectTiredness() {
  const signals: BehaviorSignals = {
    consecutiveWrong: 2,
    avgResponseTime: 8000, // 反应慢
    responseTimeVariance: 400000, // 方差小
    skipCount: 0,
    dwellTimeRatio: 1.5, // 停留时间长
    baselineResponseTime: 5000,
  };

  const result = emotionDetector.detectEmotion(null, signals);
  console.log('检测到疲劳:', result);
  // 预期输出: { emotion: 'tired', confidence: ~0.8-1.0 }
}

// ===== 示例5: 检测正常状态 =====
function detectNeutral() {
  const signals: BehaviorSignals = {
    consecutiveWrong: 0,
    avgResponseTime: 5200, // 接近基线
    responseTimeVariance: 800000, // 方差适中
    skipCount: 0,
    dwellTimeRatio: 0.9,
    baselineResponseTime: 5000,
  };

  const result = emotionDetector.detectEmotion(null, signals);
  console.log('检测到正常:', result);
  // 预期输出: { emotion: 'neutral', confidence: ~0.8-1.0 }
}

// ===== 示例6: 结合自我报告 =====
function detectWithSelfReport() {
  const signals: BehaviorSignals = {
    consecutiveWrong: 3,
    avgResponseTime: 7000,
    responseTimeVariance: 4000000,
    skipCount: 2,
    dwellTimeRatio: 0.6,
    baselineResponseTime: 5000,
  };

  // 自我报告与行为一致
  const result1 = emotionDetector.detectEmotion('我感觉很沮丧', signals);
  console.log('自我报告+行为一致:', result1);
  // 预期输出: { emotion: 'frustrated', confidence: ~0.9-0.95 }

  // 自我报告与行为不一致
  const neutralSignals: BehaviorSignals = {
    ...signals,
    consecutiveWrong: 0,
    avgResponseTime: 5000,
    responseTimeVariance: 500000,
    skipCount: 0,
  };
  const result2 = emotionDetector.detectEmotion('我感觉很沮丧', neutralSignals);
  console.log('自我报告+行为不一致:', result2);
  // 预期输出: confidence 会降低
}

// 运行示例
if (require.main === module) {
  console.log('\n=== T5.5 情绪检测器示例 ===\n');
  detectFrustration();
  detectAnxiety();
  detectBoredom();
  detectTiredness();
  detectNeutral();
  detectWithSelfReport();
}
