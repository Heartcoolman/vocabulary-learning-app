import { apiLogger } from '../../../utils/logger';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { env } from '../../../config/env';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * JWT解码后的payload结构
 */
interface JwtPayload {
  userId: string;
  exp: number;
  iat: number;
}

/**
 * base64url 解码（JWT 使用 base64url 编码，与标准 base64 不同）
 * base64url 使用 - 和 _ 替代 + 和 /，且不使用填充符 =
 */
function base64UrlDecode(input: string): string {
  // 将 base64url 转换为标准 base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // 添加填充符
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return atob(padded);
}

/**
 * 解码JWT token（不验证签名，仅用于读取payload）
 */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * 检查JWT token是否已过期
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return true;

  // exp是秒级时间戳，需要转换为毫秒
  return payload.exp * 1000 < Date.now();
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * TokenManager - JWT令牌管理单例
 *
 * 职责：
 * - 管理JWT令牌的存储和检索
 * - 验证令牌有效性
 * - 提供令牌生命周期管理
 *
 * 安全注意事项：
 * - JWT存储在localStorage中，存在XSS攻击风险
 * - 生产环境建议使用httpOnly cookie存储token（需要后端支持）
 * - 当前实现仅在客户端验证token过期时间，不验证签名
 *
 * 缓解措施：
 * - 设置较短的token过期时间
 * - 实现token刷新机制
 * - 确保应用有充分的XSS防护
 */
class TokenManager {
  private static instance: TokenManager;
  private token: string | null = null;
  private refreshTimer: number | null = null;
  private refreshPromise: Promise<string> | null = null;
  private readonly STORAGE_KEY = STORAGE_KEYS.AUTH_TOKEN;
  private readonly REFRESH_THRESHOLD = 5 * 60 * 1000;

  private constructor() {
    this.loadToken();
  }

  /**
   * 获取TokenManager单例实例
   */
  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  /**
   * 从localStorage加载token并验证有效性
   */
  private loadToken(): void {
    const storedToken = localStorage.getItem(this.STORAGE_KEY);
    if (storedToken) {
      if (isTokenExpired(storedToken)) {
        apiLogger.warn('存储的token已过期，已自动清除');
        this.clearToken();
      } else {
        this.token = storedToken;
        this.setupRefreshTimer(storedToken);
      }
    }
  }

  /**
   * 设置认证令牌
   */
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem(this.STORAGE_KEY, token);
    this.setupRefreshTimer(token);
  }

  /**
   * 获取当前令牌
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * 清除认证令牌
   */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem(this.STORAGE_KEY);
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshPromise = null;
  }

  /**
   * 检查是否有有效令牌
   */
  hasValidToken(): boolean {
    if (!this.token) return false;
    return !isTokenExpired(this.token);
  }

  private setupRefreshTimer(token: string): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }

    const payload = decodeJwt(token);
    if (!payload || !payload.exp) return;

    const expiresAt = payload.exp * 1000;
    const now = Date.now();
    const timeUntilRefresh = expiresAt - now - this.REFRESH_THRESHOLD;

    if (timeUntilRefresh > 0) {
      this.refreshTimer = window.setTimeout(() => {
        this.refreshToken();
      }, timeUntilRefresh);
    } else if (expiresAt > now) {
      this.refreshToken();
    }
  }

  private async refreshToken(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const attemptRefresh = async (csrfToken: string | null): Promise<Response> => {
          const headers: Record<string, string> = {
            Authorization: `Bearer ${this.token}`,
          };
          if (csrfToken) {
            headers[CSRF_HEADER_NAME] = csrfToken;
          }
          return fetch(`${env.apiUrl}/api/v1/auth/refresh_token`, {
            method: 'POST',
            headers,
            credentials: 'include',
          });
        };

        let csrfToken = getCookieValue(CSRF_COOKIE_NAME);
        let response = await attemptRefresh(csrfToken);
        if (response.status === 403) {
          // CSRF cookie may be set on the 403 response by middleware; retry once with the new token.
          const refreshedCsrf = getCookieValue(CSRF_COOKIE_NAME);
          if (refreshedCsrf && refreshedCsrf !== csrfToken) {
            csrfToken = refreshedCsrf;
            response = await attemptRefresh(csrfToken);
          }
        }

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.token) {
            this.setToken(data.data.token);
            return data.data.token;
          }
        }

        if (response.status === 401) {
          this.clearToken();
          window.dispatchEvent(
            new CustomEvent('auth:logout', { detail: { reason: 'refresh_failed' } }),
          );
        }
        throw new Error('Refresh failed');
      } catch (err) {
        apiLogger.error('Token refresh failed:', err instanceof Error ? err.message : String(err));
        this.clearToken();
        window.dispatchEvent(
          new CustomEvent('auth:logout', { detail: { reason: 'refresh_error' } }),
        );
        return '';
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }
}

export default TokenManager;
