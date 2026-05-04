import { base, optimism, unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import {
  ChainNotSupportedError,
  InvalidParamsError,
} from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { validateChainIds } from '@/utils/validation.js'

describe('validateChainIds', () => {
  const cm = (): ChainManager =>
    new MockChainManager({
      supportedChains: [optimism.id, base.id, unichain.id],
    }) as unknown as ChainManager

  it('returns undefined when chainIds is undefined (caller wants all chains)', () => {
    expect(validateChainIds(undefined, cm())).toBeUndefined()
  })

  it('returns the deduped list in caller order when all ids are supported', () => {
    expect(
      validateChainIds([base.id, optimism.id, base.id], cm()),
    ).toEqual([base.id, optimism.id])
  })

  it('throws ChainNotSupportedError on the first unsupported id', () => {
    const manager = cm()
    expect(() =>
      validateChainIds([optimism.id, 999 as never], manager),
    ).toThrow(ChainNotSupportedError)
    try {
      validateChainIds([999 as never], manager)
    } catch (err) {
      expect(err).toBeInstanceOf(ChainNotSupportedError)
      expect((err as ChainNotSupportedError).chainId).toBe(999)
      expect((err as ChainNotSupportedError).supportedChainIds).toEqual([
        optimism.id,
        base.id,
        unichain.id,
      ])
    }
  })

  it('throws InvalidParamsError when chainIds is an empty array', () => {
    expect(() => validateChainIds([], cm())).toThrow(InvalidParamsError)
    try {
      validateChainIds([], cm())
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidParamsError)
      expect((err as InvalidParamsError).param).toBe('chainIds')
      expect((err as InvalidParamsError).expected).toContain('non-empty')
    }
  })
})
