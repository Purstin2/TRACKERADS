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
 * 2. PRETO FOSCO, NEUTRO DE VERDADE. Primeira tentativa tingiu os cinzas de
 *    verde — e com o acento amarelado (142°) mais o brilho verde por cima,
 *    a tela inteira lavou de lodo. Os neutros agora são cinza puro
 *    (#060606 / #101010 / #181818): num fundo sem matiz o verde salta MAIS,
 *    e é o que dá a leitura de terminal futurista em vez de pântano.
 *
 * 3. COR DE OBJETO É SEMPRE SÓLIDA. `violet`, `blue` e `amber` existem pra
 *    tingir ícone de cartão — e entram como preenchimento cheio com glifo
 *    escuro (ver `*-ink`), nunca como fundo a 13% com texto colorido. Aquele
 *    verniz translúcido é o atalho que denuncia interface gerada.
 *
 * 4. LUZ NO LUGAR DE SOMBRA COLORIDA. `shadow-glow` não brilha mais com a cor
 *    da marca; a profundidade vem do brilho ambiente em index.css.
 *
 * O acento saiu de 142° (verde-grama, puxado pro amarelo) para 161° — menta
 * elétrica, puxada pro ciano. Mesmo matiz de terminal, sem o tom de esgoto.
 *
 * Contraste contra a superfície #101010: ink 17,1:1 · muted 6,5:1 ·
 * muted2 3,8:1 · acento 12,7:1 · danger 6,3:1 · warn 11,8:1. Glifo escuro
 * sobre sólido: verde 12,4 · violeta 6,8 · âmbar 9,9 · azul 7,2.
 * ─────────────────────────────────────────────────────────────────────────── */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#00F0A4',
          2: '#00C88A',
          dark: '#00A673',
          ink: '#00170F', // texto/glifo SOBRE o acento — nunca branco (1,5:1)
          glow: 'rgba(0,240,164,.14)',
        },
        bg: '#060606',
        surface: '#101010',
        surface2: '#181818',
        border: '#222222',
        border2: '#2E2E2E',
        ink: '#F2F3F2',
        muted: '#949895',
        muted2: '#6B706D',
        ok: '#00F0A4',
        danger: '#FF5C5C',
        warn: '#FFC145',
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
        brand: 'linear-gradient(135deg,#00F0A4 0%,#00C88A 100%)',
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
