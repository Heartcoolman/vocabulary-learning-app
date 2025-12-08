import type { Meta, StoryObj } from '@storybook/react-vite';
import { vi } from 'vitest';
import React, { useState } from 'react';
import { Modal, ConfirmModal, AlertModal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Warning, Check, Info, Trash } from '../Icon';

/**
 * # Modal 模态框组件
 *
 * 模态框用于在当前页面上方显示重要内容，需要用户关注或交互。
 *
 * ## 特性
 * - 支持自定义标题和内容
 * - 支持多种最大宽度：sm, md, lg, xl
 * - 支持点击遮罩层关闭
 * - 支持 ESC 键关闭
 * - 提供 ConfirmModal 和 AlertModal 预设组件
 *
 * ## 使用方式
 * ```tsx
 * import { Modal } from '@/components/ui/Modal';
 *
 * const [isOpen, setIsOpen] = useState(false);
 *
 * <Button onClick={() => setIsOpen(true)}>打开模态框</Button>
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="模态框标题"
 * >
 *   模态框内容
 * </Modal>
 * ```
 */
const meta: Meta<typeof Modal> = {
  title: 'UI/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '模态框组件，用于显示重要内容和用户交互。',
      },
    },
  },
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: '是否显示模态框',
      table: {
        type: { summary: 'boolean' },
      },
    },
    title: {
      control: 'text',
      description: '模态框标题',
    },
    showCloseButton: {
      control: 'boolean',
      description: '是否显示关闭按钮',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    closeOnOverlayClick: {
      control: 'boolean',
      description: '是否点击遮罩层关闭',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    maxWidth: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: '最大宽度',
      table: {
        type: { summary: "'sm' | 'md' | 'lg' | 'xl'" },
        defaultValue: { summary: 'md' },
      },
    },
    onClose: {
      action: 'closed',
      description: '关闭回调',
    },
  },
  args: {
    onClose: vi.fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/* ========================================
 * 默认状态
 * ======================================== */

/**
 * 默认模态框状态
 */
export const Default: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>打开模态框</Button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="默认模态框">
          <p className="text-gray-600">这是模态框的内容区域，你可以在这里放置任何内容。</p>
        </Modal>
      </>
    );
  },
};

/* ========================================
 * 宽度变体
 * ======================================== */

/**
 * 所有宽度变体
 */
export const AllWidths: Story = {
  render: function Render() {
    const [width, setWidth] = useState<'sm' | 'md' | 'lg' | 'xl' | null>(null);
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setWidth('sm')}>
            小 (sm)
          </Button>
          <Button variant="secondary" onClick={() => setWidth('md')}>
            中 (md)
          </Button>
          <Button variant="secondary" onClick={() => setWidth('lg')}>
            大 (lg)
          </Button>
          <Button variant="secondary" onClick={() => setWidth('xl')}>
            超大 (xl)
          </Button>
        </div>
        <Modal
          isOpen={width !== null}
          onClose={() => setWidth(null)}
          title={`宽度: ${width}`}
          maxWidth={width || 'md'}
        >
          <p className="text-gray-600">这是 {width} ���度的模态框。模态框内容会根据宽度自适应。</p>
          <p className="mt-4 text-sm text-gray-400">点击关闭按钮或按 ESC 键关闭模态框。</p>
        </Modal>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '模态框支持 4 种最大宽度：sm（小）、md（中）、lg（大）、xl（超大）。',
      },
    },
  },
};

/* ========================================
 * 配置选项
 * ======================================== */

/**
 * 无标题模态框
 */
export const NoTitle: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>打开无标题模态框</Button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check size={24} className="text-green-600" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-gray-900">操作成功</h3>
            <p className="text-gray-600">您的更改已成功保存。</p>
            <Button className="mt-6" onClick={() => setIsOpen(false)}>
              确定
            </Button>
          </div>
        </Modal>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '不设置 title 属性时，模态框不会显示标题栏。',
      },
    },
  },
};

/**
 * 无关闭按钮
 */
export const NoCloseButton: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>打开模态框</Button>
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="无关闭按钮"
          showCloseButton={false}
        >
          <p className="text-gray-600">这个模态框没有右上角的关闭按钮。</p>
          <p className="mt-2 text-sm text-gray-400">但你仍然可以点击遮罩层或按 ESC 键关闭。</p>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setIsOpen(false)}>关闭</Button>
          </div>
        </Modal>
      </>
    );
  },
};

/**
 * 禁止点击遮罩层关闭
 */
