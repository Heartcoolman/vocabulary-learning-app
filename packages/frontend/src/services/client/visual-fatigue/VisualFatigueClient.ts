/**
 * VisualFatigueClient - 视觉疲劳检测相关 API
 *
 * 职责：
 * - 上报视觉疲劳指标
 * - 获取/更新用户基线
 * - 获取配置
 * - 获取融合疲劳结果
 */

import { BaseClient } from '../base/BaseClient';
import type {
  VisualFatigueInput,
  VisualFatigueConfig,
  PersonalBaseline,
  FusedFatigueResult,
} from '@danci/shared';

/**
 * 上报指标响应
 */
interface SubmitMetricsResponse {
  success: boolean;
  data: {
    processed: {
      score: number;
      confidence: number;
      isValid: boolean;
    };
    fusion: {
      fusedFatigue: number;
      visualFatigue: number;
      behaviorFatigue: number;
      fatigueLevel: 'alert' | 'mild' | 'moderate' | 'severe';
      recommendations: string[];
    };
  };
}

/**
 * 基线响应
 */
interface BaselineResponse {
  success: boolean;
  data: {
    hasBaseline: boolean;
    baseline: PersonalBaseline | null;
    baselineType: string;
    avgVisualFatigue?: number;
    recordCount?: number;
  };
}

/**
 * 配置响应
 */
interface ConfigResponse {
  success: boolean;
  data: VisualFatigueConfig;
}

/**
 * 融合结果响应
 */
interface FusionResponse {
  success: boolean;
  data: {
    hasData: boolean;
    fusion: {
      fusedFatigue: number;
      visualFatigue: number;
      behaviorFatigue: number;
      temporalFatigue: number;
      fatigueLevel: 'alert' | 'mild' | 'moderate' | 'severe';
      hasConflict: boolean;
      conflictDescription?: string;
      recommendations: string[];
    } | null;
    visual: {
      score: number;
      perclos: number;
      blinkRate: number;
      confidence: number;
    } | null;
    trend: number;
  };
}

/**
 * 视觉疲劳 API 客户端
 */
export class VisualFatigueClient extends BaseClient {
  /**
   * 上报视觉疲劳指标
   * @param metrics 视觉疲劳指标数据
   */
  async submitMetrics(metrics: VisualFatigueInput): Promise<SubmitMetricsResponse['data']> {
    // BaseClient.request() 已经返回 data.data，无需再次访问 .data
    return await this.request<SubmitMetricsResponse['data']>('/api/visual-fatigue/metrics', {
      method: 'POST',
      body: JSON.stringify(metrics),
    });
  }

  /**
   * 获取用户基线
   */
  async getBaseline(): Promise<BaselineResponse['data']> {
    // BaseClient.request() 已经返回 data.data，无需再次访问 .data
    return await this.request<BaselineResponse['data']>('/api/visual-fatigue/baseline');
  }

  /**
   * 更新用户基线
   * @param baseline 基线数据
   */
  async updateBaseline(baseline: PersonalBaseline): Promise<void> {
    await this.request('/api/visual-fatigue/baseline', {
      method: 'POST',
      body: JSON.stringify(baseline),
    });
  }

  /**
   * 获取视觉疲劳检测配置
   */
  async getConfig(): Promise<VisualFatigueConfig> {
    // BaseClient.request() 已经返回 data.data，无需再次访问 .data
    return await this.request<VisualFatigueConfig>('/api/visual-fatigue/config');
  }

  /**
   * 更新视觉疲劳检测配置
   * @param config 配置项（enabled, detectionFps, uploadIntervalMs 等）
   */
  async updateConfig(
    config: Partial<{
      enabled: boolean;
      detectionFps: number;
      uploadIntervalMs: number;
      vlmAnalysisEnabled: boolean;
    }>,
  ): Promise<void> {
    await this.request('/api/visual-fatigue/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  /**
   * 获取最新融合疲劳结果
   */
  async getFusion(): Promise<FusionResponse['data']> {
    // BaseClient.request() 已经返回 data.data，无需再次访问 .data
    return await this.request<FusionResponse['data']>('/api/visual-fatigue/fusion');
  }

  /**
   * 重置视觉疲劳数据
   */
  async reset(): Promise<void> {
    await this.request('/api/visual-fatigue/reset', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * 批量上报视觉疲劳指标（用于离线缓存上传）
   * @param metricsList 指标列表
   */
  async submitMetricsBatch(metricsList: VisualFatigueInput[]): Promise<void> {
    // 逐个上报，避免后端实现复杂化
    for (const metrics of metricsList) {
      await this.submitMetrics(metrics);
    }
  }
}

// 导出单例
export const visualFatigueClient = new VisualFatigueClient();
export default visualFatigueClient;
