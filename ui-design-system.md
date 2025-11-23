# UI/UX 设计系统规范

> 本文档定义了词汇学习应用的完整UI/UX设计规范，包括颜色、字体、间距、组件样式、动画效果和交互模式。所有前端开发必须遵循此规范，以确保界面的一致性和用户体验的统一性。

---

## 📐 设计原则

### 核心理念
1. **简洁优先** - 界面清晰，避免视觉干扰
2. **以学习为中心** - 突出学习内容，弱化装饰元素
3. **流畅交互** - 所有操作都有即时反馈
4. **可访问性** - 支持键盘导航和屏幕阅读器
5. **响应式设计** - 适配所有设备尺寸

---

## 🎨 颜色系统

### 主色调

```css
/* 品牌色 - 蓝色系 */
--primary-50: #eff6ff;
--primary-100: #dbeafe;
--primary-500: #3b82f6;  /* 主要按钮、链接 */
--primary-600: #2563eb;  /* 悬停状态 */

/* 中性色 - 灰色系 */
--gray-50: #f9fafb;
--gray-100: #f3f4f6;     /* 次要按钮背景 */
--gray-200: #e5e7eb;     /* 边框、分隔线 */
--gray-500: #6b7280;     /* 次要文字 */
--gray-600: #4b5563;     /* 音标、提示文字 */
--gray-700: #374151;     /* 导航文字 */
--gray-900: #111827;     /* 主要文字、标题 */

/* 语义色 */
--success-100: #dcfce7;  /* 正确答案背景 */
--success-500: #22c55e;  /* 正确答案 */
--success-600: #16a34a;

--error-100: #fee2e2;    /* 错误答案背景 */
--error-500: #ef4444;    /* 错误答案 */
--error-600: #dc2626;

--warning-100: #fef3c7;
--warning-500: #f59e0b;

/* 背景色 */
--bg-primary: #ffffff;   /* 主背景 */
--bg-secondary: #f9fafb; /* 次要背景 */
```

### 颜色使用规则

| 用途 | 颜色 | Tailwind类 |
|------|------|-----------|
| 主要按钮 | Blue-500 | `bg-blue-500 text-white` |
| 主要按钮悬停 | Blue-600 | `hover:bg-blue-600` |
| 次要按钮 | Gray-100 | `bg-gray-100 text-gray-900` |
| 次要按钮悬停 | Gray-200 | `hover:bg-gray-200` |
| 正确答案 | Green-500 | `bg-green-500 text-white` |
| 错误答案 | Red-500 | `bg-red-500 text-white` |
| 正确答案高亮 | Green-100 + Border | `bg-green-100 border-2 border-green-500` |
| 主要文字 | Gray-900 | `text-gray-900` |
| 次要文字 | Gray-600 | `text-gray-600` |
| 边框 | Gray-200 | `border-gray-200` |

---

## 📝 字体系统

### 字体族

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
             'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 
             'Droid Sans', 'Helvetica Neue', sans-serif;
```

### 字体大小

| 用途 | 大小 | Tailwind类 | 使用场景 |
|------|------|-----------|---------|
| 超大标题 | 48-64px | `text-5xl md:text-6xl` | 单词拼写 |
| 大标题 | 30px | `text-3xl` | 页面标题 |
| 中标题 | 24px | `text-2xl` | 卡片标题 |
| 音标 | 24-32px | `text-2xl md:text-3xl` | 音标显示 |
| 正文大 | 18-20px | `text-lg md:text-xl` | 例句 |
| 正文 | 16px | `text-base` | 按钮、导航 |
| 正文小 | 14px | `text-sm` | 辅助信息 |

### 字重

| 用途 | 字重 | Tailwind类 |
|------|------|-----------|
| 标题 | Bold (700) | `font-bold` |
| 按钮 | Medium (500) | `font-medium` |
| 正文 | Regular (400) | `font-normal` |

### 行高

```css
line-height: 1.5;  /* 默认行高 */
```

---

## 📏 间距系统

### 间距标准

使用Tailwind的间距系统（基于4px）：

| 名称 | 值 | Tailwind | 用途 |
|------|-----|---------|------|
| xs | 4px | `1` | 最小间距 |
| sm | 8px | `2` | 紧凑间距 |
| md | 16px | `4` | 标准间距 |
| lg | 24px | `6` | 宽松间距 |
| xl | 32px | `8` | 区块间距 |
| 2xl | 48px | `12` | 大区块间距 |

### 组件内边距

| 组件类型 | 内边距 | Tailwind类 |
|---------|--------|-----------|
| 按钮（小） | 8px 16px | `px-4 py-2` |
| 按钮（中） | 12px 24px | `px-6 py-3` |
| 按钮（大） | 16px 32px | `px-8 py-4` |
| 卡片 | 16px | `p-4` |
| 卡片（大） | 24px | `p-6` |
| 页面容器 | 16px | `px-4 py-8` |
| 单词卡片 | 40-64px | `py-10 px-8 md:py-16 md:px-12` |

### 组件间距

| 场景 | 间距 | Tailwind类 |
|------|------|-----------|
| 元素之间 | 16px | `space-y-4` 或 `gap-4` |
| 单词卡片元素 | 20px | `space-y-5` |
| 按钮组 | 16px | `gap-4` |
| 导航项 | 8px | `space-x-2` |

---

## 🔘 按钮规范

### 按钮类型

#### 1. 主要按钮（Primary Button）

```tsx
<button className="
  px-6 py-3 
  bg-blue-500 text-white 
  rounded-lg 
  font-medium
  hover:bg-blue-600 
  transition-all duration-200 
  hover:scale-105 active:scale-95
  focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
