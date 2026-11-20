import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  collectContractAddresses,
  EMPTY_METADATA,
  withEmptyMetadata,
} from '@/actions/shared/contractAddresses.js'

const ROUTER = '0x1111111111111111111111111111111111111111' as Address
const FACTORY = '0x2222222222222222222222222222222222222222' as Address

describe('collectContractAddresses', () => {
  it('reads contract addresses and skips unset slots and metadata', () => {
    const chains = {
      10: withEmptyMetadata({ router: ROUTER, quoter: undefined }),
      8453: {
        contracts: { factory: FACTORY },
        metadata: { routerType: 'v2' as const },
      },
    }

    expect(collectContractAddresses(chains)).toEqual({
      10: [ROUTER],
      8453: [FACTORY],
    })
    expect(EMPTY_METADATA).toEqual({})
  })
})
