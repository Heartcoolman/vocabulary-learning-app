# UI/UX 设计系统规范

> 本文档定义了词汇学习应用的完整UI/UX设计规范，包括颜色、字体、间距、组件样式、动画效果和交互模式。所有前端开发必须遵循此规范，以确保界面的一致性和用户体验的统一性。

---

## 📐 设计原则

### 核心理念
1. **简洁优先** - 界面清晰，避免视觉干扰
2. **以学习为中心** - 突出学习内容，弱化装饰元素
3. **流畅交互** - 所有操作都有即时反馈，采用物理弹簧动画
4. **可访问性** - 支持键盘导航和屏幕阅读器
5. **响应式设计** - 适配所有设备尺寸
6. **层次分明** - 通过毛玻璃、阴影和渐变创建视觉层次
7. **自然触感** - 基于 G3 弹簧物理系统的动效设计

---

## 🎨 颜色系统

### 主色调

```css
/* 品牌色 - 蓝色系 */
--primary-50: #eff6ff;
--primary-100: #dbeafe;
--primary-500: #3b82f6;  /* 主要按钮、链接 */
--primary-600: #2563eb;  /* 悬停状态 */

/* 品牌色 - Indigo 系（高级功能/数据面板） */
--indigo-50: #eef2ff;
--indigo-100: #e0e7ff;
--indigo-200: #c7d2fe;
--indigo-500: #6366f1;
--indigo-600: #4f46e5;

/* 中性色 - 灰色系 */
--gray-50: #f9fafb;
--gray-100: #f3f4f6;     /* 次要按钮背景 */
--gray-200: #e5e7eb;     /* 边框、分隔线 */
--gray-500: #6b7280;     /* 次要文字 */
--gray-600: #4b5563;     /* 音标、提示文字 */
--gray-700: #374151;     /* 导航文字 */
--gray-900: #111827;     /* 主要文字、标题 */

/* 中性色 - Slate 系（数据面板/专业界面） */
--slate-50: #f8fafc;
--slate-100: #f1f5f9;
--slate-200: #e2e8f0;
--slate-300: #cbd5e1;
--slate-400: #94a3b8;
--slate-500: #64748b;
--slate-600: #475569;
--slate-700: #334155;
--slate-800: #1e293b;
--slate-900: #0f172a;

/* 语义色 */
--success-100: #dcfce7;  /* 正确答案背景 */
--success-500: #22c55e;  /* 正确答案 */
--success-600: #16a34a;

--error-100: #fee2e2;    /* 错误答案背景 */
--error-500: #ef4444;    /* 错误答案 */
--error-600: #dc2626;

--warning-100: #fef3c7;
--warning-500: #f59e0b;

/* 扩展语义色（数据状态标签） */
--emerald-50: #ecfdf5;
--emerald-100: #d1fae5;
--emerald-500: #10b981;
--emerald-600: #059669;
--emerald-700: #047857;

--amber-50: #fffbeb;
--amber-100: #fef3c7;
--amber-500: #f59e0b;
--amber-600: #d97706;
--amber-700: #b45309;

--purple-50: #faf5ff;
--purple-100: #f3e8ff;
--purple-500: #a855f7;
--purple-600: #9333ea;
--purple-700: #7e22ce;

--rose-50: #fff1f2;
--rose-100: #ffe4e6;
--rose-500: #f43f5e;

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

### 数据面板配色（Slate 系）

数据可视化、监控面板等专业界面使用 Slate 色系，提供更冷静、专业的视觉感受：

| 用途 | 颜色 | Tailwind类 |
|------|------|-----------|
| 面板背景 | Slate-50/100 | `bg-slate-50` / `bg-slate-100` |
| 面板文字标题 | Slate-800/900 | `text-slate-800` / `text-slate-900` |
| 面板次要文字 | Slate-500/600 | `text-slate-500` / `text-slate-600` |
| 面板边框 | Slate-200 | `border-slate-200` |
| 侧边栏背景 | White/90 + Blur | `bg-white/90 backdrop-blur-lg` |
| 数据强调色 | Indigo-500 | `text-indigo-500` / `bg-indigo-500` |

### 状态标签配色

用于表示不同状态、类型或难度的彩色标签：

| 状态 | 背景 | 文字 | 边框 | 示例 |
|------|------|------|------|------|
| 真实数据 | Emerald-100 | Emerald-700 | Emerald-200 | `bg-emerald-100 text-emerald-700 border-emerald-200` |
| 模拟数据 | Purple-100 | Purple-700 | Purple-200 | `bg-purple-100 text-purple-700 border-purple-200` |
| 简单/Easy | Green-100 | Green-700 | Green-200 | `bg-green-100 text-green-700 border-green-200` |
| 中等/Mid | Amber-100 | Amber-700 | Amber-200 | `bg-amber-100 text-amber-700 border-amber-200` |
| 困难/Hard | Red-100 | Red-700 | Red-200 | `bg-red-100 text-red-700 border-red-200` |
| 跳过/Skipped | Slate-100 | Slate-600 | Slate-200 | `bg-slate-100 text-slate-600 border-slate-200` |

```tsx
// 状态标签示例
<span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-emerald-100 text-emerald-700 border-emerald-200">
  真实