">
  按钮文字
</button>
```

**使用场景**：主要操作（提交、确认、开始学习）

#### 1b. 主要按钮（对话框中）

```tsx
<button className="
  px-6 py-3 
  bg-blue-500 text-white 
  rounded-xl 
  font-medium
  hover:bg-blue-600 
  transition-all duration-200 
  hover:scale-105 active:scale-95
  focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
  shadow-lg hover:shadow-xl
">
  按钮文字
</button>
```

**使用场景**：对话框中的主要按钮（添加单词、创建词书）

#### 2. 次要按钮（Secondary Button）

```tsx
<button className="
  px-6 py-3 
  bg-gray-100 text-gray-900 
  rounded-lg 
  font-medium
  hover:bg-gray-200 
  transition-all duration-200 
  hover:scale-105 active:scale-95
  focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
">
  按钮文字
</button>
```

**使用场景**：次要操作（取消、返回）

#### 3. 圆形图标按钮

```tsx
<button className="
  w-12 h-12 
  rounded-full 
  bg-gray-100 
  hover:bg-gray-200 
  flex items-center justify-center 
  transition-all duration-150
  hover:scale-105 active:scale-95
  focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
">
  <svg className="w-6 h-6 text-gray-700">...</svg>
</button>
```

**使用场景**：发音按钮、图标操作

#### 4. 测试选项按钮

```tsx
<button className="
  min-w-[120px] px-6 py-3 
  rounded-lg 
  text-base md:text-lg font-medium
  bg-gray-100 hover:bg-gray-200 text-gray-900
  transition-all duration-200 
  hover:scale-105 active:scale-95
  focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
">
  选项文字
</button>
```

**状态变化**：
- 正确：`bg-green-500 text-white shadow-lg`
- 错误：`bg-red-500 text-white shadow-lg`
- 正确答案高亮：`bg-green-100 border-2 border-green-500`

### 按钮状态

| 状态 | 样式 |
|------|------|
| 默认 | 基础样式 |
| 悬停 | `hover:bg-{color}-600 hover:scale-105` |
| 按下 | `active:scale-95` |
| 焦点 | `focus:ring-2 focus:ring-{color}-500 focus:ring-offset-2` |
| 禁用 | `disabled:opacity-50 disabled:cursor-not-allowed` |

---

## 🎭 动画系统

### 动画时长标准

| 类型 | 时长 | 使用场景 |
|------|------|---------|
| 快速 | 150ms | 按钮点击、小元素 |
| 标准 | 200-300ms | 页面切换、卡片进入 |
| 慢速 | 400-500ms | 大元素进入、进度条 |

### 预定义动画

#### 1. 淡入动画（Fade In）

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fadeIn 300ms ease-out;
}
```

**使用场景**：文字、小元素出现

#### 2. 滑入动画（Slide Up）

```css
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-up {
  animation: slideUp 400ms ease-out;
}
```

**使用场景**：单词卡片、页面内容

#### 3. 缩放动画（Scale）

```tsx
// 悬停放大
className="hover:scale-105 transition-transform duration-200"

// 点击缩小
className="active:scale-95 transition-transform duration-150"
```

**使用场景**：所有可点击元素

#### 4. 脉冲动画（Pulse）

```tsx
className="animate-pulse"
```

**使用场景**：发音播放中、加载状态

#### 5. 旋转动画（Spin）

```tsx
className="animate-spin"
```

**使用场景**：加载指示器

#### 6. 弹跳动画（Bounce）

```tsx
className="animate-bounce"
```

