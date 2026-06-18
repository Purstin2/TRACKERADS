/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6366f1',
          2: '#8b5cf6',
          dark: '#4d50e0',
          glow: 'rgba(99,102,241,.2)',
        },
        bg: '#0a0b12',
        surface: '#111320',
        surface2: '#171a28',
        border: '#222637',
        border2: '#2e3350',
        ink: '#eceefb',
        muted: '#868fb4',
        muted2: '#5a6188',
        ok: '#22c55e',
        danger: '#f05252',
        warn: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        brand: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.22)',
        'card-sm': '0 1px 2px rgba(0,0,0,.3)',
        glow: '0 2px 8px rgba(99,102,241,.16)',
      },
      borderRadius: {
        xl2: '14px',
      },
      keyframes: {
        pageIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateX(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        pageIn: 'pageIn .28s ease',
        toastIn: 'toastIn .25s ease',
      },
    },
  },
  plugins: [],
}
