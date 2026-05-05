import { describe, expect, it } from 'vitest'

import { serializeBigInt } from '@/utils/serializers.js'

describe('serializeBigInt', () => {
  it('coerces bigints to decimal strings', () => {
    expect(serializeBigInt({ amount: 1n })).toEqual({ amount: '1' })
  })

  it('preserves precision for large bigints', () => {
    const huge = 1234567890123456789n
    expect(serializeBigInt({ n: huge })).toEqual({ n: '1234567890123456789' })
  })

  it('never emits scientific notation', () => {
    const big = 10n ** 30n
    expect(serializeBigInt({ n: big }).n).toBe(
      '1000000000000000000000000000000',
    )
  })

  it('recurses through arrays and nested objects', () => {
    expect(
      serializeBigInt({
        balances: [
          { chainId: 84532, amount: 100n },
          { chainId: 10, amount: 200n },
        ],
      }),
    ).toEqual({
      balances: [
        { chainId: 84532, amount: '100' },
        { chainId: 10, amount: '200' },
      ],
    })
  })

  it('passes through non-bigint primitives untouched', () => {
    expect(serializeBigInt({ s: 'hello', n: 42, b: true, z: null })).toEqual({
      s: 'hello',
      n: 42,
      b: true,
      z: null,
    })
  })

  it('returns a fresh object (no shared references)', () => {
    const input = { a: { b: 1n } }
    const output = serializeBigInt(input)
    expect(output).not.toBe(input)
    expect(output.a).not.toBe(input.a)
  })
})
