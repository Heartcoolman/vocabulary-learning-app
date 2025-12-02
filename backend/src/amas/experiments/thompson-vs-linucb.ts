/**
 * A/B实验配置: Thompson Sampling vs LinUCB
 *
 * 测试Thompson Sampling相对LinUCB的性能差异
 */

import { ABTestConfig } from '../evaluation/ab-testing';

export const THOMPSON_VS_LINUCB_EXPERIMENT: Omit<ABTestConfig, 'id' | 'startedAt' | 'status'> = {
  name: 'Thompson Sampling vs LinUCB',
  description: '测试Thompson Sampling相对LinUCB的累积奖励表现',
  variants: [
    {
      id: 'control_linucb',
      name: 'LinUCB (对照组)',
      weight: 0.5,
      isControl: true,
      parameters: { algorithm: 'linucb' }
    },
    {
      id: 'treatment_thompson',
      name: 'Thompson Sampling (实验组)',
      weight: 0.5,
      isControl: false,
      parameters: { algorithm: 'thompson' }
    }
  ],
  trafficAllocation: 'even',
  significanceLevel: 0.05,
  minSampleSize: 500,  // 每组至少500个用户
  minimumDetectableEffect: 0.05, // 最小可检测效应5%
  autoDecision: false  // 手动决策，避免自动上线
};

/**
 * 获取实验配置
 */
export function getExperimentConfig() {
  return THOMPSON_VS_LINUCB_EXPERIMENT;
}
