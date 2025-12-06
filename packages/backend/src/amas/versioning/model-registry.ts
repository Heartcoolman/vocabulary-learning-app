/**
 * Model Registry - 模型注册中心
 * 负责模型版本的存储、检索和管理
 */

import { ModelVersion, ModelMetrics } from './types';

/**
 * 模型存储接口
 */
export interface ModelStorage {
  /** 保存模型版本 */
  save(version: ModelVersion): Promise<void>;
  /** 加载模型版本 */
  load(versionId: string): Promise<ModelVersion | null>;
  /** 列出所有版本 */
  list(filters?: ModelListFilters): Promise<ModelVersion[]>;
  /** 删除版本 */
  delete(versionId: string): Promise<boolean>;
  /** 更新版本状态 */
  updateStatus(versionId: string, status: ModelVersion['status']): Promise<void>;
  /** 更新版本指标 */
  updateMetrics(versionId: string, metrics: ModelMetrics): Promise<void>;
}

/**
 * 版本列表过滤器
 */
export interface ModelListFilters {
  modelType?: ModelVersion['modelType'];
  status?: ModelVersion['status'];
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * 内存模型存储实现
 */
export class InMemoryModelStorage implements ModelStorage {
  private versions: Map<string, ModelVersion> = new Map();

  async save(version: ModelVersion): Promise<void> {
    this.versions.set(version.id, { ...version });
  }

  async load(versionId: string): Promise<ModelVersion | null> {
    const version = this.versions.get(versionId);
    return version ? { ...version } : null;
  }

  async list(filters?: ModelListFilters): Promise<ModelVersion[]> {
    let results = Array.from(this.versions.values());

    // 应用过滤器
    if (filters?.modelType) {
      results = results.filter(v => v.modelType === filters.modelType);
    }
    if (filters?.status) {
      results = results.filter(v => v.status === filters.status);
    }
    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter(v => filters.tags!.some(tag => v.tags.includes(tag)));
    }

    // 按创建时间降序排序
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 分页
    if (filters?.offset !== undefined) {
      results = results.slice(filters.offset);
    }
    if (filters?.limit !== undefined) {
      results = results.slice(0, filters.limit);
    }

    return results.map(v => ({ ...v }));
  }

  async delete(versionId: string): Promise<boolean> {
    return this.versions.delete(versionId);
  }

  async updateStatus(versionId: string, status: ModelVersion['status']): Promise<void> {
    const version = this.versions.get(versionId);
    if (version) {
      version.status = status;
    }
  }

  async updateMetrics(versionId: string, metrics: ModelMetrics): Promise<void> {
    const version = this.versions.get(versionId);
    if (version) {
      version.metrics = { ...metrics };
    }
  }

  /** 清空所有版本 (测试用) */
  clear(): void {
    this.versions.clear();
  }
}

/**
 * 模型注册中心
 */
export class ModelRegistry {
  private storage: ModelStorage;
  private activeVersionId: string | null = null;

  constructor(storage?: ModelStorage) {
    this.storage = storage || new InMemoryModelStorage();
  }

  /**
   * 注册新版本
   */
  async register(
    modelType: ModelVersion['modelType'],
    parameters: Record<string, any>,
    options?: {
      version?: string;
      description?: string;
      tags?: string[];
      parentId?: string;
    }
  ): Promise<ModelVersion> {
    const id = this.generateVersionId();
    const version: ModelVersion = {
      id,
      version: options?.version || this.generateSemanticVersion(),
      modelType,
      createdAt: new Date(),
      parameters,
      metrics: {
        sampleCount: 0,
        averageReward: 0
      },
      tags: options?.tags || [],
      description: options?.description,
      parentId: options?.parentId,
      status: 'draft'
    };

    await this.storage.save(version);
    return version;
  }

  /**
   * 激活版本
   */
  async activate(versionId: string): Promise<void> {
    // 将当前活跃版本设为deprecated
    if (this.activeVersionId) {
      await this.storage.updateStatus(this.activeVersionId, 'deprecated');
    }

    // 激活新版本
    await this.storage.updateStatus(versionId, 'active');
    this.activeVersionId = versionId;
  }

  /**
   * 获取活跃版本
   */
  async getActive(): Promise<ModelVersion | null> {
    if (!this.activeVersionId) {
      // 尝试从存储中查找活跃版本
      const versions = await this.storage.list({ status: 'active', limit: 1 });
      if (versions.length > 0) {
        this.activeVersionId = versions[0].id;
        return versions[0];
      }
      return null;
    }
    return this.storage.load(this.activeVersionId);
  }

  /**
   * 获取版本
   */
  async get(versionId: string): Promise<ModelVersion | null> {
    return this.storage.load(versionId);
  }

  /**
   * 列出版本
   */
  async list(filters?: ModelListFilters): Promise<ModelVersion[]> {
    return this.storage.list(filters);
  }

  /**
   * 更新版本指标
   */
  async updateMetrics(versionId: string, metrics: Partial<ModelMetrics>): Promise<void> {
    const version = await this.storage.load(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    const updatedMetrics: ModelMetrics = {
      ...version.metrics,
      ...metrics
    };

    await this.storage.updateMetrics(versionId, updatedMetrics);
  }

  /**
   * 归档版本
   */
  async archive(versionId: string): Promise<void> {
    await this.storage.updateStatus(versionId, 'archived');
  }

  /**
   * 删除版本
   */
  async delete(versionId: string): Promise<boolean> {
    if (versionId === this.activeVersionId) {
      throw new Error('Cannot delete active version');
    }
    return this.storage.delete(versionId);
  }

  /**
   * 生成版本ID
   */
  private generateVersionId(): string {
    return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成语义化版本号
   */
  private generateSemanticVersion(): string {
    const now = new Date();
    const major = now.getFullYear();
    const minor = now.getMonth() + 1;
    const patch = now.getDate();
    return `${major}.${minor}.${patch}`;
  }
}

/**
 * 创建默认模型注册中心
 */
export function createDefaultRegistry(): ModelRegistry {
  return new ModelRegistry(new InMemoryModelStorage());
}
