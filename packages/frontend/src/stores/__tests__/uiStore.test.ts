import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';

describe('UIStore', () => {
  beforeEach(() => {
    // 重置store状态
    const store = useUIStore.getState();
    store.modals = {};
    store.isSidebarOpen = true;
    store.isLoading = false;
    store.loadingMessage = undefined;
  });

  describe('模态框管理', () => {
    it('应该能打开模态框', () => {
      const { openModal, isModalOpen } = useUIStore.getState();
      openModal('test-modal');
      expect(isModalOpen('test-modal')).toBe(true);
    });

    it('应该能关闭模态框', () => {
      const { openModal, closeModal, isModalOpen } = useUIStore.getState();
      openModal('test-modal');
      closeModal('test-modal');
      expect(isModalOpen('test-modal')).toBe(false);
    });

    it('应该能切换模态框状态', () => {
      const { toggleModal, isModalOpen } = useUIStore.getState();
      toggleModal('test-modal');
      expect(isModalOpen('test-modal')).toBe(true);
      toggleModal('test-modal');
      expect(isModalOpen('test-modal')).toBe(false);
    });

    it('默认模态框应该是关闭的', () => {
      const { isModalOpen } = useUIStore.getState();
      expect(isModalOpen('non-existent')).toBe(false);
    });
  });

  describe('侧边栏管理', () => {
    it('应该能切换侧边栏状态', () => {
      const { toggleSidebar } = useUIStore.getState();
      const initialState = useUIStore.getState().isSidebarOpen;
      toggleSidebar();
      expect(useUIStore.getState().isSidebarOpen).toBe(!initialState);
    });

    it('应该能设置侧边栏状态', () => {
      const { setSidebarOpen } = useUIStore.getState();
      setSidebarOpen(false);
      expect(useUIStore.getState().isSidebarOpen).toBe(false);
      setSidebarOpen(true);
      expect(useUIStore.getState().isSidebarOpen).toBe(true);
    });
  });

  describe('加载状态管理', () => {
    it('应该能设置加载状态', () => {
      const { setLoading } = useUIStore.getState();
      setLoading(true, '加载中...');
      const state = useUIStore.getState();
      expect(state.isLoading).toBe(true);
      expect(state.loadingMessage).toBe('加载中...');
    });

    it('应该能清除加载状态', () => {
      const { setLoading } = useUIStore.getState();
      setLoading(true, '加载中...');
      setLoading(false);
      const state = useUIStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });
});