**使用场景**：完成庆祝图标

### 延迟动画（Staggered Animation）

用于列表项依次出现：

```tsx
{items.map((item, index) => (
  <div
    key={item.id}
    className="animate-fade-in"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    {item.content}
  </div>
))}
```

---

## 🎯 交互模式

### 键盘快捷键

| 快捷键 | 功能 | 实现位置 |
|--------|------|---------|
| 空格键 | 播放发音 | WordCard |
| 1-4数字键 | 选择选项 | TestOptions |
| Enter | 下一个单词 | 答题后 |
| Tab | 焦点导航 | 全局 |

### 焦点管理

```tsx
// 全局焦点样式
*:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

// 或使用Tailwind
className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
```

### 悬停效果

所有交互元素必须有悬停反馈：

```tsx
// 按钮
className="hover:bg-{color}-600 hover:scale-105"

// 卡片
className="hover:shadow-md hover:scale-105"

// 链接
className="hover:bg-gray-100"
```

---

## 📦 组件规范

### 卡片（Card）

#### 1. 标准卡片

```tsx
<div className="
  p-4 md:p-6
  bg-white 
  border border-gray-200 
  rounded-lg 
  shadow-sm 
  hover:shadow-md 
  transition-all duration-200
">
  {/* 卡片内容 */}
</div>
```

#### 2. 毛玻璃效果卡片（推荐）

```tsx
<div className="
  p-6 
  bg-white/80 backdrop-blur-sm 
  border border-gray-200/60 
  rounded-xl 
  shadow-sm 
  hover:shadow-lg hover:scale-[1.02]
  transition-all duration-200
  cursor-pointer
">
  {/* 卡片内容 */}
</div>
```

**使用场景**：词书卡片、一般列表卡片

#### 3. 单词卡片（特殊设计）

```tsx
<div className="
  group p-8 
  bg-white/80 backdrop-blur-sm 
  border border-gray-200/60 
  rounded-2xl 
  shadow-sm 
  hover:shadow-xl hover:scale-[1.03]
  cursor-pointer 
  transition-all duration-300
  flex flex-col justify-between min-h-[200px]
  hover:border-blue-400 hover:bg-white/95
  focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2
  animate-fade-in
">
  {/* 单词信息 */}
  <h3 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
    word
  </h3>
  
  {/* 音标 - 圆形背景 */}
  <span className="text-base text-gray-600 bg-gray-100 px-4 py-1.5 rounded-full">
    /fəˈnetɪk/
  </span>
  
  {/* 释义 - 圆形编号徽章 */}
  <div className="flex items-start gap-2">
    <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
      1
    </span>
    <span className="flex-1">释义内容</span>
  </div>
</div>
```

**关键特点**：
- 更大的圆角：`rounded-2xl`
- 更强的 hover 效果：`hover:shadow-xl hover:scale-[1.03]`
- hover 时边框颜色变化：`hover:border-blue-400`
- 文字颜色过渡：`group-hover:text-blue-600`
- 圆形音标背景：`rounded-full`
- 圆形编号徽章：`w-5 h-5 rounded-full`

### 输入框（Input）

```tsx
<input className="
  w-full 
  px-4 py-2 
  border border-gray-300 
  rounded-lg 
  focus:ring-2 focus:ring-blue-500 focus:border-transparent
  transition-all
" />
```

### 导航链接（Nav Link）

```tsx
// 激活状态
<Link className="
  px-4 py-2 
  rounded-lg 
  text-base font-medium 
  bg-blue-500 text-white shadow-sm
  transition-all duration-200
">

// 非激活状态
<Link className="
  px-4 py-2 
  rounded-lg 
  text-base font-medium 
  text-gray-700 
  hover:bg-gray-100 
  hover:scale-105 active:scale-95
  focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
  transition-all duration-200
">
```

### 进度条（Progress Bar）

```tsx
<div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
  <div
    className="h-full bg-blue-500 transition-all duration-500 ease-out"
    style={{ width: `${percentage}%` }}
  />
</div>
```

---

## 📱 响应式设计

### 断点系统

| 断点 | 宽度 | Tailwind前缀 | 设备 |
|------|------|-------------|------|
| xs | < 640px | (默认) | 手机 |
| sm | ≥ 640px | `sm:` | 大手机 |
| md | ≥ 768px | `md:` | 平板 |
| lg | ≥ 1024px | `lg:` | 桌面 |
| xl | ≥ 1280px | `xl:` | 大桌面 |

### 响应式字体

