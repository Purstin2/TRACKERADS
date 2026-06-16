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
        bg: '#07080f',
        surface: '#0d0f1e',
        surface2: '#12152b',
        border: '#1d2139',
        border2: '#2b3052',
        ink: '#e7eafc',
        muted: '#7e87b0',
        muted2: '#545c84',
        ok: '#10b981',
        danger: '#ef4444',
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
        card: '0 16px 50px rgba(0,0,0,.5)',
        'card-sm': '0 2px 10px rgba(0,0,0,.35)',
        glow: '0 4px 16px rgba(99,102,241,.2)',
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
