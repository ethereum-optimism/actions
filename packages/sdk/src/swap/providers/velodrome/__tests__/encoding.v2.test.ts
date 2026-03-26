import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  MockETHAsset,
  MockUSDCAsset,
  MockWETHAsset,
} from '@/__mocks__/MockAssets.js'
import {
  LEAF_ROUTER_ABI,
  UNIVERSAL_ROUTER_ABI,
  V2_ROUTER_ABI,
} from '@/swap/providers/velodrome/abis.js'
import { encodeSwap } from '@/swap/providers/velodrome/encoding/index.js'

import {
  BASE_CHAIN_ID,
  DEADLINE,
  decode,
  FACTORY,
  OP_CHAIN_ID,
  RECIPIENT,
} from './encoding.helpers.js'

describe('encodeSwap', () => {
  describe('v2 router', () => {
    it('encodes swapExactTokensForTokens with 4-field Route', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
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
        assetIn: MockETHAsset,
        assetOut: MockUSDCAsset,
        amountInRaw: 1000000000000000000n,
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
      expect(args[1][0].from).toBe('0x4200000000000000000000000000000000000006')
    })

    it('encodes swapExactTokensForETH for native output', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockETHAsset,
        amountInRaw: 1000000n,
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

  describe('leaf router', () => {
    it('encodes swapExactTokensForTokens with 3-field Route (no factory)', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
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
      expect((args[2][0] as Record<string, unknown>).factory).toBeUndefined()
    })

    it('encodes swapExactETHForTokens for native input', () => {
      const data = encodeSwap({
        assetIn: MockETHAsset,
        assetOut: MockUSDCAsset,
        amountInRaw: 1000000000000000000n,
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

    it('encodes stable pool swap', () => {
      const data = encodeSwap({
        assetIn: MockUSDCAsset,
        assetOut: MockWETHAsset,
        amountInRaw: 1000000n,
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

      const { functionName, args } = decode<[string, string[], bigint]>(
        UNIVERSAL_ROUTER_ABI,
        data,
      )
      expect(functionName).toBe('execute')
      const [commands, inputs, deadline] = args
      expect(commands).toBe('0x08')
      expect(inputs).toHaveLength(1)
      expect(deadline).toBe(BigInt(DEADLINE))
    })
  })

  describe('router type comparison', () => {
    const baseParams = {
      assetIn: MockUSDCAsset,
      assetOut: MockWETHAsset,
      amountInRaw: 1000000n,
      amountOutMin: 400000000000000000n,
      stable: false,
      factoryAddress: FACTORY,
      recipient: RECIPIENT,
      deadline: DEADLINE,
      chainId: OP_CHAIN_ID,
    } as const

    it('produces different calldata per router type', () => {
      const universalData = encodeSwap({
        ...baseParams,
        routerType: 'universal',
      })
      const v2Data = encodeSwap({ ...baseParams, routerType: 'v2' })
      const leafData = encodeSwap({ ...baseParams, routerType: 'leaf' })

      expect(universalData).not.toBe(v2Data)
      expect(v2Data).not.toBe(leafData)
      expect(universalData).not.toBe(leafData)
    })

    it('v2 calldata is longer than leaf (factory field)', () => {
      const v2Data = encodeSwap({ ...baseParams, routerType: 'v2' })
      const leafData = encodeSwap({ ...baseParams, routerType: 'leaf' })

      expect(v2Data.length).toBeGreaterThan(leafData.length)
    })
  })
})
