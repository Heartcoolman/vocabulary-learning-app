/**
 * 摄像头权限请求组件
 *
 * 处理摄像头权限请求流程：
 * - 权限说明
 * - 隐私声明
 * - 请求/重试按钮
 */

import { memo, useState } from 'react';
import type { CameraPermissionStatus } from '@danci/shared';

interface CameraPermissionRequestProps {
  /** 当前权限状态 */
  permissionStatus: CameraPermissionStatus;
  /** 请求权限回调 */
  onRequestPermission: () => Promise<CameraPermissionStatus>;
  /** 跳过/关闭回调 */
  onSkip?: () => void;
  /** 是否显示详细隐私说明 */
  showPrivacyDetails?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 权限状态图标
 */
function PermissionIcon({ status }: { status: CameraPermissionStatus }) {
  switch (status) {
    case 'granted':
      return (
        <svg
          className="h-12 w-12 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'denied':
      return (
        <svg
          className="h-12 w-12 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      );
    case 'unavailable':
      return (
        <svg
          className="h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      );
    default:
      return (
        <svg
          className="h-12 w-12 text-blue-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
  }
}

/**
 * 摄像头权限请求组件
 */
function CameraPermissionRequestComponent({
  permissionStatus,
  onRequestPermission,
  onSkip,
  showPrivacyDetails = true,
  className = '',
}: CameraPermissionRequestProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      await onRequestPermission();
    } finally {
      setIsRequesting(false);
    }
  };

  // 已授权
  if (permissionStatus === 'granted') {
    return (
      <div
        className={`rounded-lg border border-green-200 bg-green-50 p-4 text-center ${className}`}
      >
        <PermissionIcon status="granted" />
        <p className="mt-2 font-medium text-green-700">摄像头权限已授予</p>
        <p className="mt-1 text-sm text-green-600">视觉疲劳检测已启用</p>
      </div>
    );
  }

  // 已拒绝
  if (permissionStatus === 'denied') {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
        <div className="flex flex-col items-center text-center">
          <PermissionIcon status="denied" />
          <p className="mt-2 font-medium text-red-700">摄像头权限被拒绝</p>
          <p className="mt-1 text-sm text-red-600">
            请在浏览器设置中允许访问摄像头，然后刷新页面重试
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleRequest}
              disabled={isRequesting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              重试
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                跳过
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 不可用
  if (permissionStatus === 'unavailable') {
    return (
      <div className={`rounded-lg border border-gray-200 bg-gray-50 p-4 ${className}`}>
        <div className="flex flex-col items-center text-center">
          <PermissionIcon status="unavailable" />
          <p className="mt-2 font-medium text-gray-700">摄像头不可用</p>
          <p className="mt-1 text-sm text-gray-600">您的设备没有摄像头或浏览器不支持摄像头访问</p>
          {onSkip && (
            <button
              onClick={onSkip}
              className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              继续使用行为检测
            </button>
          )}
        </div>
      </div>
    );
  }

  // 未请求（默认状态）
  return (
    <div className={`rounded-lg border border-blue-200 bg-blue-50 p-4 ${className}`}>
      <div className="flex flex-col items-center text-center">
        <PermissionIcon status="not_requested" />
        <h3 className="mt-2 font-medium text-blue-800">启用视觉疲劳检测</h3>
        <p className="mt-1 text-sm text-blue-700">使用摄像头检测眼睛状态，更准确地评估疲劳程度</p>

        {/* 隐私说明 */}
        {showPrivacyDetails && (
          <div className="mt-3 w-full">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex w-full items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <svg
                className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              隐私说明
            </button>

            {showDetails && (
              <div className="mt-2 rounded-md bg-white p-3 text-left text-xs text-gray-600">
                <ul className="list-inside list-disc space-y-1">
                  <li>所有视觉处理在您的设备本地进行</li>
                  <li>视频画面不会上传到服务器</li>
                  <li>仅上传疲劳度数值，不包含任何图像</li>
                  <li>您可以随时关闭此功能</li>
                  <li>数据仅用于优化您的学习体验</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleRequest}
            disabled={isRequesting}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isRequesting ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                请求中...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                允许摄像头访问
              </>
            )}
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              暂不启用
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const CameraPermissionRequest = memo(CameraPermissionRequestComponent);
export default CameraPermissionRequest;
