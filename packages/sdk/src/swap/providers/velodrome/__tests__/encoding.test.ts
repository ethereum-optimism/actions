import type { Address } from 'viem'
import { decodeFunctionData } from 'viem'
import { base, optimism } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  LEAF_ROUTER_ABI,
  UNIVERSAL_ROUTER_ABI,
  V2_ROUTER_ABI,
} from '@/swap/providers/velodrome/abis.js'
import {
  encodeCLSwap,
  encodeSwap,
} from '@/swap/providers/velodrome/encoding.js'
import type { Asset } from '@/types/asset.js'

const OP_CHAIN_ID = optimism.id as SupportedChainId
const BASE_CHAIN_ID = base.id as SupportedChainId

const USDC: Asset = {
  type: 'erc20',
  address: {
    [OP_CHAIN_ID]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,
    [BASE_CHAIN_ID]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const WETH_TOKEN: Asset = {
  type: 'erc20',
  address: {
    [OP_CHAIN_ID]: '0x4200000000000000000000000000000000000006' as Address,
    [BASE_CHAIN_ID]: '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

const ETH: Asset = {
  type: 'native',
  address: {
    [OP_CHAIN_ID]: 'native',
    [BASE_CHAIN_ID]: 'native',
  },
  metadata: { name: 'Ether', symbol: 'ETH', decimals: 18 },
}

const RECIPIENT = '0x000000000000000000000000000000000000dEaD' as Address
const FACTORY = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a' as Address
const DEADLINE = Math.floor(Date.now() / 1000) + 60

/** Helper to decode and extract args without readonly tuple noise */
function decode<T extends readonly unknown[]>(
  abi: Parameters<typeof decodeFunctionData>[0]['abi'],
  data: `0x${string}`,
) {
  const result = decodeFunctionData({ abi, data })
  return { functionName: result.functionName, args: result.args as T }
}

describe('encodeSwap', () => {
  describe('v2 router (Optimism, Base)', () => {
    it('encodes swapExactTokensForTokens with 4-field Route', () => {
      const data = encodeSwap({
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type V2Route = {
        from: Address
        to: Address
        stable: boolean
        factory: Address
      }
      const { functionName, args } = decode<
        [bigint, bigint, V2Route[], Address, bigint]
      >(V2_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactTokensForTokens')
      expect(args[0]).toBe(1000000n)
      expect(args[1]).toBe(400000000000000000n)
      expect(args[2]).toHaveLength(1)
      expect(args[2][0].factory).toBe(FACTORY)
      expect(args[2][0].stable).toBe(false)
      expect(args[3]).toBe(RECIPIENT)
    })

    it('encodes swapExactETHForTokens for native input', () => {
      const data = encodeSwap({
        assetIn: ETH,
        assetOut: USDC,
        amountInWei: 1000000000000000000n,
        amountOutMin: 900000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type V2Route = {
        from: Address
        to: Address
        stable: boolean
        factory: Address
      }
      const { functionName, args } = decode<
        [bigint, V2Route[], Address, bigint]
      >(V2_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactETHForTokens')
      expect(args[0]).toBe(900000n)
      expect(args[1]).toHaveLength(1)
      // from should be WETH address (native converted)
      expect(args[1][0].from).toBe('0x4200000000000000000000000000000000000006')
    })

    it('encodes swapExactTokensForETH for native output', () => {
      const data = encodeSwap({
        assetIn: USDC,
        assetOut: ETH,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'v2',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      const { functionName } = decode(V2_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactTokensForETH')
    })
  })

  describe('leaf router (Relay chains)', () => {
    it('encodes swapExactTokensForTokens with 3-field Route (no factory)', () => {
      const data = encodeSwap({
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'leaf',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type LeafRoute = { from: Address; to: Address; stable: boolean }
      const { functionName, args } = decode<
        [bigint, bigint, LeafRoute[], Address, bigint]
      >(LEAF_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactTokensForTokens')
      expect(args[0]).toBe(1000000n)
      expect(args[1]).toBe(400000000000000000n)
      expect(args[2]).toHaveLength(1)
      expect(args[2][0].stable).toBe(false)
      // Leaf route should NOT have a factory field
      expect((args[2][0] as Record<string, unknown>).factory).toBeUndefined()
    })

    it('encodes swapExactETHForTokens for native input on leaf', () => {
      const data = encodeSwap({
        assetIn: ETH,
        assetOut: USDC,
        amountInWei: 1000000000000000000n,
        amountOutMin: 900000n,
        routerType: 'leaf',
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      const { functionName } = decode(LEAF_ROUTER_ABI, data)
      expect(functionName).toBe('swapExactETHForTokens')
    })

    it('encodes stable pool swap on leaf router', () => {
      const data = encodeSwap({
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'leaf',
        stable: true,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      })

      type LeafRoute = { from: Address; to: Address; stable: boolean }
      const { args } = decode<[bigint, bigint, LeafRoute[]]>(
        LEAF_ROUTER_ABI,
        data,
      )
      expect(args[2][0].stable).toBe(true)
    })
  })

  describe('universal router', () => {
    it('encodes execute() with V2_SWAP_EXACT_IN command', () => {
      const data = encodeSwap({
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        routerType: 'universal',
        stable: false,
        factoryAddress: FACTORY,
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
      // Command 0x08 = V2_SWAP_EXACT_IN
      expect(commands).toBe('0x08')
      expect(inputs).toHaveLength(1)
      expect(deadline).toBe(BigInt(DEADLINE))
    })

    it('produces different calldata than legacy router', () => {
      const params = {
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      } as const

      const universalData = encodeSwap({ ...params, routerType: 'universal' })
      const v2Data = encodeSwap({ ...params, routerType: 'v2' })
      const leafData = encodeSwap({ ...params, routerType: 'leaf' })

      // All three should produce valid but different calldata
      expect(universalData).not.toBe(v2Data)
      expect(v2Data).not.toBe(leafData)
      expect(universalData).not.toBe(leafData)
    })
  })

  describe('CL/Slipstream encoding', () => {
    it('encodes V3_SWAP_EXACT_IN command (0x00)', () => {
      const data = encodeCLSwap({
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
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
      // Command 0x00 = V3_SWAP_EXACT_IN
      expect(commands).toBe('0x00')
      expect(inputs).toHaveLength(1)
      expect(deadline).toBe(BigInt(DEADLINE))
    })

    it('produces different calldata than V2 universal router swap', () => {
      const clData = encodeCLSwap({
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        tickSpacing: 100,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: BASE_CHAIN_ID,
      })

      const v2Data = encodeSwap({
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
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

  describe('v2 vs leaf Route struct difference', () => {
    it('v2 calldata is longer than leaf calldata (factory field)', () => {
      const baseParams = {
        assetIn: USDC,
        assetOut: WETH_TOKEN,
        amountInWei: 1000000n,
        amountOutMin: 400000000000000000n,
        stable: false,
        factoryAddress: FACTORY,
        recipient: RECIPIENT,
        deadline: DEADLINE,
        chainId: OP_CHAIN_ID,
      } as const

      const v2Data = encodeSwap({ ...baseParams, routerType: 'v2' })
      const leafData = encodeSwap({ ...baseParams, routerType: 'leaf' })

      // v2 Route has 4 fields (from, to, stable, factory)
      // leaf Route has 3 fields (from, to, stable)
      // So v2 calldata should be longer by 32 bytes (one address slot)
      expect(v2Data.length).toBeGreaterThan(leafData.length)
    })
  })
})
