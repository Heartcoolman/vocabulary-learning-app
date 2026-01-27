import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminSettingsClient,
  SettingItem,
  semanticClient,
  HealthCheckResponse,
} from '../../services/client';
import {
  Gear,
  FloppyDisk,
  CircleNotch,
  CheckCircle,
  Warning,
  Eye,
  EyeSlash,
  ArrowClockwise,
  Lightning,
} from '../../components/Icon';

interface EmbeddingFormData {
  'embedding.api_key': string;
  'embedding.api_endpoint': string;
  'embedding.model': string;
  'embedding.dimension': string;
  'embedding.timeout_ms': string;
}

const SystemSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<EmbeddingFormData>({
    'embedding.api_key': '',
    'embedding.api_endpoint': '',
    'embedding.model': '',
    'embedding.dimension': '',
    'embedding.timeout_ms': '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    data: settings,
    isPending: isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-settings-embedding'],
    queryFn: () => adminSettingsClient.getEmbeddingSettings(),
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['semantic-stats'],
    queryFn: () => semanticClient.getStats(),
  });

  const {
    data: healthData,
    isFetching: isHealthFetching,
    refetch: refetchHealth,
    isError: isHealthError,
  } = useQuery({
    queryKey: ['semantic-health'],
    queryFn: () => semanticClient.getHealth(),
    staleTime: 60000,
    retry: false,
  });

  useEffect(() => {
    if (settings) {
      const newFormData: Record<string, string> = {};
      settings.forEach((s: SettingItem) => {
        newFormData[s.key] = s.value;
      });
      setFormData((prev) => ({ ...prev, ...newFormData }));
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: EmbeddingFormData) => {
      const updates = Object.entries(data).map(([key, value]) => ({
        key,
        value,
      }));
      return adminSettingsClient.updateEmbeddingSettings(updates);
    },
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['admin-settings-embedding'] });
      queryClient.invalidateQueries({ queryKey: ['semantic-stats'] });
    },
  });

  const batchEmbedMutation = useMutation({
    mutationFn: (limit: number) => semanticClient.batchEmbed(limit),
    onSuccess: () => {
      refetchStats();
    },
  });

  const handleChange = (key: keyof EmbeddingFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const [batchSize, setBatchSize] = useState(500);

  const handleBatchEmbed = () => {
    batchEmbedMutation.mutate(batchSize);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <CircleNotch className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-button border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Warning className="h-5 w-5" />
          <span>加载设置失败</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gear className="h-6 w-6 text-gray-600 dark:text-gray-400" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">系统设置</h1>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-button border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
        >
          <ArrowClockwise className="h-4 w-4" />
          刷新
        </button>
      </div>

      {/* Embedding 配置卡片 */}
      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-6 flex items-center gap-3">
          <Lightning className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">向量搜索配置</h2>
          {stats?.available && (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle className="h-3 w-3" />
              已启用
            </span>
          )}
        </div>

        {/* 服务健康状态 */}
        <div className="flex items-center gap-4 rounded-button bg-gray-50 px-4 py-3 dark:bg-slate-900">
          <span className="text-sm text-gray-500 dark:text-gray-400">服务状态</span>
          {isHealthFetching ? (
            <CircleNotch className="h-4 w-4 animate-spin text-gray-400" />
          ) : isHealthError ? (
            <span
              className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"
              title="网络请求失败"
            >
              <Warning className="h-4 w-4" />
              获取失败
            </span>
          ) : !healthData ? (
            <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
          ) : healthData.healthy ? (
            <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              健康
            </span>
          ) : typeof healthData.error === 'string' && healthData.error.includes('未配置') ? (
            <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              未配置
            </span>
          ) : (
            <span
              className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"
              title={typeof healthData.error === 'string' ? healthData.error : '服务异常'}
            >
              <Warning className="h-4 w-4" />
              异常
            </span>
          )}
          <span className="text-sm text-gray-400 dark:text-gray-500">|</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            延迟: {healthData?.latencyMs != null ? `${healthData.latencyMs}ms` : '—'}
          </span>
          <span className="text-sm text-gray-400 dark:text-gray-500">|</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            模型: {healthData?.model || '—'}
          </span>
          {healthData?.cached != null && (
            <>
              <span className="text-sm text-gray-400 dark:text-gray-500">|</span>
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-slate-700 dark:text-gray-300">
                {healthData.cached ? '缓存' : '实时'}
              </span>
            </>
          )}
          <button
            type="button"
            onClick={() => refetchHealth()}
            disabled={isHealthFetching}
            className="ml-auto text-gray-400 hover:text-gray-600 disabled:opacity-50 dark:hover:text-gray-300"
            title="刷新健康状态"
          >
            <ArrowClockwise className={`h-4 w-4 ${isHealthFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formData['embedding.api_key']}
                onChange={(e) => handleChange('embedding.api_key', e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-button border border-gray-300 bg-white px-4 py-2.5 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showApiKey ? <EyeSlash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              支持 OpenAI 或兼容 API（如 SiliconFlow）的密钥
            </p>
          </div>

          {/* API Endpoint */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Endpoint
            </label>
            <input
              type="text"
              value={formData['embedding.api_endpoint']}
              onChange={(e) => handleChange('embedding.api_endpoint', e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-button border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              API 基础地址，不包含 /embeddings 后缀
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              模型名称
            </label>
            <input
              type="text"
              value={formData['embedding.model']}
              onChange={(e) => handleChange('embedding.model', e.target.value)}
              placeholder="text-embedding-3-small"
              className="w-full rounded-button border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
            />
          </div>

          {/* Dimension & Timeout in a row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                向量维度
              </label>
              <input
                type="number"
                value={formData['embedding.dimension']}
                onChange={(e) => handleChange('embedding.dimension', e.target.value)}
                placeholder="1536"
                className="w-full rounded-button border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                超时时间 (ms)
              </label>
              <input
                type="number"
                value={formData['embedding.timeout_ms']}
                onChange={(e) => handleChange('embedding.timeout_ms', e.target.value)}
                placeholder="60000"
                className="w-full rounded-button border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 rounded-button bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <CircleNotch className="h-4 w-4 animate-spin" />
              ) : (
                <FloppyDisk className="h-4 w-4" />
              )}
              保存配置
            </button>
            {saveSuccess && (
              <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                保存成功
              </span>
            )}
            {saveMutation.isError && (
              <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <Warning className="h-4 w-4" />
                保存失败
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Stats Card */}
      {stats && (
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">向量索引状态</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-900">
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.embeddedCount}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">已索引单词</div>
            </div>
            <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-900">
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.totalCount}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">总单词数</div>
            </div>
            <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-900">
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {(stats.coverage * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">覆盖率</div>
            </div>
            <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-900">
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.dimension}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">向量维度</div>
            </div>
          </div>

          {stats.available && stats.embeddedCount < stats.totalCount && (
            <div className="mt-4 flex items-center gap-3">
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="rounded-button border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value={100}>100 条</option>
                <option value={500}>500 条</option>
                <option value={1000}>1000 条</option>
                <option value={2000}>2000 条</option>
              </select>
              <button
                type="button"
                onClick={handleBatchEmbed}
                disabled={batchEmbedMutation.isPending}
                className="flex items-center gap-2 rounded-button border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30"
              >
                {batchEmbedMutation.isPending ? (
                  <CircleNotch className="h-4 w-4 animate-spin" />
                ) : (
                  <Lightning className="h-4 w-4" />
                )}
                批量生成向量
              </button>
              {batchEmbedMutation.isSuccess && (
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  成功生成 {batchEmbedMutation.data?.count} 条向量
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemSettingsPage;
