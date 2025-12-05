import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui';
import { router } from './router';

/**
 * App - 应用根组件
 *
 * 使用新的数据路由 API（createBrowserRouter + RouterProvider）
 * 路由配置已拆分到 src/router/ 目录下的独立文件中
 */
function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
