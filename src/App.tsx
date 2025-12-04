import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import SyncIndicator from './components/SyncIndicator';
import LearningPage from './pages/LearningPage';
import VocabularyPage from './pages/VocabularyPage';
import WordBookDetailPage from './pages/WordBookDetailPage';
import StudySettingsPage from './pages/StudySettingsPage';
import HistoryPage from './pages/HistoryPage';
import StatisticsPage from './pages/StatisticsPage';
import WordListPage from './pages/WordListPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import BatchImportPage from './pages/BatchImportPage';
import WordMasteryPage from './pages/WordMasteryPage';
import HabitProfilePage from './pages/HabitProfilePage';
import TodayWordsPage from './pages/TodayWordsPage';
import StudyProgressPage from './pages/StudyProgressPage';
import LearningObjectivesPage from './pages/LearningObjectivesPage';
// AMAS 增强功能页面
import LearningTimePage from './pages/LearningTimePage';
import TrendReportPage from './pages/TrendReportPage';
import AchievementPage from './pages/AchievementPage';
import PlanPage from './pages/PlanPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagementPage from './pages/admin/UserManagementPage';
import UserDetailPage from './pages/admin/UserDetailPage';
import WordDetailPage from './pages/admin/WordDetailPage';
import AdminWordBooks from './pages/admin/AdminWordBooks';
import AlgorithmConfigPage from './pages/admin/AlgorithmConfigPage';
import ConfigHistoryPage from './pages/admin/ConfigHistoryPage';
import ExperimentDashboard from './pages/admin/ExperimentDashboard';
import LogViewerPage from './pages/admin/LogViewerPage';
// AMAS 公开展示页面
import AboutLayout from './pages/about/AboutLayout';
import AboutHomePage from './pages/about/AboutHomePage';
import SimulationPage from './pages/about/SimulationPage';
import DashboardPage from './pages/about/DashboardPage';
import StatsPage from './pages/about/StatsPage';

/**
 * AppContent - 应用主内容（需要在AuthProvider内部）
 */
function AppContent() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // /about 路由使用独立布局，不显示主导航栏
  const isAboutRoute = location.pathname.startsWith('/about');

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {!isAboutRoute && <Navigation />}
        <main role="main" className={isAboutRoute ? '' : 'pt-[72px]'}>
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* AMAS 公开展示路由（无需登录） */}
            <Route path="/about" element={<AboutLayout />}>
              <Route index element={<AboutHomePage />} />
              <Route path="simulation" element={<SimulationPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="stats" element={<StatsPage />} />
            </Route>

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
              path="/wordbooks/:id"
              element={
                <ProtectedRoute>
                  <WordBookDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/study-settings"
              element={
                <ProtectedRoute>
                  <StudySettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/learning-objectives"
              element={
                <ProtectedRoute>
                  <LearningObjectivesPage />
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
              path="/statistics"
              element={
                <ProtectedRoute>
                  <StatisticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/word-list"
              element={
                <ProtectedRoute>
                  <WordListPage />
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
            <Route
              path="/today-words"
              element={
                <ProtectedRoute>
                  <TodayWordsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/progress"
              element={
                <ProtectedRoute>
                  <StudyProgressPage />
                </ProtectedRoute>
              }
            />

            {/* AMAS 增强功能路由 */}
            <Route
              path="/learning-time"
              element={
                <ProtectedRoute>
                  <LearningTimePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trend-report"
              element={
                <ProtectedRoute>
                  <TrendReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/achievements"
              element={
                <ProtectedRoute>
                  <AchievementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/plan"
              element={
                <ProtectedRoute>
                  <PlanPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/word-mastery"
              element={
                <ProtectedRoute>
                  <WordMasteryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/habit-profile"
              element={
                <ProtectedRoute>
                  <HabitProfilePage />
                </ProtectedRoute>
              }
            />

            {/* 管理员后台路由 */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="users/:userId" element={<UserDetailPage />} />
              <Route path="users/:userId/words" element={<WordDetailPage />} />
              <Route path="wordbooks" element={<AdminWordBooks />} />
              <Route path="batch-import" element={<BatchImportPage />} />
              <Route path="algorithm-config" element={<AlgorithmConfigPage />} />
              <Route path="config-history" element={<ConfigHistoryPage />} />
              <Route path="experiments" element={<ExperimentDashboard />} />
              <Route path="logs" element={<LogViewerPage />} />
            </Route>

            {/* 404重定向 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* 同步状态指示器（仅登录时显示） */}
      {isAuthenticated && <SyncIndicator />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
