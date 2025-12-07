# Zustand Store 使用文档

本项目使用 Zustand 进行全局状态管理，已创建 2 个核心 Store。

## 📦 已创建的 Stores

### 1. UI Store (`uiStore.ts`)

管理应用的 UI 状态，包括模态框、侧边栏、加载状态等。

#### 功能特性

- ✅ 模态框状态管理（打开/关闭/切换）
- ✅ 侧边栏状态管理
- ✅ 全局加载状态管理
- ✅ Redux DevTools 集成（仅开发环境）

#### 使用示例

```typescript
import { useUIStore } from '@/stores';

function MyComponent() {
  // 获取状态和方法
  const {
    isModalOpen,
    openModal,
    closeModal,
    isSidebarOpen,
    toggleSidebar,
    isLoading,
    setLoading
  } = useUIStore();

  // 使用模态框
  const handleOpenModal = () => {
    openModal('my-modal-id');
  };

  const isMyModalOpen = useUIStore(state => state.isModalOpen('my-modal-id'));

  // 使用侧边栏
  const handleToggleSidebar = () => {
    toggleSidebar();
  };

  // 使用加载状态
  const handleLoad = async () => {
    setLoading(true, '正在加载...');
    try {
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  return <div>...</div>;
}
```

### 2. Toast Store (`toastStore.ts`)

管理全局 Toast 通知，已从 Context API 迁移到 Zustand。

#### 功能特性

- ✅ 多种 Toast 类型（success/error/warning/info）
- ✅ 自动定时移除
- ✅ 手动移除和清空
- ✅ 定时器管理和清理
- ✅ Redux DevTools 集成（仅开发环境）

#### 使用示例

```typescript
import { useToast } from '@/components/ui/Toast';
// 或者直接使用 store
import { useToastStore } from '@/stores';

function MyComponent() {
  const { success, error, warning, info } = useToast();

  const handleSuccess = () => {
    success('操作成功！');
  };

  const handleError = () => {
    error('操作失败，请重试', 5000); // 5秒后消失
  };

  const handleWarning = () => {
    warning('请注意检查输入');
  };

  const handleInfo = () => {
    info('这是一条提示信息');
  };

  return <div>...</div>;
}
```

## 🔧 配置说明

### Redux DevTools

两个 Store 都已集成 Redux DevTools，方便调试：

- 自动在开发环境启用（`import.meta.env.DEV`）
- 生产环境自动禁用
- 可以在浏览器中使用 Redux DevTools 扩展查看状态变化

### 使用 Redux DevTools

1. 安装浏览器扩展：[Redux DevTools](https://github.com/reduxjs/redux-devtools-extension)
2. 打开开发者工具
3. 切换到 Redux 面板
4. 选择对应的 Store（"UI Store" 或 "Toast Store"）
5. 查看状态变化和历史记录

## 📁 文件结构

```
src/stores/
├── __tests__/
│   ├── uiStore.test.ts      # UI Store 单元测试
│   └── toastStore.test.ts   # Toast Store 单元测试
├── index.ts                 # 统一导出
├── uiStore.ts               # UI 状态管理
├── toastStore.ts            # Toast 通知管理
└── README.md                # 本文档
```

## 🎯 迁移说明

### Toast 从 Context 迁移到 Store

- ✅ 保持了原有的 API 接口（`useToast` hook）
- ✅ 组件无需修改即可使用
- ✅ `ToastProvider` 现在从 Store 读取状态
- ✅ 定时器管理更加可靠
- ✅ 支持 Redux DevTools 调试

## 📊 统计信息

- **总代码行数**: 248 行（不含测试）
- **测试代码行数**: 195 行
- **Store 数量**: 2 个
- **测试覆盖**: 完整的单元测试

## 🚀 后续扩展

如需添加新的 Store，参考现有实现：

1. 创建新的 store 文件（如 `userStore.ts`）
2. 使用 `create()` 和 `devtools()` 中间件
3. 在 `index.ts` 中导出
4. 添加相应的单元测试

### 示例：创建新 Store

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface MyState {
  data: any;
  setData: (data: any) => void;
}

export const useMyStore = create<MyState>()(
  devtools(
    (set) => ({
      data: null,
      setData: (data) => set({ data }, false, 'setData'),
    }),
    {
      name: 'My Store',
      enabled: import.meta.env.DEV,
    },
  ),
);
```

## ⚠️ 注意事项

1. **仅在开发环境启用 DevTools**：避免生产环境性能损耗
2. **合理使用 selector**：避免不必要的重渲染
3. **定时器清理**：Toast Store 自动管理定时器，确保无内存泄漏
4. **类型安全**：所有 Store 都有完整的 TypeScript 类型定义

## 📚 参考资料

- [Zustand 官方文档](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Redux DevTools](https://github.com/reduxjs/redux-devtools-extension)