</span>
```

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

本项目采用双轨动画方案：CSS 动画用于简单过渡，Framer Motion + G3 弹簧物理系统用于复杂交互。

### G3 动画时长标准

基于 HyperOS/MIUI 的自然触感设计理念：

| 类型 | 时长 | Tailwind/CSS | 使用场景 |
|------|------|-------------|---------|
| 瞬时 | 120ms | `duration-[120ms]` | 按钮点击、图标切换 |
| 快速 | 180ms | `duration-[180ms]` | 悬停状态、小组件 |
| 标准 | 240ms | `duration-[240ms]` | 淡入淡出、状态变化 |
| 强调 | 320ms | `duration-[320ms]` | 卡片展开、进度条 |
| 大型 | 480ms | `duration-[480ms]` | 模态框、页面切换 |

### G3 弹簧物理配置（Framer Motion）

```typescript
import type { Transition } from 'framer-motion';

// 标准弹簧 - 平衡自然感，收敛约 240ms
export const g3SpringStandard: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 28,
  mass: 1,
};

// 快速弹簧 - 响应迅速，收敛约 180ms
export const g3SpringSnappy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 35,
  mass: 0.8,
};

// 柔和弹簧 - 优雅缓慢，收敛约 320ms
export const g3SpringGentle: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 26,
  mass: 1.1,
};

// 弹性弹簧 - 带适度过冲，收敛约 400ms（用于庆祝动画）
export const g3SpringBouncy: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 18,
  mass: 1,
};
```

### G3 缓动函数（Cubic Bezier）

```typescript
export const G3_EASING = {
  standard: [0.2, 0, 0, 1],    // 标准缓动
  enter: [0.05, 0.7, 0.1, 1],  // 进入动画
  exit: [0.3, 0, 0.8, 0.15],   // 退出动画
};
```

### Framer Motion Variants 预设

#### 淡入变体

```typescript
export const fadeInVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: g3SpringStandard,
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.18, ease: G3_EASING.exit },
  },
};
```

#### 向上滑入变体

```typescript
export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: g3SpringGentle,
  },
};
```

#### 缩放入场变体（模态框）

```typescript
export const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: g3SpringStandard,
  },
};
```

#### 列表错开入场变体

```typescript
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: g3SpringStandard,
  },
};
```

#### 庆祝动画变体

```typescript
export const celebrationVariants: Variants = {
  hidden: { opacity: 0, scale: 0.5, rotate: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: g3SpringBouncy,
  },
};
```

### 使用示例

```tsx
import { motion } from 'framer-motion';
import { fadeInVariants, staggerContainerVariants, staggerItemVariants } from '@/utils/animations';

// 单个元素淡入
<motion.div
  initial="hidden"
  animate="visible"
  variants={fadeInVariants}
>
  内容
</motion.div>

// 列表错开入场
<motion.div
  variants={staggerContainerVariants}
  initial="hidden"
  animate="visible"
