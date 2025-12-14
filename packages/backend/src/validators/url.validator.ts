/**
 * URL验证器 - 防止SSRF、XSS和开放重定向攻击
 *
 * 使用场景：
 * - WordBook.coverImage
 * - Word.audioUrl
 * - BadgeDefinition.iconUrl
 *
 * 安全特性：
 * 1. 强制HTTPS（生产环境）
 * 2. 阻止内网地址（SSRF防护）
 * 3. 域名白名单验证
 * 4. 长度限制
 */

import { z } from 'zod';

/**
 * 检查IP地址是否为私有IP段
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return false;
  }

  const [a, b, c, d] = parts;

  // 验证每个字段在0-255范围内
  if (parts.some((p) => p < 0 || p > 255)) {
    return false;
  }

  // 私有IP段检查
  return (
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a === 127 || // 127.0.0.0/8 (回环)
    a === 0 || // 0.0.0.0/8 (当前网络)
    (a === 169 && b === 254) // 169.254.0.0/16 (链路本地)
  );
}

/**
 * 允许的外部资源域名白名单
 *
 * 使用建议：
 * 1. 仅添加受信任的CDN和对象存储域名
 * 2. 避免使用通配符（如*.com）
 * 3. 定期审查和更新白名单
 * 4. 建议使用环境变量配置
 */
const ALLOWED_DOMAINS = [
  // CDN域名
  'cdn.yourdomain.com',

  // AWS S3 & CloudFront
  's3.amazonaws.com',
  's3-us-west-2.amazonaws.com',
  'd111111abcdef8.cloudfront.net',

  // 阿里云OSS & CDN
  'aliyuncs.com',
  'alicdn.com',

  // 腾讯云COS & CDN
  'myqcloud.com',
  'tencent-cloud.com',

  // 其他可信来源
  // 'cdn.jsdelivr.net',  // 仅用于公共资源
];

/**
 * 阻止的主机名黑名单（内网和云元数据服务）
 */
const BLOCKED_HOSTS = [
  // 本地主机
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',

  // AWS元数据服务
  '169.254.169.254',
  'instance-data.ec2.internal',

  // Google Cloud Platform元数据服务
  'metadata.google.internal',
  'metadata',

  // Azure元数据服务
  '169.254.169.254',

  // Kubernetes元数据
  '10.0.0.1',
];

/**
 * 外部URL验证Schema
 *
 * 验证规则：
 * 1. 必须是有效的URL格式
 * 2. 长度不超过500字符
 * 3. 生产环境强制HTTPS
 * 4. 禁止访问内网地址
 * 5. 必须在域名白名单中
 */
export const externalUrlSchema = z
  .string()
  .url('必须是有效的URL格式')
  .max(500, 'URL长度不能超过500字符')
  .refine(
    (urlString) => {
      try {
        const url = new URL(urlString);

        // 规则1: 仅允许HTTP/HTTPS协议
        if (!['http:', 'https:'].includes(url.protocol)) {
          return false;
        }

        // 规则2: 生产环境强制HTTPS
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
          return false;
        }

        // 规则3: 检查主机名黑名单
        const hostname = url.hostname.toLowerCase();
        if (BLOCKED_HOSTS.includes(hostname)) {
          return false;
        }

        // 规则4: 检查是否为私有IP
        // 匹配IPv4地址
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        if (ipv4Regex.test(hostname)) {
          if (isPrivateIP(hostname)) {
            return false;
          }
        }

        // 规则5: 域名白名单验证
        const isAllowed = ALLOWED_DOMAINS.some((allowedDomain) => {
          // 完全匹配或子域名匹配
          return hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);
        });

        if (!isAllowed) {
          return false;
        }

        return true;
      } catch (error) {
        // URL解析失败
        return false;
      }
    },
    {
      message: '不允许的URL来源，请使用受信任的CDN或对象存储服务',
    },
  );

/**
 * 图片URL验证Schema（包含额外的图片格式检查）
 */
