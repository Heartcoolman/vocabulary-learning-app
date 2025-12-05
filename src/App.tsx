import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import SyncIndicator from './components/SyncIndicator';

// 核心页面 - 同步导入（首屏必需）
import LearningPage from './pages/LearningPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// 懒加载 - 其他用户页面
const VocabularyPage = lazy(() => import('./pages/VocabularyPage'));
const WordBookDetailPage = lazy(() => import('./pages/WordBookDetailPage'));
const StudySettingsPage = lazy(() => import('./pages/StudySettingsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage'));
const WordListPage = lazy(() => import('./pages/WordListPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const BatchImportPage = lazy(() => import('./pages/BatchImportPage'));
const WordMasteryPage = lazy(() => import('./pages/WordMasteryPage'));
const HabitProfilePage = lazy(() => import('./pages/HabitProfilePage'));
const TodayWordsPage = lazy(() => import('./pages/TodayWordsPage'));
const StudyProgressPage = lazy(() => import('./pages/StudyProgressPage'));
const LearningObjectivesPage = lazy(() => import('./pages/LearningObjectivesPage'));

// 懒加载 - AMAS 增强功能页面
const LearningTimePage = lazy(() => import('./pages/LearningTimePage'));
const TrendReportPage = lazy(() => import('./pages/TrendReportPage'));
const AchievementPage = lazy(() => import('./pages/AchievementPage'));
const BadgeGalleryPage = lazy(() => import('./pages/BadgeGalleryPage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const LearningProfilePage = lazy(() => import('./pages/LearningProfilePage'));

// 懒加载 - 管理员页面
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const UserDetailPage = lazy(() => import('./pages/admin/UserDetailPage'));
const WordDetailPage = lazy(() => import('./pages/admin/WordDetailPage'));
const AdminWordBooks = lazy(() => import('./pages/admin/AdminWordBooks'));
const AlgorithmConfigPage = lazy(() => import('./pages/admin/AlgorithmConfigPage'));
const ConfigHistoryPage = lazy(() => import('./pages/admin/ConfigHistoryPage'));
const ExperimentDashboard = lazy(() => import('./pages/admin/ExperimentDashboard'));
const LogViewerPage = lazy(() => import('./pages/admin/LogViewerPage'));
const LogAlertsPage = lazy(() => import('./pages/admin/LogAlertsPage'));
const OptimizationDashboard = lazy(() => import('./pages/admin/OptimizationDashboard'));
const CausalInferencePage = lazy(() => import('./pages/admin/CausalInferencePage'));
const LLMAdvisorPage = lazy(() => import('./pages/admin/LLMAdvisorPage'));
const AMASExplainabilityPage = lazy(() => import('./pages/admin/AMASExplainabilityPage'));

// 懒加载 - AMAS 公开展示页面（About）
const AboutLayout = lazy(() => import('./pages/about/AboutLayout'));
const AboutHomePage = lazy(() => import('./pages/about/AboutHomePage'));
const SimulationPage = lazy(() => import('./pages/about/SimulationPage'));
const DashboardPage = lazy(() => import('./pages/about/DashboardPage'));
const StatsPage = lazy(() => import('./pages/about/StatsPage'));
const SystemStatusPage = lazy(() => import('./pages/about/SystemStatusPage'));

// 页面加载组件
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

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
            {/* 公开路由 - 核心页面（同步加载） */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* AMAS 公开展示路由（无需登录）- 懒加载 */}
            <Route path="/about" element={
              <Suspense fallback={<PageLoader />}>
                <AboutLayout />
              </Suspense>
            }>
              <Route index element={
                <Suspense fallback={<PageLoader />}>
                  <AboutHomePage />
                </Suspense>
              } />
              <Route path="simulation" element={
                <Suspense fallback={<PageLoader />}>
                  <SimulationPage />
                </Suspense>
              } />
              <Route path="dashboard" element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardPage />
                </Suspense>
              } />
              <Route path="stats" element={
                <Suspense fallback={<PageLoader />}>
                  <StatsPage />
                </Suspense>
              } />
              <Route path="system-status" element={
                <Suspense fallback={<PageLoader />}>
                  <SystemStatusPage />
                </Suspense>
              } />
            </Route>

            {/* 受保护的路由 - 核心页面（同步加载） */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <LearningPage />
                </ProtectedRoute>
              }
            />

            {/* 受保护的路由 - 懒加载页面 */}
            <Route
              path="/vocabulary"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <VocabularyPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/wordbooks/:id"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <WordBookDetailPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/study-settings"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <StudySettingsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/learning-objectives"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <LearningObjectivesPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <HistoryPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/statistics"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <StatisticsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/word-list"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <WordListPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <ProfilePage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/today-words"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <TodayWordsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/progress"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <StudyProgressPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* AMAS 增强功能路由 - 懒加载 */}
            <Route
              path="/learning-time"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <LearningTimePage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/trend-report"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <TrendReportPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/achievements"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <AchievementPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/badges"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <BadgeGalleryPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/plan"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <PlanPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/word-mastery"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <WordMasteryPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/habit-profile"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <HabitProfilePage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/learning-profile"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <LearningProfilePage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* 管理员后台路由 - 懒加载 */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<PageLoader />}>
                    <AdminLayout />
                  </Suspense>
                </ProtectedRoute>
              }
            >
              <Route index element={
                <Suspense fallback={<PageLoader />}>
                  <AdminDashboard />
                </Suspense>
              } />
              <Route path="users" element={
                <Suspense fallback={<PageLoader />}>
                  <UserManagementPage />
                </Suspense>
              } />
              <Route path="users/:userId" element={
                <Suspense fallback={<PageLoader />}>
                  <UserDetailPage />
                </Suspense>
              } />
              <Route path="users/:userId/words" element={
                <Suspense fallback={<PageLoader />}>
                  <WordDetailPage />
                </Suspense>
              } />
              <Route path="wordbooks" element={
                <Suspense fallback={<PageLoader />}>
                  <AdminWordBooks />
                </Suspense>
              } />
              <Route path="batch-import" element={
                <Suspense fallback={<PageLoader />}>
                  <BatchImportPage />
                </Suspense>
              } />
              <Route path="algorithm-config" element={
                <Suspense fallback={<PageLoader />}>
                  <AlgorithmConfigPage />
                </Suspense>
              } />
              <Route path="config-history" element={
                <Suspense fallback={<PageLoader />}>
                  <ConfigHistoryPage />
                </Suspense>
              } />
              <Route path="experiments" element={
                <Suspense fallback={<PageLoader />}>
                  <ExperimentDashboard />
                </Suspense>
              } />
              <Route path="logs" element={
                <Suspense fallback={<PageLoader />}>
                  <LogViewerPage />
                </Suspense>
              } />
              <Route path="log-alerts" element={
                <Suspense fallback={<PageLoader />}>
                  <LogAlertsPage />
                </Suspense>
              } />
              <Route path="optimization" element={
                <Suspense fallback={<PageLoader />}>
                  <OptimizationDashboard />
                </Suspense>
              } />
              <Route path="causal-analysis" element={
                <Suspense fallback={<PageLoader />}>
                  <CausalInferencePage />
                </Suspense>
              } />
              <Route path="llm-advisor" element={
                <Suspense fallback={<PageLoader />}>
                  <LLMAdvisorPage />
                </Suspense>
              } />
              <Route path="amas-explainability" element={
                <Suspense fallback={<PageLoader />}>
                  <AMASExplainabilityPage />
                </Suspense>
              } />
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
