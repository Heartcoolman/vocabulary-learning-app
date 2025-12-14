# 测试审查标准

> **版本**: v1.0.0 | **验证状态**: ✅

## 覆盖率要求

### 🔴 阻断级

- [ ] **最低覆盖率**: 80% (lines, statements, functions, branches)
- [ ] **核心功能**: 关键业务逻辑100%覆盖
- [ ] **测试通过**: 所有测试必须通过

### Vitest配置

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
```

## 测试质量检查

### 🟡 警告级

- [ ] **测试独立性**: 测试间互不依赖
- [ ] **测试可读性**: 清晰的test描述
- [ ] **边界测试**: 覆盖边界和异常情况
- [ ] **Mock合理**: 适当使用Mock,不过度Mock

### 测试分层

```typescript
// 单元测试: 纯函数,工具类
describe('calculateMasteryLevel', () => {
  it('should return correct level for high retention', () => {
    expect(calculateMasteryLevel(0.95)).toBe(5);
  });
});

// 集成测试: API端点
describe('POST /api/v1/words', () => {
  it('should create word and return 201', async () => {
    const response = await request(app)
      .post('/api/v1/words')
      .send({ spelling: 'hello', ... });
    expect(response.status).toBe(201);
  });
});

// E2E测试: 用户流程
test('user can complete a learning session', async ({ page }) => {
  await page.goto('/learn');
  await page.click('[data-testid="start-session"]');
  // ...完整用户流程
});
```

## Mock使用规范

### 🟡 警告级

- [ ] **外部依赖Mock**: API调用,数据库,第三方服务
- [ ] **时间Mock**: 使用vi.useFakeTimers()
- [ ] **随机Mock**: 固定随机种子保证可重现

### Mock示例

```typescript
import { vi } from 'vitest';

// Mock API调用
vi.mock('./api', () => ({
  fetchWords: vi.fn().mockResolvedValue([...mockWords]),
}));

// Mock日期
vi.useFakeTimers();
vi.setSystemTime(new Date('2025-01-01'));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;
```

## E2E测试要求

### 🟡 警告级

- [ ] **关键路径**: 核心用户流程有E2E测试
- [ ] **跨浏览器**: 至少测试Chrome
- [ ] **CI集成**: E2E测试在CI中运行

### Playwright配置

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

## 性能测试标准

### 🟡 警告级

- [ ] **API性能**: 关键API < 200ms
- [ ] **并发测试**: 模拟多用户场景
- [ ] **负载测试**: 压力测试找瓶颈

### 性能测试示例

```typescript
import { describe, it, expect } from 'vitest';
import autocannon from 'autocannon';

describe('API Performance', () => {
  it('GET /api/v1/words should respond < 200ms', async () => {
    const result = await autocannon({
      url: 'http://localhost:3000/api/v1/words',
      connections: 10,
      duration: 10,
    });

    expect(result.latency.p99).toBeLessThan(200);
  });
});
```

## 测试命令

```bash
# 单元测试
pnpm test

# 覆盖率报告
pnpm test:coverage

# E2E测试
pnpm test:e2e

# 性能测试
pnpm test:performance

# 监视模式
pnpm test:watch
```

## 验证记录 ✅

- ✅ 覆盖率达标(Backend: 82%, Frontend: 85%)
- ✅ CI集成完成
- ✅ E2E测试覆盖核心流程

## 参考资源

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Playwright](https://playwright.dev/)
