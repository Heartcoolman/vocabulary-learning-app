import type { Meta, StoryObj } from '@storybook/react-vite';
import { vi } from 'vitest';
import React, { useState } from 'react';
import { Input } from './Input';
import { User, Lock, MagnifyingGlass, Eye, Check, X, Envelope } from '../Icon';

/**
 * # Input 输入框组件
 *
 * 输入框用于接收用户的文本输入，支持多种类型和状态。
 *
 * ## 特性
 * - 支持多种类型：text, password, search, email, number, tel, url
 * - 支持前后缀图标/内容
 * - 支持错误状态和帮助文本
 * - 支持标签和必填标记
 * - 密码类型自动添加显示/隐藏切换
 * - 搜索类型自动添加搜索图标
 *
 * ## 使用方式
 * ```tsx
 * import { Input } from '@/components/ui/Input';
 *
 * <Input
 *   label="用户名"
 *   placeholder="请输入用户名"
 *   onChange={(e) => setValue(e.target.value)}
 * />
 * ```
 */
const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '通用输入框组件，支持多种类型、尺寸和状态。',
      },
    },
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'search', 'email', 'number', 'tel', 'url'],
      description: '输入框类型',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'text' },
      },
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: '输入框尺寸',
      table: {
        type: { summary: 'Size' },
        defaultValue: { summary: 'md' },
      },
    },
    label: {
      control: 'text',
      description: '标签文本',
    },
    placeholder: {
      control: 'text',
      description: '占位符文本',
    },
    error: {
      control: 'boolean',
      description: '是否有错误',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    errorMessage: {
      control: 'text',
      description: '错误消息',
    },
    helperText: {
      control: 'text',
      description: '帮助文本',
    },
    required: {
      control: 'boolean',
      description: '是否必填',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    fullWidth: {
      control: 'boolean',
      description: '是否占满容器宽度',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    onChange: {
      action: 'changed',
      description: '值变化回调',
    },
  },
  args: {
    onChange: vi.fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/* ========================================
 * 默认状态
 * ======================================== */

/**
 * 默认输入框状态
 */
export const Default: Story = {
  args: {
    placeholder: '请输入内容',
  },
};

/* ========================================
 * 类型展示
 * ======================================== */

/**
 * 展示所有输入框类型
 */
export const AllTypes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Input type="text" label="文本" placeholder="请输入文本" />
      <Input type="password" label="密码" placeholder="请输入密码" />
      <Input type="search" label="搜索" placeholder="搜索内容..." />
      <Input type="email" label="邮箱" placeholder="example@email.com" />
      <Input type="number" label="数字" placeholder="0" />
      <Input type="tel" label="电话" placeholder="13800138000" />
      <Input type="url" label="网址" placeholder="https://example.com" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '输入框支持多种类型：text、password、search、email、number、tel、url。密码类型自动添加显示/隐藏切换，搜索类型自动添加搜索图标。',
      },
    },
  },
};

/**
 * 密码输入框
 */
export const Password: Story = {
  args: {
    type: 'password',
    label: '密码',
    placeholder: '请输入密码',
  },
  parameters: {
    docs: {
      description: {
        story: '密码输入框自动添加显示/隐藏切换按钮。',
      },
    },
  },
};

/**
 * 搜索输入框
 */
export const Search: Story = {
  args: {
    type: 'search',
    placeholder: '搜索...',
  },
  parameters: {
    docs: {
      description: {
        story: '搜索输入框自动添加搜索图标。',
      },
    },
  },
};

/* ========================================
 * 尺寸展示
 * ======================================== */

/**
 * 展示所有尺寸
 */
export const AllSizes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Input size="xs" placeholder="超小尺寸 (xs)" />
      <Input size="sm" placeholder="小尺寸 (sm)" />
      <Input size="md" placeholder="中等尺寸 (md)" />
      <Input size="lg" placeholder="大尺寸 (lg)" />
      <Input size="xl" placeholder="超大尺寸 (xl)" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '输入框支持 5 种尺寸：xs、sm、md、lg、xl。',
      },
    },
  },
};

/* ========================================
 * 带标签和帮助文本
 * ======================================== */

/**
 * 带标签
 */
export const WithLabel: Story = {
  args: {
    label: '用户名',
    placeholder: '请输入用户名',
  },
};

/**
 * 带必填标记
 */
export const Required: Story = {
  args: {
    label: '邮箱',
    placeholder: '请输入邮箱',
    required: true,
  },
};

/**
 * 带帮助文本
 */
export const WithHelperText: Story = {
  args: {
    label: '密码',
    type: 'password',
    placeholder: '请输入密码',
    helperText: '密码长度至少 8 个字符',
  },
};

/* ========================================
 * 前后缀图标
 * ======================================== */

/**
 * 带前缀图标
 */
export const WithPrefix: Story = {
  args: {
    prefix: <User size={16} />,
    placeholder: '请输入用户名',
  },
  parameters: {
    docs: {
      description: {
        story: '可以在输入框前添加图标或其他内容。',
      },
    },
  },
};

/**
 * 带后缀图标
 */
export const WithSuffix: Story = {
  args: {
    suffix: <Check size={16} className="text-green-500" />,
    placeholder: '请输入内容',
  },
  parameters: {
    docs: {
      description: {
        story: '可以在输入框后添加图标或其他内容。',
      },
    },
  },
};

/**
 * 前后缀组合
 */
