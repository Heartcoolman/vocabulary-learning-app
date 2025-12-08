import type { Preview, Decorator } from '@storybook/react-vite';
import React, { useEffect } from 'react';
import '../src/index.css';

/**
 * 暗色模式装饰器
 * 根据 Storybook 工具栏中的主题选择切换暗色模式
 */
const withThemeProvider: Decorator = (Story, context) => {
  const theme = context.globals.theme || 'light';

  useEffect(() => {
    // 切换 HTML 根元素的暗色模式类
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [theme]);

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-300 ${
        theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'
      }`}
      style={{ padding: '1rem' }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
      expanded: true,
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },

    // Backgrounds configuration with dark mode support
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#fafbfc' },
        { name: 'dark', value: '#1f2937' },
        { name: 'white', value: '#ffffff' },
        { name: 'black', value: '#000000' },
      ],
    },

    // Layout configuration
    layout: 'centered',

    // Actions configuration
    actions: { argTypesRegex: '^on[A-Z].*' },

    // Docs configuration
    docs: {
      toc: true,
    },
  },

  // Global decorators
  decorators: [withThemeProvider],

  // Global types for toolbar
  globalTypes: {
    theme: {
      description: '主题模式',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: '浅色模式' },
          { value: 'dark', icon: 'moon', title: '暗色模式' },
        ],
        dynamicTitle: true,
      },
    },
    locale: {
      description: '国际化语言',
      toolbar: {
        title: 'Locale',
        icon: 'globe',
        items: [
          { value: 'zh', title: '中文' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
  },

  // Initial globals
  initialGlobals: {
    theme: 'light',
    locale: 'zh',
  },

  // Tags configuration
  tags: ['autodocs'],
};

export default preview;
