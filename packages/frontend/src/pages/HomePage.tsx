import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LandingPage from './LandingPage';

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-label="加载中"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="sr-only">加载中...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/learning" replace />;
  }

  return <LandingPage />;
}
