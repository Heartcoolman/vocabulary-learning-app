# 依赖版本管理快速指南

## 🚨 发现版本不一致？立即修复

### 一键修复脚本

```bash
# 在项目根目录运行
./scripts/fix-zod-versions.sh
```

这会自动：

- ✅ 统一所有包的 Zod 版本到 3.25.76
- ✅ 配置 pnpm overrides
- ✅ 重新安装依赖
- ✅ 验证版本一致性

---

## 📋 日常检查命令

### 快速检查所有关键依赖

```bash
./scripts/check-dependency-versions.sh
```

### 手动检查特定依赖

```bash
# 检查 Zod 版本
pnpm list zod --depth=0 -r

# 检查 TypeScript 版本
pnpm list typescript --depth=0 -r

# 检查 Vitest 版本
pnpm list vitest --depth=0 -r

# 检查所有过时依赖
pnpm outdated -r
```

---

## 🔧 常见问题修复

### 问题 1: Zod 版本不一致

**症状：**

```
@danci/backend: zod 3.22.4
@danci/frontend: zod 4.1.13
@danci/shared: zod 3.25.76
```

**修复：**

```bash
./scripts/fix-zod-versions.sh
```

**手动修复：**

```bash
# 1. 更新 package.json
# packages/backend/package.json: "zod": "^3.25.76"
# packages/frontend/package.json: "zod": "^3.25.76"

# 2. 添加根级别覆盖（package.json）
{
  "pnpm": {
    "overrides": {
      "zod": "3.25.76"
    }
  }
}

# 3. 重新安装
pnpm install --force
```

---

### 问题 2: 安装后版本仍然不一致

**可能原因：**

- pnpm 缓存问题
- lockfile 冲突

**修复：**

```bash
# 清理缓存
pnpm store prune

# 删除 node_modules
rm -rf node_modules packages/*/node_modules

# 删除 lockfile
rm pnpm-lock.yaml

# 重新安装
pnpm install
```

---

### 问题 3: TypeScript 类型错误

**症状：**

```
Type 'ZodString' is not assignable to type 'ZodEmail'
```

**原因：** Zod v3 和 v4 的类型不兼容

**修复：**

```bash
# 确保统一到 v3
./scripts/fix-zod-versions.sh

# 重新生成类型
pnpm --filter @danci/backend tsc --noEmit
pnpm --filter @danci/frontend tsc --noEmit
```

---

## 🎯 添加新依赖时

### 添加到 shared 包（需要前后端共享）

```bash
cd packages/shared
pnpm add <package-name>
```

**⚠️ 重要：** 如果是关键依赖（如 Zod、TypeScript），需要：

1. **更新根 package.json 的 pnpm.overrides**

   ```json
   {
     "pnpm": {
       "overrides": {
         "<package-name>": "<version>"
       }
     }
   }
   ```

2. **运行版本检查**
   ```bash
   ./scripts/check-dependency-versions.sh
   ```

### 添加到 backend/frontend（特定包使用）

```bash
# Backend
cd packages/backend
pnpm add <package-name>

# Frontend
cd packages/frontend
pnpm add <package-name>
```

---

## 📊 CI/CD 集成

### GitHub Actions 自动检查

每次 PR 和 push 到 main 时，会自动运行：

- ✅ Zod 版本一致性检查
- ✅ TypeScript 版本检查
- ✅ pnpm overrides 配置检查
- ✅ 安全审计

**查看结果：** Actions tab → Dependency Version Check

### Dependabot 自动更新

- **每周一：** 根项目和 shared 包
- **每周二：** Backend 包
- **每周三：** Frontend 包
- **每周四：** Native 包
- **每月一次：** GitHub Actions

**⚠️ 审查 Dependabot PR 时：**

1. 检查是否影响版本一致性
2. 运行完整测试套件
3. 特别注意 major 版本升级

---

## 🛠️ 维护命令

### 定期执行（每周）

```bash
# 1. 检查版本一致性
./scripts/check-dependency-versions.sh

# 2. 安全审计
pnpm audit --audit-level moderate

# 3. 检查过时依赖
pnpm outdated -r

# 4. 清理未使用的依赖（手动确认）
# npx depcheck packages/backend
# npx depcheck packages/frontend
```

### 每次更新依赖后

```bash
# 1. 运行所有测试
pnpm test

# 2. 类型检查
pnpm --filter @danci/backend tsc --noEmit
pnpm --filter @danci/frontend tsc --noEmit
pnpm --filter @danci/shared tsc --noEmit

# 3. 构建验证
pnpm build

# 4. 版本一致性检查
./scripts/check-dependency-versions.sh
```

---

## 📚 关键依赖版本锁定

当前锁定的版本（在 pnpm.overrides 中）：

| 依赖    | 版本      | 原因           |
| ------- | --------- | -------------- |
| **zod** | `3.25.76` | 跨包类型一致性 |

---

## 🔍 故障排查

### 症状：测试失败（Zod 验证错误）

**检查：**

```bash
# 1. 验证 Zod 版本
pnpm list zod -r

# 2. 检查 shared 包是否正确导入
grep -r "from '@danci/shared'" packages/*/src
```

### 症状：构建失败（类型错误）

**检查：**

```bash
# 1. 清理构建缓存
rm -rf packages/*/dist

# 2. 重新生成 Prisma 客户端（如果相关）
pnpm --filter @danci/backend prisma:generate

# 3. 重新构建
pnpm build
```

### 症状：pnpm install 很慢

**优化：**

```bash
# 1. 清理缓存
pnpm store prune

# 2. 使用 --prefer-offline
pnpm install --prefer-offline

# 3. 使用 --frozen-lockfile（CI 环境）
pnpm install --frozen-lockfile
```

---

## 📖 相关文档

- [完整审计报告](DEPENDENCY_VERSION_AUDIT_AND_STRATEGY.md) - 详细分析和策略
- [修复脚本源码](scripts/fix-zod-versions.sh)
- [检查脚本源码](scripts/check-dependency-versions.sh)
- [Dependabot 配置](.github/dependabot.yml)
- [CI 工作流](.github/workflows/dependency-check.yml)

---

## 🆘 需要帮助？

1. 查看 [完整审计报告](DEPENDENCY_VERSION_AUDIT_AND_STRATEGY.md)
2. 运行诊断脚本：`./scripts/check-dependency-versions.sh`
3. 查看 CI 日志：GitHub Actions → Dependency Version Check
4. 联系团队维护者

---

**最后更新：** 2025-12-13
**维护者：** Architecture Team