```tsx
// 单词拼写
className="text-5xl md:text-6xl"

// 音标
className="text-2xl md:text-3xl"

// 例句
className="text-lg md:text-xl"

// 按钮
className="text-base md:text-lg"
```

### 响应式间距

```tsx
// 单词卡片内边距
className="py-10 px-8 md:py-16 md:px-12"

// 页面容器
className="px-4 py-8"

// 按钮组布局
className="flex flex-col sm:flex-row gap-4"
```

### 响应式布局

```tsx
// 网格布局
className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"

// 弹性布局
className="flex flex-col sm:flex-row items-start sm:items-center"
```

---

## ♿ 可访问性规范

### ARIA标签

#### 必须添加的ARIA属性

```tsx
// 区域标识
<div role="article" aria-label="单词卡片: hello">

// 按钮状态
<button 
  aria-label="播放发音，或按空格键"
  aria-pressed={isPronouncing}
>

// 进度条
<div
  role="progressbar"
  aria-valuenow={current}
  aria-valuemin={0}
  aria-valuemax={total}
  aria-label={`已完成 ${current} 个，共 ${total} 个单词`}
/>

// 动态内容
<div role="status" aria-live="polite">
  正在加载...
</div>

// 错误提示
<div role="alert" aria-live="assertive">
  出错了
</div>

// 导航
<nav role="navigation" aria-label="主导航">
  <Link aria-current={isActive ? 'page' : undefined}>
```

### 语义化HTML

```tsx
// 使用正确的HTML标签
<header role="banner">
<main role="main">
<nav role="navigation">
<article>
<section>
<button> (不要用div模拟)
```

### 键盘导航

所有交互元素必须：
1. 可通过Tab键访问
2. 有清晰的焦点样式
3. 支持Enter/Space键触发
4. 禁用时设置`tabIndex={-1}`

---

## 🎨 阴影系统

| 级别 | Tailwind类 | 使用场景 |
|------|-----------|---------|
| 无阴影 | `shadow-none` | 默认状态 |
| 小阴影 | `shadow-sm` | 导航栏、激活按钮 |
| 标准阴影 | `shadow` | 卡片默认 |
| 中阴影 | `shadow-md` | 卡片悬停 |
| 大阴影 | `shadow-lg` | 正确/错误答案 |

---

## 🔲 圆角系统

| 大小 | 值 | Tailwind类 | 使用场景 |
|------|-----|-----------|---------|
| 小 | 4px | `rounded` | 小元素 |
| 标准 | 8px | `rounded-lg` | 一般按钮、输入框 |
| 大 | 12px | `rounded-xl` | 大卡片、对话框按钮 |
| 超大 | 16px | `rounded-2xl` | 单词卡片、对话框 |
| 特大 | 24px | `rounded-3xl` | 单词详情对话框 |
| 圆形 | 50% | `rounded-full` | 图标按钮、头像、音标背景、徽章 |

### 使用示例

```tsx
// 单词卡片 - 使用 rounded-2xl
<div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
  {/* 卡片内容 */}
</div>

// 单词详情对话框 - 使用 rounded-3xl
<div className="bg-white rounded-3xl shadow-xl p-12">
  {/* 对话框内容 */}
</div>

// 音标背景 - 使用 rounded-full
<span className="bg-gray-100 px-4 py-1.5 rounded-full">
  /həˈloʊ/
</span>

// 编号徽章 - 使用 rounded-full
<span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center">
  1
</span>
```

---

## 🌫️ 毛玻璃效果（Backdrop Blur）

毛玻璃效果为界面增添现代感和层次感，用于导航栏、卡片等元素。

### 效果级别

| 级别 | Tailwind类 | 使用场景 |
|------|-----------|----------|
| 小 | `backdrop-blur-sm` | 卡片、分页组件 |
| 中 | `backdrop-blur-md` | 导航栏 |
| 大 | `backdrop-blur-lg` | 重要覆盖层 |

### 使用规范

#### 1. 导航栏

```tsx
<header className="
  fixed top-0 left-0 right-0 z-50 
  bg-white/80 backdrop-blur-md 
  border-b border-gray-200/50 
  shadow-sm
">
  {/* 导航内容 */}
</header>
```

**关键点**：
- 背景色使用透明度：`bg-white/80`（80% 不透明度）
- 添加模糊效果：`backdrop-blur-md`
- 边框也使用透明度：`border-gray-200/50`

#### 2. 卡片

```tsx
<div className="
  p-6 
  bg-white/80 backdrop-blur-sm 
  border border-gray-200/60 
  rounded-2xl 
  shadow-sm hover:shadow-lg
  transition-all duration-200
">
  {/* 卡片内容 */}
</div>
```

