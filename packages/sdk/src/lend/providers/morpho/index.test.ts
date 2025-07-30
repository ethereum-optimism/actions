import { fetchAccrualVault } from '@morpho-org/blue-sdk-viem'
import { type Address, createPublicClient, http, type PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MorphoLendConfig } from '../../../types/lend.js'
import { LendProviderMorpho } from './index.js'

// Mock chain config for Unichain
const unichain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.unichain.org'] },
  },
  blockExplorers: {
    default: {
      name: 'Unichain Explorer',
      url: 'https://unichain.blockscout.com',
    },
  },
}

// Mock the Morpho SDK modules
vi.mock('@morpho-org/blue-sdk-viem', () => ({
  fetchMarket: vi.fn(),
  fetchAccrualVault: vi.fn(),
  MetaMorphoAction: {
    deposit: vi.fn(() => '0x1234567890abcdef'), // Mock deposit function to return mock calldata
  },
}))

vi.mock('@morpho-org/morpho-ts', () => ({
  Time: {
    timestamp: vi.fn(() => BigInt(Math.floor(Date.now() / 1000))),
  },
}))

vi.mock('@morpho-org/bundler-sdk-viem', () => ({
  populateBundle: vi.fn(),
  finalizeBundle: vi.fn(),
  encodeBundle: vi.fn(),
}))

describe('LendProviderMorpho', () => {
  let provider: LendProviderMorpho
  let mockConfig: MorphoLendConfig
  let mockPublicClient: ReturnType<typeof createPublicClient>

  beforeEach(() => {
    mockConfig = {
      type: 'morpho',
      defaultSlippage: 50,
    }

    mockPublicClient = createPublicClient({
      chain: unichain,
      transport: http(),
    })

    provider = new LendProviderMorpho(
      mockConfig,
      mockPublicClient as unknown as PublicClient,
    )
  })

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(provider).toBeInstanceOf(LendProviderMorpho)
    })

    it('should use default slippage when not provided', () => {
      const configWithoutSlippage = {
        ...mockConfig,
        defaultSlippage: undefined,
      }
      const providerWithDefaults = new LendProviderMorpho(
        configWithoutSlippage,
        mockPublicClient as unknown as PublicClient,
      )
      expect(providerWithDefaults).toBeInstanceOf(LendProviderMorpho)
    })
  })

  describe('withdraw', () => {
    it('should throw error for unimplemented withdraw functionality', async () => {
      const asset = '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as Address // USDC
      const amount = BigInt('1000000000') // 1000 USDC
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault

      await expect(provider.withdraw(asset, amount, marketId)).rejects.toThrow(
        'Withdraw functionality not yet implemented',
      )
    })
  })

  describe('supportedNetworkIds', () => {
    it('should return array of supported network chain IDs', () => {
      const networkIds = provider.supportedNetworkIds()

      expect(Array.isArray(networkIds)).toBe(true)
      expect(networkIds).toContain(130) // Unichain
      expect(networkIds.length).toBeGreaterThan(0)
    })

    it('should return unique network IDs', () => {
      const networkIds = provider.supportedNetworkIds()
      const uniqueIds = [...new Set(networkIds)]

      expect(networkIds.length).toBe(uniqueIds.length)
    })
  })

  describe('lend', () => {
    beforeEach(() => {
      // Mock vault data for all lend tests
      const mockVault = {
        totalAssets: BigInt(10000000e6), // 10M USDC
        totalSupply: BigInt(10000000e6), // 10M shares
        fee: BigInt(1e17), // 10% fee in WAD format
        owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as Address,
        curator: '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as Address,
        allocations: new Map([
          [
            '0',
            {
              position: {
                supplyShares: BigInt(1000000e6),
                supplyAssets: BigInt(1000000e6),
                market: {
                  supplyApy: BigInt(3e16), // 3% APY
                },
              },
            },
          ],
        ]),
      }

      vi.mocked(fetchAccrualVault).mockResolvedValue(mockVault as any)

      // Mock the fetch API for rewards
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: {
              vaultByAddress: {
                state: {
                  rewards: [],
                  allocation: [],
                },
              },
            },
          }),
        } as any),
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should successfully create a lending transaction', async () => {
      const asset = '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as Address // USDC
      const amount = BigInt('1000000000') // 1000 USDC
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault

      const lendTransaction = await provider.lend(asset, amount, marketId, {
        receiver: '0x1234567890123456789012345678901234567890' as Address,
      })

      expect(lendTransaction).toHaveProperty('hash')
      expect(lendTransaction).toHaveProperty('amount', amount)
      expect(lendTransaction).toHaveProperty('asset', asset)
      expect(lendTransaction).toHaveProperty('marketId', marketId)
      expect(lendTransaction).toHaveProperty('apy')
      expect(lendTransaction).toHaveProperty('timestamp')
      expect(typeof lendTransaction.apy).toBe('number')
      expect(lendTransaction.apy).toBeGreaterThan(0)
    })

    it('should find best market when marketId not provided', async () => {
      const asset = '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as Address // USDC
      const amount = BigInt('1000000000') // 1000 USDC

      // Mock the market data for getMarketInfo

      const lendTransaction = await provider.lend(asset, amount, undefined, {
        receiver: '0x1234567890123456789012345678901234567890' as Address,
      })

      expect(lendTransaction).toHaveProperty('marketId')
      expect(lendTransaction.marketId).toBeTruthy()
    })

    it('should handle lending errors', async () => {
      const asset = '0x0000000000000000000000000000000000000000' as Address // Invalid asset
      const amount = BigInt('1000000000')

      await expect(provider.lend(asset, amount)).rejects.toThrow(
        'Failed to lend',
      )
    })

    it('should use custom slippage when provided', async () => {
      const asset = '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as Address
      const amount = BigInt('1000000000')
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault
      const customSlippage = 100 // 1%

      // Mock the market data for getMarketInfo

      const lendTransaction = await provider.lend(asset, amount, marketId, {
        slippage: customSlippage,
        receiver: '0x1234567890123456789012345678901234567890' as Address,
      })

      expect(lendTransaction).toHaveProperty('amount', amount)
    })
  })
})
