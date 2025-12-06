import { z } from 'zod';

/**
 * 强密码验证规则
 * - 至少10个字符
 * - 必须包含字母、数字和特殊符号
 */
const strongPassword = z
  .string()
  .min(10, '密码长度至少为10个字符')
  .regex(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~])/,
    '密码需包含字母、数字和特殊符号'
  );

export const registerSchema = z.object({
  email: z.string().email('邮箱格式无效'),
  password: strongPassword,
  username: z.string().min(1, '用户名不能为空'),
});

export const loginSchema = z.object({
  email: z.string().email('邮箱格式无效'),
  password: z.string().min(1, '密码不能为空'),
});

export const updatePasswordSchema = z.object({
  oldPassword: z.string().min(1, '旧密码不能为空'),
  newPassword: strongPassword,
});
