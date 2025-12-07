import { useWords, useCreateWord, useDeleteWord } from '../../hooks/queries/useWords';

/**
 * React Query 使用示例组件
 *
 * 演示如何使用 useQuery 和 useMutation hooks
 */
export function WordListExample() {
  // 使用 useQuery hook 获取数据
  const { data: words, isLoading, isError, error } = useWords();

  // 使用 useMutation hooks 执行操作
  const createWordMutation = useCreateWord();
  const deleteWordMutation = useDeleteWord();

  // 处理创建单词
  const handleCreateWord = async () => {
    try {
      await createWordMutation.mutateAsync({
        word: 'example',
        translation: '示例',
        wordbookId: 'default-wordbook-id',
      });
      console.log('单词创建成功！');
    } catch (err) {
      console.error('创建失败：', err);
    }
  };

  // 处理删除单词
  const handleDeleteWord = async (id: string) => {
    try {
      await deleteWordMutation.mutateAsync(id);
      console.log('单词删除成功！');
    } catch (err) {
      console.error('删除失败：', err);
    }
  };

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  // 错误状态
  if (isError) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-red-600">
          加载失败: {error instanceof Error ? error.message : '未知错误'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">单词列表</h2>
        <button
          onClick={handleCreateWord}
          disabled={createWordMutation.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createWordMutation.isPending ? '创建中...' : '创建示例单词'}
        </button>
      </div>

      {/* 显示 mutation 状态 */}
      {createWordMutation.isError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">
          创建失败:{' '}
          {createWordMutation.error instanceof Error
            ? createWordMutation.error.message
            : '未知错误'}
        </div>
      )}

      {createWordMutation.isSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-green-700">创建成功！</div>
      )}

      {/* 单词列表 */}
      <div className="space-y-3">
        {words && words.length > 0 ? (
          words.map((word) => (
            <div
              key={word.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{word.word}</h3>
                <p className="text-gray-600">{word.translation}</p>
              </div>
              <button
                onClick={() => handleDeleteWord(word.id)}
                disabled={deleteWordMutation.isPending}
                className="rounded bg-red-100 px-3 py-1 text-sm text-red-700 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteWordMutation.isPending ? '删除中...' : '删除'}
              </button>
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-gray-500">暂无单词数据</div>
        )}
      </div>

      {/* React Query 特性说明 */}
      <div className="mt-8 rounded-lg bg-blue-50 p-4">
        <h3 className="mb-2 font-semibold text-blue-900">React Query 特性演示：</h3>
        <ul className="space-y-1 text-sm text-blue-800">
          <li>✅ 自动缓存：数据会被缓存，避免重复请求</li>
          <li>✅ 加载状态：自动管理 loading、error、success 状态</li>
          <li>✅ 乐观更新：mutation 成功后自动刷新相关查询</li>
          <li>✅ 窗口聚焦重新请求：可配置（当前已禁用）</li>
          <li>✅ 失败重试：自动重试失败的请求（当前配置为 1 次）</li>
        </ul>
      </div>
    </div>
  );
}
