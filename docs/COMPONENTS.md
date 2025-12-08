# 组件文档

## 概述

本文档描述 Danci 项目的 React 组件库结构、使用指南和开发规范。项目采用模块化的组件架构，按功能领域划分组件目录。

## 组件目录结构

```
src/components/
├── ui/                    # 基础 UI 组件
│   ├── Modal.tsx          # 模态框组件
│   ├── Toast.tsx          # 消息提示组件
│   └── index.ts           # 统一导出
├── admin/                 # 管理后台组件
│   ├── LearningRecordsTab.tsx
│   └── AMASDecisionsTab.tsx
├── badges/                # 徽章相关组件
│   └── BadgeDetailModal.tsx
├── dashboard/             # 仪表盘组件
│   ├── DailyMissionCard.tsx
│   └── ProgressOverviewCard.tsx
├── explainability/        # 可解释性组件
│   ├── DecisionFactors.tsx
│   ├── CounterfactualPanel.tsx
│   ├── WeightRadarChart.tsx
│   ├── ExplainabilityModal.tsx
│   └── LearningCurveChart.tsx
├── profile/               # 用户画像组件
│   ├── RhythmCard.tsx
│   ├── HabitHeatmap.tsx
│   ├── MotivationCard.tsx
│   └── ChronotypeCard.tsx
├── progress/              # 进度相关组件
│   ├── GoalTracker.tsx
│   ├── MasteryDistributionChart.tsx
│   └── MilestoneCard.tsx
├── word-mastery/          # 单词掌握度组件
│   ├── MemoryTraceChart.tsx
│   ├── MasteryStatsCard.tsx
│   ├── MasteryWordItem.tsx
│   └── WordMasteryDetailModal.tsx
└── [其他独立组件]
    ├── Navigation.tsx      # 导航栏
    ├── WordCard.tsx        # 单词卡片
    ├── TestOptions.tsx     # 答题选项
    ├── AmasStatus.tsx      # AMAS 状态显示
    ├── SyncIndicator.tsx   # 同步状态指示器
    └── ...
```

## 组件分类

### 1. 基础 UI 组件 (`ui/`)

提供应用基础的 UI 构建块。

#### Modal - 模态框

```tsx
import { Modal, ConfirmModal, AlertModal } from '@/components/ui';

// 基础模态框
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="模态框标题"
  size="md"  // 'sm' | 'md' | 'lg' | 'xl' | 'full'
>
  <p>模态框内容</p>
</Modal>

// 确认模态框
<ConfirmModal
  isOpen={isConfirmOpen}
  onClose={handleClose}
  onConfirm={handleConfirm}
  title="确认操作"
  message="确定要执行此操作吗？"
  confirmText="确认"
  cancelText="取消"
  variant="danger"  // 'primary' | 'danger' | 'warning'
/>

// 警告模态框
<AlertModal
  isOpen={isAlertOpen}
  onClose={handleClose}
  title="提示"
  message="操作已完成"
  type="success"  // 'success' | 'error' | 'warning' | 'info'
/>
```

**Props 说明：**

| 属性     | 类型       | 必填 | 说明                |
| -------- | ---------- | ---- | ------------------- |
| isOpen   | boolean    | 是   | 控制模态框显示/隐藏 |
| onClose  | () => void | 是   | 关闭回调            |
| title    | string     | 否   | 标题                |
| size     | ModalSize  | 否   | 尺寸，默认 'md'     |
| children | ReactNode  | 否   | 内容                |

#### Toast - 消息提示

```tsx
import { ToastProvider, useToast } from '@/components/ui';

// 在 App 中包裹 Provider
<ToastProvider>
  <App />
</ToastProvider>;

// 在组件中使用
function MyComponent() {
  const { showToast, showSuccess, showError, showWarning } = useToast();

  return (
    <>
      <button onClick={() => showSuccess('操作成功')}>成功</button>
      <button onClick={() => showError('操作失败')}>失败</button>
      <button onClick={() => showWarning('注意')}>警告</button>
      <button
        onClick={() =>
          showToast({
            type: 'info',
            message: '自定义消息',
            duration: 5000,
          })
        }
      >
        自定义
      </button>
    </>
  );
}
```

