# 用户体验测试 - 快速命令参考

## 🚀 快速开始

### 验证环境

```bash
./scripts/verify-ux-test-setup.sh
```

### 运行所有场景测试

```bash
./scripts/quick-ux-test.sh
```

### 查看测试报告

```bash
pnpm playwright show-report
```

---

## 📋 分场景测试命令

### 场景 1: 新用户首次访问 ⭐

```bash
./scripts/quick-ux-test.sh 1
```

**测试内容**: FCP、LCP、TTI、资源预加载

### 场景 2: 老用户重复访问 ⭐

```bash
./scripts/quick-ux-test.sh 2
```

**测试内容**: 缓存命中率、重复访问性能

### 场景 3: 快速连续操作

```bash
./scripts/quick-ux-test.sh 3
```

**测试内容**: 防抖/节流、UI 响应性

### 场景 4: 弱网络环境

```bash
./scripts/quick-ux-test.sh 4
```

**测试内容**: 3G 网络、离线降级

### 场景 5: 长时间使用

```bash
./scripts/quick-ux-test.sh 5
```

**测试内容**: 内存泄漏、性能衰减

### 场景 6: 跨浏览器测试

```bash
# 首先启用多浏览器（编辑 playwright.config.ts）
./scripts/quick-ux-test.sh 6
```

**测试内容**: Chrome/Firefox/Safari 兼容性

### 场景 7: 边缘场景

```bash
./scripts/quick-ux-test.sh 7
```

**测试内容**: 异常输入、错误恢复

---

## 🔧 完整测试流程

### 自动化完整测试（推荐用于 CI/CD）

```bash
./scripts/run-user-experience-tests.sh
```

**功能**:

- 自动启动后端服务（端口 3000）
- 自动启动前端服务（端口 5173）
- 运行所有测试场景
- 生成详细报告
- 自动清理环境

---

## 📊 报告相关命令

### 查看 HTML 报告

```bash
pnpm playwright show-report
```

### 生成综合报告

```bash
tsx scripts/generate-ux-report.ts
```

### 查看 Markdown 报告

```bash
cat reports/user-experience-report.md
```

### 查看 JSON 报告

```bash
cat test-results/results.json | jq
```

---

## 🛠️ 开发调试命令

### 仅启动服务（不运行测试）

```bash
# 终端 1: 启动后端
pnpm dev:backend

# 终端 2: 启动前端
pnpm dev:frontend
```

### 使用 Playwright UI 模式（交互式调试）

```bash
pnpm playwright test tests/e2e/user-experience-scenarios.spec.ts --ui
```

### 运行单个测试

```bash
pnpm playwright test tests/e2e/user-experience-scenarios.spec.ts \
  --grep "第1轮 - 测量首次加载性能"
```

### 查看测试列表

```bash
pnpm playwright test tests/e2e/user-experience-scenarios.spec.ts --list
```

---

## 🔍 Playwright 常用命令

### 安装浏览器

```bash
pnpm playwright install chromium
pnpm playwright install firefox
pnpm playwright install webkit
```

### 安装系统依赖

```bash
pnpm playwright install-deps
```

### 更新 Playwright

```bash
pnpm add -D @playwright/test@latest
pnpm playwright install
```

### 查看 Playwright 版本

```bash
pnpm playwright --version
```

---

## 📁 项目目录快速访问

### 测试文件

```bash
# 编辑测试套件
vim tests/e2e/user-experience-scenarios.spec.ts

# 编辑配置
vim tests/e2e/ux-monitor-config.ts
```

### 配置文件

```bash
# 编辑 Playwright 配置
vim playwright.config.ts
```

### 脚本文件

```bash
# 查看所有脚本
ls -la scripts/*.sh

# 编辑快速测试脚本
vim scripts/quick-ux-test.sh
```

### 文档文件

```bash
# 查看所有文档
ls -la docs/*UX*.md docs/*TESTING*.md

# 查看完整文档
less docs/USER_EXPERIENCE_TESTING.md

# 查看快速入门
less docs/README_UX_TESTING.md

# 查看项目总结
less docs/UX_TESTING_SUMMARY.md
```

---

## 🐛 故障排查命令

### 检查服务状态

```bash
# 检查后端
curl http://localhost:3000/api/about/health

# 检查前端
curl http://localhost:5173
```

### 查看端口占用

```bash
# Linux/Mac
lsof -i:3000
lsof -i:5173

# 或使用 netstat
netstat -tuln | grep 3000
netstat -tuln | grep 5173
```

### 杀死占用端口的进程

```bash
# Linux/Mac
kill -9 $(lsof -t -i:3000)
kill -9 $(lsof -t -i:5173)
```

### 清理测试结果

```bash
rm -rf test-results/
rm -rf playwright-report/
```

### 重新安装依赖

```bash
pnpm install --force
```

---

## 📊 性能分析命令

### 查看性能时间线（Chrome DevTools）

测试运行后，打开 `test-results/` 目录下的 trace 文件

### 使用 Lighthouse 分析

```bash
# 需要先安装 Lighthouse CI
pnpm lighthouse
```

### 查看 Bundle 大小

```bash
# 前端构建并分析
cd packages/frontend
pnpm build

# 查看生成的 dist/stats.html
open dist/stats.html
```

---

## 🔄 CI/CD 集成示例

### GitHub Actions 工作流

```yaml
name: UX Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: corepack enable
      - run: pnpm install
      - run: pnpm playwright install --with-deps
      - run: ./scripts/run-user-experience-tests.sh
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### 本地模拟 CI 环境

```bash
# 使用 act 工具
act -j test
```

---

## 💡 常用操作流程

### 开发中快速验证性能

```bash
# 1. 启动服务
pnpm dev

# 2. 快速测试关键场景（另一个终端）
./scripts/quick-ux-test.sh 1
./scripts/quick-ux-test.sh 2

# 3. 查看报告
pnpm playwright show-report
```

### PR 前完整测试

```bash
# 运行完整测试套件
./scripts/run-user-experience-tests.sh

# 生成报告
tsx scripts/generate-ux-report.ts

# 查看报告
cat reports/user-experience-report.md
```

### 性能优化工作流

```bash
# 1. 运行基准测试
./scripts/quick-ux-test.sh > baseline.log

# 2. 进行优化

# 3. 运行对比测试
./scripts/quick-ux-test.sh > optimized.log

# 4. 对比结果
diff baseline.log optimized.log
```

---

## 📚 文档快速访问

```bash
# 完整使用文档
less docs/USER_EXPERIENCE_TESTING.md

# 快速入门指南
less docs/README_UX_TESTING.md

# 报告示例
less docs/EXAMPLE_UX_REPORT.md

# 项目总结
less docs/UX_TESTING_SUMMARY.md

# 报告模板
less docs/REPORT_TEMPLATE.md

# 本命令参考
less docs/COMMANDS_REFERENCE.md
```

---

## 🎯 最常用的 5 个命令

```bash
# 1. 验证环境
./scripts/verify-ux-test-setup.sh

# 2. 快速测试
./scripts/quick-ux-test.sh

# 3. 查看报告
pnpm playwright show-report

# 4. 运行特定场景
./scripts/quick-ux-test.sh 1

# 5. 完整测试（CI/CD）
./scripts/run-user-experience-tests.sh
```

---

**提示**: 使用 `chmod +x scripts/*.sh` 确保所有脚本有执行权限

**更新日期**: 2025-12-13
