# 合规性检查标准

> **版本**: v1.0.0 | **验证状态**: ✅

## 许可证检查

### 🔴 阻断级

- [ ] **LICENSE文件**: 项目根目录有LICENSE文件
- [ ] **依赖许可**: 所有依赖许可证兼容
- [ ] **版权声明**: 代码文件有版权声明

### 许可证检查命令

```bash
# 检查依赖许可证
npx license-checker --summary

# 检查不兼容的许可证
npx license-checker --failOn "GPL;AGPL"
```

## 可访问性标准

### 🟡 警告级

- [ ] **WCAG 2.1 AA**: 符合可访问性标准
- [ ] **语义化HTML**: 使用语义化标签
- [ ] **键盘导航**: 所有功能可键盘操作
- [ ] **屏幕阅读器**: 重要元素有aria标签

### 可访问性检查

```tsx
// ✅ 正确：可访问的按钮
<button
  aria-label="播放单词发音"
  onClick={handlePlay}
>
  <PlayIcon />
</button>

// ✅ 正确：可访问的表单
<label htmlFor="email">邮箱</label>
<input
  id="email"
  type="email"
  aria-describedby="email-hint"
  aria-invalid={hasError}
/>
<span id="email-hint">请输入有效的邮箱地址</span>
```

### Lighthouse可访问性审计

```bash
pnpm lighthouse --only-categories=accessibility
# 目标分数: >= 90
```

## 浏览器兼容性

### 🟡 警告级

- [ ] **目标浏览器**: 明确支持的浏览器版本
- [ ] **Polyfill**: 必要时使用Polyfill
- [ ] **渐进增强**: 基础功能在旧浏览器可用

### Browserslist配置

```json
// package.json
{
  "browserslist": [
    "last 2 Chrome versions",
    "last 2 Firefox versions",
    "last 2 Safari versions",
    "last 2 Edge versions"
  ]
}
```

## 移动端适配

### 🟡 警告级

- [ ] **响应式设计**: 适配不同屏幕尺寸
- [ ] **触摸优化**: 触摸目标至少44x44px
- [ ] **移动性能**: Lighthouse Mobile分数 >= 80

### 响应式设计检查

```css
/* 使用Tailwind响应式类 */
<div className="
  w-full              /* 移动端全宽 */
  md:w-1/2            /* 平板半宽 */
  lg:w-1/3            /* 桌面1/3宽 */
  p-4                 /* 移动端padding */
  md:p-6              /* 平板更大padding */
">
  内容
</div>
```

## SEO要求

### 🟡 警告级

- [ ] **meta标签**: 设置title、description
- [ ] **语义化URL**: 使用有意义的URL
- [ ] **sitemap.xml**: 生成站点地图
- [ ] **robots.txt**: 配置爬虫规则

### SEO优化示例

```html
<!-- index.html -->
<head>
  <title>Danci - 智能词汇学习平台</title>
  <meta name="description" content="基于AI的个性化词汇学习系统" />
  <meta name="keywords" content="词汇学习,AI学习,智能复习" />

  <!-- Open Graph -->
  <meta property="og:title" content="Danci" />
  <meta property="og:description" content="智能词汇学习" />
  <meta property="og:image" content="/og-image.png" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
</head>
```

## 性能标准

### Lighthouse性能分数

- ✅ Desktop: >= 90
- ✅ Mobile: >= 80

## 隐私合规

### 🔴 阻断级

- [ ] **隐私政策**: 有隐私政策页面
- [ ] **Cookie同意**: 使用Cookie前获取同意
- [ ] **数据加密**: 敏感数据传输加密
- [ ] **GDPR合规**: 支持用户数据导出和删除

## 验证记录 ✅

- ✅ MIT许可证，依赖许可证兼容
- ✅ Lighthouse可访问性分数 >= 90
- ✅ 响应式设计完善
- ✅ SEO基础优化完成

## 参考资源

- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [Can I Use](https://caniuse.com/)
- [Google SEO Starter Guide](https://developers.google.com/search/docs/beginner/seo-starter-guide)
