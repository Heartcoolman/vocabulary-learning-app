import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastProvider, useToast } from '@/components/ui/Toast';

/**
 * Toast - 消息提示组件
 *
 * 用于显示操作反馈的轻量级消息提示。
 */
const meta: Meta = {
  title: 'Components/Toast',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Toast 组件用于显示操作反馈消息，支持成功、错误、警告、信息四种类型。',
      },
    },
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Toast 触发组件
function ToastTrigger({
  type,
  message,
}: {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}) {
  const toast = useToast();

  const handleClick = () => {
    toast[type](message);
  };

  const buttonStyles = {
    success: 'bg-green-500 hover:bg-green-600',
    error: 'bg-red-500 hover:bg-red-600',
    warning: 'bg-amber-500 hover:bg-amber-600',
    info: 'bg-blue-500 hover:bg-blue-600',
  };

  const labels = {
    success: '成功提示',
    error: '错误提示',
    warning: '警告提示',
    info: '信息提示',
  };

  return (
    <button className={`btn-primary ${buttonStyles[type]}`} onClick={handleClick}>
      {labels[type]}
    </button>
  );
}

/**
 * 成功提示
 *
 * 操作成功后的反馈消息。
 */
export const Success: Story = {
  render: () => <ToastTrigger type="success" message="操作成功！数据已保存。" />,
};

/**
 * 错误提示
 *
 * 操作失败时的错误消息。
 */
export const Error: Story = {
  render: () => <ToastTrigger type="error" message="操作失败，请重试。" />,
};

/**
 * 警告提示
 *
 * 需要用户注意的警告消息。
 */
export const Warning: Story = {
  render: () => <ToastTrigger type="warning" message="请注意：你的会员即将到期。" />,
};

/**
 * 信息提示
 *
 * 一般性的信息提示消息。
 */
export const Info: Story = {
  render: () => <ToastTrigger type="info" message="提示：新功能已上线！" />,
};

/**
 * 所有类型
 *
 * 展示所有类型的 Toast 消息。
 */
export const AllTypes: Story = {
  render: () => (
    <div className="flex gap-3">
      <ToastTrigger type="success" message="操作成功！" />
      <ToastTrigger type="error" message="操作失败！" />
      <ToastTrigger type="warning" message="请注意！" />
      <ToastTrigger type="info" message="提示信息" />
    </div>
  ),
};

/**
 * 长文本消息
 *
 * 展示较长文本内容的 Toast。
 */
export const LongMessage: Story = {
  render: () => (
    <ToastTrigger
      type="info"
      message="这是一条较长的提示消息，用于展示 Toast 组件对长文本的处理能力。消息会自动换行显示完整内容。"
    />
  ),
};

/**
 * 多条消息
 *
 * 演示多个 Toast 同时显示的堆叠效果。
 */
export const MultipleToasts: Story = {
  render: function Render() {
    const toast = useToast();

    const showMultiple = () => {
      toast.success('第一条消息');
      setTimeout(() => toast.info('第二条消息'), 300);
      setTimeout(() => toast.warning('第三条消息'), 600);
      setTimeout(() => toast.error('第四条消息'), 900);
    };

    return (
      <button className="btn-primary" onClick={showMultiple}>
        显示多条消息
      </button>
    );
  },
};

/**
 * 静态预览
 *
 * 静态展示各种 Toast 样式（不可交互）。
 */
export const StaticPreview: Story = {
  render: () => (
    <div className="space-y-3">
      {/* Success */}
      <div className="flex min-w-[280px] items-start gap-3 rounded-button border border-green-200 bg-green-50 px-4 py-3 text-green-800 shadow-elevated">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
          fill="currentColor"
          viewBox="0 0 256 256"
        >
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z" />
        </svg>
        <p className="flex-1 text-sm font-medium">操作成功！数据已保存。</p>
        <button className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 256 256">
            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
          </svg>
        </button>
      </div>

      {/* Error */}
      <div className="flex min-w-[280px] items-start gap-3 rounded-button border border-red-200 bg-red-50 px-4 py-3 text-red-800 shadow-elevated">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
          fill="currentColor"
          viewBox="0 0 256 256"
        >
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
        </svg>
        <p className="flex-1 text-sm font-medium">操作失败，请重试。</p>
        <button className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 256 256">
            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
          </svg>
        </button>
      </div>

      {/* Warning */}
      <div className="flex min-w-[280px] items-start gap-3 rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 shadow-elevated">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500"
          fill="currentColor"
          viewBox="0 0 256 256"
        >
          <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z" />
        </svg>
        <p className="flex-1 text-sm font-medium">请注意：你的会员即将到期。</p>
        <button className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 256 256">
            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="flex min-w-[280px] items-start gap-3 rounded-button border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 shadow-elevated">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500"
          fill="currentColor"
          viewBox="0 0 256 256"
        >
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" />
        </svg>
        <p className="flex-1 text-sm font-medium">提示：新功能已上线！</p>
        <button className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 256 256">
            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
          </svg>
        </button>
      </div>
    </div>
  ),
};
