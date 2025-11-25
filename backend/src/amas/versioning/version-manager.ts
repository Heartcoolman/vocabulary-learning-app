/**
 * Version Manager - 版本管理器
 * 负责版本比较、回滚和灰度发布
 */

import { ModelRegistry } from './model-registry';
import {
  ModelVersion,
  VersionComparison,
  RollbackOptions,
  CanaryConfig,
  CanaryStatus,
  ModelMetrics
} from './types';

/**
 * 版本管理器
 */
export class VersionManager {
  private registry: ModelRegistry;
  private canaryStatus: CanaryStatus | null = null;

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  /**
   * 比较两个版本
   */
  async compare(baselineId: string, candidateId: string): Promise<VersionComparison> {
    const baseline = await this.registry.get(baselineId);
    const candidate = await this.registry.get(candidateId);

    if (!baseline || !candidate) {
      throw new Error('Version not found');
    }

    // 计算指标差异
    const metricsDiff: VersionComparison['metricsDiff'] = {
      averageReward: candidate.metrics.averageReward - baseline.metrics.averageReward
    };

    if (baseline.metrics.accuracy !== undefined && candidate.metrics.accuracy !== undefined) {
      metricsDiff.accuracy = candidate.metrics.accuracy - baseline.metrics.accuracy;
    }

    if (baseline.metrics.ctr !== undefined && candidate.metrics.ctr !== undefined) {
      metricsDiff.ctr = candidate.metrics.ctr - baseline.metrics.ctr;
    }

    // 计算改进百分比
    const improvement: VersionComparison['improvement'] = {
      averageReward: this.calculateImprovement(
        baseline.metrics.averageReward,
        candidate.metrics.averageReward
      )
    };

    if (baseline.metrics.accuracy !== undefined && candidate.metrics.accuracy !== undefined) {
      improvement.accuracy = this.calculateImprovement(
        baseline.metrics.accuracy,
        candidate.metrics.accuracy
      );
    }

    if (baseline.metrics.ctr !== undefined && candidate.metrics.ctr !== undefined) {
      improvement.ctr = this.calculateImprovement(baseline.metrics.ctr, candidate.metrics.ctr);
    }

    // 判断是否显著改进
    const isSignificant = this.isSignificantImprovement(baseline, candidate);

    // 生成推荐
    const recommendation = this.generateRecommendation(improvement, isSignificant, baseline, candidate);

    return {
      baseline,
      candidate,
      metricsDiff,
      improvement,
      isSignificant,
      recommendation
    };
  }

  /**
   * 回滚到指定版本
   */
  async rollback(options: RollbackOptions): Promise<void> {
    const targetVersion = await this.registry.get(options.targetVersionId);
    if (!targetVersion) {
      throw new Error(`Target version ${options.targetVersionId} not found`);
    }

    console.log(`[VersionManager] Rolling back to version ${targetVersion.version}`);
    console.log(`[VersionManager] Reason: ${options.reason}`);

    if (options.immediate !== false) {
      // 立即激活目标版本
      await this.registry.activate(options.targetVersionId);
    }

    // 如果有灰度发布正在进行,终止它
    if (this.canaryStatus && this.canaryStatus.status === 'running') {
      this.canaryStatus.status = 'rolled_back';
      this.canaryStatus.failureReason = options.reason;
    }

    // 记录回滚事件 (可扩展: 发送通知)
    if (options.notifyChannels && options.notifyChannels.length > 0) {
      console.log(`[VersionManager] Notifying channels: ${options.notifyChannels.join(', ')}`);
    }
  }

  /**
   * 开始灰度发布
   */
  async startCanary(config: CanaryConfig): Promise<void> {
    const version = await this.registry.get(config.versionId);
    if (!version) {
      throw new Error(`Version ${config.versionId} not found`);
    }

    const activeVersion = await this.registry.getActive();
    if (!activeVersion) {
      throw new Error('No active version found');
    }

    this.canaryStatus = {
      config,
      startedAt: new Date(),
      status: 'running',
      currentTraffic: config.trafficPercentage,
      samplesCollected: 0,
      canaryMetrics: {
        sampleCount: 0,
        averageReward: 0
      },
      baselineMetrics: { ...activeVersion.metrics }
    };

    console.log(
      `[VersionManager] Started canary for version ${version.version} at ${config.trafficPercentage * 100}% traffic`
    );
  }