**Toast 配置：**

| 属性     | 类型                                        | 说明                        |
| -------- | ------------------------------------------- | --------------------------- |
| type     | 'success' \| 'error' \| 'warning' \| 'info' | 消息类型                    |
| message  | string                                      | 消息内容                    |
| duration | number                                      | 持续时间（毫秒），默认 3000 |

### 2. 学习核心组件

#### WordCard - 单词卡片

```tsx
import WordCard from '@/components/WordCard';

<WordCard
  word={{
    id: '1',
    spelling: 'example',
    phonetic: '/ɪɡˈzɑːmpl/',
    meanings: ['n. 例子', 'v. 作为例子'],
    examples: ['This is an example.'],
  }}
  showPhonetic={true}
  showMeanings={true}
  onPronounce={handlePronounce}
  isHighlighted={false}
/>;
```

**Props：**

| 属性          | 类型       | 必填 | 说明         |
| ------------- | ---------- | ---- | ------------ |
| word          | Word       | 是   | 单词数据     |
| showPhonetic  | boolean    | 否   | 是否显示音标 |
| showMeanings  | boolean    | 否   | 是否显示释义 |
| onPronounce   | () => void | 否   | 发音回调     |
| isHighlighted | boolean    | 否   | 是否高亮显示 |

#### TestOptions - 答题选项

```tsx
import TestOptions from '@/components/TestOptions';

<TestOptions
  options={[
    { id: '1', text: '选项A', isCorrect: true },
    { id: '2', text: '选项B', isCorrect: false },
    { id: '3', text: '选项C', isCorrect: false },
    { id: '4', text: '选项D', isCorrect: false },
  ]}
  selectedId={selectedId}
  onSelect={handleSelect}
  showResult={showResult}
  disabled={disabled}
/>;
```

**Props：**

| 属性       | 类型                 | 必填 | 说明                      |
| ---------- | -------------------- | ---- | ------------------------- |
| options    | TestOption[]         | 是   | 选项数组                  |
| selectedId | string \| null       | 否   | 已选择的选项 ID           |
| onSelect   | (id: string) => void | 是   | 选择回调                  |
| showResult | boolean              | 否   | 是否显示结果（正确/错误） |
| disabled   | boolean              | 否   | 是否禁用选择              |

### 3. AMAS 相关组件

#### AmasStatus - AMAS 状态显示

```tsx
import AmasStatus from '@/components/AmasStatus';

<AmasStatus
  state={{
    attention: 0.8,
    fatigue: 0.3,
    motivation: 0.7,
    cognitive: 0.85,
  }}
  compact={false}
  showLabels={true}
/>;
```

#### AmasSuggestion - AMAS 建议

```tsx
import AmasSuggestion from '@/components/AmasSuggestion';

<AmasSuggestion
  suggestion={{
    type: 'break',
    message: '建议休息 5 分钟',
    confidence: 0.85,
  }}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
/>;
```

### 4. 可解释性组件 (`explainability/`)

#### DecisionFactors - 决策因素展示

```tsx
import { DecisionFactors } from '@/components/explainability';

<DecisionFactors
  factors={[
    { name: '注意力', value: 0.8, weight: 0.3 },
    { name: '疲劳度', value: 0.2, weight: 0.25 },
    { name: '动机', value: 0.7, weight: 0.25 },
    { name: '认知能力', value: 0.85, weight: 0.2 },
  ]}
  decision="继续学习"
/>;
```

#### WeightRadarChart - 权重雷达图

```tsx
import { WeightRadarChart } from '@/components/explainability';

<WeightRadarChart
  data={{
    labels: ['注意力', '记忆力', '速度', '稳定性', '动机'],
    values: [0.8, 0.7, 0.85, 0.6, 0.75],
  }}
  size={300}
/>;
```

