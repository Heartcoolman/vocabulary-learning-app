import { useState, useEffect, useRef } from 'react';
import StorageService, { SyncStatus } from '../services/StorageService';
import { Check, X } from './Icon';

/**
 * SyncIndicator - 同步状态指示器
 * 显示数据同步状态和进度
 */
export default function SyncIndicator() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(StorageService.getSyncStatus());
  const [showDetails, setShowDetails] = useState(false);
  const [showSuccessIcon, setShowSuccessIcon] = useState(false);
  const [showErrorIcon, setShowErrorIcon] = useState(false);
  const successTimerRef = useRef<number | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const prevSyncingRef = useRef(syncStatus.isSyncing);

  useEffect(() => {
    // 订阅同步状态变化
    const unsubscribe = StorageService.onSyncStatusChange((status) => {
      setSyncStatus(status);
      
      // 检测同步完成
      if (prevSyncingRef.current && !status.isSyncing) {
        if (status.error) {
          // 同步失败，显示红色叉号
          setShowErrorIcon(true);
          setShowSuccessIcon(false);
          
          // 清除之前的定时器
          if (errorTimerRef.current) {
            clearTimeout(errorTimerRef.current);
          }
          
          // 3秒后隐藏错误图标
          errorTimerRef.current = window.setTimeout(() => {
            setShowErrorIcon(false);
          }, 3000);
        } else {
          // 同步成功，显示绿色对劲
          setShowSuccessIcon(true);
          setShowErrorIcon(false);
          
          // 清除之前的定时器
          if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
          }
          
          // 3秒后隐藏成功图标
          successTimerRef.current = window.setTimeout(() => {
            setShowSuccessIcon(false);
          }, 3000);
        }
      }
      
      prevSyncingRef.current = status.isSyncing;
    });
    
    return () => {
      unsubscribe();
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  // 如果没有待同步的变更且没有错误，且没有显示成功/失败图标，不显示
  if (!syncStatus.isSyncing && syncStatus.pendingChanges === 0 && !syncStatus.error && !showSuccessIcon && !showErrorIcon) {
    return null;
  }

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '从未同步';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}小时前`;
    
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white/90 backdrop-blur-md border border-gray-200/50 rounded-lg shadow-lg p-4 max-w-sm animate-g3-fade-in">
        {/* 主状态 */}
        <div 
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setShowDetails(!showDetails)}
        >
          {syncStatus.isSyncing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              <span className="text-sm font-medium text-gray-900">正在同步...</span>
            </>
          ) : showSuccessIcon ? (
            <>
              <Check size={24} weight="bold" className="text-green-500 animate-g3-fade-in" />
              <span className="text-sm font-medium text-green-600 animate-g3-fade-in">同步成功</span>
            </>
          ) : showErrorIcon ? (
            <>
              <X size={24} weight="bold" className="text-red-500 animate-g3-fade-in" />
              <span className="text-sm font-medium text-red-600 animate-g3-fade-in">同步失败</span>
            </>
          ) : syncStatus.error ? (
            <>
              <X size={20} weight="bold" className="text-red-500" />
              <span className="text-sm font-medium text-red-600">同步失败</span>
            </>
          ) : syncStatus.pendingChanges > 0 ? (
            <>
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-900">
                {syncStatus.pendingChanges} 个待同步
              </span>
            </>
          ) : (
            <>
              <Check size={20} weight="bold" className="text-green-500" />
              <span className="text-sm font-medium text-green-600">已同步</span>
            </>
          )}
          
          <button
            className="ml-auto text-gray-400 hover:text-gray-600"
            aria-label={showDetails ? '隐藏详情' : '显示详情'}
          >
            <svg 
              className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* 详细信息 */}
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 animate-g3-fade-in">
            {syncStatus.error && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                {syncStatus.error}
              </div>
            )}
            
            <div className="text-xs text-gray-600">
              <div className="flex justify-between">
                <span>最后同步</span>
                <span className="font-medium">{formatTime(syncStatus.lastSyncTime)}</span>
              </div>
              
              {syncStatus.pendingChanges > 0 && (
                <div className="flex justify-between mt-1">
                  <span>待同步</span>
                  <span className="font-medium">{syncStatus.pendingChanges} 项</span>
                </div>
              )}
            </div>

            {syncStatus.error && (
              <button
                onClick={async () => {
                  // 触发同步，状态会通过 onSyncStatusChange 回调自动更新
                  // 按钮会在 isSyncing 变为 true 时显示 loading 状态
                  try {
                    await StorageService.syncToCloud();
                  } catch (err) {
                    console.error('手动同步失败:', err);
                    // 同步失败会触发 onSyncStatusChange，显示错误图标
                  }
                }}
                disabled={syncStatus.isSyncing}
                className={`w-full px-3 py-1.5 text-white text-xs rounded transition-colors ${
                  syncStatus.isSyncing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {syncStatus.isSyncing ? '同步中...' : '重试同步'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
