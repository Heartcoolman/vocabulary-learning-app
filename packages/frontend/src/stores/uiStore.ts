import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UIState {
  // 模态框状态
  modals: {
    [key: string]: boolean;
  };

  // 侧边栏状态
  isSidebarOpen: boolean;

  // 加载状态
  isLoading: boolean;
  loadingMessage?: string;

  // Actions
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  toggleModal: (modalId: string) => void;
  isModalOpen: (modalId: string) => boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  setLoading: (loading: boolean, message?: string) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set, get) => ({
      // 初始状态
      modals: {},
      isSidebarOpen: true,
      isLoading: false,
      loadingMessage: undefined,

      // 模态框操作
      openModal: (modalId: string) =>
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: true },
          }),
          false,
          'openModal',
        ),

      closeModal: (modalId: string) =>
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: false },
          }),
          false,
          'closeModal',
        ),

      toggleModal: (modalId: string) =>
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: !state.modals[modalId] },
          }),
          false,
          'toggleModal',
        ),

      isModalOpen: (modalId: string) => {
        return get().modals[modalId] ?? false;
      },

      // 侧边栏操作
      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen }), false, 'toggleSidebar'),

      setSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }, false, 'setSidebarOpen'),

      // 加载状态操作
      setLoading: (loading: boolean, message?: string) =>
        set({ isLoading: loading, loadingMessage: message }, false, 'setLoading'),
    }),
    {
      name: 'UI Store',
      enabled: import.meta.env.DEV,
    },
  ),
);
