export type UserRole = 'USER' | 'ADMIN';

export interface UserInfo {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthUser extends UserInfo {
  iat?: number;
  exp?: number;
}
