/**
 * ErrorPage 组件
 *
 * 通用错误页面组件，支持重试功能
 */
import React, { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { WarningCircle, ArrowsClockwise, House, ArrowLeft } from '@phosphor-icons/react';
import { cn } from '../ui/utils';

export interface ErrorPageProps {
  /** 错误标题 */
  title?: string;
  /** 错误描述 */
  message?: string;
  /** 错误代码 */
  code?: string | number;
  /** 自定义图标 */
  icon?: React.ReactNode;
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 是否显示返回首页按钮 */
  showHome?: boolean;
  /** 是否显示返回上一页按钮 */
  showBack?: boolean;
  /** 重试回调（默认刷新页面） */
  onRetry?: () => void;
  /** 自定义类名 */
  className?: string;
}

export const ErrorPage = memo<ErrorPageProps>(
  ({
    title = '出错了',
    message = '抱歉，页面加载时出现了问题',
    code,
    icon,
    showRetry = true,
    showHome = true,
    showBack = true,
    onRetry,
    className,
  }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const handleRetry = () => {
      if (onRetry) {
        onRetry();
      } else {
        // 默认刷新当前页面
        window.location.reload();
      }
    };

    const handleBack = () => {
      // 如果有上一页历史则返回，否则跳转首页
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/');
      }
    };

    return (
      <div
        className={cn(
          'flex min-h-[60vh] flex-col items-center justify-center px-4 py-16',
          className,
        )}
      >
        <div className="animate-g3-fade-in text-center">
          {/* 图标 */}
          <div className="mb-6">
            {icon || (
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <WarningCircle size={48} className="text-red-500" />
              </div>
            )}
          </div>

          {/* 错误代码 */}
          {code && (
            <div className="mb-2 font-mono text-6xl font-bold text-gray-200 dark:text-gray-700">
              {code}
            </div>
          )}

          {/* 标题 */}
          <h1 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>

          {/* 描述 */}
          <p className="mb-8 max-w-md text-gray-600 dark:text-gray-400">{message}</p>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {showRetry && (
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
              >
                <ArrowsClockwise size={18} />
                重试
              </button>
            )}

            {showBack && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 rounded-button border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 active:scale-95 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
              >
                <ArrowLeft size={18} />
                返回
              </button>
            )}

            {showHome && (
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 rounded-button border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 active:scale-95 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
              >
                <House size={18} />
                返回首页
              </button>
            )}
          </div>

          {/* 当前路径提示（调试用） */}
          <p className="mt-8 text-xs text-gray-400 dark:text-gray-600">
            当前路径: {location.pathname}
          </p>
        </div>
      </div>
    );
  },
);

ErrorPage.displayName = 'ErrorPage';

/**
 * NotFoundPage - 404页面
 */
export const NotFoundPage = memo(() => (
  <ErrorPage
    code="404"
    title="页面不存在"
    message="您访问的页面可能已被移除、名称已更改或暂时不可用"
    showRetry={false}
  />
));

NotFoundPage.displayName = 'NotFoundPage';

/**
 * ServerErrorPage - 500服务器错误页面
 */
export const ServerErrorPage = memo(() => (
  <ErrorPage code="500" title="服务器错误" message="服务器遇到了问题，请稍后再试" />
));

ServerErrorPage.displayName = 'ServerErrorPage';

/**
 * NetworkErrorPage - 网络错误页面
 */
export const NetworkErrorPage = memo(() => (
  <ErrorPage title="网络错误" message="无法连接到服务器，请检查您的网络连接" />
));

NetworkErrorPage.displayName = 'NetworkErrorPage';
