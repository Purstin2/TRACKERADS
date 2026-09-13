/** @type {import('tailwindcss').Config} */
/* ── PULSE ────────────────────────────────────────────────────────────────────
 * Direção visual de 13/09/2026. O que mudou e por quê:
 *
 * 1. ACENTO ÚNICO. Saiu o índigo→violeta (#6366f1/#8b5cf6), que é a assinatura
 *    mais reconhecível de template gerado, e entrou um verde vivo usado com
 *    disciplina: botão primário, estado ativo, linha de gráfico e valor
 *    positivo. Nada além disso. `ok` é o MESMO hex do acento de propósito —
 *    verde quer dizer "isso está indo bem" tanto na marca quanto no número.
 *
 * 2. NEUTRO COM O MATIZ DO ACENTO. Os cinzas eram azul-marinho saturado
 *    (#0a0b12, #111320). Agora carregam um traço do verde, muito dessaturado:
 *    é o que faz o acento parecer nativo da tela em vez de colado por cima.
 *
 * 3. COR DE OBJETO É SEMPRE SÓLIDA. `violet`, `blue` e `amber` existem pra
 *    tingir ícone de cartão — e entram como preenchimento cheio com glifo
 *    escuro (ver `*-ink`), nunca como fundo a 13% com texto colorido. Aquele
 *    verniz translúcido é o atalho que denuncia interface gerada.
 *
 * 4. LUZ NO LUGAR DE SOMBRA COLORIDA. `shadow-glow` não brilha mais com a cor
 *    da marca; a profundidade vem do brilho ambiente em index.css.
 *
 * Contraste conferido contra a superfície #121614: ink 16,1:1 · muted 6,2:1 ·
 * muted2 3,7:1 · acento 12,1:1 · danger 6,6:1 · warn 10,9:1. Glifo escuro
 * sobre preenchimento sólido: verde 12,7 · violeta 6,8 · âmbar 9,9 · azul 7,2.
 * ─────────────────────────────────────────────────────────────────────────── */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#3DF07E',
          2: '#2BD46A',
          dark: '#23B85A',
          ink: '#08110C', // texto/glifo SOBRE o acento — nunca branco (1,5:1)
          glow: 'rgba(61,240,126,.16)',
        },
        bg: '#080A09',
        surface: '#121614',
        surface2: '#1A201D',
        border: '#1F2321',
        border2: '#2A312D',
        ink: '#ECF2EE',
        muted: '#8D9A94',
        muted2: '#67736D',
        ok: '#3DF07E',
        danger: '#FF6B6B',
        warn: '#FBBF24',
        // cores de objeto (ícone de cartão). Use SÓLIDAS, com o `-ink` por cima.
        violet: { DEFAULT: '#A78BFA', ink: '#140F2B' },
        blue: { DEFAULT: '#60A5FA', ink: '#05152C' },
        amber: { DEFAULT: '#FBBF24', ink: '#2A1D02' },
        'danger-ink': '#2B0707',
      },
      fontFamily: {
        sans: ['Sora Variable', 'Sora', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        // era gradiente índigo→violeta. Mantido o nome pra não quebrar uso,
        // mas agora é o acento chapado: gradiente de marca é cara de template.
        brand: 'linear-gradient(135deg,#3DF07E 0%,#2BD46A 100%)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.5), 0 10px 30px rgba(0,0,0,.28)',
        'card-sm': '0 1px 2px rgba(0,0,0,.35)',
        glow: '0 2px 10px rgba(0,0,0,.35)',
      },
      borderRadius: {
        xl2: '20px',
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
