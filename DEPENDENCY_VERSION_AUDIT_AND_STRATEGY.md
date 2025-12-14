# 依赖版本审计与统一策略

> 审计日期: 2025-12-13
> 审计范围: Zod、TypeScript、Prisma、React Query、Vitest、ESLint
> 严重性: 🔴 高危（Zod 版本不一致导致类型安全风险）

---

## 1. 版本不一致性分析

### 1.1 Zod 版本严重不一致 🔴 高危

| 包                  | Zod 版本   | 依赖类型     | 实际加载版本        |
| ------------------- | ---------- | ------------ | ------------------- |
| **@danci/backend**  | `^3.22.4`  | dependencies | `3.22.4` (过时)     |
| **@danci/frontend** | `^4.1.13`  | dependencies | `4.1.13` (最新)     |
| **@danci/shared**   | `^3.25.76` | dependencies | `3.25.76` (最新 v3) |
| lighthouse (dev)    | -          | transitive   | `3.25.76`           |

#### 问题严重性评估

**🔴 严重问题：跨版本类型不兼容**

```
frontend (zod@4.1.13)
    ↓ imports
shared (zod@3.25.76) ← 类型来自 v3
    ↓ exports
frontend 使用 zod v4 API 解析 v3 schemas
```

由于 pnpm 的依赖隔离机制，实际运行时：

- `@danci/shared` 在 **frontend** 中使用 zod `3.25.76`（从 shared 的 node_modules）
- **frontend** 自身代码使用 zod `4.1.13`
- **backend** 使用过时的 zod `3.22.4`（存在已知 bug）

**类型兼容性风险：**

1. ✅ **frontend 中导入 shared schemas 是安全的** - shared 使用自己的 zod 3.25.76
2. ⚠️ **但 frontend 中的类型推断可能不准确** - TypeScript 看到的是 zod v4 类型
3. 🔴 **backend 使用过时版本** - 缺少 v3.23+ 的重要 bug 修复

### 1.2 Zod v3 vs v4 Breaking Changes

