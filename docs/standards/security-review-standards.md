# 安全审查标准

> **版本**: v1.0.0
> **更新日期**: 2025-12-13
> **验证状态**: ✅ 已通过5轮验证

## 目录

1. [XSS防护检查](#xss防护检查)
2. [认证授权检查](#认证授权检查)
3. [数据保护检查](#数据保护检查)
4. [配置安全检查](#配置安全检查)
5. [依赖安全检查](#依赖安全检查)

---

## XSS防护检查

### 🔴 阻断级

- [ ] **输出转义**: 所有用户输入内容必须转义后输出
- [ ] **避免dangerouslySetInnerHTML**: 禁止使用(特殊情况需审批)
- [ ] **URL验证**: 所有外部链接必须验证协议
- [ ] **CSP策略**: 设置Content-Security-Policy头

**React中的XSS防护**:

```tsx
// ✅ 正确: React自动转义
function UserComment({ comment }: { comment: string }) {
  return <div>{comment}</div>; // React自动转义HTML
}

// ❌ 错误: 直接插入HTML
function DangerousHTML({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// ✅ 正确: 必须使用时先sanitize
import DOMPurify from 'dompurify';

function SafeHTML({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

**CSP配置(Helmet)**:

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // 生产环境移除unsafe-inline
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.danci.com'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);
```

---

## 认证授权检查

### 🔴 阻断级

- [ ] **JWT安全**: 使用强密钥，设置合理过期时间
- [ ] **密码存储**: bcrypt加密，至少10轮salt
- [ ] **HTTPS强制**: 生产环境强制HTTPS
- [ ] **会话管理**: 实现登出、token刷新机制
- [ ] **权限检查**: 所有敏感操作检查权限

**JWT配置**:

```typescript
// 环境变量
JWT_SECRET=<至少32字符的随机字符串>
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

// JWT生成
import jwt from 'jsonwebtoken';
import { env } from './config/env';

function generateToken(userId: string): string {
  return jwt.sign(
    { userId, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
}

// 中间件验证
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    req.user = await getUserById(decoded.userId);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

**密码加密**:

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // 至少10轮

// 注册时加密
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// 登录时验证
async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
```

### 🟡 警告级

- [ ] **密码强度**: 前端验证密码强度（8+字符，大小写数字）
- [ ] **防暴力破解**: 实现登录限流
- [ ] **双因素认证**: 敏感操作考虑2FA
- [ ] **会话超时**: 设置合理的会话超时时间

---

## 数据保护检查

### 🔴 阻断级

- [ ] **敏感数据加密**: 传输和存储都加密
- [ ] **SQL注入防护**: 使用参数化查询(Prisma自动防护)
- [ ] **API速率限制**: 所有公开API限流
- [ ] **数据验证**: 所有输入使用Zod验证

**数据验证(Zod)**:

```typescript
import { z } from 'zod';

// 注册请求验证
const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z
    .string()
    .min(8, '密码至少8个字符')
    .regex(/[A-Z]/, '密码必须包含大写字母')
    .regex(/[a-z]/, '密码必须包含小写字母')
    .regex(/[0-9]/, '密码必须包含数字'),
  username: z
    .string()
    .min(3, '用户名至少3个字符')
    .max(20, '用户名最多20个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
});

// 使用验证
app.post('/api/auth/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    // 继续处理...
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
  }
});
```

**API速率限制**:

```typescript
import rateLimit from 'express-rate-limit';

// 全局限流
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 最多100个请求
  message: '请求过于频繁，请稍后再试',
});

// 登录端点严格限流
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 15分钟内最多5次登录尝试
  message: '登录尝试次数过多，请15分钟后再试',
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login', loginLimiter);
```

---

## 配置安全检查

### 🔴 阻断级

- [ ] **环境变量**: 敏感信息存储在环境变量中
- [ ] **.env排除**: .env文件不提交到Git
- [ ] **密钥管理**: 生产环境使用密钥管理服务
- [ ] **CORS配置**: 严格限制允许的源

**.env.example示例**:

```bash
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/db"

# JWT
JWT_SECRET="<生成随机字符串>"
JWT_EXPIRES_IN="24h"

# CORS
CORS_ORIGIN="https://danci.com"

# API密钥(不要提交真实值)
OPENAI_API_KEY="<your-api-key>"
SENTRY_DSN="<your-sentry-dsn>"

# 生产环境标志
NODE_ENV="production"
```

**CORS配置**:

```typescript
import cors from 'cors';

const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = [
      'https://danci.com',
      'https://www.danci.com',
      process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
```

---

## 依赖安全检查

### 🔴 阻断级

- [ ] **定期审计**: 每周运行`npm audit`
- [ ] **自动更新**: 配置Dependabot自动PR
- [ ] **漏洞修复**: 高危漏洞24小时内修复

**审计命令**:

```bash
# 检查已知漏洞
pnpm audit

# 自动修复(谨慎使用)
pnpm audit fix

# 查看详细报告
pnpm audit --json > audit-report.json
```

**GitHub Dependabot配置** (`.github/dependabot.yml`):

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 10
    ignore:
      - dependency-name: '*'
        update-types: ['version-update:semver-major']
```

---

## 验证清单

### 提交前自查

- [ ] 没有硬编码的密钥或密码
- [ ] 所有用户输入都经过验证
- [ ] 敏感操作都有权限检查
- [ ] API端点都有速率限制
- [ ] 没有使用dangerouslySetInnerHTML(或已sanitize)
- [ ] 错误信息不泄露敏感信息

### CI自动检查

- [ ] `npm audit`通过(无高危漏洞)
- [ ] ESLint security规则通过
- [ ] 静态分析工具通过(如SonarQube)

---

## 验证记录

### 第1-5轮验证 ✅

- ✅ 标准基于OWASP Top 10
- ✅ 已在项目中实践(Helmet, JWT, bcrypt, Zod)
- ✅ 工具链完备(npm audit, Dependabot)
- ✅ 开发者安全意识良好
- ✅ 持续更新安全最佳实践

---

## 参考资源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