#### 3. 分页组件

```tsx
<nav className="
  p-6 
  bg-white/80 backdrop-blur-sm 
  rounded-xl 
  shadow-sm 
  border border-gray-200/60
">
  {/* 分页内容 */}
</nav>
```

### 最佳实践

1. **配合透明度使用**：毛玻璃效果必须与背景透明度配合 (`bg-white/80`)
2. **边框透明度**：边框也应使用透明度以保持一致性 (`border-gray-200/60`)
3. **性能考虑**：不要过度使用，主要用于导航栏和顶层卡片
4. **浏览器兼容**：确保在不支持的浏览器中有降级方案

---

## 🎯 图标设计规范

本项目使用 [Phosphor Icons](https://phosphoricons.com/) 图标库，提供一致、现代的图标系统。

### 图标库

**Phosphor Icons** 是一个灵活的开源图标库，具有以下特点：
- 多种样式权重（thin, light, regular, bold, fill, duotone）
- 统一的设计语言
- React 组件支持
- 可自定义尺寸和颜色

### 图标尺寸

| 尺寸 | 像素值 | 使用场景 | 示例 |
|------|--------|---------|------|
| 超小 | 12px | 徽章内图标 | 掌握度徽章 |
| 小 | 14-16px | 按钮内图标、导航箭头 | 返回箭头、删除图标 |
| 标准 | 18-20px | 列表项图标、按钮主图标 | 添加按钮、书籍图标 |
| 大 | 28-32px | 统计卡片图标、发音按钮 | 统计图标、发音图标 |
| 超大 | 48-64px | 加载状态、错误提示 | 加载图标、警告图标 |
| 特大 | 80-96px | 空状态图标、完成庆祝 | 空列表、完成图标 |

### 图标样式权重

Phosphor Icons 提供 6 种样式权重：

| 权重 | `weight` 属性 | 使用场景 | 视觉特点 |
|------|--------------|---------|---------|
| Thin | `"thin"` | 空状态图标、装饰图标 | 最细线条，轻盈感 |
| Light | `"light"` | - | 细线条 |
| Regular | `"regular"` | 默认图标（可省略） | 标准线条 |
| Bold | `"bold"` | 按钮图标、强调图标 | 粗线条，醒目 |
| Fill | `"fill"` | 激活状态、发音按钮 | 填充实心 |
| Duotone | `"duotone"` | 统计卡片、装饰图标 | 双色调，有层次感 |

### 使用示例

#### 1. 基础使用

```tsx
import { Books, ArrowLeft, Plus } from '../components/Icon';

// 标准图标 - 18px, bold
<Books size={18} weight="bold" />

// 导航箭头 - 16px, bold
<ArrowLeft size={16} weight="bold" />

// 添加按钮 - 20px, bold
<Plus size={20} weight="bold" />
```

#### 2. 带颜色的图标

```tsx
// 使用十六进制颜色
<Books size={18} weight="duotone" color="#6b7280" />

// 使用 Tailwind 类名
<Books size={18} weight="duotone" className="text-gray-500" />
```

#### 3. 空状态图标

```tsx
// 超大、thin 权重、灰色
<BookOpen size={96} weight="thin" color="#9ca3af" className="mx-auto mb-6 animate-pulse" />
```

#### 4. 统计卡片图标

```tsx
// 32px, duotone，彩色
<ChartBar size={32} weight="duotone" color="#3b82f6" />
<Target size={32} weight="duotone" color="#a855f7" />
<CheckCircle size={32} weight="duotone" color="#16a34a" />
```

#### 5. 发音按钮图标

```tsx
// 28px, fill 权重，白色
<SpeakerHigh size={28} weight="fill" className="text-white" />
```

#### 6. 加载状态图标

```tsx
// 48px, bold，带旋转动画
<CircleNotch 
  size={48} 
  weight="bold" 
  color="#3b82f6" 
  className="animate-spin mx-auto mb-4" 
/>
```

### 图标颜色规范

| 用途 | 颜色值 | Tailwind类 |
|------|--------|-----------|
| 主要图标 | `#111827` | `text-gray-900` / `color="#111827"` |
| 次要图标 | `#6b7280` | `text-gray-500` / `color="#6b7280"` |
| 禁用图标 | `#9ca3af` | `text-gray-400` / `color="#9ca3af"` |
| 品牌色图标 | `#3b82f6` | `text-blue-500` / `color="#3b82f6"` |
| 成功图标 | `#16a34a` | `text-green-600` / `color="#16a34a"` |
| 警告图标 | `#eab308` | `text-yellow-500` / `color="#eab308"` |
| 错误图标 | `#dc2626` | `text-red-600` / `color="#dc2626"` |
| 白色图标 | `#ffffff` | `text-white` / `color="#ffffff"` |

### 图标与文字组合

```tsx
// 按钮中的图标（左侧）
<button className="flex items-center gap-2">
  <Plus size={18} weight="bold" />
  添加单词
</button>

// 按钮中的图标（右侧）
<button className="flex items-center gap-2">
  下一页
  <ArrowRight size={16} weight="bold" />
</button>

// 列表项中的图标
<div className="flex items-center gap-2">
  <Books size={16} weight="bold" />
  <span>共 100 个单词</span>
</div>
```

### 常用图标清单

| 图标名称 | 用途 | 常用尺寸 | 常用权重 |
|---------|------|---------|---------|
| `Books` | 词书、词库 | 16-18px | bold, duotone |
| `BookOpen` | 空状态、学习 | 80-96px | thin |
| `Plus` | 添加按钮 | 16-20px | bold |
| `Trash` | 删除按钮 | 16px | bold |
| `ArrowLeft` | 返回、上一页 | 14-16px | bold |
| `ArrowRight` | 下一页 | 14-16px | bold |
| `SpeakerHigh` | 发音按钮 | 28px | fill |
| `ListNumbers` | 列表、序号 | 18px | duotone |
| `Confetti` | 完成庆祝 | 96px | duotone |
| `ChartBar` | 统计图表 | 32px | duotone |
| `Target` | 目标、准确率 | 32px | duotone |
| `CheckCircle` | 正确、成功 | 16-32px | bold, duotone |
| `XCircle` | 错误、失败 | 16-32px | bold |
| `Warning` | 警告 | 16-64px | bold, fill, duotone |
| `Clock` | 时间 | 16px | bold |
| `CircleNotch` | 加载中 | 48px | bold |
| `MagnifyingGlass` | 搜索、空结果 | 80px | thin |

### 图标动画

```tsx
// 旋转动画（加载中）
<CircleNotch className="animate-spin" size={48} weight="bold" />

// 脉冲动画（空状态）
<BookOpen className="animate-pulse" size={96} weight="thin" />

// Hover 脉冲（发音按钮）
<SpeakerHigh className="group-hover:animate-pulse" size={28} weight="fill" />
```

### 最佳实践

1. **统一权重**：同一场景下使用相同权重
2. **尺寸一致**：同一组图标保持相同尺寸  
3. **颜色协调**：图标颜色应与设计系统颜色一致
4. **语义化选择**：选择与功能相符的图标
5. **按需导入**：只导入实际使用的图标，优化打包体积
6. **无障碍**：为图标添加适当的 `aria-label` 或使用 `aria-hidden="true"`

### 导入优化

项目使用按需导入优化打包体积，所有使用的图标都在 [`src/components/Icon.tsx`](file:///e:/danci/src/components/Icon.tsx) 中统一管理。

---

## 🎨 单词详情对话框设计

单词详情对话框是极简主义设计的典范，强调内容的呈现。

### 设计规范

```tsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
  <div className="bg-white rounded-3xl shadow-xl p-12 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slide-up">
    {/* 单词和发音 */}
    <div className="text-center mb-12">
      <div className="flex items-center justify-center mb-4">
        <h3 className="text-8xl font-bold text-gray-900">
          hello
        </h3>
        <button className="
          ml-6 w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 
          shadow-lg hover:shadow-xl flex items-center justify-center
          transition-all hover:scale-110 active:scale-95
        ">
          {/* 发音图标 */}
        </button>
      </div>
      <p className="text-3xl text-gray-400">/həˈloʊ/</p>
    </div>

    {/* 渐变分隔线 */}
    <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-8"></div>

    {/* 释义和例句 - 左右布局 */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* 释义 */}
      <div>
        <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
          释义
        </h4>
        <div className="space-y-3">
          <div className="flex items-baseline">
            <span className="text-blue-500 font-bold text-lg mr-4">1.</span>
            <span className="text-gray-900 text-xl">你好；喂</span>
          </div>
        </div>
      </div>

      {/* 例句 */}
      <div>
        <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
          例句
        </h4>
        <blockquote className="border-l-4 border-blue-500 pl-6 py-2 italic text-gray-700">
          Hello, how are you?
        </blockquote>
      </div>
    </div>
  </div>
</div>
```

### 关键设计元素

| 元素 | 样式 | 说明 |
|------|------|------|
| 对话框容器 | `rounded-3xl` (24px) | 最大圆角，营造柔和感 |
| 单词拼写 | `text-8xl font-bold` | 超大字体突出单词 |
| 音标 | `text-3xl text-gray-400` | 大号灰色音标 |
| 发音按钮 | `w-14 h-14 rounded-full bg-blue-500` | 大号圆形蓝色按钮 |
| 分隔线 | 渐变效果 | 从透明到灰色再到透明 |
| 标题 | 大写 + 字母间距 | `uppercase tracking-wider` |
| 释义编号 | `text-blue-500 font-bold text-lg` | 蓝色加粗 |
| 例句 | 左蓝色边框 + 斜体 | `border-l-4 border-blue-500 italic` |

---

## 🌈 渐变效果

### 渐变分隔线

用于对话框、卡片等处，提供优雅的视觉分隔。

```tsx
{/* 水平渐变分隔线 */}
<div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>

{/* 垂直渐变分隔线 */}
<div className="w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent"></div>
```

**使用场景**：
- 单词详情对话框中的内容分隔
- 大卡片中的区块分隔
- 替代传统实线边框

### 渐变背景（可选）

```tsx
{/* 微妙的渐变背景 */}
<div className="bg-gradient-to-br from-blue-50 to-white">
  {/* 内容 */}
</div>
```

**注意**：渐变背景应谨慎使用，避免过度装饰。

---

## 📋 状态反馈

### 加载状态

```tsx
<div className="min-h-screen flex items-center justify-center animate-fade-in">
  <div className="text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
    <p className="text-gray-600" role="status" aria-live="polite">
      正在加载...
    </p>
  </div>
</div>
```

### 错误状态

```tsx
<div className="text-center max-w-md px-4" role="alert" aria-live="assertive">
  <div className="text-red-500 text-5xl mb-4" aria-hidden="true">⚠️</div>
  <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
  <p className="text-gray-600 mb-6">{error}</p>
  <button className="px-6 py-3 bg-blue-500 text-white rounded-lg...">
    重试
  </button>
</div>
```

### 成功状态

```tsx
<div className="text-center" role="status" aria-live="polite">
  <div className="text-green-500 text-6xl mb-4 animate-bounce">🎉</div>
  <h2 className="text-3xl font-bold text-gray-900 mb-2">学习完成！</h2>
  <p className="text-gray-600">你已经完成了本次学习会话</p>
</div>
```

### 空状态

```tsx
<div className="text-center py-12 animate-fade-in">
  <p className="text-gray-500 text-lg mb-4">词库为空</p>
  <p className="text-gray-400 mb-6">点击上方"添加单词"按钮开始添加</p>
  <button className="px-6 py-3 bg-blue-500 text-white rounded-lg...">
    添加单词
  </button>
</div>
```

---

## 🎯 最佳实践

### 1. 始终使用Transition

所有状态变化都应该有过渡效果：

```tsx
className="transition-all duration-200"
```

### 2. 组合动画效果

```tsx
className="
  transition-all duration-200 
  hover:scale-105 active:scale-95
  hover:bg-blue-600
"
```

### 3. 保持一致的间距

使用Tailwind的间距系统，避免自定义值：

```tsx
// ✅ 好
className="px-4 py-2 gap-4"

// ❌ 避免
style={{ padding: '13px 17px' }}
```

### 4. 移动优先

先写移动端样式，再添加响应式：

```tsx
// ✅ 好
className="text-lg md:text-xl"

// ❌ 避免
className="md:text-lg text-xl"
```

### 5. 语义化命名

使用描述性的类名和变量名：

```tsx
// ✅ 好
const isPronouncing = true;
const handleSelectAnswer = () => {};

// ❌ 避免
const flag = true;
const handle = () => {};
```

### 6. 毛玻璃效果的使用

毛玻璃效果必须与背景透明度配合：

```tsx
// ✅ 好 - 毛玻璃 + 透明度
className="bg-white/80 backdrop-blur-sm"

// ❌ 避免 - 只有模糊没有透明度
className="bg-white backdrop-blur-sm"
```

### 7. 透明度的一致性

背景、边框应使用一致的透明度策略：

```tsx
// ✅ 好 - 一致的透明度
className="bg-white/80 backdrop-blur-sm border border-gray-200/60"

// ❌ 避免 - 不一致
className="bg-white/80 backdrop-blur-sm border border-gray-200"
```

### 8. 卡片 Hover 效果的精确控制

不同场景使用不同的缩放比例：

```tsx
// 一般卡片
className="hover:scale-[1.02]"

// 单词卡片（更明显）
className="hover:scale-[1.03]"

// 按钮
className="hover:scale-105" // 等伞于 1.05
```

### 9. 圆角大小选择

根据元素大小和重要性选择圆角：

```tsx
// 小元素：按钮、训章
className="rounded-lg" // 8px

// 中等元素：卡片
className="rounded-xl" // 12px

// 大元素：单词卡片
className="rounded-2xl" // 16px

// 特别重要：对话框
className="rounded-3xl" // 24px
```

### 10. 渐变分隔线使用

在需要优雅分隔的场景使用渐变线：

```tsx
// ✅ 好 - 用于对话框、大卡片
className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"

// 一般场景 - 使用普通边框
className="border-b border-gray-200"
```

---

## 📚 组件清单

所有新组件必须包含：

- [ ] 响应式设计（移动端、平板、桌面）
- [ ] 悬停效果
- [ ] 焦点样式
- [ ] 键盘导航支持
- [ ] ARIA标签
- [ ] 加载/错误/空状态
- [ ] 动画效果
- [ ] TypeScript类型定义
- [ ] 注释文档

---

## 🔍 代码审查检查项

在提交代码前，确保：

- [ ] 所有颜色使用了设计系统中定义的颜色
- [ ] 所有字体大小使用了标准尺寸
- [ ] 所有间距使用了Tailwind的间距系统
- [ ] 所有按钮有悬停和焦点效果
- [ ] 所有交互元素有动画过渡
- [ ] 所有组件支持键盘导航
- [ ] 所有组件有适当的ARIA标签
- [ ] 所有组件在移动端正常显示
- [ ] 没有硬编码的颜色值（如#fff）
- [ ] 没有内联样式（除非必要）

---

## 📖 参考示例

### 完整按钮示例

```tsx
<button
  onClick={handleClick}
  disabled={isDisabled}
  className="
    px-6 py-3
    bg-blue-500 text-white
    rounded-lg
    font-medium
    hover:bg-blue-600
    transition-all duration-200
    hover:scale-105 active:scale-95
    focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
  "
  aria-label="按钮说明"
>
  按钮文字
</button>
```

### 完整卡片示例

```tsx
<div
  className="
    p-6
    bg-white
    border border-gray-200
    rounded-lg
    shadow-sm
    hover:shadow-md
    transition-all duration-200
    hover:scale-105
    animate-fade-in
  "
  style={{ animationDelay: `${index * 50}ms` }}
>
  <h3 className="text-xl font-bold text-gray-900 mb-2">
    标题
  </h3>
  <p className="text-gray-600">
    内容
  </p>
</div>
```

---

## 🚀 快速开始

### 创建新组件模板

```tsx
import { useState } from 'react';

interface MyComponentProps {
  // 定义props类型
}

/**
 * MyComponent - 组件说明
 * 描述组件的功能和用途
 */
export default function MyComponent({ }: MyComponentProps) {
  return (
    <div className="animate-fade-in">
      {/* 组件内容 */}
    </div>
  );
}
```

### 常用类名组合

```tsx
// 主要按钮
"px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"

// 对话框主要按钮
"px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"

// 次要按钮
"px-6 py-3 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"

// 毛玻璃效果卡片
"p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-200"

// 单词卡片
"group p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl shadow-sm hover:shadow-xl hover:scale-[1.03] transition-all duration-300 hover:border-blue-400"

// 输入框
"w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"

// 导航栏
"fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200/50 shadow-sm"

// 页面容器
"max-w-6xl mx-auto px-4 py-8 animate-fade-in"

// 圆形音标背景
"text-base text-gray-600 bg-gray-100 px-4 py-1.5 rounded-full"

// 圆形编号徽章
"w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold"

// 渐变分隔线
"h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"
```


---

**版本**: 2.0.0  
**最后更新**: 2025年11月  
**维护者**: 开发团队

## 更新日志

### v2.0.0 (2025年11月)
- ✨ 新增毛玻璃效果（Backdrop Blur）章节
- ✨ 新增单词详情对话框设计规范
- ✨ 新增渐变效果章节
- ✨ 新增图标设计规范（Phosphor Icons）
- 🔄 扩展圆角系统，增加 `rounded-xl`、`rounded-2xl`、`rounded-3xl`
- 🔄 更新卡片组件规范，增加毛玻璃效果卡片和单词卡片
- 🔄 更新按钮规范，增加对话框按钮样式
- 🔄 更新最佳实践，增加毛玻璃效果和透明度使用指南
- 🔄 更新常用类名组合，增加更多实用组合

### v1.0.0 (2024年)
- 🎉 初版发布

遵循此规范，确保应用的UI/UX保持一致、专业和易用。