#### LearningCurveChart - 学习曲线

```tsx
import { LearningCurveChart } from '@/components/explainability';

<LearningCurveChart
  data={{
    dates: ['2024-01-01', '2024-01-02', ...],
    accuracy: [0.7, 0.75, 0.72, 0.78, ...],
    retention: [0.6, 0.65, 0.68, 0.7, ...],
  }}
  height={300}
/>
```

#### CounterfactualPanel - 反事实分析

```tsx
import { CounterfactualPanel } from '@/components/explainability';

<CounterfactualPanel
  originalDecision={{
    action: 'continue',
    confidence: 0.85,
  }}
  counterfactuals={[
    {
      condition: '如果疲劳度降低到 0.2',
      newDecision: 'increase_difficulty',
      impact: '+15% 学习效率',
    },
  ]}
/>;
```

### 5. 用户画像组件 (`profile/`)

#### ChronotypeCard - 生物钟类型卡片

```tsx
import { ChronotypeCard } from '@/components/profile';

<ChronotypeCard
  chronotype={{
    category: 'morning', // 'morning' | 'evening' | 'intermediate'
    peakHours: [9, 10, 11],
    confidence: 0.85,
  }}
/>;
```

#### HabitHeatmap - 习惯热力图

```tsx
import { HabitHeatmap } from '@/components/profile';

<HabitHeatmap
  data={[
    { date: '2024-01-01', value: 5, level: 2 },
    { date: '2024-01-02', value: 10, level: 4 },
    // ...
  ]}
  startDate="2024-01-01"
  endDate="2024-12-31"
/>;
```

#### MotivationCard - 动机卡片

```tsx
import { MotivationCard } from '@/components/profile';

<MotivationCard
  motivation={{
    current: 0.75,
    trend: 'up',
    factors: ['连续学习', '成就达成'],
  }}
/>;
```

### 6. 进度组件 (`progress/`)

#### MasteryDistributionChart - 掌握度分布图

```tsx
import { MasteryDistributionChart } from '@/components/progress';

<MasteryDistributionChart
  distribution={{
    level0: 50, // 未学习
    level1: 100, // 刚接触
    level2: 80, // 学习中
    level3: 60, // 熟练
    level4: 40, // 掌握
    level5: 20, // 精通
  }}
/>;
```

#### GoalTracker - 目标追踪器

```tsx
import { GoalTracker } from '@/components/progress';

<GoalTracker
  goal={{
    target: 20,
    current: 15,
    unit: '个单词',
    deadline: '今日',
  }}
/>;
```

#### MilestoneCard - 里程碑卡片

```tsx
import { MilestoneCard } from '@/components/progress';

<MilestoneCard
  milestone={{
    title: '词汇量 1000',
    description: '学习了 1000 个单词',
    achievedAt: '2024-01-15',
    icon: 'star',
  }}
/>;
```

### 7. 单词掌握度组件 (`word-mastery/`)

#### MasteryStatsCard - 掌握度统计卡片

```tsx
import { MasteryStatsCard } from '@/components/word-mastery';

<MasteryStatsCard
  stats={{
    totalWords: 500,
    masteredWords: 200,
    learningWords: 150,
    newWords: 150,
    averageRetention: 0.85,
  }}
/>;
```

#### MemoryTraceChart - 记忆轨迹图

```tsx
import { MemoryTraceChart } from '@/components/word-mastery';

<MemoryTraceChart
  traces={[
    { timestamp: '2024-01-01', retention: 1.0 },
    { timestamp: '2024-01-02', retention: 0.8 },
    { timestamp: '2024-01-05', retention: 0.6 },
    // ...
  ]}
  predictedRetention={0.5}
  optimalReviewTime="2024-01-08"
/>;
```

#### WordMasteryDetailModal - 单词掌握度详情模态框

