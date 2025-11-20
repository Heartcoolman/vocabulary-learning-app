import { useState } from 'react';
import StorageService from '../services/StorageService';

interface MigrationPromptProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * MigrationPrompt - 数据迁移提示组件
 * 引导用户将本地数据迁移到云端
 */
export default function MigrationPrompt({ onComplete, onSkip }: MigrationPromptProps) {
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ words: number; records: number } | null>(null);

  const handleMigrate = async () => {
    try {
      setIsMigrating(true);
      setError(null);
      
      const result = await StorageService.migrateToCloud();
      setResult(result);
      
      // 切换到混合模式
      StorageService.setMode('hybrid');
      
      // 延迟一下让用户看到结果
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '迁移失败';
      setError(errorMessage);
      setIsMigrating(false);
    }
  };

  const handleSkip = () => {
    // 切换到混合模式但不迁移
    StorageService.setMode('hybrid');
    onSkip();
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md mx-4">
          <div className="text-center">
            <div className="text-green-500 text-6xl mb-4 animate-bounce" aria-hidden="true">✓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">迁移完成！</h2>
            <p className="text-gray-600 mb-4">
              成功迁移 {result.words} 个单词和 {result.records} 条学习记录
            </p>
            <p className="text-sm text-gray-500">
              你的数据现在已经安全地保存在云端
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md mx-4">
        <div className="text-center mb-6">
          <div className="text-blue-500 text-5xl mb-4" aria-hidden="true">☁️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            将数据同步到云端
          </h2>
          <p className="text-gray-600">
            我们检测到你有本地数据。是否要将这些数据迁移到云端？
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-green-500 text-xl mt-0.5" aria-hidden="true">✓</div>
            <div>
              <p className="font-medium text-gray-900">多设备访问</p>
              <p className="text-sm text-gray-600">在任何设备上访问你的词库</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="text-green-500 text-xl mt-0.5" aria-hidden="true">✓</div>
            <div>
              <p className="font-medium text-gray-900">数据安全</p>
              <p className="text-sm text-gray-600">云端备份，永不丢失</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="text-green-500 text-xl mt-0.5" aria-hidden="true">✓</div>
            <div>
              <p className="font-medium text-gray-900">自动同步</p>
              <p className="text-sm text-gray-600">实时同步学习进度</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleMigrate}
            disabled={isMigrating}
            className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMigrating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                正在迁移...
              </span>
            ) : (
              '开始迁移'
            )}
          </button>
          
          <button
            onClick={handleSkip}
            disabled={isMigrating}
            className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            稍后再说
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500 text-center">
          你可以随时在个人资料页面进行数据迁移
        </p>
      </div>
    </div>
  );
}
