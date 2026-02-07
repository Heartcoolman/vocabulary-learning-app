# 前端设计规范文档 (Design System)

本文档基于现有代码库 (`packages/frontend`) 的设计实现整理而成，旨在统一设计语言，确保 UI/UX 的一致性。

**核心设计理念**: 极简主义，强调微交互与流畅的动效 (G3-inspired)，注重内容呈现与视觉层级。

---

## 1. 排版系统 (Typography)

采用系统原生字体栈，确保最佳渲染性能与可读性。

### 字体栈 (Font Family)

```css
font-family:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
  'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

### 字重 (Font Weight)

- **Normal**: 400 (`font-normal`)
- **Medium**: 500 (`font-medium`) - 用于链接、小标题
- **Semibold**: 600 (`font-semibold`) - 用于强调文字
- **Bold**: 700 (`font-bold`) - 用于大标题

### 文字尺度 (Type Scale)

基于 **1.25** 比例尺度。

| 类别 (Token)  | CSS类名     | 大 小 (rem/px)  | 用途                 |
| :------------ | :---------- | :-------------- | :------------------- |
| **Micro**     | `text-xs`   | 0.75rem (12px)  | 辅助说明、标签       |
| **Caption**   | `text-sm`   | 0.875rem (14px) | 次要内容、输入框文字 |
| **Body**      | `text-base` | 1rem (16px)     | 正文默认大小         |
| **Heading 5** | `text-lg`   | 1.125rem (18px) | 强调正文、卡片标题   |
| **Heading 4** | `text-xl`   | 1.25rem (20px)  | 小标题               |
| **Heading 3** | `text-2xl`  | 1.5rem (24px)   | 模块标题             |
| **Heading 2** | `text-3xl`  | 1.875rem (30px) | 页面标题             |
| **Heading 1** | `text-4xl`  | 2.25rem (36px)  | 巨型标题             |

### 行高 (Line Height)

- `leading-tight` (1.25): 用于大标题
- `leading-snug` (1.375): 用于小标题
- `leading-normal` (1.5): 默认
- `leading-relaxed` (1.625): 用于长段落
- `leading-loose` (2): 宽松

---

## 2. 色彩系统 (Color System)

### 主色调

- **Primary Blue**: 使用 Tailwind `blue-500` 到 `blue-600` 的渐变。
  - Gradient: `linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)`
  - Hover: `linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)`

### 背景色

- **Page Background**: `#fafbfc` (极淡的灰白色)
- **Surface White**: `#ffffff`
- **Surface Muted**: `gray-50`

### 语义色

- **Success**: `green-500` / `green-600`
- **Danger**: `red-500` / `red-600`
- **Warning**: `amber-500` / `amber-600`
- **Text Primary**: `gray-900`
- **Text Secondary**: `gray-500`

### 渐变 (Gradients)

- **Glass (玻璃态)**: `linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(249, 250, 251, 0.85) 100%)`
- **Shine (微光)**: `linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)`

---

## 3. 阴影与深度 (Shadows & Depth)

采用 **G3 阴影系统**，模拟自然光照与层级。

| 级别 (Token)     | CSS类名               | 描述                               |
| :--------------- | :-------------------- | :--------------------------------- |
| **Soft**         | `shadow-soft`         | 基础层级，极柔和，用于卡片默认状态 |
| **Elevated**     | `shadow-elevated`     | 悬浮层级，用于 hover 或浮窗        |
| **Floating**     | `shadow-floating`     | 最高层级，用于模态框、Dropdown     |
| **Button Rest**  | `shadow-button-rest`  | 按钮静止状态                       |
| **Button Hover** | `shadow-button-hover` | 按钮悬停状态                       |

---

## 4. 圆角规范 (Border Radius)

组件采用语义化圆角，风格较为圆润友好。

- **Card**: `1rem` (16px) - `rounded-card`
- **Button**: `0.75rem` (12px) - `rounded-button`
- **Input**: `0.625rem` (10px) - `rounded-input`
- **Badge**: `0.5rem` (8px) - `rounded-badge`
- **Pill**: `9999px` - `rounded-full`

---

## 5. 动效系统 (Motion & Animation)

基于 HyperOS/MIUI 的自然触感设计 G3 曲线。

### 缓动曲线 (Easings)

- `ease-g3-standard`: 标准缓动
- `ease-g3-enter`: 入场缓动
- `ease-g3-exit`: 出场缓动

### 持续时间 (Durations)

- `g3-fast`
- `g3-normal` (约 300ms)
- `g3-slow`

### 常用交互动效

- **Hover Up**: 卡片悬停时上浮并增加阴影 (`hover:-translate-y-1`)
- **Active Scale**: 按钮点击时微缩 (`active:scale-[0.98]`)
- **Ripple**: 涟漪波纹动画
- **Pulse**: 焦点或加载时的呼吸效果

---

## 6. 组件规范 (Component Specs)

### 按钮 (Button)

- **高度**: sm (32px), md (40px), lg (48px)
- **Style**:
  - `Primary`: 蓝色渐变背景，白色文字，带阴影。
  - `Secondary`: 白色背景，灰色边框，软阴影。
  - `Outline`: 透明背景，蓝色边框，蓝色文字。
  - `Ghost`: 透明背景，灰色文字，Hover背景变灰。
- **Icon**: 支持左右图标，或纯图标按钮 (圆形)。

### 卡片 (Card)

- **Variants**:
  - `Elevated`: 白底，软阴影 (默认)
  - `Glass`: 毛玻璃效果 (`backdrop-blur-sm`)，半透明白底
  - `Outlined`: 仅边框
  - `Filled`: 浅灰背景无边框
- **Padding**: sm (12px), md (16px), lg (24px)
- **Hover**: 可选 `clickable` 属性，启用上浮动效。

### 输入框 (Input)

- **Style**: 浅灰背景 (`bg-gray-50/50`)，Focus 时变白并加蓝色光圈。
- **Class**: `input-enhanced`
- **States**: Disabled 样式为半透明。

### 骨架屏 (Skeleton)

- 提供 `.skeleton-line` (圆角) 和 `.skeleton-circle` (圆形) 变体。
- 支持减少动画 (`prefers-reduced-motion`) 模式下的静态展示。

---

## 7. 布局与间距 (Layout)

- 遵循 Tailwind 默认间距系统 (4px grid)。
- 常用容器 Padding: `p-4` (16px), `p-6` (24px).
- 常用 Gap: `gap-2` (8px), `gap-4` (16px).
