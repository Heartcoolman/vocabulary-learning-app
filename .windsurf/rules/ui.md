---
trigger: always_on
---

设计到前端时，使用此设计规范
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
| 标准 | 8px | `rounded-lg` | 按钮、卡片、输入框 |
| 圆形 | 50% | `rounded-full` | 图标按钮、头像 |

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
- [ ] 所有