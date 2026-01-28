import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const ADMIN_TOKEN_KEY = 'admin_token';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  permissions: string[];
}

interface AdminAuthState {
  user: AdminUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;

  setAuth: (user: AdminUser, token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  init: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  devtools(
    (set) => ({
      user: null,
      token: null,
      loading: true,
      isAuthenticated: false,

      setAuth: (user, token) => {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
        set({ user, token, isAuthenticated: true, loading: false }, false, 'setAuth');
      },

      clearAuth: () => {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        set(
          { user: null, token: null, isAuthenticated: false, loading: false },
          false,
          'clearAuth',
        );
      },

      setLoading: (loading) => set({ loading }, false, 'setLoading'),

      init: () => {
        const token = localStorage.getItem(ADMIN_TOKEN_KEY);
        if (token) {
          set({ token, loading: true }, false, 'init');
        } else {
          set({ loading: false }, false, 'init');
        }
      },
    }),
    { name: 'AdminAuth Store', enabled: import.meta.env.DEV },
  ),
);
