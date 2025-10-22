/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    server: {
      deps: {
        inline: ['@turnkey/react-wallet-kit', '@turnkey/core'],
      },
    },
  },
})
