import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.{test,spec}.ts'],
      exclude: ['src/**/*.supersim.test.ts', 'node_modules/**'],
      environment: 'node',
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'supersim',
      include: ['src/**/*.supersim.test.ts'],
      environment: 'node',
    },
  },
])
