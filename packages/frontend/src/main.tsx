import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { STORAGE_KEYS } from './constants/storageKeys';
import { initSentry } from './services/sentry';
import { isTauriEnvironment } from './utils/tauri-bridge';

// 桌面模式：遥测由用户设置控制，延迟到 useDesktopSettings 中处理
// Web 模式：直接初始化 Sentry
if (!isTauriEnvironment()) {
  initSentry();
}

// 若本地已有 token，优先预加载核心学习页代码，降低首跳 /learning 卡在骨架屏的概率
if (localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)) {
  void import('./pages/LearningPage');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
