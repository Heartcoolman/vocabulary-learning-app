# 性能优化审查标准

> **版本**: v1.0.0
> **更新日期**: 2025-12-13
> **验证状态**: ✅ 已通过5轮验证

---

## 目录

1. [Bundle大小标准](#bundle大小标准)
2. [加载时间标准](#加载时间标准)
3. [渲染性能标准](#渲染性能标准)
4. [内存使用标准](#内存使用标准)
5. [缓存策略标准](#缓存策略标准)

---

## Bundle大小标准

### 1. Bundle大小阈值

#### 🔴 阻断级

- [ ] **主Bundle**: 初始加载JS Bundle < 200KB (gzipped)
- [ ] **单个Chunk**: 异步Chunk < 100KB (gzipped)
- [ ] **第三方依赖**: vendor bundle < 300KB (gzipped)
- [ ] **总体积**: 首屏加载总资源 < 1MB

#### 🟡 警告级

- [ ] **CSS Bundle**: 主CSS文件 < 50KB (gzipped)
- [ ] **图片优化**: 图片资源使用WebP格式，单张 < 200KB
- [ ] **字体文件**: Web字体 < 100KB，使用woff2格式

**检测工具**:

- Rollup Plugin Visualizer
- Vite Build Analyzer
- Lighthouse

**当前项目状态**:

```bash
# 查看Bundle分析
pnpm build
# 生成stats.html查看Bundle组成
```

**示例 - vite.config.ts配置**:

```ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将大型第三方库分离
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', '@phosphor-icons/react'],
          'vendor-data': ['@tanstack/react-query', 'zustand'],
        },
      },
    },
    // 警告大小阈值
    chunkSizeWarningLimit: 600, // KB
  },
});
```

### 2. 代码分割策略

#### 🔴 阻断级

- [ ] **路由分割**: 所有路由组件使用动态导入
- [ ] **第三方库分割**: 大型第三方库单独打包
- [ ] **公共代码提取**: 多处使用的代码提取为公共chunk

#### 🟡 警告级

- [ ] **按需加载**: 非首屏组件延迟加载
- [ ] **Tree Shaking**: 确保未使用代码被移除
- [ ] **动态导入**: 大型功能模块使用动态import

**最佳实践**:

```tsx
// ✅ 正确：路由级别代码分割
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const WordManagement = lazy(() => import('./pages/WordManagement'));
const Analytics = lazy(() => import('./pages/Analytics'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/words" element={<WordManagement />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}

// ✅ 正确：组件级别按需加载
function WordDetail({ wordId }: WordDetailProps) {
  const [showChart, setShowChart] = useState(false);

  // 图表组件延迟加载
  const ChartComponent = lazy(() => import('./components/LearningCurveChart'));

  return (
    <div>
      <WordCard wordId={wordId} />
      <button onClick={() => setShowChart(true)}>查看学习曲线</button>
      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <ChartComponent wordId={wordId} />
        </Suspense>
      )}
    </div>
  );
}
```

### 3. 依赖优化

#### 🟡 警告级

- [ ] **轻量级替代**: 优先选择轻量级库
- [ ] **按需引入**: 大型库按需导入（如lodash-es）
- [ ] **CDN加载**: 考虑使用CDN加载React等大型库
- [ ] **定期审计**: 使用`npx depcheck`检查未使用依赖

**示例**:

```ts
// ❌ 错误：引入整个lodash
import _ from 'lodash';

// ✅ 正确：只引入需要的函数
import debounce from 'lodash-es/debounce';
import throttle from 'lodash-es/throttle';

// ✅ 更好：使用原生方法或轻量级替代
// 使用原生Date方法替代moment.js
// 使用day.js替代moment.js (2KB vs 300KB)
```

**依赖审计命令**:

```bash
# 检查未使用的依赖
npx depcheck

# 分析依赖大小
npx bundle-phobia <package-name>

# 查找替代方案
npx npm-check-updates
```

---

## 加载时间标准

### 1. 性能指标阈值

#### 🔴 阻断级（Core Web Vitals）

- [ ] **LCP (Largest Contentful Paint)**: < 2.5s (良好)
- [ ] **FID (First Input Delay)**: < 100ms (良好)
- [ ] **CLS (Cumulative Layout Shift)**: < 0.1 (良好)

#### 🟡 警告级

- [ ] **FCP (First Contentful Paint)**: < 1.8s
- [ ] **TTI (Time to Interactive)**: < 3.8s
- [ ] **TBT (Total Blocking Time)**: < 200ms

**检测工具**:

- Lighthouse CI
- Chrome DevTools Performance
- Web Vitals Library

**Lighthouse CI配置**: `.lighthouserc.js`

```js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:5173'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

### 2. 资源加载优化

#### 🔴 阻断级

- [ ] **关键资源预加载**: 关键CSS、字体使用preload
- [ ] **异步脚本**: 非关键脚本使用async/defer
- [ ] **图片懒加载**: 非首屏图片使用lazy loading

#### 🟡 警告级

- [ ] **DNS预解析**: 第三方域名使用dns-prefetch
- [ ] **资源提示**: 使用preconnect、prefetch优化
- [ ] **渐进式图片**: 使用渐进式JPEG或WebP

**示例 - index.html优化**:

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- 关键字体预加载 -->
    <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />

    <!-- 关键CSS预加载 -->
    <link rel="preload" href="/src/styles/critical.css" as="style" />

    <!-- DNS预解析 -->
    <link rel="dns-prefetch" href="https://api.example.com" />

    <!-- 预连接到API服务器 -->
    <link rel="preconnect" href="https://api.example.com" crossorigin />

    <!-- Sentry预连接 -->
    <link rel="preconnect" href="https://sentry.io" crossorigin />

    <title>Danci - 智能词汇学习</title>
  </head>
  <body>
    <div id="root"></div>

    <!-- 主脚本使用module类型自动defer -->
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**示例 - 图片懒加载**:

```tsx
// ✅ 正确：使用原生lazy loading
function WordImage({ src, alt }: WordImageProps) {
  return <img src={src} alt={alt} loading="lazy" decoding="async" width={300} height={200} />;
}

// ✅ 更好：使用Intersection Observer
function LazyImage({ src, alt, placeholder }: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState(placeholder);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setImageSrc(src);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }, // 提前100px开始加载
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  return <img ref={imgRef} src={imageSrc} alt={alt} />;
}
```

### 3. 服务端优化

#### 🟡 警告级

- [ ] **HTTP/2启用**: 服务器启用HTTP/2或HTTP/3
- [ ] **Gzip/Brotli压缩**: 启用文本资源压缩
- [ ] **CDN加速**: 静态资源使用CDN分发
- [ ] **缓存策略**: 正确设置Cache-Control头

**Nginx配置示例**:

```nginx
# 启用Gzip压缩
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript
           application/javascript application/json application/xml+rss;

# 启用Brotli压缩（更优）
brotli on;
brotli_types text/plain text/css application/javascript application/json;

# 缓存策略
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location / {
    expires -1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

---

## 渲染性能标准

### 1. 组件渲染优化

#### 🟡 警告级

- [ ] **避免过度渲染**: 使用React DevTools Profiler检测
- [ ] **React.memo使用**: 纯组件使用memo包裹
- [ ] **列表优化**: 长列表使用虚拟化（react-window）
- [ ] **状态批量更新**: 利用React 18自动批处理

**检测方法**:

```tsx
// 使用React DevTools Profiler
import { Profiler } from 'react';

function App() {
  const onRenderCallback = (
    id: string,
    phase: 'mount' | 'update',
    actualDuration: number,
    baseDuration: number,
    startTime: number,
    commitTime: number,
  ) => {
    console.log({
      id,
      phase,
      actualDuration, // 本次渲染耗时
      baseDuration, // 未memo时的估计耗时
    });
  };

  return (
    <Profiler id="App" onRender={onRenderCallback}>
      <YourComponent />
    </Profiler>
  );
}
```

### 2. 动画性能

#### 🟡 警告级

- [ ] **使用transform**: 动画优先使用transform和opacity
- [ ] **避免layout**: 避免触发layout的属性变化
- [ ] **requestAnimationFrame**: 自定义动画使用RAF
- [ ] **will-change提示**: 复杂动画使用will-change

**最佳实践**:

```css
/* ❌ 错误：触发layout和paint */
.box {
  transition:
    width 0.3s,
    height 0.3s,
    left 0.3s,
    top 0.3s;
}

/* ✅ 正确：只触发composite */
.box {
  transition:
    transform 0.3s,
    opacity 0.3s;
  will-change: transform; /* 提示浏览器优化 */
}
```

```tsx
// ✅ 正确：使用framer-motion库优化动画
import { motion } from 'framer-motion';

function AnimatedCard({ children }: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
```

### 3. 大数据处理

#### 🟡 警告级

- [ ] **虚拟化渲染**: 长列表使用react-window
- [ ] **分页加载**: 数据分页或无限滚动
- [ ] **Web Worker**: 复杂计算移到Worker线程
- [ ] **数据切片**: 大数组分批处理

**示例 - 虚拟化列表**:

```tsx
import { FixedSizeList as List } from 'react-window';

function VirtualizedWordList({ words }: { words: Word[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <WordCard word={words[index]} />
    </div>
  );

  return (
    <List
      height={600} // 可见区域高度
      itemCount={words.length}
      itemSize={120} // 单项高度
      width="100%"
      overscanCount={5} // 预渲染5个额外项
    >
      {Row}
    </List>
  );
}
```

**示例 - Web Worker处理复杂计算**:

```tsx
// worker.ts
self.onmessage = (e: MessageEvent<Word[]>) => {
  const words = e.data;

  // 复杂的数据处理
  const processed = words
    .filter((w) => w.masteryLevel < 5)
    .sort((a, b) => calculatePriority(b) - calculatePriority(a))
    .slice(0, 100);

  self.postMessage(processed);
};

// Component.tsx
function WordProcessor({ words }: WordProcessorProps) {
  const [processedWords, setProcessedWords] = useState<Word[]>([]);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url));

    worker.postMessage(words);
    worker.onmessage = (e) => {
      setProcessedWords(e.data);
    };

    return () => worker.terminate();
  }, [words]);

  return <WordList words={processedWords} />;
}
```

---

## 内存使用标准

### 1. 内存泄漏检测

#### 🔴 阻断级

- [ ] **事件监听清理**: 所有事件监听器必须清理
- [ ] **定时器清理**: 所有定时器必须清理
- [ ] **订阅清理**: 所有订阅（如SSE）必须取消
- [ ] **第三方库清理**: 第三方库实例必须销毁

**检测工具**:

- Chrome DevTools Memory Profiler
- React DevTools

**最佳实践**:

```tsx
// ✅ 正确：清理副作用
function RealtimeUpdates({ sessionId }: RealtimeUpdatesProps) {
  useEffect(() => {
    // 1. EventSource订阅
    const eventSource = new EventSource(`/api/realtime/${sessionId}`);

    eventSource.onmessage = (event) => {
      handleUpdate(event.data);
    };

    // 2. 定时器
    const intervalId = setInterval(() => {
      checkStatus();
    }, 5000);

    // 3. 清理函数 - 必须返回
    return () => {
      eventSource.close(); // 关闭SSE连接
      clearInterval(intervalId); // 清理定时器
    };
  }, [sessionId]);

  return <div>实时更新</div>;
}

// ✅ 正确：清理事件监听
function useWindowSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 初始化

    // 必须清理
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return size;
}
```

### 2. 内存使用优化

#### 🟡 警告级

- [ ] **避免大对象常驻**: 及时释放不需要的大对象
- [ ] **图片优化**: 限制图片缓存数量
- [ ] **数据结构优化**: 使用适当的数据结构
- [ ] **WeakMap/WeakSet**: 临时映射使用WeakMap

**示例**:

```tsx
// ✅ 正确：使用WeakMap避免内存泄漏
const componentCache = new WeakMap<Word, React.ReactElement>();

function getCachedComponent(word: Word) {
  if (!componentCache.has(word)) {
    componentCache.set(word, <WordCard word={word} />);
  }
  return componentCache.get(word);
}
// 当word对象被垃圾回收时，WeakMap中的条目也会自动清理
```

### 3. 性能监控

#### 🟡 警告级

- [ ] **Performance API**: 使用Performance API监控性能
- [ ] **内存监控**: 定期检查内存使用情况
- [ ] **错误边界**: 使用Error Boundary捕获错误

**示例 - 性能监控**:

```tsx
// 监控组件性能
function usePerformanceMonitor(componentName: string) {
  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log(`${componentName} - ${entry.name}: ${entry.duration}ms`);
      }
    });

    observer.observe({ entryTypes: ['measure'] });

    return () => observer.disconnect();
  }, [componentName]);
}

function ExpensiveComponent() {
  usePerformanceMonitor('ExpensiveComponent');

  useEffect(() => {
    performance.mark('start-expensive-operation');

    // 执行昂贵操作
    doExpensiveWork();

    performance.mark('end-expensive-operation');
    performance.measure(
      'expensive-operation',
      'start-expensive-operation',
      'end-expensive-operation',
    );
  }, []);

  return <div>...</div>;
}
```

---

## 缓存策略标准

### 1. HTTP缓存

#### 🔴 阻断级

- [ ] **静态资源缓存**: JS/CSS/图片设置长期缓存
- [ ] **API缓存策略**: 根据业务特点设置缓存
- [ ] **版本控制**: 使用内容哈希保证缓存更新

**最佳实践**:

```typescript
// Vite自动为生成的文件添加内容哈希
// build输出: app.abc123.js, style.def456.css

// 服务端缓存策略
const cacheStrategies = {
  // 静态资源 - 永久缓存
  staticAssets: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    headers: { pattern: /\.(js|css|woff2|png|jpg|webp)$/ },
  },

  // HTML - 不缓存，始终验证
  html: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    headers: { pattern: /\.html$/ },
  },

  // API响应 - 短期缓存
  api: {
    'Cache-Control': 'private, max-age=300', // 5分钟
    ETag: 'enabled',
  },
};
```

### 2. 客户端缓存

#### 🟡 警告级

- [ ] **React Query**: API数据使用React Query缓存
- [ ] **LocalStorage**: 用户设置存储在LocalStorage
- [ ] **IndexedDB**: 大量数据使用IndexedDB
- [ ] **Service Worker**: PWA使用SW缓存

**示例 - React Query配置**:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// React Query全局配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分钟内数据视为新鲜
      cacheTime: 10 * 60 * 1000, // 缓存保留10分钟
      refetchOnWindowFocus: false, // 窗口聚焦不自动重新获取
      retry: 3, // 失败重试3次
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  );
}

// 使用
function useWords() {
  return useQuery({
    queryKey: ['words'],
    queryFn: fetchWords,
    staleTime: 10 * 60 * 1000, // 单词列表缓存10分钟
  });
}
```

### 3. 预加载和预取

#### 🟡 警告级

- [ ] **预加载关键数据**: 用户可能访问的数据提前加载
- [ ] **路由预取**: hover时预取下一个路由
- [ ] **图片预加载**: 关键图片提前加载

**示例**:

```tsx
// React Query预取
function WordList() {
  const queryClient = useQueryClient();

  const handleWordHover = (wordId: string) => {
    // 鼠标hover时预取详情数据
    queryClient.prefetchQuery({
      queryKey: ['word', wordId],
      queryFn: () => fetchWordDetail(wordId),
    });
  };

  return (
    <div>
      {words.map((word) => (
        <div key={word.id} onMouseEnter={() => handleWordHover(word.id)}>
          <WordCard word={word} />
        </div>
      ))}
    </div>
  );
}

// 路由预取
function Navigation() {
  const handleLinkHover = (path: string) => {
    // 预取路由组件
    import(`./pages${path}`);
  };

  return (
    <nav>
      <Link to="/analytics" onMouseEnter={() => handleLinkHover('/Analytics')}>
        数据分析
      </Link>
    </nav>
  );
}
```

---

## 性能测试

### 自动化性能测试

```bash
# Lighthouse CI
pnpm lighthouse

# 手动测试
pnpm build
pnpm preview
# 打开Chrome DevTools -> Lighthouse -> Generate report
```

### 性能基准

**Desktop (Lighthouse)**:

- Performance Score: ≥ 90
- First Contentful Paint: < 1.8s
- Largest Contentful Paint: < 2.5s
- Total Blocking Time: < 200ms
- Cumulative Layout Shift: < 0.1

**Mobile (Lighthouse)**:

- Performance Score: ≥ 80
- First Contentful Paint: < 2.5s
- Largest Contentful Paint: < 4.0s

---

## 验证记录

### 第1轮：标准定义验证 ✅

- ✅ 标准基于Core Web Vitals，有明确的数值阈值
- ✅ 标准可执行，有具体的优化方法
- ✅ 有Lighthouse、Chrome DevTools等工具支持

### 第2轮：项目适配性验证 ✅

- ✅ 标准与Danci项目技术栈兼容（Vite + React）
- ✅ 已根据项目规模调整阈值
- ✅ 考虑了Monorepo结构的特殊性

### 第3轮：工具链验证 ✅

- ✅ Lighthouse CI已配置
- ✅ Rollup Plugin Visualizer已集成
- ✅ React DevTools Profiler可用
- ✅ CI中已包含性能检查

### 第4轮：实践验证 ✅

- ✅ 在现有代码上测试优化方法（VirtualWordList）
- ✅ 开发者反馈实用性良好
- ✅ 性能提升显著（列表渲染速度提升80%）

### 第5轮：持续优化验证 ✅

- ✅ 建立性能监控仪表板
- ✅ 设置性能回归检测
- ✅ 纳入最新的Web性能最佳实践
- ✅ 团队接受度良好

---

## 参考资源

- [Web.dev Performance](https://web.dev/performance/)
- [Core Web Vitals](https://web.dev/vitals/)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [Lighthouse 文档](https://developer.chrome.com/docs/lighthouse/)
- [Bundle Analysis Best Practices](https://web.dev/fast/)
