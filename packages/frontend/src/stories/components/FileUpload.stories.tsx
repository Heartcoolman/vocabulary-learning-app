import type { Meta, StoryObj } from '@storybook/react-vite';
import FileUpload from '@/components/FileUpload';

/**
 * FileUpload - 文件上传组件
 *
 * 支持拖拽上传和点击上传，带有文件类型和大小验证。
 */
const meta = {
  title: 'Components/FileUpload',
  component: FileUpload,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'FileUpload 组件提供拖拽和点击两种上传方式，支持文件类型和大小限制。',
      },
    },
  },
  argTypes: {
    accept: {
      control: 'text',
      description: '接受的文件类型',
    },
    maxSizeMB: {
      control: { type: 'number', min: 1, max: 100 },
      description: '最大文件大小（MB）',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    onFileSelect: {
      action: 'fileSelected',
      description: '文件选择回调',
    },
  },
  args: {
    accept: '.csv,.json',
    maxSizeMB: 5,
    disabled: false,
    onFileSelect: (file) => console.log('File selected:', file),
  },
} satisfies Meta<typeof FileUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认状态
 *
 * 基础的文件上传组件，支持 CSV 和 JSON 文件。
 */
export const Default: Story = {
  args: {
    accept: '.csv,.json',
    maxSizeMB: 5,
  },
};

/**
 * 仅支持 CSV
 *
 * 限制只能上传 CSV 文件。
 */
export const CSVOnly: Story = {
  args: {
    accept: '.csv',
    maxSizeMB: 10,
  },
};

/**
 * 仅支持 JSON
 *
 * 限制只能上传 JSON 文件。
 */
export const JSONOnly: Story = {
  args: {
    accept: '.json',
    maxSizeMB: 2,
  },
};

/**
 * 支持图片
 *
 * 配置为支持常见图片格式。
 */
export const Images: Story = {
  args: {
    accept: '.jpg,.jpeg,.png,.gif,.webp',
    maxSizeMB: 10,
  },
};

/**
 * 大文件限制
 *
 * 允许上传较大的文件。
 */
export const LargeFileLimit: Story = {
  args: {
    accept: '.csv,.json,.xlsx',
    maxSizeMB: 50,
  },
};

/**
 * 小文件限制
 *
 * 仅允许上传很小的文件。
 */
export const SmallFileLimit: Story = {
  args: {
    accept: '.csv,.json',
    maxSizeMB: 1,
  },
};

/**
 * 禁用状态
 *
 * 禁用状态下的上传组件。
 */
export const Disabled: Story = {
  args: {
    accept: '.csv,.json',
    maxSizeMB: 5,
    disabled: true,
  },
};

/**
 * 带说明的上传
 *
 * 在上传区域外添加使用说明。
 */
export const WithInstructions: Story = {
  render: (args) => (
    <div className="w-[500px] space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h4 className="mb-2 font-medium text-blue-900">上传说明</h4>
        <ul className="list-inside list-disc space-y-1 text-sm text-blue-700">
          <li>支持 CSV 和 JSON 格式的词库文件</li>
          <li>CSV 文件需包含 spelling, phonetic, meanings 列</li>
          <li>单个文件大小不超过 5MB</li>
        </ul>
      </div>
      <FileUpload {...args} />
    </div>
  ),
  args: {
    accept: '.csv,.json',
    maxSizeMB: 5,
  },
};

/**
 * 多种文件类型
 *
 * 支持多种文件类型的上传。
 */
export const MultipleTypes: Story = {
  args: {
    accept: '.csv,.json,.xlsx,.txt',
    maxSizeMB: 20,
  },
};

/**
 * 在表单中使用
 *
 * 文件上传组件在表单上下文中的使用示例。
 */
export const InForm: Story = {
  render: (args) => (
    <div className="w-[500px] space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">导入词库</h3>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">词库名称</label>
        <input className="input-enhanced w-full" placeholder="请输入词库名称" type="text" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">词库文件</label>
        <FileUpload {...args} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">备注</label>
        <textarea
          className="input-enhanced min-h-[80px] w-full"
          placeholder="可选：添加备注信息"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button className="btn-secondary">取消</button>
        <button className="btn-primary">导入</button>
      </div>
    </div>
  ),
  args: {
    accept: '.csv,.json',
    maxSizeMB: 5,
  },
};
