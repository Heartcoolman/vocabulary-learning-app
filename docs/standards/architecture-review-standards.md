# 架构审查标准

> **版本**: v1.0.0 | **验证状态**: ✅

## 分层架构检查

### 🔴 阻断级

- [ ] **职责分离**: Routes → Services → Repositories → Database
- [ ] **依赖方向**: 单向依赖,不能循环依赖
- [ ] **接口契约**: 层间通过接口通信

### Monorepo结构

```
packages/
├── backend/          # Express + Prisma + TypeScript
├── frontend/         # Vite + React + TypeScript
├── shared/           # 共享类型和工具
└── native/           # Native模块(可选)
```

## 模块化检查

### 🟡 警告级

- [ ] **高内聚**: 模块内功能相关性强
- [ ] **低耦合**: 模块间依赖最小化
- [ ] **单一职责**: 每个模块一个明确职责

### 后端模块化

```typescript
src/
├── amas/             # AMAS智能学习算法
│   ├── interfaces/   # 接口层
│   ├── adapters/     # 适配器层
│   ├── algorithms/   # 算法实现
│   └── services/     # 业务服务
├── core/             # 核心基础设施
│   ├── event-bus.ts  # 事件总线
│   └── logger.ts     # 日志
├── services/         # 业务服务
├── routes/           # API路由
│   └── v1/           # 版本化API
└── repositories/     # 数据访问
```

## 设计模式检查

### 推荐模式

- ✅ **适配器模式**: AMAS算法接口统一
- ✅ **策略模式**: 多种学习策略可切换
- ✅ **观察者模式**: EventBus事件驱动
- ✅ **工厂模式**: 对象创建集中管理

## API设计

### 🔴 阻断级

- [ ] **RESTful规范**: HTTP方法语义正确
- [ ] **版本化**: API使用版本前缀(/api/v1/)
- [ ] **错误处理**: 统一的错误响应格式
- [ ] **状态码**: 正确使用HTTP状态码

### RESTful API规范

```
GET    /api/v1/words           # 获取列表
GET    /api/v1/words/:id       # 获取单个
POST   /api/v1/words           # 创建
PUT    /api/v1/words/:id       # 完整更新
PATCH  /api/v1/words/:id       # 部分更新
DELETE /api/v1/words/:id       # 删除
```

## 验证记录 ✅

- ✅ 第1-5轮验证通过
- ✅ 已在Danci项目中实践
- ✅ 团队理解并遵守标准

## 参考资源

- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design](https://martinfowler.com/tags/domain%20driven%20design.html)
