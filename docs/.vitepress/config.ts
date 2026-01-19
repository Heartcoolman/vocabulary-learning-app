import { defineConfig } from 'vitepress'
import { getThemeConfig } from '@sugarat/theme/node'

const blogTheme = getThemeConfig({
  author: 'Danci Team',
  comment: false,
  popover: false,
  friend: false,
  recommend: false,
  authorList: false,
  article: {
    readingTime: true,
  },
})

export default defineConfig({
  extends: blogTheme,
  title: 'Danci 文档',
  description: '智能单词学习系统 - 基于 AMAS 自适应学习引擎',
  lang: 'zh-CN',
  base: '/vocabulary-learning-app/',
  ignoreDeadLinks: [
    /^https?:\/\/localhost/,
  ],

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/vocabulary-learning-app/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Danci',

    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/DOCKER' },
      { text: '使用教程', link: '/GUIDE' },
      { text: '技术文档', link: '/ARCHITECTURE' },
      { text: '更新日志', link: '/CHANGELOG' },
    ],

    sidebar: [
      {
        text: '快速开始',
        items: [
          { text: 'Docker 部署', link: '/DOCKER' },
          { text: '本地开发', link: '/DEVELOPMENT' },
          { text: '部署配置', link: '/DEPLOY' },
        ],
      },
      {
        text: '使用教程',
        items: [
          { text: '用户指南', link: '/GUIDE' },
        ],
      },
      {
        text: '技术文档',
        items: [
          { text: '系统架构', link: '/ARCHITECTURE' },
          { text: 'API 接口', link: '/API' },
          { text: '组件文档', link: '/COMPONENTS' },
        ],
      },
      {
        text: '核心算法',
        items: [
          { text: 'AMAS 引擎', link: '/AMAS' },
        ],
      },
      {
        text: '更新日志',
        items: [
          { text: '变更记录', link: '/CHANGELOG' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Heartcoolman/vocabulary-learning-app' },
    ],

    footer: {
      message: '基于 AMAS 自适应学习引擎',
      copyright: 'Copyright © 2025-2026 Danci Team',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档',
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    outline: {
      label: '页面导航',
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    lastUpdated: {
      text: '最后更新于',
    },

    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
  },
})
