/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* ========================================
       * G3 缓动函数 Token
       * 用法: transition-timing-g3, ease-g3-enter
       * ======================================== */
      transitionTimingFunction: {
        'g3': 'var(--ease-g3-standard)',
        'g3-linear': 'var(--ease-g3-standard-linear)',
        'g3-enter': 'var(--ease-g3-enter)',
        'g3-exit': 'var(--ease-g3-exit)',
      },

      /* ========================================
       * G3 动画时长 Token
       * 用法: duration-g3-fast, duration-g3-normal
       * ======================================== */
      transitionDuration: {
        'g3-instant': 'var(--g3-duration-instant)',
        'g3-fast': 'var(--g3-duration-fast)',
        'g3-normal': 'var(--g3-duration-normal)',
        'g3-slow': 'var(--g3-duration-slow)',
        'g3-slower': 'var(--g3-duration-slower)',
      },

      /* ========================================
       * 阴影层级系统
       * 三级阴影：柔和 -> 悬浮 -> 漂浮
       * ======================================== */
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.04)',
        'elevated': '0 4px 12px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.06)',
        'floating': '0 8px 24px rgba(0, 0, 0, 0.08), 0 16px 48px rgba(0, 0, 0, 0.08)',
        'inner-glow': 'inset 0 1px 2px rgba(255, 255, 255, 0.5)',
        'button-rest': '0 2px 6px rgba(0, 0, 0, 0.06)',
        'button-hover': '0 4px 12px rgba(0, 0, 0, 0.1)',
        'button-active': '0 1px 3px rgba(0, 0, 0, 0.08)',
      },

      /* ========================================
       * 圆角规范
       * 统一组件圆角语义化
       * ======================================== */
      borderRadius: {
        'card': '1rem',
        'button': '0.75rem',
        'input': '0.625rem',
        'badge': '0.5rem',
        'pill': '9999px',
      },

      /* ========================================
       * 背景渐变
       * 微妙的表面色彩层次
       * ======================================== */
      backgroundImage: {
        'surface-muted': 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.96) 100%)',
        'surface-elevated': 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
      },

      /* ========================================
       * 动画预设
       * ======================================== */
      animation: {
        'fade-in': 'fadeIn 300ms ease-out',
        'slide-up': 'slideUp 400ms ease-out',
        'g3-fade-in': 'g3FadeIn var(--g3-duration-normal) var(--ease-g3-standard) forwards',
        'g3-fade-in-fast': 'g3FadeIn var(--g3-duration-fast) var(--ease-g3-standard) forwards',
        'g3-slide-up': 'g3SlideUp var(--g3-duration-slow) var(--ease-g3-enter) forwards',
        'g3-scale-in': 'g3ScaleIn var(--g3-duration-normal) var(--ease-g3-enter) forwards',
        'g3-fade-out': 'g3FadeOut var(--g3-duration-fast) var(--ease-g3-exit) forwards',
        'g3-backdrop-in': 'g3BackdropIn var(--g3-duration-normal) var(--ease-g3-standard) forwards',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
