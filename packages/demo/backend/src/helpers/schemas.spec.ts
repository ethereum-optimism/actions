import { describe, expect, it } from 'vitest'

import {
  AddressSchema,
  AmountExactSchema,
  AmountWithMaxSchema,
  BorrowMarketIdSchema,
  Bytes32Schema,
  ChainIdSchema,
  ChainIdsStringSchema,
  ChainIdStringSchema,
} from './schemas.js'

describe('AddressSchema', () => {
  it('accepts a lowercase hex address', () => {
    const result = AddressSchema.safeParse(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('0xabcdef0123456789abcdef0123456789abcdef01')
    }
  })

  it('normalizes mixed-case input to lowercase', () => {
    const result = AddressSchema.safeParse(
      '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('0xabcdef0123456789abcdef0123456789abcdef01')
    }
  })

  it('rejects too-short hex', () => {
    expect(AddressSchema.safeParse('0xabc').success).toBe(false)
  })

  it('rejects non-hex chars', () => {
    expect(
      AddressSchema.safeParse('0xZZZZZZ0123456789abcdef0123456789abcdef01')
        .success,
    ).toBe(false)
  })

  it('rejects missing 0x prefix', () => {
    expect(
      AddressSchema.safeParse('abcdef0123456789abcdef0123456789abcdef01')
        .success,
    ).toBe(false)
  })
})

describe('Bytes32Schema', () => {
  it('accepts a 64-hex-char value', () => {
    const result = Bytes32Schema.safeParse('0x' + 'a'.repeat(64))
    expect(result.success).toBe(true)
  })

  it('normalizes to lowercase', () => {
    const result = Bytes32Schema.safeParse('0x' + 'A'.repeat(64))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('0x' + 'a'.repeat(64))
    }
  })

  it('rejects 40-hex-char address', () => {
    expect(Bytes32Schema.safeParse('0x' + 'a'.repeat(40)).success).toBe(false)
  })

  it('rejects 65-hex-char value', () => {
    expect(Bytes32Schema.safeParse('0x' + 'a'.repeat(65)).success).toBe(false)
  })
})

describe('ChainIdSchema', () => {
  it('accepts positive integers', () => {
    const result = ChainIdSchema.safeParse(84532)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe(84532)
  })

  it('rejects zero', () => {
    expect(ChainIdSchema.safeParse(0).success).toBe(false)
  })

  it('rejects negative', () => {
    expect(ChainIdSchema.safeParse(-1).success).toBe(false)
  })

  it('rejects non-integer', () => {
    expect(ChainIdSchema.safeParse(1.5).success).toBe(false)
  })

  it('rejects string', () => {
    expect(ChainIdSchema.safeParse('84532').success).toBe(false)
  })
})

describe('ChainIdStringSchema', () => {
  it('accepts a positive integer string and parses to number', () => {
    const result = ChainIdStringSchema.safeParse('84532')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe(84532)
  })

  it('rejects empty string', () => {
    expect(ChainIdStringSchema.safeParse('').success).toBe(false)
  })

  it('rejects negative string', () => {
    expect(ChainIdStringSchema.safeParse('-1').success).toBe(false)
  })

  it('rejects non-numeric string', () => {
    expect(ChainIdStringSchema.safeParse('abc').success).toBe(false)
  })
})

