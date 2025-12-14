# 文件上传和存储机制安全审查报告

**审查日期**: 2025-12-13
**项目**: Danci 智能词汇学习系统
**审查范围**: 文件上传安全、存储架构、图片处理、对象存储集成

---

## 执行摘要

### 当前状态

该项目**目前未实现任何文件上传功能**，但数据库schema中已预留3个文件URL字段：

- `WordBook.coverImage` (词书封面)
- `Word.audioUrl` (单词音频)
- `BadgeDefinition.iconUrl` (徽章图标)

当前实现均为**URL字符串存储**，由前端或管理员直接提供外部资源链接，**不涉及文件上传处理**。

### 安全等级评估

| 维度         | 当前状态          | 风险等级 | 优先级          |
| ------------ | ----------------- | -------- | --------------- |
| 文件上传验证 | 未实现            | N/A      | P1 (实现前必需) |
| 存储安全     | 未实现            | N/A      | P1 (实现前必需) |
| 访问控制     | URL字符串验证不足 | 中       | P2              |
| 恶意内容防护 | 未实现            | N/A      | P1 (实现前必需) |
| 性能优化     | 未考虑            | 低       | P3              |

---

## 第一部分：当前实现分析

### 1.1 数据库Schema分析

**发现的文件相关字段**：

```prisma
model WordBook {
  coverImage  String?  // 词书封面图URL (可选)
}

model Word {
  audioUrl  String?  // 单词发音音频URL (可选)
}

model BadgeDefinition {
  iconUrl  String  // 徽章图标URL (必填)
}
```

**当前验证逻辑** (`wordbook.routes.ts`):

```typescript
// 封面图片URL验证
if (coverImage && !coverImage.match(/^https?:\/\/.+/)) {
  return res.status(400).json({
    success: false,
    error: '封面图片URL格式不正确',
  });
}
```

### 1.2 存在的安全风险

#### 🔴 高危风险

1. **SSRF (服务器端请求伪造) 风险**
   - 用户可以输入任意URL，如果后端尝试获取这些资源将存在SSRF风险
   - 可能被利用访问内网资源：`http://localhost:6379`, `http://169.254.169.254/latest/meta-data/`
   - **当前验证**：仅检查 `^https?:\/\/.+` 格式，未阻止内网地址

2. **XSS (跨站脚本) 风险**
   - URL字段未进行HTML转义
   - 如果直接用于 `<img src>` 标签，可能被注入 `javascript:` 协议

3. **开放重定向风险**
   - 恶意URL可能导致用户被重定向到钓鱼网站

#### 🟡 中危风险

1. **资源枚举风险** - 未实现URL签名或时效性验证
2. **内容劫持风险** - 外部URL资源可能被劫持
3. **隐私泄露风险** - 外部图片服务器可获取用户IP

---

## 第二部分：安全加固建议

### 2.1 文件上传实现建议 (P1 - 实现前必需)

#### 推荐架构

**对象存储 + CDN**架构：

```
用户 → 前端 → 后端获取预签名URL → 前端直传OSS → CDN加速访问
```

**优势**：

- ✅ 减少后端负载（直传）
- ✅ 避免文件流经后端（安全隔离）
- ✅ 自动扩展（OSS）
- ✅ 全球加速（CDN）
- ✅ 成本优化（按需付费）

#### 技术栈建议

| 场景     | 推荐方案            | 备选方案                            |
| -------- | ------------------- | ----------------------------------- |
| 国内部署 | 阿里云OSS + CDN     | 腾讯云COS, 七牛云Kodo               |
| 国际部署 | AWS S3 + CloudFront | Google Cloud Storage, Cloudflare R2 |
| 自建方案 | MinIO + Nginx       | 不推荐（运维成本高）                |

#### 依赖包建议

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner file-type sharp
```

### 2.2 上传安全策略

#### 文件类型验证 (多层防御)

```typescript
// 1. MIME类型白名单
const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
};

// 2. Magic Number验证
import { fileTypeFromBuffer } from 'file-type';

async function validateFileType(buffer: Buffer, expectedType: 'image' | 'audio') {
  const fileType = await fileTypeFromBuffer(buffer);

  if (!fileType || !ALLOWED_MIME_TYPES[expectedType].includes(fileType.mime)) {
    throw new Error(`不支持的${expectedType}格式`);
  }

  return fileType;
}
```

#### 文件大小限制

```typescript
const FILE_SIZE_LIMITS = {
  coverImage: 5 * 1024 * 1024, // 5MB
  audioFile: 10 * 1024 * 1024, // 10MB
  icon: 1 * 1024 * 1024, // 1MB
};
```

#### 文件名清洗

```typescript
import { randomUUID } from 'crypto';
import path from 'path';

function sanitizeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const uuid = randomUUID();
  return `${uuid}${ext}`;
}
```

### 2.3 URL安全加固 (当前架构适用)

#### 增强URL验证

```typescript
import { z } from 'zod';
import { URL } from 'url';

const externalUrlSchema = z
  .string()
  .url('必须是有效的URL')
  .max(500, 'URL长度不能超过500字符')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);

        // 1. 强制HTTPS (生产环境)
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
          return false;
        }

        // 2. 阻止内网地址
        const hostname = parsed.hostname;
        const blockedHosts = [
          'localhost',
          '127.0.0.1',
          '0.0.0.0',
          '169.254.169.254', // AWS元数据服务
          'metadata.google.internal', // GCP元数据服务
        ];

        if (blockedHosts.includes(hostname)) {
          return false;
        }

        // 阻止私有IP段
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const match = hostname.match(ipv4Regex);
        if (match) {
          const [, a, b, c, d] = match.map(Number);
          // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
          if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
            return false;
          }
        }

        // 3. 域名白名单 (推荐)
        const allowedDomains = [
          'cdn.yourdomain.com',
          's3.amazonaws.com',
          'cloudfront.net',
          'aliyuncs.com',
        ];

        return allowedDomains.some((domain) => hostname.endsWith(domain));
      } catch {
        return false;
      }
    },
    { message: '不允许的URL来源' },
  );
```

#### CSP头加固

```typescript
// 在 app.ts 中增强helmet配置
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        // 图片源白名单
        imgSrc: [
          "'self'",
          'data:',
          'https:',
          'https://cdn.yourdomain.com',
          'https://s3.amazonaws.com',
          'https://*.cloudfront.net',
        ],
        // 音频源白名单
        mediaSrc: ["'self'", 'https://cdn.yourdomain.com'],
        connectSrc: ["'self'", env.CORS_ORIGIN].filter(Boolean),
        objectSrc: ["'none'"],
      },
    },
  }),
);
```

---

## 第三部分：实现路线图

### 3.1 短期目标 (1-2周) - P0

#### 立即修复

- [x] 数据库已正确配置 (URL字段为可选)
- [ ] **增强URL验证** (SSRF防护)
  - [ ] 实现内网IP检测
  - [ ] 实现域名白名单
  - [ ] 强制HTTPS (生产环境)
- [ ] **CSP头加固**
  - [ ] 限制imgSrc到可信CDN
  - [ ] 限制mediaSrc到可信音频源

### 3.2 中期目标 (2-4周) - P1

#### 核心功能实现

1. **技术选型确定**
   - [ ] 选择对象存储服务 (AWS S3 / 阿里云OSS)
   - [ ] 选择CDN服务

2. **预签名URL服务**
   - [ ] 创建 `src/services/upload.service.ts`
   - [ ] 实现 `generateUploadUrl()` 方法
   - [ ] 实现 `generateDownloadUrl()` 方法

3. **上传API路由**
   - [ ] 创建 `src/routes/upload.routes.ts`
   - [ ] POST `/api/upload/presign` - 获取预签名URL
   - [ ] POST `/api/upload/confirm` - 确认上传完成

4. **图片处理服务**
   - [ ] 创建 `src/services/image-processing.service.ts`
   - [ ] 实现缩略图生成
   - [ ] 实现EXIF清理

### 3.3 长期目标 (1-2个月) - P2/P3

#### 安全增强

- [ ] 病毒扫描集成 (ClamAV)
- [ ] 内容审核 (云服务API)
- [ ] 访问日志和审计

#### 性能优化

- [ ] CDN配置和缓存策略
- [ ] 分片上传和断点续传
- [ ] Redis缓存预签名URL

---

## 第四部分：环境配置

### 4.1 环境变量清单

在 `packages/backend/src/config/env.ts` 中新增：

```typescript
// 对象存储配置
S3_REGION: z.string().default('us-east-1'),
S3_BUCKET_NAME: z.string().min(1),
S3_ACCESS_KEY_ID: z.string().min(1),
S3_SECRET_ACCESS_KEY: z.string().min(1),
S3_ENDPOINT: z.string().url().optional(),  // MinIO自定义端点

// CDN配置
CDN_DOMAIN: z.string().url().optional(),

// 文件上传限制
MAX_FILE_SIZE_IMAGE: z.string().default('5242880'),   // 5MB
MAX_FILE_SIZE_AUDIO: z.string().default('10485760'),  // 10MB
USER_UPLOAD_QUOTA_MB: z.string().default('100'),      // 100MB

