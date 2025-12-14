# CI/CD 流程文档

本文档详细说明了单词学习平台的持续集成（CI）和持续部署（CD）流程，包括构建、测试、部署和回滚的完整流程。

## 目录

- [概述](#概述)
- [CI 流程](#ci-流程)
- [CD 流程](#cd-流程)
- [环境说明](#环境说明)
- [工作流配置](#工作流配置)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)

---

## 概述

### CI/CD 架构

```
┌─────────────┐
│  开发者提交  │
│  Git Push   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│       GitHub Actions Triggers       │
│  ┌─────────┐  ┌────────┐  ┌──────┐ │
│  │ on:push │  │on:pull │  │manual│ │
│  │         │  │request │  │      │ │
│  └─────────┘  └────────┘  └──────┘ │
└─────────────────┬───────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
┌───────────────┐   ┌──────────────┐
│   CI Pipeline │   │ CD Pipeline  │
│               │   │              │
│ • Lint        │   │ • Build      │
│ • Typecheck   │   │ • Test       │
│ • Unit Tests  │   │ • Deploy     │
│ • Integration │   │ • Verify     │
│ • Build       │   │              │
└───────────────┘   └──────────────┘
```

### 主要组件

- **GitHub Actions**: 主要 CI/CD 平台
- **pnpm**: 包管理和构建工具
- **Docker**: 容器化构建和部署
- **Prisma**: 数据库迁移管理
- **Vitest**: 测试框架

---

## CI 流程

CI 流程在每次代码提交和 PR 创建时自动触发，确保代码质量。

### 1. 代码检查（Lint & Format）

**触发时机**: 所有 push 和 pull request

**流程**:

```yaml
# .github/workflows/ci.yml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.24.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ESLint
        run: pnpm lint

      - name: Check Prettier formatting
        run: pnpm format:check
```

**检查项**:

- ESLint 规则验证
- Prettier 格式化检查
- 代码风格一致性

**失败处理**:

- 阻止 PR 合并
- 通知开发者修复问题

### 2. 类型检查（TypeCheck）

**触发时机**: 所有 push 和 pull request

**流程**:

```yaml
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      # ... 环境设置 ...

      - name: Generate Prisma Client
        run: pnpm prisma:generate

      - name: Build Shared Package
        run: pnpm --filter @danci/shared build

      - name: Run TypeScript check (Frontend)
        run: pnpm --filter @danci/frontend exec tsc --noEmit

      - name: Run TypeScript check (Backend)
        run: pnpm --filter @danci/backend exec tsc --noEmit

      - name: Run TypeScript check (Shared)
        run: pnpm --filter @danci/shared exec tsc --noEmit
```

**检查项**:

- TypeScript 类型错误
- 接口定义一致性
- 导入/导出正确性

### 3. 单元测试（Unit Tests）

**触发时机**: 所有 push 和 pull request

**流程**:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb:latest-pg15
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: vocabulary_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      # ... 环境设置 ...

      - name: Run database migrations
        run: pnpm --filter @danci/backend exec prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/vocabulary_test

      - name: Run Backend Tests with Coverage
        run: pnpm --filter @danci/backend test:coverage
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/vocabulary_test
          REDIS_URL: redis://localhost:6379
          NODE_ENV: test
          JWT_SECRET: test-jwt-secret-for-ci

      - name: Upload Coverage Report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-backend
          path: packages/backend/coverage/
          retention-days: 7
```

**测试类型**:

- 单元测试（独立组件测试）
- 集成测试（多组件协作测试）
- 覆盖率报告（最低 80% 目标）

### 4. 构建验证（Build Verification）

**触发时机**: lint 和 typecheck 通过后

**流程**:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    steps:
      # ... 环境设置 ...

      - name: Generate Prisma Client
        run: pnpm prisma:generate

      - name: Build all packages
        run: pnpm build

      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: backend-build
          path: packages/backend/dist/
          retention-days: 7
```

**验证项**:

- TypeScript 编译成功
- 依赖解析正确
- 构建产物完整

### 5. 覆盖率检查（Coverage Threshold）

**触发时机**: 测试完成后

**流程**:

```yaml
jobs:
  coverage-check:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Download Coverage
        uses: actions/download-artifact@v4
        with:
          name: coverage-backend
          path: coverage/backend

      - name: Check Coverage Threshold
        run: |
          LINES=$(cat coverage/backend/coverage-summary.json | jq '.total.lines.pct')
          THRESHOLD=80
          if (( $(echo "$LINES < $THRESHOLD" | bc -l) )); then
            echo "::warning::Coverage ($LINES%) is below threshold ($THRESHOLD%)"
          fi
```

**阈值要求**:

- Lines: ≥ 80%
- Statements: ≥ 80%
- Functions: ≥ 80%
- Branches: ≥ 80%

### CI 状态总结

**流程**:

```yaml
jobs:
  ci-status:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test, build, coverage-check]
    if: always()
    steps:
      - name: Check CI Status
        run: |
          if [ "${{ needs.lint.result }}" == "failure" ]; then
            echo "::error::Lint check failed"
            exit 1
          fi
          # ... 检查所有步骤 ...
          echo "All CI checks passed!"
```

---

## CD 流程

CD 流程在代码合并到主分支后自动触发，实现自动部署。

### 1. PR 预览部署

**触发时机**: Pull Request 创建或更新

**目的**: 为 PR 创建预览环境，方便审查

**流程**:

```yaml
jobs:
  preview:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      # ... 环境设置和构建 ...

      - name: Deploy to Preview Environment
        id: deploy-preview
        run: |
          PREVIEW_URL="https://pr-${{ github.event.pull_request.number }}.preview.danci.app"
          # 使用 Vercel/Netlify 部署
          echo "preview_url=$PREVIEW_URL" >> $GITHUB_OUTPUT

      - name: Comment PR with Preview URL
        uses: actions/github-script@v7
        with:
          script: |
            const previewUrl = '${{ steps.deploy-preview.outputs.preview_url }}';
            const body = `## 🚀 预览部署完成

            | 环境 | URL |
            |------|-----|
            | 前端预览 | [${previewUrl}](${previewUrl}) |

            **提交:** \`${{ github.event.pull_request.head.sha }}\`
            `;

            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: body
            });
```

**预览环境特点**:

- 独立的前端环境
- 连接到测试数据库
- 自动清理（PR 关闭后）

### 2. 生产环境部署

**触发时机**: 代码合并到 main 分支

**流程**:

#### 步骤 1: 构建 Docker 镜像

```yaml
jobs:
  production:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      # ... 环境设置 ...

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Backend Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./packages/backend/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/backend:latest
            ghcr.io/${{ github.repository }}/backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**镜像标签策略**:

- `latest`: 最新稳定版本
- `{sha}`: 特定提交的镜像
- `v{version}`: 版本号标签（手动发布时）

#### 步骤 2: 部署到生产服务器

```yaml
- name: Deploy to Production Server
  env:
    DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
    DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
    DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
  run: |
    # 配置 SSH
    mkdir -p ~/.ssh
    echo "$DEPLOY_KEY" > ~/.ssh/deploy_key
    chmod 600 ~/.ssh/deploy_key

    # SSH 到服务器并部署
    ssh -o StrictHostKeyChecking=no -i ~/.ssh/deploy_key $DEPLOY_USER@$DEPLOY_HOST << 'EOF'
      cd /opt/danci

      # 拉取最新镜像
      docker-compose pull backend

      # 滚动更新
      docker-compose up -d --no-deps --scale backend=2 backend
      sleep 10
      docker-compose up -d --no-deps --scale backend=1 backend

      # 清理旧镜像
      docker image prune -f
    EOF
```

**部署策略**:

- 蓝绿部署（推荐）
- 滚动更新
- 金丝雀发布（高级）

#### 步骤 3: 数据库迁移

```yaml
database-migration:
  runs-on: ubuntu-latest
  needs: production
  steps:
    # ... 环境设置 ...

    - name: Run database migrations
      run: pnpm --filter @danci/backend exec prisma migrate deploy
      env:
        DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
```

**迁移安全措施**:

- 在单独的 job 中执行
- 仅在应用部署成功后执行
- 自动备份数据库（在迁移前）
- 验证迁移成功

#### 步骤 4: 部署验证

```bash
# 自动化验证脚本
#!/bin/bash
set -e

PROD_URL="https://api.yourdomain.com"

# 1. 健康检查
echo "Checking health endpoint..."
curl -f "$PROD_URL/health" || exit 1

# 2. 功能测试
echo "Running smoke tests..."
# 测试关键 API 端点
curl -f "$PROD_URL/api/auth/health" || exit 1
curl -f "$PROD_URL/api/words/health" || exit 1

# 3. 性能检查
echo "Checking response time..."
RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' "$PROD_URL/health")
if (( $(echo "$RESPONSE_TIME > 1" | bc -l) )); then
  echo "Response time too slow: ${RESPONSE_TIME}s"
  exit 1
fi

echo "Deployment verification passed!"
```

#### 步骤 5: 创建部署记录

```yaml
- name: Create GitHub Deployment
  uses: actions/github-script@v7
  with:
    script: |
      const { data: deployment } = await github.rest.repos.createDeployment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: context.sha,
        environment: 'production',
        description: `Production deployment for ${context.sha.substring(0, 7)}`
      });

      await github.rest.repos.createDeploymentStatus({
        owner: context.repo.owner,
        repo: context.repo.repo,
        deployment_id: deployment.id,
        state: 'success',
        environment_url: 'https://danci.app',
        description: 'Deployment completed successfully'
      });
```

### 3. 部署通知

**流程**:

```yaml
notify:
  runs-on: ubuntu-latest
  needs: [production, database-migration]
  if: always()
  steps:
    - name: Send Deployment Notification
      run: |
        STATUS="${{ needs.production.result }}"

        # 发送到 Slack/Discord/企业微信
        curl -X POST ${{ secrets.WEBHOOK_URL }} \
          -H 'Content-Type: application/json' \
          -d "{\"text\":\"Production deployment $STATUS for commit ${{ github.sha }}\"}"
```

**通知渠道**:

- Slack
- Discord
- 企业微信
- 钉钉
- 邮件

### 4. 自动标签创建

**流程**:

```yaml
- name: Create Release Tag
  if: needs.production.result == 'success'
  run: |
    DATE=$(date +%Y%m%d)
    SHA=$(git rev-parse --short HEAD)
    TAG="deploy-${DATE}-${SHA}"

    git tag $TAG
    git push origin $TAG
```

**标签格式**:

- `deploy-YYYYMMDD-{sha}`: 部署标签
- `v{major}.{minor}.{patch}`: 版本标签
- `release-{name}`: 发布标签

---

## 环境说明

### 环境列表

| 环境                  | 分支    | 用途     | 自动部署 |
| --------------------- | ------- | -------- | -------- |
| 开发环境 (dev)        | dev     | 日常开发 | ✅ 是    |
| 测试环境 (staging)    | staging | 集成测试 | ✅ 是    |
| 预览环境 (preview)    | PR 分支 | PR 审查  | ✅ 是    |
| 生产环境 (production) | main    | 线上服务 | ✅ 是    |

### 环境配置

#### 开发环境

```bash
# 环境变量
NODE_ENV=development
DATABASE_URL=postgresql://dev:password@dev-db:5432/danci_dev
REDIS_URL=redis://dev-redis:6379
LOG_LEVEL=debug
```

**特点**:

- 详细日志输出
- 热重载
- 开发工具启用

#### 测试环境

```bash
# 环境变量
NODE_ENV=test
DATABASE_URL=postgresql://test:password@test-db:5432/danci_test
REDIS_URL=redis://test-redis:6379
LOG_LEVEL=info
```

**特点**:

- 隔离的测试数据库
- 可重复的测试数据
- CI/CD 集成

#### 生产环境

```bash
# 环境变量
NODE_ENV=production
DATABASE_URL=postgresql://prod:secure_password@prod-db:5432/danci_prod
REDIS_URL=redis://prod-redis:6379
LOG_LEVEL=warn
SENTRY_DSN=https://...
```

**特点**:

- 优化的构建配置
- 错误追踪（Sentry）
- 监控和告警

---

## 工作流配置

### GitHub Secrets 配置

需要在 GitHub 仓库中配置以下 secrets:

#### 生产环境

```
# 部署凭证
DEPLOY_HOST=prod-server.example.com
DEPLOY_USER=deploy
DEPLOY_KEY=<SSH 私钥>

# 数据库
PRODUCTION_DATABASE_URL=postgresql://...

# API 配置
PRODUCTION_API_URL=https://api.yourdomain.com

# 容器注册表
GITHUB_TOKEN=<自动提供>

# 通知
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

#### 测试环境

```
PREVIEW_API_URL=https://preview-api.yourdomain.com
```

### 配置步骤

1. **进入仓库设置**

   ```
   GitHub 仓库 -> Settings -> Secrets and variables -> Actions
   ```

2. **添加 Secret**

   ```
   点击 "New repository secret"
   输入 Name 和 Value
   点击 "Add secret"
   ```

3. **验证配置**
   ```bash
   # 在 workflow 中测试
   echo "Secret configured: ${{ secrets.DEPLOY_HOST != '' }}"
   ```

---

## 最佳实践

### 1. 分支策略

采用 Git Flow 工作流:

```
main (production)
  └── release/* (staging)
        └── develop (dev)
              └── feature/* (individual features)
              └── bugfix/* (bug fixes)
              └── hotfix/* (production hotfixes)
```

**规则**:

- `main`: 仅接受 merge，禁止直接 push
- `develop`: 日常开发分支
- `feature/*`: 功能开发分支
- `hotfix/*`: 紧急修复分支（直接从 main 创建）

### 2. Commit 规范

使用 Conventional Commits:

```bash
# 格式
<type>(<scope>): <subject>

# 示例
feat(auth): add JWT token refresh
fix(database): resolve connection pool leak
docs(api): update authentication endpoints
chore(deps): upgrade prisma to v5.7.0
```

**类型**:

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

### 3. PR 规范

**PR 标题**: 遵循 commit 规范

**PR 描述模板**:

```markdown
## 变更类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 文档更新
- [ ] 重构
- [ ] 其他

## 变更说明

<!-- 描述主要变更 -->

## 测试

- [ ] 单元测试已添加/更新
- [ ] 集成测试已添加/更新
- [ ] 手动测试已完成

## 检查清单

- [ ] 代码遵循项目规范
- [ ] 已更新相关文档
- [ ] 通过所有 CI 检查
- [ ] 已进行自测

## 相关 Issue

Closes #123
```

### 4. 代码审查

**审查重点**:

- [ ] 代码质量和可读性
- [ ] 测试覆盖率
- [ ] 性能影响
- [ ] 安全问题
- [ ] 向后兼容性

**审查流程**:

1. 至少 1 人审查批准
2. 所有 CI 检查通过
3. 无未解决的讨论
4. 无合并冲突

### 5. 发布管理

**版本号规范** (Semantic Versioning):

```
v{major}.{minor}.{patch}

major: 破坏性变更
minor: 新功能（向后兼容）
patch: Bug 修复
```

**发布流程**:

```bash
# 1. 更新版本号
npm version minor  # 或 major/patch

# 2. 更新 CHANGELOG
# 手动编辑 CHANGELOG.md

# 3. 创建发布标签
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0

# 4. 创建 GitHub Release
# 在 GitHub 上创建 Release，附上 CHANGELOG
```

---

## 故障排查

### 常见 CI 问题

#### 1. 依赖安装失败

**症状**:

```
Error: Unable to find a match: @danci/shared@*
```

**解决方法**:

```bash
# 清除缓存
pnpm store prune

# 重新安装
pnpm install --frozen-lockfile
```

#### 2. 类型检查失败

**症状**:

```
error TS2304: Cannot find name 'PrismaClient'
```

**解决方法**:

```bash
# 确保在类型检查前生成 Prisma Client
pnpm prisma:generate
```

#### 3. 测试失败（数据库连接）

**症状**:

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**解决方法**:

```yaml
# 确保 service 健康检查通过
services:
  postgres:
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

#### 4. 构建超时

**症状**:

```
Error: The operation was canceled.
```

**解决方法**:

```yaml
# 增加超时时间
jobs:
  build:
    timeout-minutes: 30 # 默认是 360
```

### 常见 CD 问题

#### 1. Docker 构建失败

**症状**:

```
ERROR [stage-1 3/5] COPY --from=builder /app/dist ./dist
```

**解决方法**:

```dockerfile
# 检查构建产物路径
RUN ls -la /app/packages/backend/dist/
```

#### 2. 部署后服务不可用

**症状**: 健康检查失败

**排查步骤**:

```bash
# 1. 检查容器日志
docker-compose logs backend

# 2. 检查环境变量
docker-compose exec backend env | grep DATABASE_URL

# 3. 手动测试健康检查
curl http://localhost:3000/health
```

#### 3. 数据库迁移失败

**症状**:

```
Error: Migration failed
```

**解决方法**:

```bash
# 1. 检查迁移状态
pnpm prisma migrate status

# 2. 手动解决冲突
pnpm prisma migrate resolve --applied <migration-name>

# 3. 重新运行迁移
pnpm prisma migrate deploy
```

---

## 监控和告警

### CI/CD 监控指标

| 指标        | 目标值      | 告警阈值  |
| ----------- | ----------- | --------- |
| CI 构建时间 | < 10 分钟   | > 15 分钟 |
| CI 成功率   | > 95%       | < 90%     |
| 部署频率    | 每天 1-5 次 | -         |
| 部署成功率  | > 98%       | < 95%     |
| 回滚率      | < 5%        | > 10%     |

### 告警配置

```yaml
# .github/workflows/alert-on-failure.yml
name: Alert on Failure

on:
  workflow_run:
    workflows: ['CI', 'Deploy']
    types:
      - completed

jobs:
  alert:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    steps:
      - name: Send alert
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"⚠️ Workflow failed: ${{ github.event.workflow_run.name }}\"}"
```

---

## 相关文档

- [部署指南](./DEPLOYMENT_GUIDE.md) - 手动部署流程
- [运维指南](./OPERATIONS_GUIDE.md) - 日常运维操作
- [迁移部署指南](./MIGRATION_DEPLOYMENT.md) - 版本迁移策略

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-12
**维护者**: DevOps Team
