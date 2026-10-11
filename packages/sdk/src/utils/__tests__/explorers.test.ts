import { describe, expect, it } from 'vitest'
import { optimismSepolia } from 'viem/chains'

import {
  getBlockExplorerUrls,
  getTransactionUrl,
} from '@/utils/explorers.js'

describe('explorers', () => {
  it('builds a transaction URL from the chain explorer', () => {
    expect(getTransactionUrl(optimismSepolia.id, '0xabc')).toBe(
      `${optimismSepolia.blockExplorers!.default.url}/tx/0xabc`,
    )
  })

  it('prefers userOpHash over transaction hashes', () => {
    expect(
      getBlockExplorerUrls({
        chainId: optimismSepolia.id,
        userOpHash: '0xop',
        transactionHash: '0xtx',
      }),
    ).toEqual([`${optimismSepolia.blockExplorers!.default.url}/op/0xop`])
  })

  it('maps batched transaction hashes', () => {
    expect(
      getBlockExplorerUrls({
        chainId: optimismSepolia.id,
        transactionHashes: ['0x1', '0x2'],
      }),
    ).toEqual([
      `${optimismSepolia.blockExplorers!.default.url}/tx/0x1`,
      `${optimismSepolia.blockExplorers!.default.url}/tx/0x2`,
    ])
  })
})
