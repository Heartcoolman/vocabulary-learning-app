import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

// 定义输入框属性接口用于 Storybook
interface InputProps {
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'password' | 'email' | 'number' | 'search';
  className?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// 基础输入框渲染组件
const InputTemplate = ({
  placeholder,
  disabled,
  type = 'text',
  className = 'input-enhanced w-80',
  defaultValue,
  onChange,
}: InputProps) => (
  <input
    className={className}
    placeholder={placeholder}
    type={type}
    disabled={disabled}
    defaultValue={defaultValue}
    onChange={onChange}
  />
);

/**
 * Input - 输入框组件展示
 *
 * 展示项目中使用的各种输入框样式，包括基础输入框、带图标输入框、错误状态等。
 */
const meta = {
  title: 'Components/Input',
  component: InputTemplate,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '输入框是用户数据输入的核心组件，提供多种状态和变体。',
      },
    },
  },
  argTypes: {
    placeholder: {
      control: 'text',
      description: '占位符文本',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'number', 'search'],
      description: '输入框类型',
    },
  },
} satisfies Meta<typeof InputTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础输入框
 *
 * 使用 input-enhanced 类的默认样式。
 */
export const Default: Story = {
  render: (args) => (
    <input
      className="input-enhanced w-80"
      placeholder={args.placeholder || '请输入内容...'}
      type={args.type || 'text'}
      disabled={args.disabled}
    />
  ),
  args: {
    placeholder: '请输入内容...',
    type: 'text',
    disabled: false,
  },
};

/**
 * 带标签的输入框
 *
 * 输入框配合标签使用的常见模式。
 */
export const WithLabel: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <label className="text-sm font-medium text-gray-700">用户名</label>
      <input className="input-enhanced w-full" placeholder="请输入用户名" type="text" />
    </div>
  ),
};

/**
 * 带图标的输入框
 *
 * 在输入框内显示图标，提升可识别性。
 */
export const WithIcon: Story = {
  render: () => (
    <div className="relative w-80">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <svg
          className="h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input className="input-enhanced w-full pl-10" placeholder="搜索单词..." type="search" />
    </div>
  ),
};

/**
 * 错误状态
 *
 * 输入验证失败时的错误状态展示。
 */
export const WithError: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <label className="text-sm font-medium text-gray-700">邮箱地址</label>
      <input
        className="input-enhanced w-full border-red-300 focus:border-red-400 focus:ring-red-100"
        placeholder="请输入邮箱"
        type="email"
        defaultValue="invalid-email"
      />
      <p className="text-sm text-red-500">请输入有效的邮箱地址</p>
    </div>
  ),
};

/**
 * 成功状态
 *
 * 输入验证通过时的成功状态展示。
 */
export const WithSuccess: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <label className="text-sm font-medium text-gray-700">邮箱地址</label>
      <input
        className="input-enhanced w-full border-green-300 focus:border-green-400 focus:ring-green-100"
        placeholder="请输入邮箱"
        type="email"
        defaultValue="user@example.com"
      />
      <p className="text-sm text-green-500">邮箱格式正确</p>
    </div>
  ),
};

/**
 * 禁用状态
 *
 * 禁用状态下的输入框展示。
 */
export const Disabled: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <label className="text-sm font-medium text-gray-400">用户名（不可编辑）</label>
      <input
        className="input-enhanced w-full"
        placeholder="请输入用户名"
        type="text"
        defaultValue="admin"
        disabled
      />
    </div>
  ),
};

/**
 * 密码输入框
 *
 * 带密码可见性切换的输入框。
 */
export const Password: Story = {
  render: function Render() {
    const [showPassword, setShowPassword] = useState(false);
    return (
      <div className="relative w-80">
        <input
          className="input-enhanced w-full pr-10"
          placeholder="请输入密码"
          type={showPassword ? 'text' : 'password'}
          defaultValue="password123"
        />
        <button
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          onClick={() => setShowPassword(!showPassword)}
          type="button"
        >
          {showPassword ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          )}
        </button>
      </div>
    );
  },
};

/**
 * 文本域
 *
 * 多行文本输入框。
 */
export const Textarea: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <label className="text-sm font-medium text-gray-700">备注</label>
      <textarea
        className="input-enhanced min-h-[120px] w-full resize-y"
        placeholder="请输入备注内容..."
        rows={4}
      />
    </div>
  ),
};

/**
 * 表单组合
 *
 * 完整的表单输入组合示例。
 */
export const FormGroup: Story = {
  render: () => (
    <div className="w-96 space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-soft">
      <h3 className="text-lg font-semibold text-gray-900">用户注册</h3>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">用户名 *</label>
        <input className="input-enhanced w-full" placeholder="请输入用户名" type="text" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">邮箱地址 *</label>
        <input className="input-enhanced w-full" placeholder="请输入邮箱" type="email" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">密码 *</label>
        <input className="input-enhanced w-full" placeholder="请输入密码" type="password" />
      </div>

      <div className="pt-2">
        <button className="btn-primary w-full">注册</button>
      </div>
    </div>
  ),
};
