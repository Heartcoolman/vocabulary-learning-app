import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { STORAGE_KEYS } from './constants/storageKeys';
import { initSentry } from './services/sentry';

initSentry();

// 若本地已有 token，优先预加载核心学习页代码，降低首跳 /learning 卡在骨架屏的概率
if (localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)) {
  void import('./pages/LearningPage');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
