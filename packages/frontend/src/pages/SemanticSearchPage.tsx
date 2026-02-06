import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass } from '../components/Icon';
import { Spinner } from '../components/ui';
import { useSemanticSearch } from '../hooks/queries/useSemanticSearch';
import { useSemanticStats } from '../hooks/queries/useSemanticStats';
import { useWordBooks } from '../hooks/queries/useWordBooks';

export default function SemanticSearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [wordBookId, setWordBookId] = useState('all');

  const { stats } = useSemanticStats();
  const { data: wordBooks = [], isLoading: isWordBooksLoading } = useWordBooks(
    { type: 'all' },
    { enabled: stats?.available ?? false },
  );

  const { results, isLoading, debouncedQuery } = useSemanticSearch({
    query,
    limit: 20,
    wordBookId: wordBookId === 'all' ? undefined : wordBookId,
    enabled: stats?.available ?? false,
    debounceMs: 500,
  });

  if (!stats?.available) {
    return (
      <div className="min-h-screen animate-g3-fade-in bg-gray-50 px-4 py-8 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-gray-600 dark:text-gray-400">向量服务不可用，无法使用此功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen animate-g3-fade-in bg-gray-50 px-4 py-8 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-all hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            aria-label="返回"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">语义搜索</h1>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="relative lg:col-span-2">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlass size={20} className="text-gray-400" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入单词或中文含义..."
              className="w-full rounded-button border border-gray-200 bg-white py-3 pl-10 pr-4 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
            />
          </div>

          <select
            value={wordBookId}
            onChange={(e) => setWordBookId(e.target.value)}
            className="h-full w-full rounded-button border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
            disabled={isWordBooksLoading}
          >
            <option value="all">全部词书</option>
            {wordBooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.type === 'SYSTEM' ? '系统' : '我的'} · {book.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="xl" color="primary" />
          </div>
        ) : debouncedQuery.trim() === '' ? (
          <div className="rounded-card border border-gray-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="text-gray-600 dark:text-gray-400">请输入关键词开始搜索</p>
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-card border border-gray-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="text-gray-600 dark:text-gray-400">未找到相关单词</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((word) => {
              const similarity = Math.max(0, Math.round((1 - word.distance) * 100));
              return (
                <div
                  key={word.id}
                  className="rounded-card border border-gray-200 bg-white p-4 transition-all hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {word.spelling}
                      </h3>
                      {word.phonetic && (
                        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
                          /{word.phonetic}/
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <span
                        className={`text-xs font-bold ${
                          similarity >= 80
                            ? 'text-green-600 dark:text-green-400'
                            : similarity >= 60
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {similarity}%
                      </span>
                      <span className="text-[10px] text-gray-400">相似度</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {word.meanings.slice(0, 2).map((meaning, idx) => (
                      <p
                        key={idx}
                        className="line-clamp-1 text-sm text-gray-700 dark:text-gray-300"
                      >
                        {meaning}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
