import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider } from '@/types/lend.js'

import { VerbsLendNamespace } from './VerbsLendNamespace.js'

describe('VerbsLendNamespace', () => {
  let mockProvider: LendProvider

  beforeEach(() => {
    mockProvider = createMockLendProvider()
  })

  it('should create an instance with a lend provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)

    expect(namespace).toBeInstanceOf(VerbsLendNamespace)
  })

  it('should delegate getVaults to provider', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const mockVaults = [
      {
        chainId: 130,
        address: getRandomAddress(),
        name: 'Test Vault',
        asset: getRandomAddress(),
        totalAssets: BigInt('1000000'),
        totalShares: BigInt('1000000'),
        apy: 0.05,
        apyBreakdown: {
          nativeApy: 0.04,
          totalRewardsApr: 0.01,
          performanceFee: 0.0,
          netApy: 0.05,
        },
        owner: getRandomAddress(),
        curator: getRandomAddress(),
        fee: 0.1,
        lastUpdate: Date.now(),
      },
    ]

    vi.mocked(mockProvider.getVaults).mockResolvedValue(mockVaults)

    const result = await namespace.getVaults()

    expect(mockProvider.getVaults).toHaveBeenCalled()
    expect(result).toBe(mockVaults)
  })

  it('should delegate getVault to provider', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const vaultAddress = getRandomAddress()
    const mockVault = {
      chainId: 130,
      address: vaultAddress,
      name: 'Test Vault',
      asset: getRandomAddress(),
      totalAssets: BigInt('1000000'),
      totalShares: BigInt('1000000'),
      apy: 0.05,
      apyBreakdown: {
        nativeApy: 0.04,
        totalRewardsApr: 0.01,
        performanceFee: 0.0,
        netApy: 0.05,
      },
      owner: getRandomAddress(),
      curator: getRandomAddress(),
      fee: 0.1,
      lastUpdate: Date.now(),
    }

    vi.mocked(mockProvider.getVault).mockResolvedValue(mockVault)

    const result = await namespace.getVault(vaultAddress)

    expect(mockProvider.getVault).toHaveBeenCalledWith(vaultAddress)
    expect(result).toBe(mockVault)
  })

  it('should delegate getVaultBalance to provider', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const vaultAddress = getRandomAddress()
    const walletAddress = getRandomAddress()
    const mockBalance = {
      balance: BigInt('500000'),
      balanceFormatted: '500.000',
      shares: BigInt('500000'),
      sharesFormatted: '0.5',
      chainId: 130,
    }

    vi.mocked(mockProvider.getVaultBalance).mockResolvedValue(mockBalance)

    const result = await namespace.getVaultBalance(vaultAddress, walletAddress)

    expect(mockProvider.getVaultBalance).toHaveBeenCalledWith(
      vaultAddress,
      walletAddress,
    )
    expect(result).toBe(mockBalance)
  })

  it('should delegate supportedNetworkIds to provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const mockNetworkIds = [130, 8453]

    vi.mocked(mockProvider.supportedNetworkIds).mockReturnValue(mockNetworkIds)

    const result = namespace.supportedNetworkIds()

    expect(mockProvider.supportedNetworkIds).toHaveBeenCalled()
    expect(result).toBe(mockNetworkIds)
  })

  it('should provide access to the underlying provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)

    expect(namespace['provider']).toBe(mockProvider)
  })
})
