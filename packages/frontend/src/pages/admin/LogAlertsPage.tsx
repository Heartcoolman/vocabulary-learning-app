import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Plus, Trash, Warning, CircleNotch, Pencil, X } from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import { adminClient } from '../../services/client';

/**
 * 日志级别枚举
 */
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * 日志告警规则
 */
interface LogAlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  levels: LogLevel[];
  module?: string;
  messagePattern?: string;
  threshold: number;
  windowMinutes: number;
  webhookUrl: string;
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 规则表单数据
 */
interface RuleFormData {
  name: string;
  description: string;
  enabled: boolean;
  levels: LogLevel[];
  module: string;
  messagePattern: string;
  threshold: number;
  windowMinutes: number;
  webhookUrl: string;
  cooldownMinutes: number;
}

/**
 * 日志告警规则管理页面
 */
export default function LogAlertsPage() {
  const toast = useToast();
  const [rules, setRules] = useState<LogAlertRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRule, setEditingRule] = useState<LogAlertRule | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const [formData, setFormData] = useState<RuleFormData>({
    name: '',
    description: '',
    enabled: true,
    levels: ['ERROR', 'FATAL'],
    module: '',
    messagePattern: '',
    threshold: 5,
    windowMinutes: 5,
    webhookUrl: '',
    cooldownMinutes: 30,
  });

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 加载告警规则列表
   */
  const loadRules = async () => {
    try {
      setIsLoading(true);
      const data = await adminClient.requestAdmin<LogAlertRule[]>('/api/admin/logs/log-alerts');
      setRules(Array.isArray(data) ? data : []);
    } catch (error) {
      adminLogger.error({ err: error }, '加载告警规则失败');
      toast.error('加载告警规则失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 创建新规则
   */
  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsSaving(true);
      const newRule = await adminClient.requestAdmin<LogAlertRule>('/api/admin/logs/log-alerts', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setRules((prev) => [...prev, newRule]);
      setShowCreateModal(false);
      resetForm();
      toast.success('告警规则创建成功');
    } catch (error) {
      adminLogger.error({ err: error, formData }, '创建告警规则失败');
      toast.error('创建失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 更新规则
   */
  const handleUpdate = async () => {
    if (!editingRule || !validateForm()) {
      return;
    }

    try {
      setIsSaving(true);
      const updatedRule = await adminClient.requestAdmin<LogAlertRule>(
        `/api/admin/logs/log-alerts/${editingRule.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(formData),
        },
      );
      setRules((prev) => prev.map((r) => (r.id === updatedRule.id ? updatedRule : r)));
      setShowEditModal(false);
      setEditingRule(null);
      resetForm();
      toast.success('告警规则更新成功');
    } catch (error) {
      adminLogger.error({ err: error, ruleId: editingRule.id, formData }, '更新告警规则失败');
      toast.error('更新失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 删除规则
   */
  const handleDelete = async () => {
    if (!deletingRuleId) {
      return;
    }

    try {
      setIsSaving(true);
      await adminClient.requestAdmin<void>(`/api/admin/logs/log-alerts/${deletingRuleId}`, {
        method: 'DELETE',
      });
      setRules((prev) => prev.filter((r) => r.id !== deletingRuleId));
      setShowDeleteConfirm(false);
      setDeletingRuleId(null);
      toast.success('告警规则已删除');
    } catch (error) {
      adminLogger.error({ err: error, ruleId: deletingRuleId }, '删除告警规则失败');
      toast.error('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 切换规则启用状态
   */
  const toggleRuleEnabled = async (rule: LogAlertRule) => {
    try {
      const updatedRule = await adminClient.requestAdmin<LogAlertRule>(
        `/api/admin/logs/log-alerts/${rule.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...rule,
            enabled: !rule.enabled,
          }),
        },
      );
      setRules((prev) => prev.map((r) => (r.id === updatedRule.id ? updatedRule : r)));
      toast.success(updatedRule.enabled ? '规则已启用' : '规则已禁用');
    } catch (error) {
      adminLogger.error({ err: error, ruleId: rule.id }, '切换规则状态失败');
      toast.error('操作失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  /**
   * 打开编辑对话框
   */
  const openEditModal = (rule: LogAlertRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || '',
      enabled: rule.enabled,
      levels: rule.levels,
      module: rule.module || '',
      messagePattern: rule.messagePattern || '',
      threshold: rule.threshold,
      windowMinutes: rule.windowMinutes,
      webhookUrl: rule.webhookUrl,
      cooldownMinutes: rule.cooldownMinutes,
    });
    setShowEditModal(true);
  };

  /**
   * 打开删除确认对话框
   */
  const openDeleteConfirm = (ruleId: string) => {
    setDeletingRuleId(ruleId);
    setShowDeleteConfirm(true);
  };

  /**
   * 验证表单
   */
  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error('请输入规则名称');
      return false;
    }

    if (formData.levels.length === 0) {
      toast.error('请至少选择一个日志级别');
      return false;
    }

    if (formData.threshold <= 0) {
      toast.error('阈值必须大于 0');
      return false;
    }

    if (formData.windowMinutes <= 0) {
      toast.error('时间窗口必须大于 0');
      return false;
    }

    if (!formData.webhookUrl.trim()) {
      toast.error('请输入 Webhook URL');
      return false;
    }

    try {
      new URL(formData.webhookUrl);
    } catch {
      toast.error('请输入有效的 Webhook URL');
      return false;
    }

    if (formData.cooldownMinutes < 0) {
      toast.error('冷却时间不能为负数');
      return false;
    }

    return true;
  };

  /**
   * 重置表单
   */
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      enabled: true,
      levels: ['ERROR', 'FATAL'],
      module: '',
      messagePattern: '',
      threshold: 5,
      windowMinutes: 5,
      webhookUrl: '',
      cooldownMinutes: 30,
    });
  };

  /**
   * 切换日志级别选择
   */
  const toggleLevel = (level: LogLevel) => {
    setFormData((prev) => ({
      ...prev,
      levels: prev.levels.includes(level)
        ? prev.levels.filter((l) => l !== level)
        : [...prev.levels, level],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center p-8">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
            加载告警规则中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-g3-fade-in p-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={32} className="text-blue-500" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">日志告警规则</h1>
              <p className="mt-1 text-gray-600 dark:text-gray-400">配置和管理日志监控告警规则</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-button bg-blue-500 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            <Plus size={20} />
            创建规则
          </button>
        </div>
      </div>

      {/* 规则列表 */}
      {rules.length === 0 ? (
        <div className="rounded-card border border-gray-200/60 bg-white/80 py-16 text-center backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <Bell size={64} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">暂无告警规则</h3>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            点击上方"创建规则"按钮添加第一个告警规则
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-card border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{rule.name}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRuleEnabled(rule)}
                        className={`rounded-full px-3 py-1 text-sm font-medium transition-all ${
                          rule.enabled
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                        }`}
                      >
                        {rule.enabled ? '已启用' : '已禁用'}
                      </button>
                    </div>
                  </div>

                  {rule.description && (
                    <p className="mb-4 text-gray-600 dark:text-gray-400">{rule.description}</p>
                  )}

                  <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {/* 触发级别 */}
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        触发级别
                      </span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {rule.levels.map((level) => (
                          <span
                            key={level}
                            className={`rounded px-2 py-1 text-xs font-medium ${getLevelColor(level)}`}
                          >
                            {level}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 模块匹配 */}
                    {rule.module && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          模块匹配
                        </span>
                        <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">
                          {rule.module}
                        </p>
                      </div>
                    )}

                    {/* 消息匹配 */}
                    {rule.messagePattern && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          消息匹配
                        </span>
                        <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">
                          {rule.messagePattern}
                        </p>
                      </div>
                    )}

                    {/* 阈值 */}
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        触发阈值
                      </span>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {rule.threshold} 次 / {rule.windowMinutes} 分钟
                      </p>
                    </div>

                    {/* 冷却时间 */}
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        冷却时间
                      </span>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {rule.cooldownMinutes} 分钟
                      </p>
                    </div>

                    {/* Webhook */}
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Webhook URL
                      </span>
                      <p
                        className="mt-1 truncate font-mono text-sm text-gray-600 dark:text-gray-400"
                        title={rule.webhookUrl}
                      >
                        {rule.webhookUrl}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>创建于: {new Date(rule.createdAt).toLocaleString('zh-CN')}</span>
                    <span>更新于: {new Date(rule.updatedAt).toLocaleString('zh-CN')}</span>
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(rule)}
                    className="rounded-button p-2 text-blue-600 transition-all hover:bg-blue-50"
                    title="编辑规则"
                  >
                    <Pencil size={20} />
                  </button>
                  <button
                    onClick={() => openDeleteConfirm(rule.id)}
                    className="rounded-button p-2 text-red-600 transition-all hover:bg-red-50"
                    title="删除规则"
                  >
                    <Trash size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建规则对话框 */}
      {showCreateModal && (
        <RuleFormModal
          title="创建告警规则"
          formData={formData}
          setFormData={setFormData}
          toggleLevel={toggleLevel}
          onSubmit={handleCreate}
          onCancel={() => {
            setShowCreateModal(false);
            resetForm();
          }}
          isSaving={isSaving}
        />
      )}

      {/* 编辑规则对话框 */}
      {showEditModal && (
        <RuleFormModal
          title="编辑告警规则"
          formData={formData}
          setFormData={setFormData}
          toggleLevel={toggleLevel}
          onSubmit={handleUpdate}
          onCancel={() => {
            setShowEditModal(false);
            setEditingRule(null);
            resetForm();
          }}
          isSaving={isSaving}
        />
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-6">
            <div className="w-full max-w-md animate-g3-slide-up rounded-3xl bg-white p-8 shadow-floating dark:bg-slate-800">
              <div className="mb-6 text-center">
                <Warning size={64} className="mx-auto mb-4 text-red-500" />
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">确认删除</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  确定要删除这个告警规则吗？此操作不可撤销。
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletingRuleId(null);
                  }}
                  disabled={isSaving}
                  className="flex-1 rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="flex-1 rounded-card bg-red-500 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:bg-red-600 disabled:opacity-50"
                >
                  {isSaving ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * 规则表单对话框组件
 */
interface RuleFormModalProps {
  title: string;
  formData: RuleFormData;
  setFormData: React.Dispatch<React.SetStateAction<RuleFormData>>;
  toggleLevel: (level: LogLevel) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

function RuleFormModal({
  title,
  formData,
  setFormData,
  toggleLevel,
  onSubmit,
  onCancel,
  isSaving,
}: RuleFormModalProps) {
  const allLevels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl animate-g3-slide-up flex-col rounded-3xl bg-white shadow-floating dark:bg-slate-800">
        {/* 固定头部 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-8 py-6 dark:border-slate-700">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onCancel}
            className="rounded-button p-2 transition-all hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <X size={24} />
          </button>
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-6">
            {/* 规则名称 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                规则名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                placeholder="例如：高频错误日志告警"
              />
            </div>

            {/* 规则描述 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                规则描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                placeholder="简要描述此规则的用途"
              />
            </div>

            {/* 触发级别 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                触发级别（多选） <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {allLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={`rounded-button px-4 py-2 text-sm font-medium transition-all ${
                      formData.levels.includes(level)
                        ? `${getLevelColor(level)} ring-2 ring-offset-2`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* 模块匹配 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                模块匹配（可选）
              </label>
              <input
                type="text"
                value={formData.module}
                onChange={(e) => setFormData({ ...formData, module: e.target.value })}
                className="w-full rounded-button border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                placeholder="例如：amas.*（留空表示匹配所有模块）"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">支持正则表达式</p>
            </div>

            {/* 消息正则匹配 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                消息正则匹配（可选）
              </label>
              <input
                type="text"
                value={formData.messagePattern}
                onChange={(e) => setFormData({ ...formData, messagePattern: e.target.value })}
                className="w-full rounded-button border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                placeholder="例如：database.*error（留空表示匹配所有消息）"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">支持正则表达式</p>
            </div>

            {/* 阈值和时间窗口 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  阈值（次数） <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.threshold}
                  onChange={(e) =>
                    setFormData({ ...formData, threshold: parseInt(e.target.value) || 1 })
                  }
                  className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  时间窗口（分钟） <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.windowMinutes}
                  onChange={(e) =>
                    setFormData({ ...formData, windowMinutes: parseInt(e.target.value) || 1 })
                  }
                  className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            {/* Webhook URL */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Webhook URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={formData.webhookUrl}
                onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                className="w-full rounded-button border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                placeholder="https://example.com/webhook"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                告警触发时将发送 POST 请求到此 URL
              </p>
            </div>

            {/* 冷却时间 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                冷却时间（分钟） <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={formData.cooldownMinutes}
                onChange={(e) =>
                  setFormData({ ...formData, cooldownMinutes: parseInt(e.target.value) || 0 })
                }
                className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                同一规则在冷却时间内不会重复发送告警
              </p>
            </div>

            {/* 启用状态 */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-2 focus:ring-blue-500"
              />
              <label
                htmlFor="enabled"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                创建后立即启用
              </label>
            </div>
          </div>
        </div>

        {/* 固定底部按钮 */}
        <div className="flex gap-4 border-t border-gray-200 px-8 py-6 dark:border-slate-700">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={isSaving}
            className="flex-1 rounded-card bg-blue-500 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:bg-blue-600 disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 获取日志级别对应的颜色类名
 */
function getLevelColor(level: LogLevel): string {
  const colors: Record<LogLevel, string> = {
    DEBUG: 'bg-gray-100 text-gray-700',
    INFO: 'bg-blue-100 text-blue-700',
    WARN: 'bg-yellow-100 text-yellow-700',
    ERROR: 'bg-red-100 text-red-700',
    FATAL: 'bg-purple-100 text-purple-700',
  };
  return colors[level];
}