export const WithPrefixAndSuffix: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Input label="用户名" prefix={<User size={16} />} placeholder="请输入用户名" />
      <Input
        label="邮箱"
        prefix={<Envelope size={16} />}
        suffix={<Check size={16} className="text-green-500" />}
        placeholder="请输入邮箱"
      />
      <Input
        label="网址"
        prefix={<span className="text-sm text-gray-400">https://</span>}
        suffix={<span className="text-sm text-gray-400">.com</span>}
        placeholder="example"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '前后缀可以是图标，也可以是文本等其他内容。',
      },
    },
  },
};

/* ========================================
 * 状态展示
 * ======================================== */

/**
 * 禁用状态
 */
export const Disabled: Story = {
  args: {
    label: '禁用输入框',
    placeholder: '无法输入',
    disabled: true,
    value: '禁用的内容',
  },
};

/**
 * 错误状态
 */
export const Error: Story = {
  args: {
    label: '邮箱',
    placeholder: '请输入邮箱',
    error: true,
    errorMessage: '请输入有效的邮箱地址',
    value: 'invalid-email',
  },
  parameters: {
    docs: {
      description: {
        story: '输入框可以显示错误状态和错误消息。',
      },
    },
  },
};

/**
 * 所有状态对比
 */
export const AllStates: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <div>
        <p className="mb-2 text-sm text-gray-500">正常状态</p>
        <Input placeholder="正常输入框" />
      </div>
      <div>
        <p className="mb-2 text-sm text-gray-500">聚焦状态（点击输入框查看）</p>
        <Input placeholder="点击聚焦" />
      </div>
      <div>
        <p className="mb-2 text-sm text-gray-500">禁用状态</p>
        <Input placeholder="禁用输入框" disabled />
      </div>
      <div>
        <p className="mb-2 text-sm text-gray-500">错误状态</p>
        <Input placeholder="错误输入框" error errorMessage="这是一条错误消息" />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '对比展示输入框的不同状态：正常、聚焦、禁用、错误。',
      },
    },
  },
};

/* ========================================
 * 全宽模式
 * ======================================== */

/**
 * 全宽输入框
 */
export const FullWidth: Story = {
  args: {
    label: '全宽输入框',
    placeholder: '占满容器宽度',
    fullWidth: true,
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};

/* ========================================
 * 交互示例
 * ======================================== */

/**
 * 交互示例 - 受控输入
 */
export const ControlledInput: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="flex w-80 flex-col gap-4">
        <Input
          label="受控输入框"
          placeholder="输入内容..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-sm text-gray-600">
          当前值：<span className="rounded bg-gray-100 px-2 py-1 font-mono">{value || '(空)'}</span>
        </p>
        <p className="text-sm text-gray-500">字符数：{value.length}</p>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '展示受控输入框的使用方��，实时显示输入内容。',
      },
    },
  },
};

/**
 * 交互示例 - 表单验证
 */
export const FormValidation: Story = {
  render: function Render() {
    const [email, setEmail] = useState('');
    const [touched, setTouched] = useState(false);

    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const showError = touched && !!email && !isValid;
    const showSuccess = touched && !!email && isValid;

    return (
      <div className="flex w-80 flex-col gap-4">
        <Input
          type="email"
          label="邮箱地址"
          placeholder="example@email.com"
          prefix={<Envelope size={16} />}
          suffix={
            showSuccess ? (
              <Check size={16} className="text-green-500" />
            ) : showError ? (
              <X size={16} className="text-red-500" />
            ) : null
          }
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          error={showError}
          errorMessage={showError ? '请输入有效的邮箱地址' : undefined}
          helperText={!showError && !showSuccess ? '我们不会分享您的邮箱' : undefined}
          required
        />
        {showSuccess && <p className="text-sm text-green-600">✓ 邮箱格式正确</p>}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '展示带有实时验证的表单输入框，包括错误状态和成功状态的视觉反馈。',
      },
    },
  },
};

/**
 * 交互示例 - 搜索功能
 */
export const SearchExample: Story = {
  render: function Render() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<string[]>([]);

    const allItems = ['苹果', '香蕉', '橙子', '葡萄', '西瓜', '芒果', '草莓', '蓝莓'];

    const handleSearch = (value: string) => {
      setQuery(value);
      if (value.trim()) {
        setResults(allItems.filter((item) => item.includes(value)));
      } else {
        setResults([]);
      }
    };

    return (
      <div className="flex w-80 flex-col gap-4">
        <Input
          type="search"
          placeholder="搜索水果..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {results.length > 0 && (
          <div className="divide-y rounded-button border">
            {results.map((item) => (
              <div
                key={item}
                className="cursor-pointer px-3 py-2 hover:bg-gray-50"
                onClick={() => {
                  setQuery(item);
                  setResults([]);
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
        {query && results.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-500">没有找到匹配的结果</p>
        )}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '展示搜索输入框的实际应用场景，包括实时搜索和结果展示。',
      },
    },
  },
};

/**
 * 登录表单示例
 */
export const LoginForm: Story = {
  render: function Render() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setLoading(false);
      alert(`登录成功！用户名：${username}`);
    };

    return (
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4">
        <h3 className="text-center text-lg font-semibold">用户登录</h3>
        <Input
          label="用户名"
          prefix={<User size={16} />}
          placeholder="请输入用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Input
          type="password"
          label="密码"
          prefix={<Lock size={16} />}
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading || !username || !password}
          className="mt-2 rounded-button bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '一个完整的登录表单示例，展示输入框在实际场景中的应用。',
      },
    },
  },
};
