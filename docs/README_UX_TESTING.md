# 🎯 用户体验模拟测试套件

## 📖 概述

这是一套全面的用户体验测试系统，模拟真实用户在 7 种不同场景下的使用体验。通过 5 轮独立测试，全面评估系统的性能、稳定性和用户体验质量。

## ✨ 特性

- ✅ **7 大真实场景**: 覆盖新用户、老用户、快速操作、弱网络、长时间使用、跨浏览器、边缘场景
- ✅ **5 轮重复测试**: 每个场景独立运行 5 轮，确保结果稳定可靠
- ✅ **详细性能指标**: FCP、LCP、TTI、CLS、内存使用、缓存命中率等
- ✅ **自动化报告**: 生成 HTML、JSON、Markdown 格式的测试报告
- ✅ **性能预算**: 基于 Core Web Vitals 标准的性能基准
- ✅ **实时监控**: 测试过程中实时输出性能数据
- ✅ **可扩展**: 易于添加新场景和自定义指标

## 🚀 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 运行测试

#### 方式一: 快速测试（推荐用于开发）

```bash
# 运行所有场景
./scripts/quick-ux-test.sh

# 运行特定场景
./scripts/quick-ux-test.sh 1  # 场景 1: 新用户首次访问
./scripts/quick-ux-test.sh 2  # 场景 2: 老用户重复访问
./scripts/quick-ux-test.sh 3  # 场景 3: 快速连续操作
./scripts/quick-ux-test.sh 4  # 场景 4: 弱网络环境
./scripts/quick-ux-test.sh 5  # 场景 5: 长时间使用
./scripts/quick-ux-test.sh 6  # 场景 6: 跨浏览器测试
./scripts/quick-ux-test.sh 7  # 场景 7: 边缘场景
```

#### 方式二: 完整测试（推荐用于 CI/CD）

```bash
# 自动启动服务、运行测试、生成报告
./scripts/run-user-experience-tests.sh
```

### 3. 查看报告

```bash
# 打开 HTML 报告
pnpm playwright show-report

# 生成综合报告
tsx scripts/generate-ux-report.ts

# 查看报告
cat reports/user-experience-report.md
```

## 📊 测试场景详解

### 场景 1: 新用户首次访问 ⭐

**模拟内容**: 全新用户第一次访问应用

**测试重点**:

- 首次内容绘制（FCP）
- 最大内容绘制（LCP）
- 可交互时间（TTI）
- 资源预加载效果
- 首次加载体验

**运行命令**:

```bash
./scripts/quick-ux-test.sh 1
```

**预期结果**:

- FCP < 2秒
- LCP < 4秒
- TTI < 5秒

---

### 场景 2: 老用户重复访问 ⭐

**模拟内容**: 用户多次访问，测试缓存效果

**测试重点**:

- 缓存命中率
- 重复访问加载时间
- 缓存策略有效性
- 数据新鲜度

**运行命令**:

```bash
./scripts/quick-ux-test.sh 2
```

**预期结果**:

- 缓存命中率 > 50%
- 加载时间 < 首次访问的 80%

---

### 场景 3: 快速连续操作

**模拟内容**: 用户快速连续点击和输入

**测试重点**:

- 防抖/节流机制
- 竞态条件处理
- UI 响应性
- 卡顿识别

**运行命令**:

```bash
./scripts/quick-ux-test.sh 3
```

**预期结果**:

- 错误率 < 20%
- 平均响应时间 < 500ms

---

### 场景 4: 弱网络环境

**模拟内容**: 3G 网络和离线场景

**测试重点**:

- 3G 网络性能
- 离线降级体验
- 错误处理
- 重试机制

**运行命令**:

```bash
./scripts/quick-ux-test.sh 4
```

**预期结果**:

- 3G 加载时间 < 10秒
- 提供离线提示

---

### 场景 5: 长时间使用

**模拟内容**: 用户持续使用 30 分钟

**测试重点**:

- 内存使用趋势
- 内存泄漏检测
- 性能衰减
- 清理机制

**运行命令**:

```bash
./scripts/quick-ux-test.sh 5
```

**预期结果**:

- 内存增长 < 100%
- 无性能衰减

---

### 场景 6: 跨浏览器测试

**模拟内容**: Chrome、Firefox、Safari 兼容性

**测试重点**:

- 浏览器兼容性
- CSS 布局一致性
- JavaScript API 兼容性

**运行命令**:

```bash
# 首先在 playwright.config.ts 中启用多浏览器
./scripts/quick-ux-test.sh 6
```

**预期结果**:

- 所有浏览器功能正常
- 布局偏移 < 10 次

---

### 场景 7: 边缘场景

**模拟内容**: 异常输入和错误恢复

**测试重点**:

- 异常输入处理
- 错误恢复机制
- 边界条件
- 并发请求

**运行命令**:

```bash
./scripts/quick-ux-test.sh 7
```

**预期结果**:

- 应用不崩溃
- 优雅错误提示

## 📈 性能指标说明

### Core Web Vitals

