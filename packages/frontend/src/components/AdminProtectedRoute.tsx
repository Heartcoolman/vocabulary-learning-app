import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuthStore } from '../stores/adminAuthStore';
import { adminGetMe } from '../services/client/admin/AdminAuthClient';
import { Spinner } from './ui';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

export default function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { user, token, isAuthenticated, setAuth, clearAuth } = useAdminAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      // Already authenticated with user info
      if (isAuthenticated && user) {
        setChecking(false);
        return;
      }

      // No token stored
      if (!token) {
        setChecking(false);
        return;
      }

      // Token exists but no user info - verify with backend
      try {
        const adminUser = await adminGetMe();
        setAuth(adminUser, token);
      } catch {
        clearAuth();
      } finally {
        setChecking(false);
      }
    };

    verifyToken();
  }, [token, isAuthenticated, user, setAuth, clearAuth]);

  if (checking) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center bg-white dark:bg-slate-900">
        <div className="text-center" role="status" aria-live="polite">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-slate-300">正在验证管理员身份...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
}
