/**
 * Version Management Tests
 * 版本管理系统单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelRegistry,
  InMemoryModelStorage,
  VersionManager,
  createDefaultRegistry
} from '../../../src/amas/versioning';

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = createDefaultRegistry();
  });

  describe('版本注册', () => {
    it('应该成功注册新版本', async () => {
      const version = await registry.register('linucb', { alpha: 0.5, lambda: 1.0 }, {
        description: 'Test model',
        tags: ['test']
      });

      expect(version).toBeDefined();
      expect(version.id).toBeTruthy();
      expect(version.modelType).toBe('linucb');
      expect(version.status).toBe('draft');
      expect(version.parameters.alpha).toBe(0.5);
    });

    it('应该生成唯一的版本ID', async () => {
      const v1 = await registry.register('linucb', {});
      const v2 = await registry.register('linucb', {});

      expect(v1.id).not.toBe(v2.id);
    });

    it('应该包含父版本ID', async () => {
      const parent = await registry.register('linucb', {});
      const child = await registry.register('linucb', {}, {
        parentId: parent.id
      });

      expect(child.parentId).toBe(parent.id);
    });
  });

  describe('版本激活', () => {
    it('应该激活指定版本', async () => {
      const version = await registry.register('linucb', {});
      await registry.activate(version.id);

      const active = await registry.getActive();
      expect(active?.id).toBe(version.id);
      expect(active?.status).toBe('active');
    });

    it('应该将旧版本设为deprecated', async () => {
      const v1 = await registry.register('linucb', {});
      const v2 = await registry.register('linucb', {});

      await registry.activate(v1.id);
      await registry.activate(v2.id);

      const oldVersion = await registry.get(v1.id);
      expect(oldVersion?.status).toBe('deprecated');
    });
  });

  describe('版本查询', () => {
    it('应该通过ID获取版本', async () => {
      const version = await registry.register('linucb', { alpha: 0.5 });
      const retrieved = await registry.get(version.id);

      expect(retrieved?.id).toBe(version.id);
      expect(retrieved?.parameters.alpha).toBe(0.5);
    });

    it('应该列出所有版本', async () => {
      await registry.register('linucb', {});
      await registry.register('xgboost', {});
      await registry.register('neural', {});

      const versions = await registry.list();
      expect(versions).toHaveLength(3);
    });

    it('应该按状态过滤', async () => {
      const v1 = await registry.register('linucb', {});
      await registry.register('linucb', {});
      await registry.activate(v1.id);

      const activeVersions = await registry.list({ status: 'active' });
      expect(activeVersions).toHaveLength(1);
      expect(activeVersions[0].id).toBe(v1.id);
    });

    it('应该按模型类型过滤', async () => {
      await registry.register('linucb', {});
      await registry.register('linucb', {});
      await registry.register('xgboost', {});

      const linucbVersions = await registry.list({ modelType: 'linucb' });
      expect(linucbVersions).toHaveLength(2);
    });

    it('应该支持分页', async () => {
      for (let i = 0; i < 10; i++) {
        await registry.register('linucb', {});
      }

      const page1 = await registry.list({ limit: 5, offset: 0 });
      const page2 = await registry.list({ limit: 5, offset: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('指标更新', () => {
    it('应该更新版本指标', async () => {
      const version = await registry.register('linucb', {});
      await registry.updateMetrics(version.id, {
        sampleCount: 100,
        averageReward: 0.85,
        accuracy: 0.92
      });

      const updated = await registry.get(version.id);
      expect(updated?.metrics.sampleCount).toBe(100);
      expect(updated?.metrics.averageReward).toBe(0.85);
      expect(updated?.metrics.accuracy).toBe(0.92);
    });
  });

  describe('版本删除和归档', () => {
    it('应该归档版本', async () => {
      const version = await registry.register('linucb', {});
      await registry.archive(version.id);

      const archived = await registry.get(version.id);
      expect(archived?.status).toBe('archived');
    });

    it('应该删除非活跃版本', async () => {
      const version = await registry.register('linucb', {});
      const deleted = await registry.delete(version.id);

      expect(deleted).toBe(true);
      const retrieved = await registry.get(version.id);
      expect(retrieved).toBeNull();
    });

    it('不应该删除活跃版本', async () => {
      const version = await registry.register('linucb', {});
      await registry.activate(version.id);

      await expect(registry.delete(version.id)).rejects.toThrow('Cannot delete active version');
    });
  });
});

describe('VersionManager', () => {
  let registry: ModelRegistry;
  let manager: VersionManager;

  beforeEach(() => {
    registry = createDefaultRegistry();
    manager = new VersionManager(registry);
  });

  describe('版本比较', () => {
    it('应该比较两个版本的性能', async () => {
      const baseline = await registry.register('linucb', {});
      const candidate = await registry.register('linucb', {});

      await registry.updateMetrics(baseline.id, {
        sampleCount: 1000,
        averageReward: 0.75
      });

      await registry.updateMetrics(candidate.id, {
        sampleCount: 1000,
        averageReward: 0.85
      });

      const comparison = await manager.compare(baseline.id, candidate.id);

      expect(comparison.baseline.id).toBe(baseline.id);
      expect(comparison.candidate.id).toBe(candidate.id);
      expect(comparison.metricsDiff.averageReward).toBeCloseTo(0.10, 2);
      expect(comparison.improvement.averageReward).toBeGreaterThan(0);
    });

    it('应该判断显著改进', async () => {
      const baseline = await registry.register('linucb', {});
      const candidate = await registry.register('linucb', {});

      await registry.updateMetrics(baseline.id, {
        sampleCount: 200,
        averageReward: 0.70
      });

      await registry.updateMetrics(candidate.id, {
        sampleCount: 200,
        averageReward: 0.80 // 14%改进
      });

      const comparison = await manager.compare(baseline.id, candidate.id);

      expect(comparison.isSignificant).toBe(true);
      expect(comparison.recommendation).toBe('rollout');
    });

    it('应该推荐回滚当性能下降', async () => {
      const baseline = await registry.register('linucb', {});
      const candidate = await registry.register('linucb', {});

      await registry.updateMetrics(baseline.id, {
        sampleCount: 200,
        averageReward: 0.80
      });

      await registry.updateMetrics(candidate.id, {
        sampleCount: 200,
        averageReward: 0.65 // 负面影响
      });

      const comparison = await manager.compare(baseline.id, candidate.id);

      expect(comparison.improvement.averageReward).toBeLessThan(0);
      expect(comparison.recommendation).toBe('rollback');
    });
  });

  describe('版本回滚', () => {
    it('应该回滚到指定版本', async () => {
      const v1 = await registry.register('linucb', {});
      const v2 = await registry.register('linucb', {});

      await registry.activate(v2.id);
      await manager.rollback({
        targetVersionId: v1.id,
        reason: 'Performance regression'
      });

      const active = await registry.getActive();
      expect(active?.id).toBe(v1.id);
    });
  });

  describe('灰度发布', () => {
    it('应该启动灰度发布', async () => {
      const v1 = await registry.register('linucb', {});
      const v2 = await registry.register('linucb', {});

      await registry.activate(v1.id);
      await manager.startCanary({
        versionId: v2.id,
        trafficPercentage: 0.1,
        durationSeconds: 60,
        successCriteria: {
          minSamples: 100,
          minImprovement: 0.05,
          maxErrorRate: 0.05
        },
        autoRollback: true
      });

      const status = manager.getCanaryStatus();
      expect(status).toBeDefined();
      expect(status?.status).toBe('running');
      expect(status?.currentTraffic).toBe(0.1);
    });

    it('应该根据流量比例分配请求', async () => {
      const v1 = await registry.register('linucb', {});
      const v2 = await registry.register('linucb', {});

      await registry.activate(v1.id);
      await manager.startCanary({
        versionId: v2.id,
        trafficPercentage: 0.5,
        durationSeconds: 60,
        successCriteria: {
          minSamples: 10,
          minImprovement: 0.05,
          maxErrorRate: 0.1
        },
        autoRollback: false
      });

      // 测试1000次,大约500次应该使用灰度版本
      let canaryCount = 0;
      for (let i = 0; i < 1000; i++) {
        if (manager.shouldUseCanary()) {
          canaryCount++;
        }
      }

      expect(canaryCount).toBeGreaterThan(400);
      expect(canaryCount).toBeLessThan(600);
    });

    it('应该更新灰度发布指标', async () => {
      const v1 = await registry.register('linucb', {});
      const v2 = await registry.register('linucb', {});

      await registry.activate(v1.id);
      await manager.startCanary({
        versionId: v2.id,
        trafficPercentage: 0.1,
        durationSeconds: 1,
        successCriteria: {
          minSamples: 10,
          minImprovement: 0.05,
          maxErrorRate: 0.1
        },
        autoRollback: false
      });

      manager.updateCanaryMetrics({
        sampleCount: 50,
        averageReward: 0.85
      });

      const status = manager.getCanaryStatus();
      expect(status?.samplesCollected).toBe(50);
      expect(status?.canaryMetrics.averageReward).toBe(0.85);
    });

    it('应该完成成功的灰度发布', async () => {
      const v1 = await registry.register('linucb', {});
      const v2 = await registry.register('linucb', {});

      await registry.activate(v1.id);
      await manager.startCanary({
        versionId: v2.id,
        trafficPercentage: 0.1,
        durationSeconds: 1,
        successCriteria: {
          minSamples: 10,
          minImprovement: 0.05,
          maxErrorRate: 0.1
        },
        autoRollback: false
      });

      await manager.completeCanary(true);

      const status = manager.getCanaryStatus();
      const active = await registry.getActive();

      expect(status?.status).toBe('success');
      expect(active?.id).toBe(v2.id);
    });
  });
});