| 指标    | 说明         | 优秀    | 良好    | 需改进  |
| ------- | ------------ | ------- | ------- | ------- |
| **FCP** | 首次内容绘制 | < 1.8s  | < 3s    | > 3s    |
| **LCP** | 最大内容绘制 | < 2.5s  | < 4s    | > 4s    |
| **TTI** | 可交互时间   | < 3.8s  | < 7.3s  | > 7.3s  |
| **CLS** | 累积布局偏移 | < 0.1   | < 0.25  | > 0.25  |
| **FID** | 首次输入延迟 | < 100ms | < 300ms | > 300ms |

### 自定义指标

| 指标           | 说明             | 基准   |
| -------------- | ---------------- | ------ |
| **总加载时间** | 从开始到完全加载 | < 5s   |
| **缓存命中率** | 缓存资源比例     | > 50%  |
| **错误率**     | 操作失败比例     | < 20%  |
| **内存增长**   | 长期使用内存增长 | < 100% |

## 🗂️ 项目结构

```
danci/
├── tests/e2e/
│   ├── user-experience-scenarios.spec.ts  # 测试套件主文件
│   └── ux-monitor-config.ts               # 性能监控配置
├── scripts/
│   ├── quick-ux-test.sh                   # 快速测试脚本
│   ├── run-user-experience-tests.sh       # 完整测试脚本
│   └── generate-ux-report.ts              # 报告生成器
├── docs/
│   ├── USER_EXPERIENCE_TESTING.md         # 完整使用文档
│   ├── EXAMPLE_UX_REPORT.md               # 报告示例
│   └── README_UX_TESTING.md               # 本文件
├── playwright.config.ts                   # Playwright 配置
└── reports/                               # 测试报告目录
```

## 🔧 配置选项

### 启用多浏览器测试

编辑 `playwright.config.ts`:

```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } }, // 取消注释
  { name: 'webkit', use: { ...devices['Desktop Safari'] } }, // 取消注释
];
```

### 调整性能基准

编辑 `tests/e2e/user-experience-scenarios.spec.ts`:

```typescript
expect(metrics.fcp).toBeLessThan(2000); // 调整 FCP 阈值
expect(metrics.lcp).toBeLessThan(4000); // 调整 LCP 阈值
```

### 自定义测试轮数

编辑测试文件中的循环:

```typescript
for (let round = 1; round <= 5; round++) {
  // 修改轮数
  // 测试代码
}
```

## 📝 测试报告

### HTML 报告（推荐）

```bash
pnpm playwright show-report
```

- 视觉化测试结果
- 失败截图和视频
- 详细错误堆栈
- 性能时间线

### JSON 报告

```bash
cat test-results/results.json
```

- 机器可读格式
- 适合 CI/CD 集成
- 可用于数据分析

### Markdown 报告

```bash
tsx scripts/generate-ux-report.ts
cat reports/user-experience-report.md
```

- 人类可读格式
- 包含详细建议
- 性能趋势分析

## 🎯 使用场景

### 开发阶段

```bash
# 快速测试关键场景
./scripts/quick-ux-test.sh 1
./scripts/quick-ux-test.sh 2
```

### Pull Request

```bash
# 运行完整测试套件
./scripts/run-user-experience-tests.sh
```

### CI/CD Pipeline

```yaml
# .github/workflows/ux-test.yml
- name: Run UX Tests
  run: ./scripts/run-user-experience-tests.sh

- name: Upload Report
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

### 性能审计

```bash
# 生成详细报告
./scripts/run-user-experience-tests.sh
tsx scripts/generate-ux-report.ts

# 分析性能趋势
cat reports/user-experience-report.md
```

## 🐛 故障排查

### 服务未启动

```bash
# 检查服务状态
curl http://localhost:3000/api/about/health
curl http://localhost:5173

# 手动启动服务
pnpm dev:backend  # 终端 1
pnpm dev:frontend # 终端 2
```

### 浏览器问题

```bash
# 安装浏览器
pnpm playwright install chromium

# 安装系统依赖
pnpm playwright install-deps
```

### 超时错误

编辑 `playwright.config.ts`:

```typescript
use: {
  actionTimeout: 30000,      // 增加到 30秒
  navigationTimeout: 60000,  // 增加到 60秒
}
```

## 💡 最佳实践

1. **定期运行**: 在每次代码提交前运行关键场景测试
2. **性能预算**: 设定明确的性能目标，不允许回退
3. **测试隔离**: 确保每个测试独立运行，互不影响
4. **真实场景**: 模拟真实用户行为，不要简化测试
5. **持续监控**: 建立性能监控仪表板，追踪长期趋势

## 📚 相关文档

- [完整使用文档](./USER_EXPERIENCE_TESTING.md)
- [报告示例](./EXAMPLE_UX_REPORT.md)
- [Playwright 官方文档](https://playwright.dev/)
- [Web Vitals 指南](https://web.dev/vitals/)

## 🤝 贡献

欢迎贡献！如果您有改进建议：

1. Fork 项目
2. 创建特性分支
3. 提交 Pull Request

## 📄 许可证

MIT

---

**最后更新**: 2025-12-13

**维护者**: Danci Team

**问题反馈**: 请在 GitHub Issues 提交问题
