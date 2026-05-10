import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.{test,spec}.ts'],
      exclude: ['src/**/*.network.test.ts', 'node_modules/**'],
      environment: 'node',
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'network',
      include: ['src/**/*.network.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
    },
  },
])
