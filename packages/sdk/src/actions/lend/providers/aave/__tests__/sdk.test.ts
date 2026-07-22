import {
  createPublicClient,
  custom,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  multicall3Abi,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { mainnet, optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import {
  calculateApyBreakdown,
  getReserve,
} from '@/actions/lend/providers/aave/sdk.js'
import { POOL_GET_RESERVE_DATA_ABI } from '@/actions/shared/aave/abis/pool.js'
import { WETH } from '@/constants/assets.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { LendMarketConfig } from '@/types/lend/index.js'
import { getAssetAddress } from '@/utils/assets.js'

const LIQUIDITY_RATE_RAY = 70_000_000_000_000_000_000_000_000n
const AVAILABLE_LIQUIDITY = 6_026_826_049_431_131_650n
const A_TOKEN_SUPPLY = 292_100_687_278_031_065_961n
const A_TOKEN = '0x23e4ed24c1b47491edbc64d4f905225c6ae4d0a1'

const reserveData = [
  { data: 0n },
  0n,
  LIQUIDITY_RATE_RAY,
  0n,
  0n,
  0n,
  0,
  0,
  A_TOKEN,
  zeroAddress,
  zeroAddress,
  zeroAddress,
  0n,
  0n,
  0n,
] as const

class TestChainManager extends ChainManager {
  constructor(private readonly client: PublicClient) {
    super([])
  }

  override getPublicClient(): PublicClient {
    return this.client
  }
}

function createAaveClient(results: Hex[]): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: custom({
      request: async () => {
        const result = results.shift()
        if (!result) throw new Error('Unexpected RPC request')
        return result
      },
    }),
  })
}

function encodedReserveReads(): Hex[] {
  const availableLiquidity = encodeFunctionResult({
    abi: erc20Abi,
    functionName: 'balanceOf',
    result: AVAILABLE_LIQUIDITY,
  })
  const totalSupply = encodeFunctionResult({
    abi: erc20Abi,
    functionName: 'totalSupply',
    result: A_TOKEN_SUPPLY,
  })
  return [
    encodeFunctionResult({
      abi: POOL_GET_RESERVE_DATA_ABI,
      functionName: 'getReserveData',
      result: reserveData,
    }),
    encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result: [
        { success: true, returnData: availableLiquidity },
        { success: true, returnData: totalSupply },
      ],
    }),
  ]
}

const wethAddress = getAssetAddress(WETH, optimismSepolia.id)
const market: LendMarketConfig = {
  address: wethAddress,
  chainId: optimismSepolia.id,
  name: 'Aave WETH Optimism Sepolia',
  asset: WETH,
  lendProvider: 'aave',
}
const lendConfig: LendProviderConfig = { marketAllowlist: [market] }

describe('calculateApyBreakdown', () => {
  it('converts a ray-sized liquidity rate without integer overflow', () => {
    const apy = calculateApyBreakdown(LIQUIDITY_RATE_RAY)

    expect(apy.native).toBeCloseTo(Math.exp(0.07) - 1, 8)
    expect(apy.total).toBe(apy.native)
  })
})

describe('getReserve', () => {
  it('reads reserve state directly without the UI provider tuple', async () => {
    const chainManager = new TestChainManager(
      createAaveClient(encodedReserveReads()),
    )

    const reserve = await getReserve({
      marketId: { address: wethAddress, chainId: optimismSepolia.id },
      chainManager,
      lendConfig,
    })

    expect(reserve.supply).toEqual({
      totalAssets: AVAILABLE_LIQUIDITY,
      totalShares: A_TOKEN_SUPPLY,
    })
    expect(reserve.apy.native).toBeGreaterThan(0)
  })
})