describe('ChainIdsStringSchema', () => {
  it('parses comma-separated chain IDs', () => {
    expect(ChainIdsStringSchema.parse('84532,11155420')).toEqual([
      84532, 11155420,
    ])
  })

  it('removes duplicate chain IDs', () => {
    expect(ChainIdsStringSchema.parse('84532,11155420,84532')).toEqual([
      84532, 11155420,
    ])
  })

  it.each(['', '0', '84532,0', '84532,', '84532, 11155420', 'abc'])(
    'rejects invalid chain list %j',
    (value) => {
      expect(ChainIdsStringSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe('AmountExactSchema', () => {
  it('accepts amount and passes through', () => {
    const result = AmountExactSchema.safeParse({ amount: 1.5 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ amount: 1.5 })
  })

  it('accepts amountRaw and converts to bigint', () => {
    const result = AmountExactSchema.safeParse({ amountRaw: '1500000' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ amountRaw: 1500000n })
  })

  it('rejects both amount and amountRaw present', () => {
    expect(
      AmountExactSchema.safeParse({ amount: 1.5, amountRaw: '1' }).success,
    ).toBe(false)
  })

  it('rejects empty object', () => {
    expect(AmountExactSchema.safeParse({}).success).toBe(false)
  })

  it('rejects max sentinel (not part of AmountExact)', () => {
    expect(AmountExactSchema.safeParse({ max: true }).success).toBe(false)
  })

  it('rejects amountRaw with non-digit characters', () => {
    expect(AmountExactSchema.safeParse({ amountRaw: '1.5' }).success).toBe(
      false,
    )
    expect(AmountExactSchema.safeParse({ amountRaw: '-1' }).success).toBe(false)
  })

  it('rejects amountRaw longer than 78 digits (DoS cap)', () => {
    const tooLong = '1'.repeat(79)
    expect(AmountExactSchema.safeParse({ amountRaw: tooLong }).success).toBe(
      false,
    )
  })

  it('accepts amountRaw exactly 78 digits (max-uint256 width)', () => {
    const maxWidth = '1'.repeat(78)
    expect(AmountExactSchema.safeParse({ amountRaw: maxWidth }).success).toBe(
      true,
    )
  })

  it('rejects zero amount', () => {
    expect(AmountExactSchema.safeParse({ amount: 0 }).success).toBe(false)
  })

  it('rejects negative amount', () => {
    expect(AmountExactSchema.safeParse({ amount: -1 }).success).toBe(false)
  })
})

describe('AmountWithMaxSchema', () => {
  it('accepts max sentinel', () => {
    const result = AmountWithMaxSchema.safeParse({ max: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ max: true })
  })

  it('accepts amount and passes through', () => {
    const result = AmountWithMaxSchema.safeParse({ amount: 5 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ amount: 5 })
  })

  it('accepts amountRaw and converts to bigint', () => {
    const result = AmountWithMaxSchema.safeParse({ amountRaw: '5000' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ amountRaw: 5000n })
  })

  it('rejects max: false (only literal true is valid)', () => {
    expect(AmountWithMaxSchema.safeParse({ max: false }).success).toBe(false)
  })

  it('rejects amount + max combination', () => {
    expect(
      AmountWithMaxSchema.safeParse({ amount: 5, max: true }).success,
    ).toBe(false)
  })

  it('rejects empty object', () => {
    expect(AmountWithMaxSchema.safeParse({}).success).toBe(false)
  })
})

describe('BorrowMarketIdSchema', () => {
  const validMarketId = '0x' + 'a'.repeat(64)

  it('accepts a valid morpho-blue tagged union', () => {
    const result = BorrowMarketIdSchema.safeParse({
      kind: 'morpho-blue',
      marketId: validMarketId,
      chainId: 84532,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        kind: 'morpho-blue',
        marketId: validMarketId,
        chainId: 84532,
      })
    }
  })

  it('normalizes marketId to lowercase via Bytes32Schema transform', () => {
    const upperMarketId = '0x' + 'A'.repeat(64)
    const result = BorrowMarketIdSchema.safeParse({
      kind: 'morpho-blue',
      marketId: upperMarketId,
      chainId: 84532,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.marketId).toBe(validMarketId)
    }
  })

  it('accepts the aave-v3 kind', () => {
    expect(
      BorrowMarketIdSchema.safeParse({
        kind: 'aave-v3',
        marketId: validMarketId,
        chainId: 11155420,
      }).success,
    ).toBe(true)
  })

  it('rejects unknown kind', () => {
    expect(
      BorrowMarketIdSchema.safeParse({
        kind: 'compound-v3',
        marketId: validMarketId,
        chainId: 84532,
      }).success,
    ).toBe(false)
  })

  it('rejects missing kind', () => {
    expect(
      BorrowMarketIdSchema.safeParse({
        marketId: validMarketId,
        chainId: 84532,
      }).success,
    ).toBe(false)
  })

  it('rejects extra keys (strict mode)', () => {
    expect(
      BorrowMarketIdSchema.safeParse({
        kind: 'morpho-blue',
        marketId: validMarketId,
        chainId: 84532,
        extra: 'field',
      }).success,
    ).toBe(false)
  })

  it('rejects malformed marketId (40 hex chars instead of 64)', () => {
    expect(
      BorrowMarketIdSchema.safeParse({
        kind: 'morpho-blue',
        marketId: '0x' + 'a'.repeat(40),
        chainId: 84532,
      }).success,
    ).toBe(false)
  })
})
