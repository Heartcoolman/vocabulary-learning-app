import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useToastStore } from '../toastStore';

describe('ToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 重置store状态
    const store = useToastStore.getState();
    store.clearAllToasts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useToastStore.getState().clearAllToasts();
  });

  describe('Toast创建', () => {
    it('应该能显示toast', () => {
      const { showToast } = useToastStore.getState();
      showToast('success', '操作成功');
      const state = useToastStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].type).toBe('success');
      expect(state.toasts[0].message).toBe('操作成功');
    });

    it('应该能使用便捷方法显示不同类型的toast', () => {
      const { success, error, warning, info } = useToastStore.getState();

      success('成功消息');
      expect(useToastStore.getState().toasts[0].type).toBe('success');

      error('错误消息');
      expect(useToastStore.getState().toasts[1].type).toBe('error');

      warning('警告消息');
      expect(useToastStore.getState().toasts[2].type).toBe('warning');

      info('信息消息');
      expect(useToastStore.getState().toasts[3].type).toBe('info');

      expect(useToastStore.getState().toasts).toHaveLength(4);
    });

    it('每个toast应该有唯一的ID', () => {
      const { success } = useToastStore.getState();
      success('消息1');
      success('消息2');
      const state = useToastStore.getState();
      expect(state.toasts[0].id).not.toBe(state.toasts[1].id);
    });
  });

  describe('Toast移除', () => {
    it('应该能手动移除toast', () => {
      const { success, removeToast } = useToastStore.getState();
      success('测试消息');
      const id = useToastStore.getState().toasts[0].id;
      removeToast(id);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('应该能清除所有toast', () => {
      const { success, clearAllToasts } = useToastStore.getState();
      success('消息1');
      success('消息2');
      success('消息3');
      expect(useToastStore.getState().toasts).toHaveLength(3);
      clearAllToasts();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('应该在指定时间后自动移除toast', () => {
      const { success } = useToastStore.getState();
      success('测试消息', 3000);
      expect(useToastStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(3000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('移除toast时应该清除对应的定时器', () => {
      const { success, removeToast } = useToastStore.getState();
      success('测试消息', 5000);
      const id = useToastStore.getState().toasts[0].id;

      removeToast(id);
      expect(useToastStore.getState().toasts).toHaveLength(0);

      // 即使时间到了也不应该有任何变化（因为定时器已被清除）
      vi.advanceTimersByTime(5000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('定时器管理', () => {
    it('清除所有toast时应该清除所有定时器', () => {
      const { success, clearAllToasts } = useToastStore.getState();
      success('消息1', 3000);
      success('消息2', 4000);
      success('消息3', 5000);

      clearAllToasts();
      expect(useToastStore.getState().timers.size).toBe(0);

      // 即使时间到了也不应该有任何toast（因为定时器已被清除）
      vi.advanceTimersByTime(10000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('duration为0时不应该自动移除toast', () => {
      const { showToast } = useToastStore.getState();
      showToast('info', '持久消息', 0);

      vi.advanceTimersByTime(10000);
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });
});
