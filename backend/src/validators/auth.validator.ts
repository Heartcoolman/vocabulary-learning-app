import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('邮箱格式无效'),
  password: z.string().min(8, '密码长度至少为8个字符'),
  username: z.string().min(1, '用户名不能为空'),
});

export const loginSchema = z.object({
  email: z.string().email('邮箱格式无效'),
  password: z.string().min(1, '密码不能为空'),
});

export const updatePasswordSchema = z.object({
  oldPassword: z.string().min(1, '旧密码不能为空'),
  newPassword: z.string().min(8, '新密码长度至少为8个字符'),
});
