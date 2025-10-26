/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  important: '#root',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Monaco', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        red: '#FF0621',
        orange: '#fe8019',
        yellow: '#fabd2f',
        green: '#b8bb26',
        blue: '#83a598',
        indigo: '#d3869b',
        purple: '#d3869b',
        terminal: {
          bg: '#1d2021',
          secondary: '#282828',
          border: '#504945',
          text: '#ebdbb2',
          muted: '#928374',
          dim: '#665c54',
          accent: '#FF0621',
          error: '#fb4933',
          warning: '#fabd2f',
          success: '#b8bb26',
          info: '#83a598',
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
