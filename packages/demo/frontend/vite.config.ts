import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['eventemitter3'],
    exclude: ['@base-org/account'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
      defaultIsModuleExports: true,
    },
  },
})