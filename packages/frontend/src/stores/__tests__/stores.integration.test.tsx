import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUIStore } from '../uiStore';
import { useToastStore } from '../toastStore';
import { useToast } from '../../components/ui/Toast';

describe('Stores Integration', () => {
  describe('Store 导出检查', () => {
    it('应该能正确导入 useUIStore', () => {
      expect(useUIStore).toBeDefined();
      expect(typeof useUIStore).toBe('function');
    });

    it('应该能正确导入 useToastStore', () => {
      expect(useToastStore).toBeDefined();
      expect(typeof useToastStore).toBe('function');
    });

    it('useToast hook 应该可用', () => {
      expect(useToast).toBeDefined();
      expect(typeof useToast).toBe('function');
    });
  });

  describe('UI Store 基本功能', () => {
    it('应该能获取 UI Store 状态', () => {
      const { result } = renderHook(() => useUIStore());
      expect(result.current).toHaveProperty('modals');
      expect(result.current).toHaveProperty('isSidebarOpen');
      expect(result.current).toHaveProperty('isLoading');
    });

    it('应该能获取 UI Store 方法', () => {
      const { result } = renderHook(() => useUIStore());
      expect(result.current).toHaveProperty('openModal');
      expect(result.current).toHaveProperty('closeModal');
      expect(result.current).toHaveProperty('toggleModal');
      expect(result.current).toHaveProperty('toggleSidebar');
      expect(result.current).toHaveProperty('setLoading');
    });
  });

  describe('Toast Store 基本功能', () => {
    it('应该能获取 Toast Store 状态', () => {
      const { result } = renderHook(() => useToastStore());
      expect(result.current).toHaveProperty('toasts');
      expect(result.current.toasts).toBeInstanceOf(Array);
    });

    it('应该能获取 Toast Store 方法', () => {
      const { result } = renderHook(() => useToastStore());
      expect(result.current).toHaveProperty('showToast');
      expect(result.current).toHaveProperty('success');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('warning');
      expect(result.current).toHaveProperty('info');
    });
  });

  describe('Store 互操作性', () => {
    it('多个 Store 应该能独立工作', () => {
      const { result: uiResult } = renderHook(() => useUIStore());
      const { result: toastResult } = renderHook(() => useToastStore());

      act(() => {
        uiResult.current.setLoading(true);
        toastResult.current.success('测试消息');
      });

      expect(uiResult.current.isLoading).toBe(true);
      expect(toastResult.current.toasts).toHaveLength(1);
    });
  });
});