  /**
   * 更新灰度发布状态
   */
  updateCanaryMetrics(metrics: ModelMetrics): void {
    if (!this.canaryStatus || this.canaryStatus.status !== 'running') {
      return;
    }

    this.canaryStatus.canaryMetrics = metrics;
    this.canaryStatus.samplesCollected = metrics.sampleCount;

    // 检查是否达到成功条件
    if (this.shouldCompleteCanary()) {
      this.completeCanary();
    }
  }

  /**
   * 获取灰度发布状态
   */
  getCanaryStatus(): CanaryStatus | null {
    return this.canaryStatus ? { ...this.canaryStatus } : null;
  }

  /**
   * 判断是否应该使用灰度版本
   */
  shouldUseCanary(): boolean {
    if (!this.canaryStatus || this.canaryStatus.status !== 'running') {
      return false;
    }

    // 根据流量比例随机决定
    return Math.random() < this.canaryStatus.currentTraffic;
  }

  /**
   * 手动完成灰度发布
   */
  async completeCanary(success: boolean = true): Promise<void> {
    if (!this.canaryStatus || this.canaryStatus.status !== 'running') {
      throw new Error('No canary deployment in progress');
    }

    if (success) {
      // 激活灰度版本
      await this.registry.activate(this.canaryStatus.config.versionId);
      this.canaryStatus.status = 'success';
      console.log(`[VersionManager] Canary deployment successful`);
    } else {
      // 回滚
      this.canaryStatus.status = 'failed';
      console.log(`[VersionManager] Canary deployment failed`);

      if (this.canaryStatus.config.autoRollback) {
        const activeVersion = await this.registry.getActive();
        if (activeVersion) {
          console.log(`[VersionManager] Auto-rolling back to ${activeVersion.version}`);
        }
      }
    }
  }

  /**
   * 计算改进百分比
   */
  private calculateImprovement(baseline: number, candidate: number): number {
    if (baseline === 0) return candidate > 0 ? Infinity : 0;
    return ((candidate - baseline) / Math.abs(baseline)) * 100;
  }

  /**
   * 判断是否显著改进
   */
  private isSignificantImprovement(baseline: ModelVersion, candidate: ModelVersion): boolean {
    // 简单的启发式规则: 改进>5%且样本数>100
    const improvement = this.calculateImprovement(
      baseline.metrics.averageReward,
      candidate.metrics.averageReward
    );

    return improvement > 5 && candidate.metrics.sampleCount >= 100;
  }

  /**
   * 生成推荐
   */
  private generateRecommendation(
    improvement: VersionComparison['improvement'],
    isSignificant: boolean,
    baseline: ModelVersion,
    candidate: ModelVersion
  ): VersionComparison['recommendation'] {
    // 如果有显著改进,推荐rollout
    if (isSignificant && improvement.averageReward > 5) {
      return 'rollout';
    }

    // 如果有负面影响,推荐rollback
    if (improvement.averageReward < -5) {
      return 'rollback';
    }

    // 样本数不足,继续测试
    if (candidate.metrics.sampleCount < 100) {
      return 'continue_testing';
    }

    // 默认: 继续测试
    return 'continue_testing';
  }

  /**
   * 判断是否应该完成灰度发布
   */
  private shouldCompleteCanary(): boolean {
    if (!this.canaryStatus || this.canaryStatus.status !== 'running') {
      return false;
    }

    const { config, canaryMetrics, baselineMetrics, samplesCollected } = this.canaryStatus;

    // 检查最小样本数
    if (samplesCollected < config.successCriteria.minSamples) {
      return false;
    }

    // 检查改进率
    const improvement = this.calculateImprovement(
      baselineMetrics.averageReward,
      canaryMetrics.averageReward
    );

    if (improvement < config.successCriteria.minImprovement) {
      // 未达到改进要求
      if (config.autoRollback) {
        this.canaryStatus.status = 'failed';
        this.canaryStatus.failureReason = 'Improvement below threshold';
      }
      return false;
    }

    // 检查错误率 (如果有)
    // 这里简化处理,实际应该从监控系统获取

    // 检查持续时间
    const elapsed = Date.now() - this.canaryStatus.startedAt.getTime();
    if (elapsed < config.durationSeconds * 1000) {
      return false;
    }

    return true;
  }
}

/**
 * 创建默认版本管理器
 */
export function createDefaultVersionManager(registry: ModelRegistry): VersionManager {
  return new VersionManager(registry);
}
