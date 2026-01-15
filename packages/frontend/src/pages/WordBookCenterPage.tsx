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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-6">
        <header className="mb-6">
          <nav className="mb-4 flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-button px-3 py-2 font-medium text-blue-500 transition-all duration-g3-fast hover:scale-105 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" weight="bold" />
              返回
            </button>
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-2 rounded-button px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              <Gear className="h-4 w-4" />
              配置
            </button>
          </nav>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <Books className="h-8 w-8 text-blue-500" weight="duotone" />
            词库中心
          </h1>
          <p className="mt-1 text-base text-gray-600 dark:text-gray-400">浏览和导入外部词书</p>
        </header>

        {needsConfig ? (
          <div className="animate-g3-slide-up py-16 text-center">
            <Warning
              className="mx-auto mb-6 animate-pulse"
              size={96}
              weight="thin"
              color="#eab308"
            />
            <h2 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
              词库中心未配置
            </h2>
            <p className="mb-6 text-base text-gray-600 dark:text-gray-400">
              请先配置词库中心的 URL 以浏览和导入词书
            </p>
            <button
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-2 rounded-button bg-blue-500 px-6 py-3 font-medium text-white shadow-soft transition-all hover:bg-blue-600 hover:shadow-elevated focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Gear className="h-5 w-5" weight="bold" />
              配置词库中心
            </button>
          </div>
        ) : browseLoading ? (
          <div className="flex items-center justify-center py-16">
            <CircleNotch className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : browseError ? (
          <div className="animate-g3-slide-up py-16 text-center">
            <Warning
              className="mx-auto mb-6 animate-pulse"
              size={96}
              weight="thin"
              color="#ef4444"
            />
            <h2 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">加载失败</h2>
            <p className="mb-6 text-base text-gray-600 dark:text-gray-400">
              {browseError instanceof Error ? browseError.message : '无法连接词库中心'}
            </p>
            <button
              onClick={() => refetchBrowse()}
              className="inline-flex items-center gap-2 rounded-button bg-blue-500 px-6 py-3 font-medium text-white shadow-soft transition-all hover:bg-blue-600 hover:shadow-elevated focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索词书..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="搜索词书"
                  className="w-full rounded-button border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
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
              <div className="animate-g3-slide-up py-12 text-center">
                <Books className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">没有找到匹配的词书</p>
              </div>
            ) : (
              <main>
                <div
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
                  aria-label="词书列表"
                >
                  {filteredWordbooks.map((wordbook) => (
                    <CenterWordBookCard
                      key={wordbook.id}
                      wordbook={wordbook}
                      onSelect={setSelectedWordbook}
                    />
                  ))}
                </div>
              </main>
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="config-modal-title"
          >
            <div className="mx-4 w-full max-w-md animate-g3-fade-in rounded-card border border-gray-200/60 bg-white/95 p-6 shadow-elevated backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/95">
              <h2
                id="config-modal-title"
                className="mb-4 text-lg font-bold text-gray-900 dark:text-white"
              >
                配置词库中心
              </h2>
              <div className="mb-4">
                <label
                  htmlFor="config-url-input"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  词库中心 URL
                </label>
                <input
                  id="config-url-input"
                  type="url"
                  value={configUrl}
                  onChange={(e) => setConfigUrl(e.target.value)}
                  placeholder="https://example.com/wordbook-center"
                  className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="rounded-button bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                >
                  取消
                </button>
                <button
                  onClick={() => updateConfigMutation.mutate(configUrl)}
                  disabled={updateConfigMutation.isPending}
                  className="rounded-button bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  {updateConfigMutation.isPending ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ImportProgress status={importStatus.status} message={importStatus.message} />
      </div>
    </div>
  );
}
