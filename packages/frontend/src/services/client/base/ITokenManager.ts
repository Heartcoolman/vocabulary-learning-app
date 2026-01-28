/**
 * Token 管理器接口
 * 定义 TokenManager 和 AdminTokenManager 的公共接口
 */
export interface ITokenManager {
  getToken(): string | null;
  clearToken(): void;
  setToken?(token: string): void;
  hasValidToken?(): boolean;
}
