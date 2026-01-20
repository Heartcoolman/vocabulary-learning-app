import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './AdminApp';
import './index.css';
import { initSentry } from './services/sentry';

initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
