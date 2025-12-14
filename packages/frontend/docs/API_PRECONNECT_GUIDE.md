# 如何配置 API 预连接

## 快速开始

API 预连接已通过 Vite 插件自动配置，无需手动修改 HTML 文件。

## 配置环境变量

### 开发环境

创建或编辑 `packages/frontend/.env.local`:

```env
VITE_API_URL=http://localhost:3000
```

### 生产环境

方式 1: 创建 `.env.production` 文件:

```env
VITE_API_URL=https://api.danci.app
```

方式 2: 在构建命令中指定:

```bash
VITE_API_URL=https://api.production.com pnpm run build
```

## 验证配置

### 开发环境

启动开发服务器后，在浏览器中：

1. 打开开发者工具 (F12)
2. 切换到 Elements 标签
3. 查看 `<head>` 部分，应该看到：

```html
<!-- API 资源预连接 (动态注入) -->
<link rel="preconnect" href="http://localhost:3000" crossorigin />
<link rel="dns-prefetch" href="http://localhost:3000" />
```

### 生产环境

构建后检查 `dist/index.html`:

```bash
pnpm run build
cat dist/index.html | grep preconnect
```

应该看到类似输出：

```html
<link rel="preconnect" href="https://api.danci.app" crossorigin />
```

## 性能提升

正确配置后，首次 API 请求将节省 100-500ms 的连接建立时间。

在 Chrome DevTools 的 Network 标签中，你会看到：

- DNS 查询已提前完成
- TCP 连接已建立
- TLS 握手已完成

## 常见问题

### Q: 我修改了 VITE_API_URL，但没有生效？

A: 需要重启开发服务器：

```bash
# Ctrl+C 停止
pnpm run dev  # 重新启动
```

### Q: 生产环境还是看到 HTTP URL？

A: 检查 NODE_ENV 是否设置为 production。插件会自动将生产环境的 HTTP 转换为 HTTPS。

### Q: 如何禁用预连接？

A: 不推荐禁用，但如果需要，可以在 `vite.config.ts` 中注释掉 `inject-api-preconnect` 插件。

## 相关文档

- [Vite 环境变量文档](https://vitejs.dev/guide/env-and-mode.html)
- [MDN: preconnect](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/preconnect)
- [Web.dev: Resource Hints](https://web.dev/preconnect-and-dns-prefetch/)
