# frontend-perf Specification

## Purpose

前端性能优化规范，重点优化首屏加载速度，减少 Bundle 大小，提升用户体验。

## ADDED Requirements

### Requirement: Bundle Size Optimization

主要 JavaScript Bundle **MUST** 优化至可接受的大小范围。

#### Scenario: React vendor chunk optimization

- **GIVEN** 生产构建完成
- **WHEN** 检查 react-vendor chunk 大小
- **THEN** gzipped 大小 **MUST** 小于 50KB
- **AND** 可通过 CDN 外部化或代码优化实现

#### Scenario: Total initial JavaScript budget

- **GIVEN** 首次加载应用
- **WHEN** 计算关键路径 JavaScript
- **THEN** 首屏所需 JS (gzipped) **MUST** 小于 150KB
- **AND** 非关键 JS **MUST** 延迟加载

#### Scenario: Chunk size warning compliance

- **GIVEN** Vite 构建执行
- **WHEN** 构建完成
- **THEN** **MUST NOT** 有超过 500KB 的 chunk 警告
- **AND** 所有 chunk **MUST** 小于 chunkSizeWarningLimit

---

### Requirement: Critical Path Optimization

首屏渲染关键路径 **MUST** 优化以满足 LCP 目标。

#### Scenario: LCP target on 4G network

- **GIVEN** 用户在 4G 网络条件下访问
- **WHEN** 页面加载完成
- **THEN** LCP **MUST** 小于 1.5 秒

#### Scenario: FCP target

- **GIVEN** 用户首次访问应用
- **WHEN** 浏览器开始渲染
- **THEN** FCP **MUST** 小于 1.0 秒

#### Scenario: Critical CSS inlining

- **GIVEN** HTML 文档加载
- **WHEN** 解析 head 标签
- **THEN** 关键 CSS **MUST** 内联或预加载
- **AND** 非关键 CSS **MUST** 异步加载

---

### Requirement: Resource Preloading Strategy

关键资源 **MUST** 使用适当的预加载策略。

#### Scenario: Preconnect to API origin

- **GIVEN** HTML 文档加载
- **WHEN** 解析 head 标签
- **THEN** **MUST** 存在 `<link rel="preconnect" href="${API_ORIGIN}">`
- **AND** **MUST** 存在对应的 `dns-prefetch`

#### Scenario: Preload critical fonts

- **GIVEN** 页面使用自定义字体
- **WHEN** HTML 文档加载
- **THEN** 关键字体 **MUST** 使用 `<link rel="preload" as="font">` 预加载

#### Scenario: Prefetch priority routes

- **GIVEN** 用户已完成首屏加载
- **WHEN** 浏览器空闲时
- **THEN** 优先路由组件 **MUST** 在后台预取
- **AND** 预取 **MUST** 使用 `requestIdleCallback` 调度

---

### Requirement: Lazy Loading Enhancement

非关键组件 **MUST** 使用懒加载以减少首屏负担。

#### Scenario: Route-level code splitting

- **GIVEN** 用户访问首页
- **WHEN** 首屏渲染完成
- **THEN** 其他路由组件 **MUST NOT** 包含在首屏 bundle
- **AND** 路由切换时 **MUST** 按需加载对应 chunk

#### Scenario: Heavy component lazy loading

- **GIVEN** 页面包含重型组件（如图表、编辑器）
- **WHEN** 页面初始渲染
- **THEN** 重型组件 **MUST** 延迟加载
- **AND** **MUST** 显示 Skeleton 或 Loading 状态

#### Scenario: Admin routes complete isolation

- **GIVEN** 普通用户访问学习页面
- **WHEN** 应用加载
- **THEN** 管理员相关代码 **MUST NOT** 加载
- **AND** admin.html 入口点 **MUST** 完全独立

---

### Requirement: Image and Asset Optimization

静态资源 **MUST** 优化以减少加载时间。

#### Scenario: Image lazy loading

- **GIVEN** 页面包含非首屏图片
- **WHEN** 页面初始渲染
- **THEN** 非可视区域图片 **MUST** 延迟加载
- **AND** **MUST** 使用 `loading="lazy"` 属性

#### Scenario: Icon bundle optimization

- **GIVEN** 使用 @phosphor-icons/react
- **WHEN** 导入图标
- **THEN** **MUST** 使用具名导入而非全量导入
- **AND** 未使用图标 **MUST NOT** 包含在 bundle

---

### Requirement: Caching Strategy

资源缓存策略 **MUST** 最大化复用并减少重复下载。

#### Scenario: Vendor chunk long-term caching

- **GIVEN** 用户再次访问应用
- **WHEN** vendor chunk 未变更
- **THEN** 浏览器 **MUST** 使用缓存版本
- **AND** chunk 文件名 **MUST** 包含 content hash

#### Scenario: React Query data caching

- **GIVEN** 数据已缓存
- **WHEN** 用户在 5 分钟内重新访问同一页面
- **THEN** **MUST** 使用缓存数据
- **AND** 不发起新的 API 请求

---

### Requirement: Performance Monitoring

性能指标 **MUST** 可监控和追踪。

#### Scenario: Web Vitals collection

- **GIVEN** 用户访问页面
- **WHEN** 页面加载完成
- **THEN** LCP、FCP、CLS、FID/INP **MUST** 被收集
- **AND** 数据 **MUST** 可发送到监控服务

#### Scenario: Performance budget enforcement

- **GIVEN** CI/CD 构建执行
- **WHEN** 构建完成
- **THEN** **MUST** 检查是否超出性能预算
- **AND** 超出预算 **SHOULD** 产生警告
