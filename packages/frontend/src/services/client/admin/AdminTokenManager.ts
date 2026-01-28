const ADMIN_TOKEN_KEY = 'admin_token';

/**
 * AdminTokenManager - 管理员令牌管理
 *
 * 与普通用户的 TokenManager 分离，使用独立的存储键 `admin_token`
 */
class AdminTokenManager {
  private static instance: AdminTokenManager;
  private token: string | null = null;

  private constructor() {
    this.loadToken();
  }

  static getInstance(): AdminTokenManager {
    if (!AdminTokenManager.instance) {
      AdminTokenManager.instance = new AdminTokenManager();
    }
    return AdminTokenManager.instance;
  }

  private loadToken(): void {
    this.token = localStorage.getItem(ADMIN_TOKEN_KEY);
  }

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.loadToken();
    }
    return this.token;
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }

  hasValidToken(): boolean {
    return !!this.getToken();
  }
}

export default AdminTokenManager;