export const NoOverlayClose: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>打开模态框</Button>
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="必须通过按钮关闭"
          closeOnOverlayClick={false}
        >
          <p className="text-gray-600">点击遮罩层不会关闭这个模态框。</p>
          <p className="mt-2 text-sm text-gray-400">你必须点击关闭按钮或按 ESC 键才能关闭。</p>
        </Modal>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '设置 closeOnOverlayClick={false} 可以禁止点击遮罩层关闭模态框。',
      },
    },
  },
};

/* ========================================
 * ConfirmModal 确认模态框
 * ======================================== */

/**
 * 确认模态框 - Danger 变体
 */
export const ConfirmDanger: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setLoading(false);
      setIsOpen(false);
    };

    return (
      <>
        <Button variant="danger" leftIcon={<Trash size={16} />} onClick={() => setIsOpen(true)}>
          删除项目
        </Button>
        <ConfirmModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onConfirm={handleConfirm}
          title="确认删除"
          message="删除后将无法恢复，确定要删除这个项目吗？"
          confirmText="删除"
          cancelText="取消"
          variant="danger"
          isLoading={loading}
        />
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'ConfirmModal 是预设的确认对话框，danger 变体用于危险操作确认。',
      },
    },
  },
};

/**
 * 确认模态框 - Warning 变体
 */
export const ConfirmWarning: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button variant="warning" onClick={() => setIsOpen(true)}>
          重置设置
        </Button>
        <ConfirmModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onConfirm={() => {
            alert('设置已重置');
            setIsOpen(false);
          }}
          title="重置设置"
          message="这将把所有设置恢复为默认值，是否继续？"
          confirmText="重置"
          cancelText="取消"
          variant="warning"
        />
      </>
    );
  },
};

/**
 * 确认模态框 - Info 变体
 */
export const ConfirmInfo: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          发布文章
        </Button>
        <ConfirmModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onConfirm={() => {
            alert('文章已发布');
            setIsOpen(false);
          }}
          title="发布文章"
          message="文章发布后将对所有人可见，确定要发布吗？"
          confirmText="发布"
          cancelText="取消"
          variant="info"
        />
      </>
    );
  },
};

/**
 * 所有确认变体
 */
export const AllConfirmVariants: Story = {
  render: function Render() {
    const [variant, setVariant] = useState<'danger' | 'warning' | 'info' | null>(null);

    const titles = {
      danger: '删除确认',
      warning: '警告',
      info: '提示',
    };

    const messages = {
      danger: '此操作不可撤销，确定要继续吗？',
      warning: '这可能会影响其他功能，是否继续？',
      info: '确定要执行此操作吗？',
    };

    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => setVariant('danger')}>
            Danger
          </Button>
          <Button variant="warning" onClick={() => setVariant('warning')}>
            Warning
          </Button>
          <Button variant="primary" onClick={() => setVariant('info')}>
            Info
          </Button>
        </div>
        {variant && (
          <ConfirmModal
            isOpen={true}
            onClose={() => setVariant(null)}
            onConfirm={() => setVariant(null)}
            title={titles[variant]}
            message={messages[variant]}
            variant={variant}
          />
        )}
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'ConfirmModal 支持三种变体：danger（危险）、warning（警告）、info（信息）。',
      },
    },
  },
};

/* ========================================
 * AlertModal 提示模态框
 * ======================================== */

/**
 * 提示模态框 - Success
 */
export const AlertSuccess: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button variant="success" onClick={() => setIsOpen(true)}>
          显示成功提示
        </Button>
        <AlertModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="保存成功"
          message="您的更改已成功保存到服务器。"
          variant="success"
        />
      </>
    );
  },
};

/**
 * 提示模态框 - Error
 */
export const AlertError: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button variant="danger" onClick={() => setIsOpen(true)}>
          显示错误提示
        </Button>
        <AlertModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="操作失败"
          message="网络连接失败，请检查您的网络设置后重试。"
          variant="error"
        />
      </>
    );
  },
};

/**
 * 所有提示变体
 */
export const AllAlertVariants: Story = {
  render: function Render() {
    const [variant, setVariant] = useState<'success' | 'error' | 'warning' | 'info' | null>(null);

    const configs = {
      success: { title: '操作成功', message: '您的请求已成功处理。' },
      error: { title: '操作失败', message: '发生了一个错误，请稍后重试。' },
      warning: { title: '警告', message: '请注意，此操作可能有风险。' },
      info: { title: '提示', message: '这是一条普通的提示信息。' },
    };

    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button variant="success" onClick={() => setVariant('success')}>
            Success
          </Button>
          <Button variant="danger" onClick={() => setVariant('error')}>
            Error
          </Button>
          <Button variant="warning" onClick={() => setVariant('warning')}>
            Warning
          </Button>
          <Button variant="primary" onClick={() => setVariant('info')}>
            Info
          </Button>
        </div>
        {variant && (
          <AlertModal
            isOpen={true}
            onClose={() => setVariant(null)}
            title={configs[variant].title}
            message={configs[variant].message}
            variant={variant}
          />
        )}
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'AlertModal 支持四种变体：success（成功）、error（错误）、warning（警告）、info（信息）。',
      },
    },
  },
};

