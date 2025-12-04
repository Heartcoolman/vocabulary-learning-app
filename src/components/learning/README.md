# Learning Components

学习相关的组件集合。

## TodayWordsCard

今日推荐单词卡片组件，用于展示系统智能推荐的今日学习单词。

### 功能特性

1. **智能推荐展示**
   - 自动调用 `ApiClient.getTodayWords()` 获取今日推荐单词
   - 按优先级排序显示（前3个为高优先级，中间3个为中优先级，其余为低优先级）
   - 最多显示 10 个单词

2. **单词信息展示**
   - 单词拼写
   - 国际音标
   - 中文释义（显示第一个释义）
   - 优先级指示器（颜色标记：红色=高，黄色=中，绿色=低）

3. **学习进度追踪**
   - 显示高优先级单词数量
   - 显示总单词数量
   - 一键开始学习按钮

4. **用户体验优化**
   - Loading skeleton 加载动画
   - 错误处理和重试机制
   - 响应式布局（移动端友好）
   - 自定义滚动条样式
   - Hover 交互效果

### 使用示例

```tsx
import TodayWordsCard from '../components/learning/TodayWordsCard';
import { Word } from '../types/models';

function MyLearningPage() {
  const handleStartLearning = (words: Word[]) => {
    console.log('开始学习这些单词:', words);
    // 处理学习逻辑
  };

  return (
    <TodayWordsCard onStartLearning={handleStartLearning} />
  );
}
```

### Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `onStartLearning` | `(words: Word[]) => void` | 是 | 点击"开始学习"按钮时的回调函数，传入推荐的单词列表 |

### 组件状态

- **Loading**: 显示骨架屏加载动画
- **Error**: 显示错误信息和重试按钮
- **Empty**: 显示"暂无推荐单词"提示
- **Success**: 显示单词列表和操作按钮

### 样式特点

- 使用 Tailwind CSS 进行样式控制
- 渐变色背景（蓝色到靛蓝色）
- 卡片式设计，适合放在页面顶部
- 自适应滚动条（最大高度 384px）
- 图标使用 Phosphor Icons

### 集成到 LearningPage

在 `LearningPage.tsx` 中的集成示例：

```tsx
// 1. 导入组件
import TodayWordsCard from '../components/learning/TodayWordsCard';

// 2. 添加状态
const [showTodayWords, setShowTodayWords] = useState(true);

// 3. 处理开始学习
const handleStartLearningFromToday = useCallback((words: Word[]) => {
  learningLogger.info({ wordCount: words.length }, '从今日推荐开始学习');
  setShowTodayWords(false); // 隐藏今日推荐卡片，开始学习
}, []);

// 4. 在页面中渲染（仅在未开始学习时显示）
{showTodayWords && !currentWord && !isLoading && allWords.length > 0 && (
  <TodayWordsCard onStartLearning={handleStartLearningFromToday} />
)}
```

### API 依赖

组件依赖以下 API：

```typescript
ApiClient.getTodayWords(): Promise<TodayWordsResponse>

interface TodayWordsResponse {
  words: Word[];
  progress: StudyProgress;
}
```

### 注意事项

1. 组件会自动在挂载时加载今日推荐单词
2. 后端 API 应该返回已排序的单词列表（按优先级从高到低）
3. 组件不处理学习逻辑，仅负责展示和触发学习会话
4. 错误状态下提供重试功能，无需刷新页面
5. 空状态下引导用户添加词书或单词

### 未来扩展

可能的功能扩展方向：

- [ ] 支持切换不同的推荐策略（新词优先、复习优先、混合模式）
- [ ] 添加单词详情预览功能
- [ ] 支持拖拽排序调整优先级
- [ ] 添加单词收藏/标记功能
- [ ] 显示学习进度百分比
- [ ] 支持自定义显示数量
