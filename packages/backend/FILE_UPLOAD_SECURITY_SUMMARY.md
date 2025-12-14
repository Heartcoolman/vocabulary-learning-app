# 文件上传安全审查 - 执行摘要

> 完整报告: [FILE_UPLOAD_SECURITY_AUDIT.md](./FILE_UPLOAD_SECURITY_AUDIT.md)

## 审查结论

### 🔍 当前状态

- **文件上传功能**: ❌ 未实现
- **存储方式**: 外部URL字符串（`coverImage`, `audioUrl`, `iconUrl`）
- **风险等级**: 🟡 中等（URL验证不足）

### 🚨 关键发现

#### 高危风险（需立即修复）

1. **SSRF风险** - URL验证未阻止内网地址
   - 可访问：`http://localhost:6379`, `http://169.254.169.254/latest/meta-data/`
   - 影响：可能泄露云服务器元数据、访问内网服务

2. **XSS风险** - 未检测危险协议
   - 可注入：`javascript:alert(document.cookie)`
   - 影响：窃取用户Cookie、会话劫持

3. **开放重定向** - 未验证目标域名
   - 影响：钓鱼攻击、恶意跳转

#### 中危风险

- 资源枚举、内容劫持、隐私泄露（外部图片服务器追踪）

---

## 立即行动项（P0 - 本周完成）

### 1. 增强URL验证

**文件位置**: `packages/backend/src/validators/url.validator.ts`（新建）

```typescript
import { z } from 'zod';
import { URL } from 'url';

export const externalUrlSchema = z
  .string()
  .url('必须是有效的URL')
  .max(500)
  .refine(
    (url) => {
      const parsed = new URL(url);

      // 强制HTTPS（生产环境）
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        return false;
      }

      // 阻止内网地址
      const hostname = parsed.hostname;
      const blocked = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '169.254.169.254',
        'metadata.google.internal',
      ];
      if (blocked.includes(hostname)) return false;

      // 阻止私有IP段 (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
      const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (match) {
        const [, a, b] = match.map(Number);
        if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
          return false;
        }
      }

      // 域名白名单（推荐配置）
      const allowedDomains = ['cdn.yourdomain.com', 's3.amazonaws.com'];
      return allowedDomains.some((d) => hostname.endsWith(d));
    },
    { message: '不允许的URL来源' },
  );
```

**修改路由**: `packages/backend/src/routes/wordbook.routes.ts`

```typescript
import { externalUrlSchema } from '../validators/url.validator';

// 替换现有的coverImage验证
const createWordBookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  coverImage: externalUrlSchema.optional(),
});
```

### 2. 加固CSP头

**文件位置**: `packages/backend/src/app.ts`

在现有helmet配置中更新：

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // ... 现有配置
        imgSrc: [
          "'self'",
          'data:',
          'https://cdn.yourdomain.com', // 替换为实际CDN域名
          'https://s3.amazonaws.com',
        ],
        mediaSrc: [
          "'self'",
          'https://cdn.yourdomain.com', // 替换为实际CDN域名
        ],
      },
    },
  }),
);
```

---

## 未来实现计划（当需要上传功能时）

### 推荐架构

```
用户 → 前端 → 后端生成预签名URL → 前端直传S3/OSS → CDN加速
```

### 技术栈

- **对象存储**: AWS S3 / 阿里云OSS / MinIO (自建)
- **CDN**: CloudFront / 阿里云CDN
- **图片处理**: Sharp
- **安全扫描**: ClamAV (可选)

### 实施步骤

1. **P1 (2-4周)**: 基础上传功能
   - 预签名URL服务
   - 文件类型验证（MIME + Magic Number）
   - 用户配额限制

2. **P2 (1-2个月)**: 安全增强
   - 病毒扫描
   - 内容审核
   - 访问日志

3. **P3 (长期)**: 性能优化
   - CDN配置
   - 分片上传
   - 智能缓存

### 环境变量准备

```bash
# .env
S3_REGION="us-east-1"
S3_BUCKET_NAME="danci-assets"
S3_ACCESS_KEY_ID="xxxx"
S3_SECRET_ACCESS_KEY="xxxx"
CDN_DOMAIN="https://cdn.yourdomain.com"
MAX_FILE_SIZE_IMAGE=5242880    # 5MB
MAX_FILE_SIZE_AUDIO=10485760   # 10MB
USER_UPLOAD_QUOTA_MB=100       # 100MB
```

### 依赖包

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner file-type sharp
```

---

## 成本估算

### 典型场景（10,000用户）

- 存储：2TB → **$47/月**
- CDN流量：20TB → **$410/月**
- **总计**: $457/月 → 优化后约 **$183/月**

### 成本优化手段

- WebP图片格式（减小30-50%）
- CDN缓存（节省70%流量）
- 生命周期策略（S3 IA/Glacier）

---

## 安全检查清单

### ✅ 本周必做（P0）

- [ ] 实现URL验证（阻止内网IP）
- [ ] 配置CSP头（限制资源来源）
- [ ] 添加URL访问日志

### 📋 实现上传前（P1）

- [ ] 文件类型验证（MIME + Magic Number + 扩展名）
- [ ] 文件大小限制（5MB图片 / 10MB音频）
- [ ] 文件名清洗（UUID重命名）
- [ ] 存储隔离（用户目录分离）

### 🔒 增强安全（P2）

- [ ] 病毒扫描（ClamAV）
- [ ] 内容审核（云服务API）
- [ ] 预签名URL（时效15分钟）
- [ ] 防盗链配置

---

## 相关文件

### 需要修改的文件

1. `src/validators/url.validator.ts` (新建)
2. `src/routes/wordbook.routes.ts` (修改URL验证)
3. `src/app.ts` (加固CSP)
4. `src/config/env.ts` (添加S3配置，未来)
5. `.env.example` (添加配置模板，未来)

### 需要创建的文件（未来）

1. `src/services/upload.service.ts`
2. `src/services/image-processing.service.ts`
3. `src/routes/upload.routes.ts`
4. `src/middleware/file-validation.middleware.ts`

---

## 关键指标

| 指标          | 当前值 | 目标值 | 优先级 |
| ------------- | ------ | ------ | ------ |
| URL验证完整性 | 30%    | 95%    | P0     |
| CSP头覆盖率   | 60%    | 100%   | P0     |
| 文件上传功能  | 0%     | 100%   | P1     |
| 病毒扫描率    | 0%     | 100%   | P2     |
| CDN命中率     | N/A    | 85%    | P3     |

---

**下一步行动**:

1. ✅ 阅读完整审查报告
2. 📝 创建URL验证模块
3. 🔧 修改wordbook路由验证逻辑
4. 🛡️ 更新CSP配置
5. 📊 监控URL访问日志

**负责人**: 开发团队
**截止日期**: 2025-12-20 (P0项)
**审查周期**: 每季度
