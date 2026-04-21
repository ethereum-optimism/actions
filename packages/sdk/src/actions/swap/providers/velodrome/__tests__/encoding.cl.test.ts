import { describe, expect, it } from 'vitest'

import { MockUSDCAsset, MockWETHAsset } from '@/__mocks__/MockAssets.js'
import { UNIVERSAL_ROUTER_ABI } from '@/actions/swap/providers/velodrome/abis.js'
import {
  encodeCLSwap,
  encodeSwap,
} from '@/actions/swap/providers/velodrome/encoding/index.js'

import {
  BASE_CHAIN_ID,
  DEADLINE,
  decode,
  FACTORY,
  RECIPIENT,
} from './encoding.helpers.js'

describe('encodeCLSwap', () => {
  it('encodes V3_SWAP_EXACT_IN command (0x00)', () => {
    const data = encodeCLSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      tickSpacing: 100,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    const { functionName, args } = decode<[string, string[], bigint]>(
      UNIVERSAL_ROUTER_ABI,
      data,
    )
    expect(functionName).toBe('execute')
    const [commands, inputs, deadline] = args
    expect(commands).toBe('0x00')
    expect(inputs).toHaveLength(1)
    expect(deadline).toBe(BigInt(DEADLINE))
  })

  it('produces different calldata than V2 universal router swap', () => {
    const clData = encodeCLSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      tickSpacing: 100,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    const v2Data = encodeSwap({
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      routerType: 'universal',
      stable: false,
      factoryAddress: FACTORY,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: BASE_CHAIN_ID,
    })

    expect(clData).not.toBe(v2Data)
  })
})
