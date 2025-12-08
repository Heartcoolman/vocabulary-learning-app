import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Modal, ConfirmModal, AlertModal } from '@/components/ui/Modal';

/**
 * Modal - 模态框组件
 *
 * 用于展示重要信息或需要用户确认的操作。
 */
const meta = {
  title: 'Components/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '模态框用于在不离开当前页面的情况下展示重要内容或请求用户操作。',
      },
    },
  },
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: '是否显示模态框',
    },
    title: {
      control: 'text',
      description: '标题',
    },
    maxWidth: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: '最大宽度',
    },
    showCloseButton: {
      control: 'boolean',
      description: '是否显示关闭按钮',
    },
    closeOnOverlayClick: {
      control: 'boolean',
      description: '点击遮罩是否关闭',
    },
  },
  args: {
    isOpen: false,
    onClose: () => console.log('Modal closed'),
    children: <p>模态框内容</p>,
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础模态框
 *
 * 点击按钮打开模态框，展示基础用法。
 */
export const Default: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button className="btn-primary" onClick={() => setIsOpen(true)}>
          打开模态框
        </button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="基础模态框">
          <p className="text-gray-600">这是一个基础的模态框示例。你可以在这里放置任何内容。</p>
          <div className="mt-6 flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setIsOpen(false)}>
              取消
            </button>
            <button className="btn-primary" onClick={() => setIsOpen(false)}>
              确认
            </button>
          </div>
        </Modal>
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>模态框内容</p>,
    title: '基础模态框',
  },
};

/**
 * 不同尺寸
 *
 * 模态框支持多种尺寸：sm、md、lg、xl。
 */
export const Sizes: Story = {
  render: function Render(args) {
    const [size, setSize] = useState<'sm' | 'md' | 'lg' | 'xl' | null>(null);
    return (
      <>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setSize('sm')}>
            小号 (sm)
          </button>
          <button className="btn-secondary" onClick={() => setSize('md')}>
            中号 (md)
          </button>
          <button className="btn-secondary" onClick={() => setSize('lg')}>
            大号 (lg)
          </button>
          <button className="btn-secondary" onClick={() => setSize('xl')}>
            超大 (xl)
          </button>
        </div>
        <Modal
          isOpen={size !== null}
          onClose={() => setSize(null)}
          title={`${size?.toUpperCase()} 尺寸模态框`}
          maxWidth={size || 'md'}
        >
          <p className="text-gray-600">
            这是 {size?.toUpperCase()} 尺寸的模态框。不同场景可以选择合适的尺寸。
          </p>
        </Modal>
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>模态框内容</p>,
    maxWidth: 'md',
  },
};

/**
 * 确认模态框
 *
 * 用于危险操作或需要用户确认的场景。
 */
export const Confirm: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button className="btn-primary bg-red-500 hover:bg-red-600" onClick={() => setIsOpen(true)}>
          删除项目
        </button>
        <ConfirmModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onConfirm={() => {
            console.log('已确认删除');
            setIsOpen(false);
          }}
          title="确认删除"
          message="确定要删除这个项目吗？此操作无法撤销。"
          confirmText="删除"
          cancelText="取消"
          variant="danger"
        />
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>确认删除内容</p>,
    title: '确认删除',
  },
};

/**
 * 警告确认
 *
 * 警告级别的确认模态框。
 */
export const Warning: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button
          className="btn-primary bg-amber-500 hover:bg-amber-600"
          onClick={() => setIsOpen(true)}
        >
          重置设置
        </button>
        <ConfirmModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onConfirm={() => {
            console.log('已重置');
            setIsOpen(false);
          }}
          title="重置设置"
          message="确定要重置所有设置到默认值吗？"
          confirmText="重置"
          cancelText="取消"
          variant="warning"
        />
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>警告内容</p>,
    title: '重置设置',
  },
};

/**
 * 提示模态框
 *
 * 用于显示信息提示，只需一个按钮关闭。
 */
export const Alert: Story = {
  render: function Render(args) {
    const [alert, setAlert] = useState<{
      type: 'success' | 'error' | 'warning' | 'info';
      title: string;
      message: string;
    } | null>(null);

    return (
      <>
        <div className="flex gap-2">
          <button
            className="btn-primary bg-green-500 hover:bg-green-600"
            onClick={() =>
              setAlert({
                type: 'success',
                title: '操作成功',
                message: '你的更改已保存。',
              })
            }
          >
            成功提示
          </button>
          <button
            className="btn-primary bg-red-500 hover:bg-red-600"
            onClick={() =>
              setAlert({
                type: 'error',
                title: '操作失败',
                message: '保存时发生错误，请重试。',
              })
            }
          >
            错误提示
          </button>
          <button
            className="btn-primary bg-amber-500 hover:bg-amber-600"
            onClick={() =>
              setAlert({
                type: 'warning',
                title: '注意',
                message: '你的会员即将到期。',
              })
            }
          >
            警告提示
          </button>
          <button
            className="btn-primary bg-blue-500 hover:bg-blue-600"
            onClick={() =>
              setAlert({
                type: 'info',
                title: '提示',
                message: '新版本已发布，请更新。',
              })
            }
          >
            信息提示
          </button>
        </div>
        {alert && (
          <AlertModal
            isOpen={true}
            onClose={() => setAlert(null)}
            title={alert.title}
            message={alert.message}
            variant={alert.type}
          />
        )}
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>提示内容</p>,
    title: '提示',
  },
};

/**
 * 带表单的模态框
 *
 * 模态框内包含表单的常见用法。
 */
export const WithForm: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button className="btn-primary" onClick={() => setIsOpen(true)}>
          添加单词
        </button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="添加新单词" maxWidth="md">
          <form className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">单词拼写</label>
              <input className="input-enhanced w-full" placeholder="请输入单词" type="text" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">音标</label>
              <input className="input-enhanced w-full" placeholder="请输入音标" type="text" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">释义</label>
              <textarea
                className="input-enhanced min-h-[80px] w-full"
                placeholder="请输入释义"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setIsOpen(false)}>
                取消
              </button>
              <button type="submit" className="btn-primary">
                保存
              </button>
            </div>
          </form>
        </Modal>
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>表单内容</p>,
    title: '添加新单词',
    maxWidth: 'md',
  },
};

/**
 * 加载状态
 *
 * 确认操作时显示加载状态。
 */
export const Loading: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = () => {
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        setIsOpen(false);
      }, 2000);
    };

    return (
      <>
        <button className="btn-primary" onClick={() => setIsOpen(true)}>
          提交表单
        </button>
        <ConfirmModal
          isOpen={isOpen}
          onClose={() => !isLoading && setIsOpen(false)}
          onConfirm={handleConfirm}
          title="提交确认"
          message="确定要提交这些更改吗？"
          confirmText="提交"
          cancelText="取消"
          variant="info"
          isLoading={isLoading}
        />
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>加载内容</p>,
    title: '提交确认',
  },
};

/**
 * 无标题模态框
 *
 * 不显示标题栏的简洁模态框。
 */
export const NoTitle: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button className="btn-primary" onClick={() => setIsOpen(true)}>
          快速提示
        </button>
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          showCloseButton={false}
          maxWidth="sm"
        >
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">操作成功！</h3>
            <p className="mb-6 text-gray-600">你的单词已成功添加到词库中。</p>
            <button className="btn-primary w-full" onClick={() => setIsOpen(false)}>
              知道了
            </button>
          </div>
        </Modal>
      </>
    );
  },
  args: {
    isOpen: false,
    onClose: () => {},
    children: <p>无标题内容</p>,
    showCloseButton: false,
    maxWidth: 'sm',
  },
};
