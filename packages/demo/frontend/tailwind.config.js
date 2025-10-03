/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Monaco', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        red: '#FF0621',
        orange: '#FF7A00',
        yellow: '#FFD500',
        green: '#00D42F',
        blue: '#0075FF',
        indigo: '#4B00FF',
        purple: '#CC00FF',
        terminal: {
          bg: '#1d2021',
          secondary: '#282828',
          border: '#504945',
          text: '#ebdbb2',
          muted: '#a89984',
          dim: '#665c54',
          accent: '#FF0621',
          error: '#FF0621',
          warning: '#FFD500',
          success: '#00D42F',
          info: '#0075FF',
        },
      },
      animation: {
        'cursor-blink': 'blink 1s infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        blink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        glow: {
          '0%': { 'text-shadow': '0 0 5px #FF0621' },
          '100%': { 'text-shadow': '0 0 20px #FF0621, 0 0 30px #FF0621' },
        },
      },
      boxShadow: {
        terminal: '0 0 20px rgba(255, 6, 33, 0.3)',
        'terminal-inner': 'inset 0 0 20px rgba(255, 6, 33, 0.1)',
      },
    },
  },
  plugins: [],
}
