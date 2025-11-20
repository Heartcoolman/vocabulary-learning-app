import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StorageService from './services/StorageService';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import SyncIndicator from './components/SyncIndicator';
import MigrationPrompt from './components/MigrationPrompt';
import LearningPage from './pages/LearningPage';
import VocabularyPage from './pages/VocabularyPage';
import HistoryPage from './pages/HistoryPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';

/**
 * AppContent - 应用主内容（需要在AuthProvider内部）
 */
function AppContent() {
  const { isAuthenticated, showMigrationPrompt, dismissMigrationPrompt } = useAuth();

  return (
    <>
      <div className="min-h-screen bg-white">
        <Navigation />
        <main role="main">
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            
            {/* 受保护的路由 */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <LearningPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vocabulary"
              element={
                <ProtectedRoute>
                  <VocabularyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <HistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            
            {/* 404重定向 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* 同步状态指示器（仅登录时显示） */}
      {isAuthenticated && <SyncIndicator />}

      {/* 数据迁移提示 */}
      {showMigrationPrompt && (
        <MigrationPrompt
          onComplete={dismissMigrationPrompt}
          onSkip={dismissMigrationPrompt}
        />
      )}
    </>
  );
}

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    // 初始化数据库
    const init = async () => {
      try {
        await StorageService.init();
        console.log('应用初始化完成');
        setIsInitialized(true);
      } catch (error) {
        console.error('应用初始化失败:', error);
        setInitError(error instanceof Error ? error.message : '初始化失败');
      }
    };

    init();
  }, []);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center animate-fade-in">
        <div className="text-center">
          {initError ? (
            <div role="alert" aria-live="assertive">
              <div className="text-red-500 text-5xl mb-4" aria-hidden="true">⚠️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">初始化失败</h2>
              <p className="text-gray-600 mb-6">{initError}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                刷新页面
              </button>
            </div>
          ) : (
            <div role="status" aria-live="polite">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">应用正在初始化...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
