# 用户体验场景测试指南

## 📋 概述

这是一套全面的用户体验测试套件，模拟真实用户在不同场景下的使用体验，帮助识别性能瓶颈、用户体验问题和系统稳健性。

## 🎯 测试场景

### 1. 新用户首次访问

模拟全新用户第一次访问应用的体验。

**测试目标:**

- 测量首次内容绘制（FCP）
- 测量最大内容绘制（LCP）
- 测量可交互时间（TTI）
- 验证资源预加载效果
- 评估首次加载体验

**性能基准:**

- FCP < 2秒
- LCP < 4秒
- TTI < 5秒
- 总加载时间 < 5秒

**运行测试:**

```bash
./scripts/quick-ux-test.sh 1
```

### 2. 老用户重复访问

模拟老用户多次访问应用的体验。

**测试目标:**

- 测量缓存命中率
- 验证缓存策略有效性
- 测量重复访问加载时间
- 检查数据新鲜度
- 评估 Service Worker 价值

**性能基准:**

- 缓存命中率 > 50%
- 重复访问加载时间 < 首次加载的 80%
- 资源加载时间明显减少

**运行测试:**

```bash
./scripts/quick-ux-test.sh 2
```

### 3. 快速连续操作

模拟用户快速连续点击和输入的场景。

**测试目标:**

- 测试防抖（Debounce）机制
- 测试节流（Throttle）机制
- 验证竞态条件处理
- 检查 UI 响应性
- 识别卡顿问题

**性能基准:**

- 错误率 < 20%
- 平均响应时间 < 500ms
- 无界面卡顿

**运行测试:**

```bash
./scripts/quick-ux-test.sh 3
```

### 4. 弱网络环境

模拟 3G 网络和离线场景。

**测试目标:**

- 测试 3G 网络下的加载性能
- 验证离线降级体验
- 检查错误处理机制
- 验证重试逻辑
- 评估弱网络用户体验

**性能基准:**

- 3G 网络加载时间 < 10秒
- 提供离线提示或降级体验
- 网络恢复后自动重连

**运行测试:**

```bash
./scripts/quick-ux-test.sh 4
```

### 5. 长时间使用

模拟用户长时间（30分钟）持续使用应用。

**测试目标:**

- 监控内存使用趋势
- 检测内存泄漏
- 验证性能衰减
- 检查清理机制
- 评估长期稳定性

**性能基准:**

- 内存增长 < 100%
- 无明显性能衰减
- 无内存泄漏

**运行测试:**

```bash
./scripts/quick-ux-test.sh 5
```

### 6. 跨浏览器测试

验证应用在不同浏览器中的兼容性。

**测试目标:**

- Chrome 兼容性测试
- Firefox 兼容性测试
- Safari/WebKit 兼容性测试
- 移动浏览器测试
- CSS 布局兼容性

**性能基准:**

- 所有浏览器基本功能正常
- 布局偏移次数 < 10
- 无严重兼容性问题

**运行测试:**

```bash
# 首先在 playwright.config.ts 中启用多浏览器
# 然后运行:
./scripts/quick-ux-test.sh 6
```

### 7. 边缘场景

测试异常输入和错误恢复能力。

**测试目标:**

- 异常输入处理
- 错误恢复机制
- 边界条件处理
- 并发请求处理
- 大数据量渲染

**性能基准:**

- 应用不崩溃
- 优雅的错误提示
- 自动错误恢复

**运行测试:**

```bash
./scripts/quick-ux-test.sh 7
```

## 🚀 快速开始

### 前置条件

1. 安装依赖:

```bash
pnpm install
```

2. 确保数据库运行正常:

```bash
# 如果使用 Docker
pnpm docker:up
```

### 运行测试

#### 方法 1: 快速测试（推荐）

运行所有场景:

```bash
chmod +x scripts/quick-ux-test.sh
./scripts/quick-ux-test.sh
```

运行特定场景:

```bash
./scripts/quick-ux-test.sh 1  # 场景 1
./scripts/quick-ux-test.sh 2  # 场景 2
# ...
```

#### 方法 2: 完整测试（包含自动启动服务）

```bash
chmod +x scripts/run-user-experience-tests.sh
./scripts/run-user-experience-tests.sh
```

这个脚本会:

- 自动启动后端和前端服务
- 运行所有测试场景
- 生成详细报告
- 清理测试环境

#### 方法 3: 使用 Playwright 直接运行

