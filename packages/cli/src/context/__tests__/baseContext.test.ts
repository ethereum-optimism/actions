import { describe, expect, it } from 'vitest'

import { baseContext } from '@/context/baseContext.js'

describe('baseContext', () => {
  it('returns an Actions instance and the resolved config', () => {
    const { config, actions } = baseContext()
    expect(config.chains.length).toBeGreaterThan(0)
    expect(actions).toBeDefined()
    expect(typeof actions.getSupportedAssets).toBe('function')
  })

  it('returns a fresh Actions instance per call', () => {
    const a = baseContext()
    const b = baseContext()
    expect(a.actions).not.toBe(b.actions)
  })

  it('does not require PRIVATE_KEY', () => {
    const originalEnv = process.env
    process.env = { ...originalEnv }
    delete process.env.PRIVATE_KEY
    try {
      expect(() => baseContext()).not.toThrow()
    } finally {
      process.env = originalEnv
    }
  })
})
