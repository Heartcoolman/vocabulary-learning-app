# G3 动画曲线技术实现文档

## 1. 简介
本文档详细说明如何在 Web 前端项目中落地“G3 级”平滑动画。我们将重点介绍两种主要方法：CSS `linear()` 函数（用于高性能预设动画）和 JavaScript 弹簧物理（用于动态交互动画）。

## 2. 方案一：CSS `linear()` 函数 (推荐用于固定动画)

CSS `linear()` 函数允许我们通过定义一系列关键点来近似任何复杂的曲线，从而突破 `cubic-bezier` 的限制。

### 2.1 原理
通过生成高密度的 G3 曲线采样点，传递给 `linear()` 函数。

### 2.2 代码示例

```css
/* 定义一个近似 G3 的平滑曲线变量 */
:root {
  /* 这是一个示例 linear 曲线，模拟了极其平滑的起步和刹车 */
  --ease-g3-smooth: linear(
    0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.284 12.2%, 
    0.49 18.1%, 0.675 24.3%, 0.824 31.1%, 0.926 39.4%, 
    0.98 50%, 0.996 61.3%, 1
  );
}

.card {
  transition: transform 0.6s var(--ease-g3-smooth);
}

.card:hover {
  transform: translateY(-10px);
}
```

### 2.3 生成工具
可以使用在线工具（如 `linear()` generator）或编写脚本，根据 G3 数学公式（如五次多项式）生成这些点。

## 3. 方案二：JavaScript 弹簧物理 (推荐用于交互动画)

对于拖拽、滑动等需要实时响应用户手势的场景，物理模拟是唯一能保证 G2/G3 连续性的方案。

### 3.1 推荐库
*   **Framer Motion (React)**: 极其易用，默认使用弹簧。
*   **React Spring**: 专注于物理精确性。
*   **GSAP (GreenSock)**: 性能强大，支持自定义 ease。

### 3.2 Framer Motion 示例

```jsx
import { motion } from "framer-motion";

export const SmoothCard = () => (
  <motion.div
    // 使用弹簧配置：stiffness (刚度), damping (阻尼), mass (质量)
    // 这种配置能产生自然的“过冲”和回弹，且加速度连续
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
    whileHover={{ scale: 1.05 }}
  >
    G3 Smoothness
  </motion.div>
);
```

### 3.3 原生 JS 实现 (简易版)

如果不使用库，可以使用简单的弹簧算法：

```javascript
function springAnimate(target, config = { k: 0.1, d: 0.8 }) {
  let position = 0;
  let velocity = 0;
  
  function step() {
    const force = (target - position) * config.k; // 弹力
    velocity += force;
    velocity *= config.d; // 阻尼
    position += velocity;
    
    // 更新 DOM
    element.style.transform = `translateX(${position}px)`;
    
    if (Math.abs(velocity) > 0.01 || Math.abs(target - position) > 0.01) {
      requestAnimationFrame(step);
    }
  }
  step();
}
```

## 4. 性能优化
1.  **优先使用 CSS Transform/Opacity**: 避免触发布局重排 (Layout) 和重绘 (Paint)。
2.  **will-change**: 对关键动画元素使用 `will-change: transform` 提示浏览器提升层级。
3.  **避免主线程阻塞**: JS 动画在主线程运行，确保业务逻辑不阻塞 UI。

## 5. 兼容性处理
对于不支持 `linear()` 的旧浏览器，提供回退方案：

```css
.element {
  /* 回退方案：标准缓动 */
  transition-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1);
  
  /* 现代浏览器：G3 级缓动 */
  transition-timing-function: linear(...);
}
```