```bash
# 手动启动服务
pnpm dev:backend  # 终端 1
pnpm dev:frontend # 终端 2

# 运行测试（终端 3）
pnpm playwright test tests/e2e/user-experience-scenarios.spec.ts
```

## 📊 查看测试报告

### HTML 报告（推荐）

```bash
pnpm playwright show-report
```

浏览器会自动打开详细的 HTML 报告，包含:

- 每个测试的执行结果
- 失败截图和视频
- 性能指标数据
- 错误堆栈追踪

### 控制台输出

测试运行时会在控制台输出详细信息:

- 实时测试进度
- 性能指标数据
- 错误和警告
- 测试汇总

### 生成综合报告

```bash
# 运行报告生成器
tsx scripts/generate-ux-report.ts
```

这会生成:

- `reports/user-experience-report.md` - Markdown 格式报告
- `reports/user-experience-report.json` - JSON 格式数据

## 🔧 配置选项

### Playwright 配置

编辑 `playwright.config.ts`:

```typescript
export default defineConfig({
  // 测试重试次数
  retries: 1,

  // 并行执行数量
  workers: 1,

  // 超时设置
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  // 启用多浏览器测试
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

### 性能基准配置

编辑 `tests/e2e/user-experience-scenarios.spec.ts` 中的断言:

```typescript
// 调整性能基准
expect(metrics.fcp).toBeLessThan(2000); // FCP < 2s
expect(metrics.lcp).toBeLessThan(4000); // LCP < 4s
```

## 📈 性能指标说明

### 核心 Web 指标 (Core Web Vitals)

| 指标    | 说明         | 优秀    | 良好    | 需改进  |
| ------- | ------------ | ------- | ------- | ------- |
| **FCP** | 首次内容绘制 | < 1.8s  | < 3s    | > 3s    |
| **LCP** | 最大内容绘制 | < 2.5s  | < 4s    | > 4s    |
| **TTI** | 可交互时间   | < 3.8s  | < 7.3s  | > 7.3s  |
| **CLS** | 累积布局偏移 | < 0.1   | < 0.25  | > 0.25  |
| **FID** | 首次输入延迟 | < 100ms | < 300ms | > 300ms |

### 自定义指标

| 指标           | 说明                 | 基准   |
| -------------- | -------------------- | ------ |
| **总加载时间** | 从开始到完全加载     | < 5s   |
| **缓存命中率** | 从缓存加载的资源比例 | > 50%  |
| **错误率**     | 操作失败的比例       | < 20%  |
| **内存增长**   | 长时间使用的内存增长 | < 100% |

## 🐛 故障排查

### 测试失败

1. **服务未启动**

   ```bash
   # 检查服务状态
   curl http://localhost:3000/api/about/health
   curl http://localhost:5173
   ```

2. **超时错误**
   - 增加 `playwright.config.ts` 中的超时时间
   - 检查网络连接
   - 检查系统资源

3. **浏览器启动失败**
   ```bash
   # 安装浏览器
   pnpm playwright install chromium
   ```

### 性能不达标

1. **分析性能瓶颈**
   - 查看 Lighthouse 报告
   - 使用 Chrome DevTools Performance
   - 检查网络请求瀑布图

2. **优化建议**
   - 压缩和优化图片
   - 启用代码分割
   - 使用 CDN
   - 优化关键渲染路径
   - 实现资源预加载

## 📝 CI/CD 集成

### GitHub Actions

```yaml
name: User Experience Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm playwright install --with-deps
      - run: ./scripts/run-user-experience-tests.sh
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## 🔄 持续改进

### 定期运行

建议在以下时机运行测试:

- 每次代码提交前
- Pull Request 创建时
- 发布前
- 每日自动测试

### 性能追踪

1. 建立性能基线
2. 追踪性能趋势
3. 设置性能预警
4. 定期审查和优化

### 测试维护

1. 定期更新测试用例
2. 调整性能基准
3. 添加新的测试场景
4. 删除过时的测试

## 💡 最佳实践

1. **测试隔离**: 每个测试独立运行，不依赖其他测试
2. **真实场景**: 模拟真实用户行为
3. **性能预算**: 设定明确的性能目标
4. **快速反馈**: 优先运行快速测试
5. **完整覆盖**: 定期运行完整测试套件

## 📚 相关资源

- [Playwright 文档](https://playwright.dev/)
- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API)

## 🤝 贡献

如果您发现测试中的问题或有改进建议:

1. 创建 Issue 描述问题
2. 提交 Pull Request
3. 更新文档

## 📄 许可证

MIT