// 病毒扫描配置 (可选)
ENABLE_VIRUS_SCAN: z.string().default('false'),
CLAMAV_HOST: z.string().default('localhost'),
CLAMAV_PORT: z.string().default('3310'),
```

### 4.2 .env.example 新增

```bash
# ============================================
# 对象存储配置 (AWS S3)
# ============================================
S3_REGION="us-east-1"
S3_BUCKET_NAME="danci-assets"
S3_ACCESS_KEY_ID="your_access_key_id"
S3_SECRET_ACCESS_KEY="your_secret_access_key"

# 如果使用MinIO自建对象存储
# S3_ENDPOINT="http://localhost:9000"

# ============================================
# CDN配置
# ============================================
CDN_DOMAIN="https://cdn.yourdomain.com"

# ============================================
# 文件上传限制
# ============================================
MAX_FILE_SIZE_IMAGE=5242880    # 5MB
MAX_FILE_SIZE_AUDIO=10485760   # 10MB
USER_UPLOAD_QUOTA_MB=100       # 每用户100MB配额

# ============================================
# 病毒扫描配置 (可选)
# ============================================
ENABLE_VIRUS_SCAN="false"
CLAMAV_HOST="localhost"
CLAMAV_PORT=3310
```

---

## 第五部分：成本分析

### 假设场景

- 用户数：10,000
- 每用户上传：10张封面图 + 100个音频
- 平均图片大小：500KB，平均音频大小：2MB
- 月度访问：每文件10次

### AWS S3 + CloudFront 成本估算

**存储成本**：

- 总存储：2,050GB
- 成本：2,050GB × $0.023/GB = **$47.15/月**

**流量成本**（直接S3）：

- 总流量：20,500GB
- 成本：20,500GB × $0.09/GB = **$1,845/月**

**CDN成本**（使用CloudFront）：

- CDN流量：20,500GB × $0.02/GB = **$410/月**
- **节省：$1,435/月 (78%)**

**总成本**：

- 存储 + CDN = **$457.15/月** ($5,485.80/年)

### 成本优化策略

1. **生命周期策略** - 节省30-50%
2. **智能分层存储** - 节省20-40%
3. **压缩优化** (WebP/Opus) - 节省25-40%
4. **CDN缓存** - 节省60-70%

**优化后成本**：约 **$182.86/月** ($2,194.32/年)

---

## 第六部分：安全检查清单

### ✅ 立即检查项 (P0)

- [ ] **URL验证强化**
  - [ ] 阻止内网地址 (SSRF防护)
  - [ ] 实现域名白名单
  - [ ] 强制HTTPS (生产环境)

- [ ] **CSP头配置**
  - [ ] 限制imgSrc到可信来源
  - [ ] 限制mediaSrc到可信来源

### ✅ 实现上传前必需 (P1)

- [ ] **文件类型验证**
  - [ ] MIME类型检查
  - [ ] 扩展名检查
  - [ ] Magic Number检查

- [ ] **文件大小限制**
  - [ ] 单文件大小限制
  - [ ] 用户配额限制

- [ ] **文件名安全**
  - [ ] 使用UUID重命名
  - [ ] 路径遍历检查

- [ ] **存储隔离**
  - [ ] 用户目录隔离
  - [ ] 私有访问控制

### ✅ 增强安全项 (P2)

- [ ] **恶意内容检测**
  - [ ] 病毒扫描
  - [ ] 内容审核

- [ ] **访问控制**
  - [ ] 预签名URL (时效性)
  - [ ] 防盗链配置

---

## 参考资源

### 官方文档

- [AWS S3 安全最佳实践](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
- [OWASP 文件上传安全](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload)
- [Sharp 图片处理库](https://sharp.pixelplumbing.com/)

### 开源项目

- [MinIO 对象存储](https://github.com/minio/minio)
- [ClamAV 病毒扫描](https://github.com/Cisco-Talos/clamav)

---

## 总结

### 当前状态

该项目目前**未实现文件上传功能**，仅使用外部URL字符串存储资源链接。现有的URL验证存在**SSRF、XSS和开放重定向**等安全风险。

### 核心建议

1. **立即修复** - 增强URL验证，阻止内网地址和危险协议
2. **技术选型** - 采用对象存储(S3/OSS) + CDN架构
3. **分阶段实现** - 按P0→P1→P2→P3优先级逐步完成
4. **成本控制** - 通过压缩、CDN和生命周期策略优化成本

### 预期收益

- ✅ **安全性提升** - 多层验证 + 隔离存储 + 病毒扫描
- ✅ **用户体验** - 直传 + CDN加速 + 预签名URL
- ✅ **可扩展性** - 对象存储自动扩容 + 全球加速
- ✅ **成本优化** - 合理配置可节省60-70%流量成本

---

**审查人**: Claude Sonnet 4.5
**审查日期**: 2025-12-13
**报告版本**: v1.0
