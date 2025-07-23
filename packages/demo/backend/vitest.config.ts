import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    testTimeout: 60_000,
    fileParallelism: false,
    // Run integration tests sequentially to avoid port conflicts
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
})
