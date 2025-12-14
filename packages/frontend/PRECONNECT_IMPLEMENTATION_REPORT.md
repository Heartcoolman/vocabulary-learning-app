# 资源预加载实施报告 (任务 1.3)

**实施日期**: 2025-12-13
**任务**: 添加资源预加载到 index.html (动态注入方式)
**状态**: ✅ 完成

## 1. 任务背景

根据 Codex 审查建议，不应硬编码 `localhost:3000` 到 HTML 文件中，而应使用 `VITE_API_URL` 环境变量动态注入 preconnect 标签。

## 2. 实施方案

### 2.1 技术方案 (方案B：动态注入)

使用 Vite 的 `transformIndexHtml` 插件 API 在构建时动态注入 preconnect 标签：

- **开发环境**: 从 `process.env.VITE_API_URL` 读取 API URL
- **生产环境**:
  - 自动将 HTTP URL 转换为 HTTPS
  - 正确解析 URL origin (协议 + 域名 + 端口)
  - 同时注入 `preconnect` 和 `dns-prefetch` 标签

### 2.2 代码修改

**文件**: `/home/liji/danci/danci/packages/frontend/vite.config.ts`

添加自定义插件 `inject-api-preconnect`:

```typescript
{
  name: 'inject-api-preconnect',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      // 从环境变量获取 API URL
      const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000';

      // 解析 URL 以提取 origin (协议 + 域名 + 端口)
      let apiOrigin: string;
      try {
        const url = new URL(apiUrl);
        apiOrigin = url.origin;
      } catch (error) {
        // 如果解析失败，使用默认值
        apiOrigin = 'http://localhost:3000';
      }

      // 生产环境强制使用 HTTPS
      if (process.env.NODE_ENV === 'production' && apiOrigin.startsWith('http://')) {
        apiOrigin = apiOrigin.replace('http://', 'https://');
      }

      // 注入 preconnect 和 dns-prefetch 标签
      const preconnectTags = `
    <!-- API 资源预连接 (动态注入) -->
    <link rel="preconnect" href="${apiOrigin}" crossorigin>
    <link rel="dns-prefetch" href="${apiOrigin}">`;

      // 在 </head> 标签之前插入
      return html.replace('</head>', `${preconnectTags}\n  </head>`);
    },
  },
}
```

## 3. 测试验证

### 3.1 开发环境验证

**测试命令**:

```bash
VITE_API_URL=http://localhost:3000 pnpm run dev
```

**实际输出 HTML**:

```html
<head>
  <!-- ... 其他标签 ... -->

  <!-- API 资源预连接 (动态注入) -->
  <link rel="preconnect" href="http://localhost:3000" crossorigin />
  <link rel="dns-prefetch" href="http://localhost:3000" />
</head>
```

✅ **结果**: 成功注入，使用开发环境 HTTP URL

### 3.2 生产环境验证

测试了以下场景：

| 场景        | VITE_API_URL                  | 生成的 preconnect              | 说明                    |
| ----------- | ----------------------------- | ------------------------------ | ----------------------- |
| HTTP URL    | `http://api.example.com`      | `https://api.example.com`      | ✅ 自动转换为 HTTPS     |
| HTTPS URL   | `https://api.example.com`     | `https://api.example.com`      | ✅ 保持不变             |
| 带端口 HTTP | `http://api.example.com:8080` | `https://api.example.com:8080` | ✅ 保留端口，转换协议   |
| 默认值      | (未设置)                      | `https://localhost:3000`       | ✅ 使用默认值并转 HTTPS |
| 典型生产    | `https://api.danci.app`       | `https://api.danci.app`        | ✅ 符合预期             |

### 3.3 验证要点

- ✅ HTTP URL 在生产环境自动转换为 HTTPS
- ✅ HTTPS URL 保持不变
- ✅ 正确提取 origin (包含协议、域名、端口)
- ✅ 同时注入 `preconnect` 和 `dns-prefetch`
- ✅ 标签位于 `</head>` 之前
- ✅ 添加注释标识动态注入来源