export const imageUrlSchema = externalUrlSchema.refine(
  (url) => {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const urlLower = url.toLowerCase();

    // 检查URL路径是否包含有效的图片扩展名
    // 注意：这不是强制要求，因为某些CDN可能不在URL中显示扩展名
    const hasImageExtension = validExtensions.some((ext) => {
      return urlLower.includes(ext);
    });

    // 如果URL包含扩展名，则必须是有效的图片格式
    if (urlLower.match(/\.\w{3,4}($|\?)/)) {
      return hasImageExtension;
    }

    // 没有明显扩展名的URL也允许通过（CDN可能使用参数方式）
    return true;
  },
  {
    message: '图片URL必须指向有效的图片格式 (.jpg, .jpeg, .png, .webp, .gif)',
  },
);

/**
 * 音频URL验证Schema
 */
export const audioUrlSchema = externalUrlSchema.refine(
  (url) => {
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const urlLower = url.toLowerCase();

    // 检查URL路径是否包含有效的音频扩展名
    if (urlLower.match(/\.\w{3,4}($|\?)/)) {
      const hasAudioExtension = validExtensions.some((ext) => {
        return urlLower.includes(ext);
      });
      return hasAudioExtension;
    }

    return true;
  },
  {
    message: '音频URL必须指向有效的音频格式 (.mp3, .wav, .ogg, .m4a, .aac)',
  },
);

/**
 * 使用示例
 */

// 1. 在路由验证中使用
export const createWordBookSchema = z.object({
  name: z.string().min(1, '词书名称不能为空').max(100, '词书名称不能超过100个字符'),
  description: z.string().max(500, '词书描述不能超过500个字符').optional(),
  coverImage: imageUrlSchema.optional(),
});

export const createWordSchema = z.object({
  spelling: z.string().min(1).max(100),
  phonetic: z.string().max(200).optional(),
  meanings: z.array(z.string()).min(1),
  examples: z.array(z.string()).optional(),
  audioUrl: audioUrlSchema.optional(),
});

export const createBadgeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  iconUrl: imageUrlSchema, // 必填
  category: z.enum(['STREAK', 'ACCURACY', 'COGNITIVE', 'MILESTONE']),
  tier: z.number().int().min(1).default(1),
  condition: z.record(z.any()),
});

/**
 * 测试用例
 */
export const testUrlValidation = () => {
  const testCases = [
    // 应该通过的URL
    { url: 'https://cdn.yourdomain.com/covers/abc123.jpg', shouldPass: true },
    { url: 'https://s3.amazonaws.com/bucket/image.png', shouldPass: true },
    { url: 'https://xxx.aliyuncs.com/audio.mp3', shouldPass: true },

    // 应该被拒绝的URL
    { url: 'http://localhost:3000/image.jpg', shouldPass: false, reason: 'localhost' },
    { url: 'https://127.0.0.1/image.jpg', shouldPass: false, reason: '回环地址' },
    { url: 'https://10.0.0.1/image.jpg', shouldPass: false, reason: '私有IP' },
    { url: 'https://192.168.1.1/image.jpg', shouldPass: false, reason: '私有IP' },
    { url: 'https://169.254.169.254/latest/meta-data/', shouldPass: false, reason: 'AWS元数据' },
    {
      url: 'http://cdn.yourdomain.com/image.jpg',
      shouldPass: false,
      reason: '生产环境未使用HTTPS',
    },
    { url: 'javascript:alert(1)', shouldPass: false, reason: '危险协议' },
    { url: 'https://evil.com/image.jpg', shouldPass: false, reason: '不在白名单' },
  ];

  console.log('URL验证测试:');
  testCases.forEach(({ url, shouldPass, reason }) => {
    const result = externalUrlSchema.safeParse(url);
    const passed = result.success;
    const status = passed === shouldPass ? '✅' : '❌';
    console.log(`${status} ${url} - ${reason || 'valid'}`);
    if (passed !== shouldPass) {
      console.log(
        '   错误:',
        result.success ? 'expected to fail' : result.error?.errors[0]?.message,
      );
    }
  });
};

// 在开发环境运行测试
if (process.env.NODE_ENV === 'development') {
  // testUrlValidation();
}
