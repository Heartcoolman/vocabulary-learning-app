import { z } from 'zod';

// 为了兼容旧本地数据，这里对可能为 null 的字段做宽松处理，
// 在服务层统一转换为字符串或 undefined。
export const createWordSchema = z.object({
  spelling: z.string().min(1, '单词拼写不能为空'),
  phonetic: z.union([z.string().min(1, '音标不能为空'), z.null()]),
  meanings: z.array(z.string()).min(1, '至少需要一个释义'),
  examples: z.array(z.string()),
  audioUrl: z.union([z.string(), z.null()]).optional(),
});

export const updateWordSchema = z.object({
  spelling: z.string().min(1, '单词拼写不能为空').optional(),
  phonetic: z.union([z.string().min(1, '音标不能为空'), z.null()]).optional(),
  meanings: z.array(z.string()).min(1, '至少需要一个释义').optional(),
  examples: z.array(z.string()).optional(),
  audioUrl: z.union([z.string(), z.null()]).optional(),
});