>
  {items.map((item) => (
    <motion.div key={item.id} variants={staggerItemVariants}>
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

### CSS 预定义动画（简单场景）

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

// 微妙缩放（数据卡片）
className="hover:scale-[1.01] transition-all duration-200"
```

**使用场景**：所有可点击元素

#### 4. 脉冲动画（Pulse）

```tsx
className="animate-pulse"
```

**使用场景**：发音播放中、加载状态、在线指示器

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

用于列表项依次出现，创造"瀑布"或"逐行揭示"效果。

#### 方案一：CSS 动画延迟（简单场景）

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

#### 方案二：Framer Motion 延迟（推荐，更流畅）

```tsx
import { motion } from 'framer-motion';

{items.map((item, idx) => (
  <motion.li
    key={item.id}
    initial={{ opacity: 0, x: -10 }}   // 初始状态：透明 + 左移
    animate={{ opacity: 1, x: 0 }}      // 结束状态：显示 + 归位
    transition={{ delay: idx * 0.08 }} // 每项延迟 80ms
  >
    {item.content}
  </motion.li>
))}
```

**延迟间隔参考值**：

| 间隔 | 效果 | 适用场景 |
|------|------|---------|
| `idx * 0.05` (50ms) | 快速连贯 | 短列表（3-5项） |
| `idx * 0.08` (80ms) | 平衡节奏 | 中等列表（4-8项）✅ 推荐 |
| `idx * 0.1` (100ms) | 明显依次 | 长列表或强调效果 |
| `idx * 0.15` (150ms) | 戏剧感 | 重要内容逐条揭示 |

**动画方向变体**：

```tsx
// 从左滑入（默认）
initial={{ opacity: 0, x: -10 }}

// 从右滑入
initial={{ opacity: 0, x: 10 }}

// 从下滑入
initial={{ opacity: 0, y: 16 }}

// 纯淡入（无位移）
initial={{ opacity: 0 }}
```

#### 方案三：staggerChildren（容器控制）

当需要容器统一控制子元素动画时：

```tsx
import { motion } from 'framer-motion';
import { staggerContainerVariants, staggerItemVariants } from '@/utils/animations';

<motion.ul
  variants={staggerContainerVariants}  // staggerChildren: 0.05, delayChildren: 0.1
  initial="hidden"
  animate="visible"
>
  {items.map((item) => (
    <motion.li key={item.id} variants={staggerItemVariants}>
      {item.content}
    </motion.li>
  ))}
</motion.ul>
```

**三种方案对比**：

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| CSS delay | 简单、无依赖 | 动画类型固定 | 简单淡入效果 |
| transition delay | 灵活、可定制方向 | 需逐项设置 | 展开内容、详情列表 |
| staggerChildren | 统一管理、代码简洁 | 需定义 variants | 页面级列表、卡片网格 |

### 交互式高度动画（Framer Motion）

可展开卡片使用 `layout` 和 `animate` 实现平滑高度变化：

```tsx
<motion.div
  layout
  animate={{ height: isOpen ? 'auto' : 120 }}
  transition={g3SpringStandard}
  className="overflow-hidden rounded-2xl"
>
  {/* 卡片内容 */}
</motion.div>
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

### 可展开阶段卡片（Expandable Stage Card）

用于首页功能介绍、手风琴列表等场景：

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown } from '../../components/Icon';
import { g3SpringStandard } from '../../utils/animations';

interface StageCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  description: string;
  details: string[];
  accentColor: string;  // e.g., 'bg-blue-500'
  bgColor: string;      // e.g., 'bg-blue-50'
  isOpen: boolean;
  onClick: () => void;
}

function StageCard({
  title, subtitle, icon, description, details,
  accentColor, bgColor, isOpen, onClick,
}: StageCardProps) {
  return (
    <motion.div
      layout
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl border cursor-pointer
        transition-colors duration-300
        ${isOpen
          ? 'bg-white border-slate-300 shadow-lg'
          : 'bg-white/60 border-slate-200 hover:border-slate-300 hover:bg-white/80'
        }
      `}
      initial={false}
      animate={{ height: isOpen ? 'auto' : 120 }}
      transition={g3SpringStandard}
    >
      {/* 左侧强调色条 */}
      <div className={`absolute top-0 left-0 w-1 h-full ${accentColor}`} />

      <div className="p-6">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <div className={`
              p-3 rounded-xl transition-colors duration-200
              ${isOpen ? `${bgColor} text-slate-700` : 'bg-slate-100 text-slate-500'}
            `}>
              {icon}
            </div>
            <div>
              <h3 className={`
                text-lg font-bold transition-colors duration-200
                ${isOpen ? 'text-slate-900' : 'text-slate-700'}
              `}>
                {title}
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {subtitle}
                </span>
              </h3>
              {!isOpen && (
                <p className="text-sm text-slate-500 line-clamp-1">{description}</p>
              )}
            </div>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={g3SpringStandard}
            className="text-slate-400"
          >
            <CaretDown size={20} />
          </motion.div>
        </div>

        {/* 展开内容 */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pl-[60px] pt-2"
            >
              <p className="text-slate-600 mb-4 leading-relaxed">{description}</p>
              <ul className="space-y-2">
                {details.map((detail, idx) => (
                  <motion.li
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className="flex items-start gap-2 text-sm text-slate-500"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${accentColor}`} />
                    {detail}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
```

**关键特点**：
- 使用 `motion.div` 的 `layout` 属性实现平滑高度动画
- 左侧彩色强调条区分不同阶段
- 展开时图标背景变色，强调当前选中状态
- 列表项逐个动画进入 (`delay: idx * 0.08`)
- 箭头旋转动画指示展开/收起状态

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

### 页面渐变背景

用于创建有层次感的页面背景，提升视觉品质：

```tsx
// 学习页面 - 清新蓝色调
<div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">

// 数据面板 - 专业冷色调
<div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">

// 统计页面 - 活力蓝紫色调
<div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">

// 首页 - 纯净白色调
<div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
```

### 文字渐变效果

用于标题强调：

```tsx
<h1 className="text-4xl font-bold text-slate-900">
  AMAS{' '}
  <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
    智能引擎
  </span>
</h1>
```

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

## 📊 数据面板组件

用于监控面板、统计页面等专业数据展示场景。

### 数据面板布局

```tsx
// 全屏仪表盘布局（带侧边栏）
<div className="flex h-screen w-full bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
  {/* 侧边栏 */}
  <aside className="w-[300px] flex flex-col flex-shrink-0 border-r border-slate-200 bg-white/90 backdrop-blur-lg shadow-xl z-10">
    {/* 侧边栏内容 */}
  </aside>
  
  {/* 主内容区 */}
  <main className="flex-1 relative flex flex-col h-full overflow-hidden">
    {/* 主内容 */}
  </main>
</div>
```

### 统计指标卡片

大数字指标展示，带装饰性背景图标：

```tsx
<motion.div 
  variants={fadeInVariants} 
  className="bg-white/80 backdrop-blur-sm border border-gray-200/60 p-6 rounded-2xl relative overflow-hidden group shadow-sm"
>
  {/* 装饰性背景图标 */}
  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
    <Target size={80} weight="fill" className="text-emerald-500" />
  </div>
  
  <div className="relative z-10">
    <p className="text-gray-600 text-sm font-medium mb-1 flex items-center gap-2">
      <TrendUp className="text-emerald-500" /> 全局准确率
    </p>
    <div className="text-3xl font-bold text-gray-900">92.4%</div>
    <div className="text-emerald-500 text-xs mt-2 font-mono">+12.4% 提升</div>
  </div>
</motion.div>
```

### 决策卡片（可选中）

带选中状态的列表卡片：

```tsx
interface DecisionCardProps {
  isSelected: boolean;
  onClick: () => void;
}

function DecisionCard({ isSelected, onClick }: DecisionCardProps) {
  const baseClasses = 'p-3 mb-3 rounded-lg cursor-pointer border transition-all duration-200 group hover:shadow-md hover:scale-[1.01]';
  const selectedClasses = isSelected
    ? 'bg-indigo-50/80 border-indigo-500 shadow-sm ring-1 ring-indigo-200'
    : 'bg-white border-slate-200 hover:border-indigo-200';

  return (
    <div onClick={onClick} className={`${baseClasses} ${selectedClasses}`}>
      {/* 卡片内容 */}
    </div>
  );
}
```

### 侧边栏头部

带筛选 Tab 的侧边栏：

```tsx
<div className="p-4 border-b border-slate-200 bg-white/50">
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
      <Target size={18} weight="fill" className="text-indigo-500" />
      近期决策
    </h2>
    {isLoading && <CircleNotch size={16} weight="bold" className="animate-spin text-indigo-400" />}
  </div>
  
  {/* Tab 筛选器 */}
  <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
    <button
      onClick={() => setActiveTab('all')}
      className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all ${
        activeTab === 'all' 
          ? 'bg-white text-slate-700 shadow-sm' 
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      全部
    </button>
    {/* 更多 Tab */}
  </div>
</div>
```

### 信息头部卡片

展示详情信息的头部区域：

```tsx
<header className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200 p-5 shadow-sm">
  <div className="flex items-start justify-between mb-4">
    <div>
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <GitBranch size={20} weight="bold" className="text-indigo-500" />
        决策轨迹
      </h2>
      <div className="text-xs text-slate-500 font-mono mt-1.5">
        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          {decisionId}
        </span>
      </div>
    </div>
    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
      <Clock size={14} />
      <span className="font-mono">{timestamp}</span>
    </div>
  </div>

  {/* 网格信息展示 */}
  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
        <IdentificationBadge size={18} weight="fill" />
      </div>
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Pseudo ID</p>
        <p className="text-sm font-mono font-medium text-slate-700">{pseudoId}</p>
      </div>
    </div>
    {/* 更多字段 */}
  </div>
</header>
```

### 流水线/流程指示器

展示多阶段流程状态：

```tsx
<div className="bg-white/60 backdrop-blur-sm rounded-lg border border-slate-200 p-4">
  <div className="flex items-center justify-between">
    {stages.map((stage, index) => (
      <React.Fragment key={stage.type}>
        {/* 节点 */}
        <div className="flex flex-col items-center flex-1 min-w-0">
          <div
            className="w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all"
            style={{
              borderColor: stage.color,
              backgroundColor: stage.status === 'SUCCESS' ? `${stage.color}15` : 'white'
            }}
          >
            {stage.status === 'SUCCESS' && <Check size={16} color={stage.color} weight="bold" />}
            {stage.status === 'FAILED' && <X size={16} color={stage.color} weight="bold" />}
          </div>
          <span className="text-[9px] text-slate-600 mt-1.5 font-medium text-center">
            {stage.name}
          </span>
        </div>
        
        {/* 连接线 */}
        {index < stages.length - 1 && (
          <div className="w-6 h-0.5 -mt-4 flex-shrink-0 bg-slate-200" />
        )}
      </React.Fragment>
    ))}
  </div>
</div>
```

### 空状态（数据面板）

```tsx
<div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 border-dashed">
  <div className="text-center text-slate-400">
    <GitBranch size={48} className="mx-auto mb-4 opacity-50" />
    <p className="text-sm font-medium">请从左侧选择一条决策记录</p>
    <p className="text-xs mt-1 text-slate-300">Select a decision to view details</p>
  </div>
</div>
```

### 实时状态指示器

```tsx
{/* 加载指示器 - 悬浮 */}
<div className="absolute top-4 right-4 z-20 bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-200 flex items-center gap-2 text-xs text-slate-500">
  <CircleNotch size={14} weight="bold" className="animate-spin text-indigo-500" />
  Loading details...
</div>

{/* 在线状态 */}
<div className="text-xs text-gray-400 flex items-center justify-end gap-2">
  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
  系统在线
</div>

{/* 自动刷新提示 */}
<div className="p-3 border-t border-slate-200 bg-slate-50/50 text-[10px] text-center text-slate-400">
  Auto-refreshing every 3s
</div>
```

---

## 📋 状态反馈

### 加载状态

```tsx
<div className="min-h-screen flex items-center justify-center animate-fade-in">
  <div className="text-center">
    <CircleNotch 
      className="animate-spin mx-auto mb-4" 
      size={48} 
      weight="bold" 
      color="#3b82f6" 
    />
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
// ==================== 按钮 ====================

// 主要按钮
"px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"

// 对话框主要按钮
"px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"

// 次要按钮
"px-6 py-3 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"

// ==================== 卡片 ====================

// 毛玻璃效果卡片
"p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-200"

// 单词卡片
"group p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl shadow-sm hover:shadow-xl hover:scale-[1.03] transition-all duration-300 hover:border-blue-400"

// 数据面板统计卡片
"bg-white/80 backdrop-blur-sm border border-gray-200/60 p-6 rounded-2xl relative overflow-hidden group shadow-sm"

// 可选中列表卡片（未选中）
"p-3 rounded-lg cursor-pointer border border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md hover:scale-[1.01] transition-all duration-200 group"

// 可选中列表卡片（选中）
"p-3 rounded-lg cursor-pointer border border-indigo-500 bg-indigo-50/80 shadow-sm ring-1 ring-indigo-200 transition-all duration-200"

// ==================== 输入 & 表单 ====================

// 输入框
"w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"

// Tab 筛选器容器
"flex gap-1 bg-slate-100 p-1 rounded-lg"

// Tab 按钮（激活）
"flex-1 px-2 py-1 text-xs font-medium rounded bg-white text-slate-700 shadow-sm transition-all"

// Tab 按钮（未激活）
"flex-1 px-2 py-1 text-xs font-medium rounded text-slate-500 hover:text-slate-700 transition-all"

// ==================== 布局 ====================

// 导航栏
"fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200/50 shadow-sm"

// 页面容器（标准）
"max-w-6xl mx-auto px-4 py-8 animate-fade-in"

// 页面容器（大型）
"max-w-7xl mx-auto"

// 页面渐变背景
"min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30"

// 数据面板渐变背景
"min-h-screen bg-gradient-to-br from-slate-100 to-slate-200"

// 侧边栏
"w-[300px] flex flex-col flex-shrink-0 border-r border-slate-200 bg-white/90 backdrop-blur-lg shadow-xl z-10"

// 信息头部卡片
"bg-white/80 backdrop-blur-md rounded-xl border border-slate-200 p-5 shadow-sm"

// ==================== 标签 & 徽章 ====================

// 状态标签（基础）
"text-[10px] px-1.5 py-0.5 rounded border font-medium"

// 真实数据标签
"text-[10px] px-1.5 py-0.5 rounded border font-medium bg-emerald-100 text-emerald-700 border-emerald-200"

// 模拟数据标签
"text-[10px] px-1.5 py-0.5 rounded border font-medium bg-purple-100 text-purple-700 border-purple-200"

// ID 标签
"bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs font-mono text-slate-500"

// 圆形音标背景
"text-base text-gray-600 bg-gray-100 px-4 py-1.5 rounded-full"

// 圆形编号徽章
"w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold"

// ==================== 装饰元素 ====================

// 渐变分隔线
"h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"

// 左侧强调色条
"absolute top-0 left-0 w-1 h-full bg-blue-500"

// 装饰性背景图标
"absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"

// 在线状态指示器
"w-2 h-2 rounded-full bg-emerald-500 animate-pulse"

// ==================== 加载状态 ====================

// 悬浮加载指示器
"absolute top-4 right-4 z-20 bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-200 flex items-center gap-2 text-xs text-slate-500"

// ==================== 文字样式 ====================

// 大写标签文字
"text-xs font-bold uppercase tracking-wider"

// 小标签
"text-[10px] text-slate-500 uppercase tracking-wider"

// 单空等宽字体
"font-mono"

// 渐变文字
"bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"
```


---

**版本**: 3.0.0  
**最后更新**: 2025年12月  
**维护者**: 开发团队

## 更新日志

### v3.0.0 (2025年12月)
- ✨ **新增 G3 弹簧物理动画系统** - 基于 HyperOS/MIUI 自然触感设计
  - 四种弹簧配置：Standard、Snappy、Gentle、Bouncy
  - G3 时长标准：120ms - 480ms
  - Framer Motion Variants 预设
- ✨ **新增数据面板组件规范** - 监控面板、统计页面专用组件
  - 全屏仪表盘布局（侧边栏 + 主内容）
  - 统计指标卡片（带装饰性背景图标）
  - 可选中列表卡片
  - 流水线/流程指示器
  - 实时状态指示器
- ✨ **扩展颜色系统**
  - 新增 Slate 系（数据面板/专业界面）
  - 新增 Indigo 系（高级功能/数据面板）
  - 新增扩展语义色：Emerald、Amber、Purple、Rose
  - 新增状态标签配色规范
- ✨ **新增页面渐变背景** - 多种场景渐变方案
- ✨ **新增文字渐变效果** - 标题强调样式
- ✨ **新增交互式高度动画** - Framer Motion layout 动画
- 🔄 扩展常用类名组合
  - 数据面板统计卡片
  - 可选中列表卡片
  - Tab 筛选器
  - 侧边栏布局
  - 状态标签/徽章
  - 装饰元素
  - 加载状态指示器
  - 文字样式
- 🔄 更新设计原则，强调层次分明和自然触感

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