```tsx
import { WordMasteryDetailModal } from '@/components/word-mastery';

<WordMasteryDetailModal isOpen={isOpen} onClose={handleClose} wordId="word-123" />;
```

### 8. 管理后台组件 (`admin/`)

#### AMASDecisionsTab - AMAS 决策记录标签页

```tsx
import { AMASDecisionsTab } from '@/components/admin';

<AMASDecisionsTab userId="user-123" onDecisionClick={handleDecisionClick} />;
```

#### LearningRecordsTab - 学习记录标签页

```tsx
import { LearningRecordsTab } from '@/components/admin';

<LearningRecordsTab userId="user-123" dateRange={{ start: '2024-01-01', end: '2024-01-31' }} />;
```

## Props 约定

### 命名规范

| 前缀   | 用途       | 示例                                |
| ------ | ---------- | ----------------------------------- |
| `on`   | 事件回调   | `onClick`, `onSelect`, `onChange`   |
| `is`   | 布尔状态   | `isOpen`, `isLoading`, `isDisabled` |
| `show` | 显示控制   | `showLabel`, `showIcon`             |
| `has`  | 存在性检查 | `hasError`, `hasData`               |

### 通用 Props

```typescript
// 尺寸
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// 变体
type Variant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success';

// 通用组件 Props
interface CommonProps {
  className?: string; // 自定义样式类
  style?: React.CSSProperties; // 内联样式
  testId?: string; // 测试 ID
}
```

### 受控 vs 非受控

```tsx
// 受控组件（推荐）
<Input
  value={value}
  onChange={setValue}
/>

// 非受控组件
<Input
  defaultValue="initial"
  ref={inputRef}
/>
```

## 组件开发规范

### 文件结构

```
ComponentName/
├── ComponentName.tsx       # 主组件
├── ComponentName.test.tsx  # 测试文件
├── types.ts               # 类型定义（可选）
├── hooks.ts               # 组件专用 Hook（可选）
└── index.ts               # 导出
```

### TypeScript 约定

```tsx
// 定义 Props 类型
interface ComponentNameProps {
  /** 必填属性 */
  requiredProp: string;
  /** 可选属性 */
  optionalProp?: number;
  /** 带默认值的属性 */
  withDefault?: boolean;
  /** 子元素 */
  children?: React.ReactNode;
  /** 事件回调 */
  onAction?: (value: string) => void;
}

// 组件定义
export function ComponentName({
  requiredProp,
  optionalProp,
  withDefault = true,
  children,
  onAction,
}: ComponentNameProps) {
  // ...
}
```

### 样式约定

```tsx
// 使用 Tailwind CSS
<div className="flex items-center gap-4 p-4 rounded-lg bg-white shadow-md">
  <span className="text-lg font-semibold text-gray-900">{title}</span>
</div>

// 条件样式
<button
  className={cn(
    'px-4 py-2 rounded-md transition-colors',
    variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600',
    variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600',
    disabled && 'opacity-50 cursor-not-allowed'
  )}
>
  {children}
</button>
```

### 动画约定（Framer Motion）

```tsx
import { motion, AnimatePresence } from 'framer-motion';

// 进入/退出动画
<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      {content}
    </motion.div>
  )}
</AnimatePresence>

// 列表动画
<motion.ul>
  {items.map((item, index) => (
    <motion.li
      key={item.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      {item.name}
    </motion.li>
  ))}
</motion.ul>
```

## 测试约定

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName requiredProp="test" />);
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('handles click event', () => {
    const handleClick = vi.fn();
    render(<ComponentName requiredProp="test" onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('displays loading state', () => {
    render(<ComponentName requiredProp="test" isLoading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

## 相关文档

- [架构文档](./ARCHITECTURE.md)
- [API 文档](./API.md)
- [状态管理文档](./STATE_MANAGEMENT.md)
- [开发指南](./DEVELOPMENT.md)