根据 [官方迁移指南](https://zod.dev/v4/changelog) 和 [详细分析](https://gist.github.com/imaman/a62d1c7bab770a3b49fe3be10a66f48a)：

#### 核心 Breaking Changes

| 变更类型            | v3 API                          | v4 API            | 影响范围                    |
| ------------------- | ------------------------------- | ----------------- | --------------------------- |
| **String 格式方法** | `z.string().email()`            | `z.email()`       | 🔴 高（38 处使用）          |
| **String 格式方法** | `z.string().uuid()`             | `z.uuid()`        | 🔴 高（38 处使用）          |
| **String 格式方法** | `z.string().url()`              | `z.url()`         | 🟡 中（少量使用）           |
| **错误属性**        | `error.errors`                  | `error.issues`    | 🟡 中（7 处使用 `.errors`） |
| **错误定制**        | `message`, `invalid_type_error` | 统一 `error` 参数 | 🟢 低                       |
| **内部属性**        | `._def`                         | `._zod.def`       | 🟢 低（未使用）             |
| **UUID 验证**       | 宽松验证                        | RFC 4122 严格验证 | 🟡 中（潜在风险）           |

#### 代码库影响统计

**Shared 包 (核心影响):**

```bash
# String 格式方法使用：38 处
z.string().email()     # 在 UserSchema 中
z.string().uuid()      # 大量使用（ID 验证）
z.string().url()       # 少量使用
```

**Backend 包:**

```typescript
// 使用 error.errors (需要改为 error.issues)
// 文件: validate.middleware.ts, env.ts, word-score.validator.ts
error.errors[0]?.message
error.errors.map(e => ...)
```

**Frontend 包:**

```typescript
// 已正确使用 error.issues
// 文件: api-validation.ts
result.error.issues.map((issue) => ...)  // ✅ 正确
```

### 1.3 其他依赖版本分析

#### TypeScript 版本 ✅ 良好

| 包           | TypeScript 版本         | 来源            |
| ------------ | ----------------------- | --------------- |
| **根项目**   | `^5.3.3` → 实际 `5.9.3` | devDependencies |
| **所有子包** | 继承根项目              | workspace       |

✅ **状态：良好** - 所有包使用统一的 TypeScript 5.9.3

#### Vitest 版本 ⚠️ 不一致

| 包                | Vitest 版本 |
| ----------------- | ----------- |
| **根项目**        | `^4.0.15`   |
| **@danci/native** | `^1.6.1` 🟡 |

⚠️ **问题：** native 包使用旧版本（1.6.1 vs 4.0.15），可能存在 API 不兼容

#### Prisma 版本 ✅ 良好

| 包          | @prisma/client      | prisma              |
| ----------- | ------------------- | ------------------- |
| **backend** | `^5.7.0` → `5.22.0` | `^5.7.0` → `5.22.0` |

✅ **状态：良好** - 版本一致且较新

#### React Query 版本 ✅ 单一使用

- **@danci/frontend**: `^5.90.12`（仅 frontend 使用）

#### ESLint 版本 ✅ 良好

- **frontend**: `^9.39.1`（最新版本）

---

## 2. Zod 版本统一策略

### 2.1 版本选择：统一到 v3.25.76 ✅ 推荐

**决策依据：**

| 因素                 | v3.25.76               | v4.1.13                       | 权重  |
| -------------------- | ---------------------- | ----------------------------- | ----- |
| **迁移成本**         | 最小（仅升级 backend） | 高（38+ 处 API 改动）         | 🔴 高 |
| **生态兼容性**       | 优秀（广泛采用）       | 一般（较新）                  | 🟡 中 |
| **性能提升**         | 稳定                   | +14x string（但代码库影响小） | 🟢 低 |
| **Breaking Changes** | 无                     | 多处需修改                    | 🔴 高 |
| **团队熟悉度**       | 高（已有代码）         | 低（需学习新 API）            | 🟡 中 |
| **长期维护**         | v3 持续维护中          | v4 未来方向                   | 🟢 低 |

**⚠️ v4 迁移成本评估：**

- 需要修改 38+ 处 `z.string().uuid()` → `z.uuid()`
- 需要修改 7 处 `error.errors` → `error.issues`
- 需要回归测试所有验证逻辑
- 潜在 UUID 验证严格化导致的兼容性问题
- **估计工作量：2-3 人天**

**✅ v3.25.76 统一成本：**

- 仅升级 backend zod `3.22.4` → `3.25.76`
- 降级 frontend zod `4.1.13` → `3.25.76`
- 无代码修改，仅配置调整
- **估计工作量：0.5 人天**

### 2.2 迁移到 v3.25.76 的具体步骤

#### 步骤 1: 更新 package.json 版本约束

```bash
# 1. 更新 backend
cd packages/backend
pnpm add zod@^3.25.76

# 2. 更新 frontend
cd packages/frontend
pnpm add zod@^3.25.76

# 3. shared 已经是 3.25.76，无需修改
```

#### 步骤 2: 清理并重新安装

```bash
# 从根目录执行
pnpm install --force
```

#### 步骤 3: 验证版本一致性

```bash
# 检查所有包的 zod 版本
pnpm list zod --depth=0 -r

# 预期输出：
# @danci/backend: zod 3.25.76
# @danci/frontend: zod 3.25.76
# @danci/shared: zod 3.25.76
```

#### 步骤 4: 运行测试套件

```bash
# 运行所有测试
pnpm test

# 特别关注验证相关测试
pnpm test:backend:unit
pnpm test:frontend
```

#### 步骤 5: 类型检查

```bash
# 检查 TypeScript 类型
pnpm --filter @danci/backend tsc --noEmit
pnpm --filter @danci/frontend tsc --noEmit
pnpm --filter @danci/shared tsc --noEmit
```

### 2.3 版本约束配置

#### 在根 package.json 中添加版本约束

```json
{
  "pnpm": {
    "overrides": {
      "zod": "3.25.76"
    }
  }
}
```

这确保所有包（包括间接依赖）都使用相同的 zod 版本。

---

## 3. 未来迁移到 v4 的路线图（可选）

如果未来决定迁移到 zod v4，建议的步骤：

### 3.1 使用自动化 Codemod

```bash
# 使用社区 codemod
npx @nicoespeon/zod-v3-to-v4@latest packages/shared/src
npx @nicoespeon/zod-v3-to-v4@latest packages/backend/src
```

### 3.2 手动修改清单

#### Shared 包 (38 处)

```typescript
// Before (v3)
export const UserEmailSchema = z.object({
  email: z.string().email(),
  id: z.string().uuid(),
});

// After (v4)
export const UserEmailSchema = z.object({
  email: z.email(),
  id: z.uuid(),
});
```

**影响文件：**

- `packages/shared/src/schemas/user.schema.ts`
- `packages/shared/src/schemas/amas.schema.ts`
- `packages/shared/src/schemas/api-response.schema.ts`
- `packages/shared/src/schemas/study.schema.ts`
- `packages/shared/src/schemas/word.schema.ts`

#### Backend 包 (7 处)

```typescript
// Before (v3)
catch (error) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: error.errors[0]?.message,
      details: error.errors.map(e => ({ ... }))
    });
  }
}

// After (v4)
catch (error) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: error.issues[0]?.message,
      details: error.issues.map(e => ({ ... }))
    });
  }
}
```

**影响文件：**

- `packages/backend/src/middleware/validate.middleware.ts`
- `packages/backend/src/config/env.ts`
- `packages/backend/src/validators/word-score.validator.ts`
- `packages/backend/src/routes/logs.routes.ts`

### 3.3 v4 迁移测试计划

1. **单元测试** - 所有 Schema 验证测试
2. **集成测试** - API 验证中间件
3. **端到端测试** - 前后端数据流
4. **回归测试** - UUID 严格验证可能破坏现有数据

---

## 4. 其他依赖统一方案

### 4.1 Vitest 版本统一

#### 问题

@danci/native 使用 vitest `^1.6.1`，其他包使用 `^4.0.15`

#### 解决方案

**选项 1: 升级 native 到 v4 ✅ 推荐**

```json
// packages/native/package.json
{
  "devDependencies": {
    "vitest": "^4.0.15" // 从 ^1.6.1 升级
  }
}
```

**Breaking Changes (v1 → v4):**

- 测试 API 基本兼容
- 配置文件格式微调
- 需要验证 native addon 测试

**选项 2: 保持独立版本**

- 风险：测试行为可能不一致
- 场景：如果 native 包有特殊测试需求

**推荐操作：**

```bash
cd packages/native
pnpm add -D vitest@^4.0.15
pnpm test  # 验证测试通过
```

### 4.2 TypeScript 版本锁定

当前状态良好，但建议显式锁定：

```json
// 根 package.json
{
  "pnpm": {
    "overrides": {
      "typescript": "5.9.3" // 锁定确切版本
    }
  }
}
```

### 4.3 React Query 版本

当前仅 frontend 使用，无需调整。

---

## 5. 依赖管理最佳实践

### 5.1 pnpm workspace 版本约束

创建 `.npmrc` 文件（如不存在）：

```ini
# 严格模式 - 确保版本一致性
strict-peer-dependencies=true

# 禁用幽灵依赖
node-linker=isolated

# 共享 workspace 依赖
shared-workspace-lockfile=true
```

更新 `pnpm-workspace.yaml`：

```yaml
packages:
  - 'packages/*'

onlyBuiltDependencies:
  - '@danci/native'
  - '@prisma/client'
  - '@prisma/engines'
  - bcrypt
  - esbuild
  - msw
  - prisma

# 推荐：添加共享依赖约束
catalog:
  zod: ^3.25.76
  typescript: 5.9.3
  vitest: ^4.0.15
```

### 5.2 根 package.json 版本覆盖

```json
{
  "pnpm": {
    "overrides": {
      "zod": "3.25.76",
      "typescript": "5.9.3"
    }
  }
}
```

这确保所有直接和间接依赖都使用指定版本。

### 5.3 Dependabot 配置

创建 `.github/dependabot.yml`：

```yaml
version: 2
updates:
  # 根项目依赖
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    groups:
      # 分组管理关键依赖
      zod:
        patterns:
          - 'zod'
      typescript:
        patterns:
          - 'typescript'
          - '@types/*'
      vitest:
        patterns:
          - 'vitest'
          - '@vitest/*'
    open-pull-requests-limit: 5

  # Backend 包
  - package-ecosystem: 'npm'
    directory: '/packages/backend'
    schedule:
      interval: 'weekly'
    groups:
      prisma:
        patterns:
          - '@prisma/client'
          - 'prisma'

  # Frontend 包
  - package-ecosystem: 'npm'
    directory: '/packages/frontend'
    schedule:
      interval: 'weekly'
    groups:
      react:
        patterns:
          - 'react'
          - 'react-dom'
      tanstack:
        patterns:
          - '@tanstack/*'

  # Shared 包
  - package-ecosystem: 'npm'
    directory: '/packages/shared'
    schedule:
      interval: 'weekly'
```

### 5.4 pre-commit 版本检查钩子

创建 `.husky/check-versions.sh`：

```bash
#!/bin/bash

echo "🔍 Checking dependency version consistency..."

# 检查 Zod 版本
ZOD_VERSIONS=$(pnpm list zod --depth=0 -r --json | jq -r '.[].dependencies.zod.version' | sort -u)
ZOD_COUNT=$(echo "$ZOD_VERSIONS" | wc -l)

if [ "$ZOD_COUNT" -gt 1 ]; then
  echo "❌ Zod version mismatch detected!"
  echo "Found versions:"
  echo "$ZOD_VERSIONS"
  exit 1
fi

echo "✅ All dependency versions are consistent"
```

添加到 `.husky/pre-commit`：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# 依赖版本检查
bash .husky/check-versions.sh

# 其他检查...
```

### 5.5 CI 版本验证

在 GitHub Actions 中添加验证步骤：

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10.24.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Check Zod version consistency
        run: |
          ZOD_VERSIONS=$(pnpm list zod --depth=0 -r --json | jq -r '.[].dependencies.zod.version' | sort -u | wc -l)
          if [ "$ZOD_VERSIONS" -gt 1 ]; then
            echo "❌ Zod version mismatch!"
            pnpm list zod -r
            exit 1
          fi
          echo "✅ Zod versions consistent"

      - name: Check TypeScript version consistency
        run: |
          TS_VERSIONS=$(pnpm list typescript --depth=0 -r --json | jq -r '.[].devDependencies.typescript.version' | sort -u | wc -l)
          if [ "$TS_VERSIONS" -gt 1 ]; then
            echo "❌ TypeScript version mismatch!"
            exit 1
          fi
          echo "✅ TypeScript versions consistent"
```

---

## 6. 执行计划与验证方法

### 6.1 立即执行（高优先级）

#### Phase 1: Zod 版本统一 (0.5 人天)

```bash
# Step 1: 备份当前状态
git checkout -b fix/zod-version-unification
git add .
git commit -m "chore: backup before zod version unification"

# Step 2: 更新 package.json
# 修改 packages/backend/package.json: "zod": "^3.25.76"
# 修改 packages/frontend/package.json: "zod": "^3.25.76"

# Step 3: 添加根级别版本覆盖
# 在根 package.json 中添加:
# "pnpm": { "overrides": { "zod": "3.25.76" } }

# Step 4: 清理并重新安装
pnpm install --force

# Step 5: 验证版本
pnpm list zod --depth=1 -r
```

**验证检查点：**

```bash
# ✅ 预期所有包显示 3.25.76
# @danci/backend: zod 3.25.76
# @danci/frontend: zod 3.25.76
# @danci/shared: zod 3.25.76
```

#### Phase 2: 运行测试验证 (2 小时)

```bash
# Backend 测试
pnpm --filter @danci/backend test:unit
pnpm --filter @danci/backend test:integration

# Frontend 测试
pnpm --filter @danci/frontend test

# Shared 测试
pnpm --filter @danci/shared test

# 全量测试
pnpm test
```

**关键测试场景：**

1. ✅ Schema 验证功能正常
2. ✅ API 请求验证中间件工作
3. ✅ Frontend API 响应验证
4. ✅ UUID 验证兼容性

#### Phase 3: 类型检查 (30 分钟)

```bash
# 所有包类型检查
pnpm --filter @danci/backend tsc --noEmit
pnpm --filter @danci/frontend tsc --noEmit
pnpm --filter @danci/shared tsc --noEmit

# 构建验证
pnpm build
```

### 6.2 短期执行（中优先级）

#### Vitest 版本统一 (1 小时)

```bash
# 升级 native 包
cd packages/native
pnpm add -D vitest@^4.0.15

# 检查配置兼容性
# 可能需要调整 vitest.config.ts

# 运行测试
pnpm test
```

#### 配置 Dependabot (30 分钟)

```bash
# 创建配置文件
mkdir -p .github
# 编写 .github/dependabot.yml（见上文）

# 提交配置
git add .github/dependabot.yml
git commit -m "chore: configure dependabot for dependency management"
```

### 6.3 长期优化（低优先级）

#### 1. 评估 Zod v4 迁移价值 (1 天)

**触发条件：**

- v4 成为行业标准（>50% 采用率）
- 出现必需的 v4 专属功能
- 性能成为瓶颈（大规模验证场景）

**评估指标：**

- 迁移工作量 vs 性能收益
- 生态系统采用度
- Breaking Changes 风险

#### 2. 建立依赖更新策略 (持续)

**每周：** 检查 Dependabot PR
**每月：** 审查依赖安全漏洞
**每季度：** 评估主要版本升级

---

## 7. 风险评估与应对

### 7.1 风险矩阵

| 风险                           | 概率 | 影响 | 级别  | 应对措施          |
| ------------------------------ | ---- | ---- | ----- | ----------------- |
| 降级 frontend zod 导致测试失败 | 低   | 中   | 🟡 中 | 完整测试覆盖      |
| 升级 backend zod 引入 bug      | 极低 | 中   | 🟢 低 | v3 内部向后兼容   |
| Vitest 升级破坏 native 测试    | 中   | 低   | 🟡 中 | 渐进式升级        |
| pnpm overrides 影响其他依赖    | 低   | 高   | 🟡 中 | 仅覆盖必要依赖    |
| UUID 验证严格化（未来 v4）     | 中   | 高   | 🔴 高 | v4 迁移前充分测试 |

### 7.2 回滚方案

如果版本统一后出现问题：

```bash
# 快速回滚到当前状态
git reset --hard HEAD~1

# 或恢复 package.json
git checkout HEAD~1 -- packages/*/package.json package.json
pnpm install --force
```

---

## 8. 监控指标

### 8.1 版本一致性指标

定期运行以下命令监控：

```bash
# 检查版本分散度
pnpm list --depth=0 -r | grep -E "zod|typescript|vitest" | sort | uniq -c
```

**健康指标：**

- ✅ Zod: 所有包显示 `3.25.76`
- ✅ TypeScript: 所有包显示 `5.9.3`
- ✅ Vitest: 所有包显示 `4.0.15`

### 8.2 依赖安全审计

```bash
# 每周执行
pnpm audit --audit-level moderate

# 检查过时依赖
pnpm outdated -r
```

---

## 9. 总结与建议

### 9.1 当前状态总结

| 项目                  | 状态    | 优先级        |
| --------------------- | ------- | ------------- |
| **Zod 版本不一致**    | 🔴 严重 | P0 - 立即修复 |
| **Backend Zod 过时**  | 🟡 警告 | P0 - 立即修复 |
| **Vitest 版本不一致** | 🟡 警告 | P1 - 短期修复 |
| **TypeScript 版本**   | ✅ 良好 | -             |
| **Prisma 版本**       | ✅ 良好 | -             |
| **缺少版本管理策略**  | 🟡 警告 | P1 - 短期建立 |

### 9.2 行动建议（按优先级）

#### P0 - 立即执行（本周）

1. ✅ **统一 Zod 到 v3.25.76**
   - 成本：0.5 人天
   - 收益：消除类型安全风险

2. ✅ **添加 pnpm overrides**
   - 成本：15 分钟
   - 收益：防止未来版本漂移

3. ✅ **运行完整测试套件**
   - 成本：2 小时
   - 收益：验证修改无副作用

#### P1 - 短期执行（本月）

4. 🔧 **统一 Vitest 版本**
   - 成本：1 小时
   - 收益：测试行为一致性

5. 📝 **配置 Dependabot**
   - 成本：30 分钟
   - 收益：自动化依赖更新

6. ⚠️ **添加 CI 版本检查**
   - 成本：1 小时
   - 收益：防止 PR 引入版本不一致

#### P2 - 长期优化（未来）

7. 🔬 **评估 Zod v4 迁移**
   - 时机：v4 生态成熟时
   - 成本：2-3 人天
   - 收益：性能提升（14x）

8. 📊 **建立依赖健康监控**
   - 成本：持续
   - 收益：主动发现问题

### 9.3 最终推荐方案

**立即执行：统一 Zod 到 v3.25.76**

理由：

1. ✅ 最小化迁移成本（无代码修改）
2. ✅ 消除现有类型安全风险
3. ✅ v3.25.76 是 v3 最新稳定版
4. ✅ 保持未来 v4 迁移选项开放
5. ✅ 修复 backend 的已知 bug

**不推荐现在迁移到 v4：**

1. ❌ 高迁移成本（38+ 处代码修改）
2. ❌ Breaking Changes 风险
3. ❌ v3 完全满足当前需求
4. ❌ 性能提升对当前规模价值有限

---

## 10. 参考资料

### 官方文档

- [Zod v4 Migration Guide](https://zod.dev/v4/changelog)
- [Zod Versioning Strategy](https://zod.dev/v4/versioning)
- [pnpm Workspace](https://pnpm.io/workspaces)

### 社区资源

- [Zod v3 to v4 Breaking Changes (Detailed)](https://gist.github.com/imaman/a62d1c7bab770a3b49fe3be10a66f48a)
- [Automated Codemod for v3→v4](https://github.com/nicoespeon/zod-v3-to-v4)
- [Zod v4 Performance Benchmarks](https://www.infoq.com/news/2025/08/zod-v4-available/)

### 内部文件

- `packages/shared/src/schemas/*.ts` - Zod schema 定义
- `packages/backend/src/middleware/validate.middleware.ts` - 验证中间件
- `packages/frontend/src/utils/api-validation.ts` - Frontend 验证工具

---

**文档维护：**

- 创建日期：2025-12-13
- 负责人：Architecture Team
- 下次审查：2025-12-20（完成 Zod 统一后）