/* ========================================
 * 交互示例
 * ======================================== */

/**
 * 交互示例 - 表单模态框
 */
export const FormModal: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setLoading(false);
      alert(`创建用户：${name} (${email})`);
      setIsOpen(false);
      setName('');
      setEmail('');
    };

    return (
      <>
        <Button onClick={() => setIsOpen(true)}>创建用户</Button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="创建新用户" maxWidth="sm">
          <div className="flex flex-col gap-4">
            <Input
              label="姓名"
              placeholder="请输入姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              type="email"
              label="邮箱"
              placeholder="请输入邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                取消
              </Button>
              <Button loading={loading} disabled={!name || !email} onClick={handleSubmit}>
                创建
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '展示在模态框中使用表单的场景。',
      },
    },
  },
};

/**
 * 交互示例 - 多步骤模态框
 */
export const MultiStepModal: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({ name: '', email: '', plan: '' });

    const handleClose = () => {
      setIsOpen(false);
      setStep(1);
      setFormData({ name: '', email: '', plan: '' });
    };

    const stepTitles = ['基本信息', '选择套餐', '确认'];

    return (
      <>
        <Button onClick={() => setIsOpen(true)}>开始注册流程</Button>
        <Modal
          isOpen={isOpen}
          onClose={handleClose}
          title={`注册 - 第 ${step} 步：${stepTitles[step - 1]}`}
          closeOnOverlayClick={false}
        >
          {/* 步骤指示器 */}
          <div className="mb-6 flex items-center justify-center">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    s <= step ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div className={`h-1 w-12 ${s < step ? 'bg-blue-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* 步骤内容 */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <Input
                label="姓名"
                placeholder="请输入姓名"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <Input
                type="email"
                label="邮箱"
                placeholder="请输入邮箱"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              {['免费版', '专业版', '企业版'].map((plan) => (
                <button
                  key={plan}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    formData.plan === plan
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setFormData({ ...formData, plan })}
                >
                  <span className="font-medium">{plan}</span>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="mb-4 rounded-lg bg-gray-50 p-4 text-left">
                <p className="text-sm text-gray-500">姓名</p>
                <p className="font-medium">{formData.name}</p>
                <p className="mt-2 text-sm text-gray-500">邮箱</p>
                <p className="font-medium">{formData.email}</p>
                <p className="mt-2 text-sm text-gray-500">套餐</p>
                <p className="font-medium">{formData.plan}</p>
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="mt-6 flex justify-between gap-2">
            <Button variant="ghost" onClick={step === 1 ? handleClose : () => setStep(step - 1)}>
              {step === 1 ? '取消' : '上一步'}
            </Button>
            <Button
              onClick={() => {
                if (step === 3) {
                  alert('注册成功！');
                  handleClose();
                } else {
                  setStep(step + 1);
                }
              }}
              disabled={
                (step === 1 && (!formData.name || !formData.email)) ||
                (step === 2 && !formData.plan)
              }
            >
              {step === 3 ? '完成注册' : '下一步'}
            </Button>
          </div>
        </Modal>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '展示多步骤表单在模态框中的实现。',
      },
    },
  },
};

/**
 * 交互示例 - 嵌套模态框
 */
export const NestedModal: Story = {
  render: function Render() {
    const [isParentOpen, setIsParentOpen] = useState(false);
    const [isChildOpen, setIsChildOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setIsParentOpen(true)}>打开父模态框</Button>
        <Modal isOpen={isParentOpen} onClose={() => setIsParentOpen(false)} title="父模态框">
          <p className="mb-4 text-gray-600">这是父模态框的内容。你可以在这里打开一个子模态框。</p>
          <Button onClick={() => setIsChildOpen(true)}>打开子模态框</Button>
          <Modal
            isOpen={isChildOpen}
            onClose={() => setIsChildOpen(false)}
            title="子模态框"
            maxWidth="sm"
          >
            <p className="text-gray-600">这是子模态框。关闭它会回到父模态框。</p>
          </Modal>
        </Modal>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '模态框可以嵌套使用，但建议尽量避免过深的嵌套层级。',
      },
    },
  },
};
