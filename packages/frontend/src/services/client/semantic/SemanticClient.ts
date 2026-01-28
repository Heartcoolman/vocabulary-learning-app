import { BaseClient } from '../base/BaseClient';

export interface SemanticWord {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
  distance: number;
}

export interface SemanticSearchResponse {
  words: SemanticWord[];
  query: string;
}

export interface SemanticStatsResponse {
  embeddedCount: number;
  totalCount: number;
  coverage: number;
  model: string;
  dimension: number;
  available: boolean;
}

export interface BatchEmbedResponse {
  count: number;
  model: string;
}

export interface ConfusionPair {
  word1: SemanticWord;
  word2: SemanticWord;
  distance: number;
}

export interface ErrorAnalysisResponse {
  totalErrors: number;
  analyzedWords: number;
  averageDistance: number;
  isClustered: boolean;
  suggestion: string;
}

export interface WordCluster {
  id: string;
  themeLabel: string;
  representativeWord: SemanticWord;
  wordCount: number;
  avgCohesion: number;
}

export interface WordClusterDetail extends WordCluster {
  words: SemanticWord[];
}

export interface HealthCheckResponse {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  model: string;
  cached: boolean;
}

export interface ClusterConfusionCount {
  clusterId: string;
  themeLabel: string;
  pairCount: number;
}

export interface ConfusionCacheStatus {
  totalPairs: number;
  lastUpdated: string | null;
  ready: boolean;
}

export class SemanticClient extends BaseClient {
  /**
   * 语义搜索
   * @param query 搜索查询（中文或英文）
   * @param limit 最大结果数
   * @param wordBookId 可选的词书ID过滤
   */
  async search(
    query: string,
    limit: number = 20,
    wordBookId?: string,
  ): Promise<SemanticSearchResponse> {
    return this.request<SemanticSearchResponse>('/api/semantic/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit, wordBookId }),
    });
  }

  /**
   * 获取相似单词
   * @param wordId 目标单词ID
   * @param limit 最大结果数
   */
  async getSimilarWords(wordId: string, limit: number = 10): Promise<SemanticWord[]> {
    return this.request<SemanticWord[]>(`/api/semantic/similar/${wordId}?limit=${limit}`);
  }

  /**
   * 获取向量统计信息
   */
  async getStats(): Promise<SemanticStatsResponse> {
    return this.request<SemanticStatsResponse>('/api/semantic/stats');
  }

  /**
   * 批量生成向量（管理员）
   * @param limit 每批处理数量
   */
  async batchEmbed(limit: number = 100): Promise<BatchEmbedResponse> {
    return this.request<BatchEmbedResponse>('/api/semantic/batch', {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
  }

  /**
   * 获取易混淆词对
   * @param options 查询选项
   */
  async getConfusionPairs(
    options: {
      wordBookId?: string;
      clusterId?: string;
      threshold?: number;
      pageSize?: number;
      page?: number;
    } = {},
  ): Promise<ConfusionPair[]> {
    const { wordBookId, clusterId, threshold = 0.15, pageSize = 20, page = 1 } = options;
    return this.request<ConfusionPair[]>('/api/semantic/confusion-pairs', {
      method: 'POST',
      body: JSON.stringify({ wordBookId, clusterId, threshold, pageSize, page }),
    });
  }

  /**
   * 获取各聚类的混淆词对数量
   * @param threshold 距离阈值
   */
  async getConfusionByCluster(threshold: number = 0.15): Promise<ClusterConfusionCount[]> {
    return this.request<ClusterConfusionCount[]>(
      `/api/semantic/confusion-by-cluster?threshold=${threshold}`,
    );
  }

  /**
   * 获取混淆词对缓存状态
   */
  async getConfusionCacheStatus(): Promise<ConfusionCacheStatus> {
    return this.request<ConfusionCacheStatus>('/api/semantic/confusion-cache/status');
  }

  /**
   * 获取错题语义分析
   */
  async getErrorAnalysis(): Promise<ErrorAnalysisResponse> {
    return this.request<ErrorAnalysisResponse>('/api/semantic/error-analysis');
  }

  /**
   * 获取所有主题聚类
   */
  async getClusters(): Promise<WordCluster[]> {
    return this.request<WordCluster[]>('/api/semantic/clusters');
  }

  /**
   * 获取聚类详情
   * @param clusterId 聚类ID
   */
  async getClusterDetail(clusterId: string): Promise<WordClusterDetail> {
    return this.request<WordClusterDetail>(`/api/semantic/clusters/${clusterId}`);
  }

  async getHealth(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('/api/semantic/health');
  }
}

export const semanticClient = new SemanticClient();
