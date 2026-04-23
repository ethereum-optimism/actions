import { afterEach, describe, expect, it, vi } from 'vitest'

import { writeJson } from '@/output/json.js'

describe('writeJson', () => {
  const writeSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true)

  afterEach(() => {
    writeSpy.mockClear()
  })

  const captured = (): string => {
    const call = writeSpy.mock.calls[0]?.[0]
    return typeof call === 'string' ? call : call!.toString()
  }

  it('emits a trailing newline', () => {
    writeJson({ ok: true })
    expect(captured().endsWith('\n')).toBe(true)
  })

  it('coerces bigints to decimal strings', () => {
    writeJson({ amount: 1234567890123456789n })
    const parsed = JSON.parse(captured())
    expect(parsed).toEqual({ amount: '1234567890123456789' })
  })

  it('pretty-prints with two-space indentation', () => {
    writeJson({ a: 1 })
    expect(captured()).toBe('{\n  "a": 1\n}\n')
  })

  it('serialises arrays and nested objects', () => {
    writeJson([{ chainId: 84532, balance: 100n }])
    expect(JSON.parse(captured())).toEqual([{ chainId: 84532, balance: '100' }])
  })

  it('passes primitives through unchanged', () => {
    writeJson(null)
    expect(captured()).toBe('null\n')
  })
})
