# Word Mastery 组件

单词掌握度分析相关的组件集合。

## WordMasteryDetailModal

单词详细掌握度信息模态框组件，用于展示单词的完整学习数据。

### 功能特性

1. **单词基本信息**：显示单词拼写、音标和释义
2. **掌握度评估**：展示综合得分、置信度、SRS等级等详细指标
3. **学习轨迹图表**：可视化展示记忆强度随时间的变化
4. **评估历史记录**：列出最近的学习记录，包括正确/错误状态和响应时间
5. **复习建议**：基于遗忘曲线预测的最佳复习时间

### 组件接口

```typescript
interface WordMasteryDetailModalProps {
  wordId: string; // 单词ID（必填）
  isOpen: boolean; // 模态框开启状态
  onClose: () => void; // 关闭回调函数
}
```

### 使用示例

```tsx
import { WordMasteryDetailModal } from '../components/word-mastery/WordMasteryDetailModal';

function MyComponent() {
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleWordClick = (wordId: string) => {
    setSelectedWordId(wordId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedWordId(null);
  };

  return (
    <>
      <button onClick={() => handleWordClick('word-id-123')}>查看详情</button>

      {selectedWordId && (
        <WordMasteryDetailModal
          wordId={selectedWordId}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}
```

### 设计特点

#### 1. Loading 状态处理

- 显示 Loading 动画，提供良好的用户体验
- 使用并发加载（Promise.all）优化加载性能

#### 2. 错误处理

- 捕获并展示加载错误
- 提供重试按钮
- 使用 Toast 提示（通过 logger）记录错误

#### 3. 数据为空时的 Empty State

- 当单词无学习记录时显示友好的空状态提示
- 引导用户开始学习

#### 4. 响应式设计

- 使用 Tailwind CSS 实现响应式布局
- 移动端友好的网格布局
- 适配小屏幕的滚动区域

#### 5. 动画效果

- 使用 Framer Motion 实现流畅的进入/退出动画
- 各区块采用渐进式加载动画（stagger effect）

### API 调用

组件内部调用以下 API：

1. `apiClient.getLearnedWords()` - 获取单词基本信息
2. `apiClient.getWordMasteryDetail(wordId)` - 获取掌握度评估
3. `apiClient.getWordMasteryTrace(wordId)` - 获取学习轨迹
4. `apiClient.getWordMasteryInterval(wordId)` - 获取复习间隔预测

### 性能优化

- 使用 `useEffect` 确保只在模态框打开时加载数据
- 避免重复加载相同数据
- 图表数据限制在合理范围内（最多显示10条历史记录）

### 样式规范

- 遵循项目统一的设计系统
- 使用 Tailwind CSS utility classes
- 颜色方案：
  - 已掌握：绿色（green-600）
  - 熟练：蓝色（blue-600）
  - 学习中：黄色（yellow-600）
  - 需复习：橙色（orange-600）
  - 未学习：灰色（gray-500）

### 图标使用

使用 Phosphor Icons 图标库：

- `ChartLine` - 掌握度评估
- `Fire` - 学习轨迹
- `Clock` - 复习建议/评估历史
- `Lightbulb` - 学习建议
- `CheckCircle` - 正确状态
- `X` - 错误状态
- `Warning` - 警告/空状态
- `CircleNotch` - 加载中

## 集成说明

该组件已集成到 `WordMasteryPage.tsx` 中：

1. 在单词卡片上添加点击事件
2. 点击后打开模态框显示详细信息
3. 使用状态管理控制模态框的开启/关闭

```tsx
// WordMasteryPage.tsx
const handleWordClick = (wordId: string) => {
  setSelectedWordId(wordId);
  setIsModalOpen(true);
};

// ��单词列表渲染中
<div key={word.id} onClick={() => handleWordClick(word.id)} className="cursor-pointer">
  <MasteryWordItem {...props} />
</div>;
```

## 依赖

- React 18+
- Framer Motion
- Phosphor Icons
- Tailwind CSS
- ApiClient (项目内部服务)
- Logger (项目内部工具)

## 测试建议

1. 测试不同掌握度等级的单词显示
2. 测试空数据状态
3. 测试加载错误处理
4. 测试响应式布局（桌面/移动端）
5. 测试大量历史记录的滚动
6. 测试模态框的打开/关闭动画

## 未来改进

- [ ] 添加单词音频播放功能
- [ ] 支持导出学习数据
- [ ] 添加分享功能
- [ ] 支持对比多个单词
- [ ] 添加更多可视化图表类型