## 4. 配置示例

### 4.1 环境变量配置

**开发环境** (`.env.local`):

```env
VITE_API_URL=http://localhost:3000
```

**生产环境** (`.env.production`):

```env
VITE_API_URL=https://api.danci.app
```

或通过构建命令传递：

```bash
VITE_API_URL=https://api.danci.app pnpm run build
```

## 5. 性能优势

### 5.1 preconnect 的作用

- **提前建立连接**: 在浏览器实际请求 API 之前，提前完成 DNS 查询、TCP 握手、TLS 协商
- **减少延迟**: 首次 API 请求可节省 100-500ms (取决于网络条件)
- **改善用户体验**: 加快首屏数据加载

### 5.2 dns-prefetch 作为后备

对于不支持 `preconnect` 的老旧浏览器，`dns-prefetch` 提供基本的 DNS 预解析支持。

## 6. 注意事项

### 6.1 安全性

- ✅ 生产环境强制 HTTPS，避免混合内容警告
- ✅ 使用 `crossorigin` 属性，确保 CORS 预检正确处理

### 6.2 维护性

- ✅ 无需手动修改 HTML 文件
- ✅ 环境变量统一管理 API 地址
- ✅ 与现有 API 代理配置保持一致

### 6.3 兼容性

- **preconnect**: Chrome 46+, Firefox 39+, Safari 11.1+
- **dns-prefetch**: 所有现代浏览器

## 7. 构建限制说明

**注意**: 当前无法完成完整的生产构建测试，因为存在共享包的导出冲突错误：

```
"WordState" is not exported by "../shared/src/index.ts"
Conflicting namespaces: "../shared/src/index.ts" re-exports "WordState"
```

这是一个**已存在的构建问题**，与本次 preconnect 功能无关。该问题需要单独修复 `/home/liji/danci/danci/packages/shared/src/index.ts` 中的重复导出。

**验证方法**: 我们通过以下方式验证了功能正确性：

1. ✅ 开发服务器实际运行测试
2. ✅ 模拟插件逻辑的单元测试
3. ✅ 多场景边界条件测试

## 8. 后续建议

### 8.1 短期优化

1. **修复共享包构建问题**: 解决 WordState 重复导出
2. **添加更多预连接**: 考虑为 CDN、字体服务等添加 preconnect
3. **监控性能提升**: 使用 Chrome DevTools 的 Network 面板测量延迟改善

### 8.2 长期优化

1. **Resource Hints 策略化**:

   ```typescript
   // 根据路由动态注入不同的 preconnect
   if (route === '/admin') {
     inject('https://admin-api.danci.app');
   }
   ```

2. **添加 prefetch/preload**:
   - 预加载关键 JavaScript chunks
   - 预加载字体文件
   - 预加载首屏图片

3. **Service Worker 集成**:
   - 缓存 API 响应
   - 离线支持

## 9. 总结

✅ **任务完成情况**:

- [x] 分析当前 API URL 配置和构建配置
- [x] 修改 vite.config.ts 添加 transformIndexHtml 插件
- [x] 实现动态注入逻辑 (方案B)
- [x] 确保生产环境使用 HTTPS
- [x] 测试开发环境正确注入
- [x] 验证生产环境逻辑正确性
- [x] 编写实施报告

**实施方案**: 采用 Vite transformIndexHtml 插件进行动态注入，完全符合 Codex 审查建议，避免硬编码，提供灵活的环境配置支持。

**测试覆盖**: 开发环境实际测试 + 生产环境模拟测试，覆盖多种 URL 场景和边界条件。

**代码质量**:

- 完善的错误处理 (URL 解析失败回退)
- 清晰的注释和文档
- 符合 TypeScript 类型安全

---

**实施人员**: Claude (AI Assistant)
**审查状态**: 待人工审查
**相关文件**:

- `/home/liji/danci/danci/packages/frontend/vite.config.ts`
- `/home/liji/danci/danci/packages/frontend/.env.example`
