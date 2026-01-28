import type { AdminUser } from '../../../stores/adminAuthStore';

const ADMIN_TOKEN_KEY = 'admin_token';

interface AdminLoginResponse {
  success: boolean;
  user: AdminUser;
  token: string;
  expiresAt: string;
}

interface AdminMeResponse {
  success: boolean;
  user: AdminUser;
}

function getBaseUrl(): string {
  return import.meta.env.VITE_API_URL || '';
}

function getToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

async function adminRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${getBaseUrl()}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || body.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<{ user: AdminUser; token: string }> {
  const data = await adminRequest<AdminLoginResponse>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return { user: data.user, token: data.token };
}

export async function adminLogout(): Promise<void> {
  try {
    await adminRequest<void>('/api/admin/auth/logout', { method: 'POST' });
  } catch {
    // ignore logout errors
  }
}

export async function adminGetMe(): Promise<AdminUser> {
  const data = await adminRequest<AdminMeResponse>('/api/admin/auth/me');
  return data.user;
}
