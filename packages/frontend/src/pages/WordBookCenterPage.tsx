import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  wordBookCenterClient,
  CenterWordBook,
  CenterWordBookDetail as DetailType,
} from '../services/client';
import {
  CenterWordBookCard,
  CenterWordBookDetail,
  TagFilter,
  ImportProgress,
} from '../components/wordbook-center';
import { useToast } from '../components/ui';
import { Books, CircleNotch, Gear, MagnifyingGlass, Warning, ArrowLeft } from '../components/Icon';
import { useNavigate } from 'react-router-dom';

export default function WordBookCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWordbook, setSelectedWordbook] = useState<CenterWordBook | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configUrl, setConfigUrl] = useState('');
  const [importStatus, setImportStatus] = useState<{
    status: 'idle' | 'importing' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
  } = useQuery({
    queryKey: ['wordbook-center', 'config'],
    queryFn: () => wordBookCenterClient.getConfig(),
  });

  const {
    data: browseData,
    isLoading: browseLoading,
    error: browseError,
    refetch: refetchBrowse,
  } = useQuery({
    queryKey: ['wordbook-center', 'browse'],
    queryFn: () => wordBookCenterClient.browse(),
    enabled: !!config?.centerUrl,
  });

  const {
    data: wordbookDetail,
    isLoading: detailLoading,
    error: detailError,
  } = useQuery({
    queryKey: ['wordbook-center', 'detail', selectedWordbook?.id],
    queryFn: () =>
      selectedWordbook ? wordBookCenterClient.getWordBookDetail(selectedWordbook.id) : null,
    enabled: !!selectedWordbook,
  });

  const updateConfigMutation = useMutation({
    mutationFn: (url: string) => wordBookCenterClient.updateConfig(url),
    onSuccess: () => {
      showToast('success', '词库中心配置已更新');
      queryClient.invalidateQueries({ queryKey: ['wordbook-center'] });
      setShowConfigModal(false);
    },
    onError: (error) => {
      showToast('error', error instanceof Error ? error.message : '配置更新失败');
    },
  });

  useEffect(() => {
    if (config?.centerUrl) {
      setConfigUrl(config.centerUrl);
    }
  }, [config]);

  const allTags = useMemo(() => {
    if (!browseData?.wordbooks) return [];
    const tagSet = new Set<string>();
    browseData.wordbooks.forEach((wb) => wb.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [browseData]);

  const filteredWordbooks = useMemo(() => {
    if (!browseData?.wordbooks) return [];
    return browseData.wordbooks.filter((wb) => {
      const matchesTags =
        selectedTags.length === 0 || selectedTags.some((tag) => wb.tags.includes(tag));
      const matchesSearch =
        !searchQuery ||
        wb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wb.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTags && matchesSearch;
    });
  }, [browseData, selectedTags, searchQuery]);

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleImportSuccess = () => {
    setImportStatus({ status: 'success', message: '词书导入成功' });
    setTimeout(() => setImportStatus({ status: 'idle' }), 3000);
    queryClient.invalidateQueries({ queryKey: ['wordbooks'] });
  };

  const needsConfig = !configLoading && (!config?.centerUrl || config.centerUrl === '');

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
              <Books className="h-7 w-7 text-indigo-600" />
              词库中心
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">浏览和导入外部词书</p>
          </div>
        </div>
        <button
          onClick={() => setShowConfigModal(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
        >
          <Gear className="h-4 w-4" />
          配置
        </button>
      </div>

      {needsConfig ? (
        <div className="py-16 text-center">
          <Warning className="mx-auto mb-4 h-16 w-16 text-yellow-500" />
          <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
            词库中心未配置
          </h2>
          <p className="mb-6 text-gray-500 dark:text-gray-400">请先配置词库中心的URL</p>
          <button
            onClick={() => setShowConfigModal(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700"
          >
            配置词库中心
          </button>
        </div>
      ) : browseLoading ? (
        <div className="flex items-center justify-center py-16">
          <CircleNotch className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : browseError ? (
        <div className="py-16 text-center">
          <Warning className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">加载失败</h2>
          <p className="mb-6 text-gray-500 dark:text-gray-400">
            {browseError instanceof Error ? browseError.message : '无法连接词库中心'}
          </p>
          <button
            onClick={() => refetchBrowse()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700"
          >
            重试
          </button>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索词书..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <TagFilter
            allTags={allTags}
            selectedTags={selectedTags}
            onTagToggle={handleTagToggle}
            onClearAll={() => setSelectedTags([])}
          />

          {filteredWordbooks.length === 0 ? (
            <div className="py-12 text-center">
              <Books className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400">没有找到匹配的词书</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredWordbooks.map((wordbook) => (
                <CenterWordBookCard
                  key={wordbook.id}
                  wordbook={wordbook}
                  onSelect={setSelectedWordbook}
                />
              ))}
            </div>
          )}
        </>
      )}

      <CenterWordBookDetail
        detail={wordbookDetail ?? null}
        isOpen={!!selectedWordbook}
        isLoading={detailLoading}
        error={detailError instanceof Error ? detailError.message : null}
        onClose={() => setSelectedWordbook(null)}
        onImportSuccess={handleImportSuccess}
      />

      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              配置词库中心
            </h2>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                词库中心 URL
              </label>
              <input
                type="url"
                value={configUrl}
                onChange={(e) => setConfigUrl(e.target.value)}
                placeholder="https://example.com/wordbook-center"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfigModal(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
              >
                取消
              </button>
              <button
                onClick={() => updateConfigMutation.mutate(configUrl)}
                disabled={updateConfigMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {updateConfigMutation.isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportProgress status={importStatus.status} message={importStatus.message} />
    </div>
  );
}
