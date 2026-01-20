/**
 * 用户相关Zod Schema
 * 用于运行时验证和类型推断
 */

import { z } from 'zod';

/**
 * 用户角色Schema
 */
export const UserRoleSchema = z.enum(['USER', 'ADMIN', 'BANNED']);

/**
 * 用户注册Schema
 */
export const RegisterDtoSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  username: z
    .string()
    .min(2, 'Username must be at least 2 characters')
    .max(50, 'Username too long'),
});

/**
 * 用户登录Schema
 */
export const LoginDtoSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * 更新密码Schema
 */
export const UpdatePasswordDtoSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

/**
 * 用户信息Schema
 */
export const UserInfoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string(),
  role: UserRoleSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * 认证用户Schema
 */
export const AuthUserSchema = UserInfoSchema.extend({
  iat: z.number().optional(),
  exp: z.number().optional(),
});
