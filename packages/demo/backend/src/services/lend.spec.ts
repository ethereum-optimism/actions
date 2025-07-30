import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as lendService from './lend.js'

// Mock the verbs config module
vi.mock('../config/verbs.js', () => ({
  getVerbs: vi.fn(),
}))

const mockLendProvider = {
  getVaults: vi.fn(),
  getVault: vi.fn(),
}

const mockVerbs = {
  lend: mockLendProvider,
}

describe('Lend Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getVerbs } = await import('../config/verbs.js')
    vi.mocked(getVerbs).mockReturnValue(mockVerbs as any)
  })

  describe('getVaults', () => {
    it('should return vaults from the lend provider', async () => {
      const mockVaults = [
        {
          address:
            '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as `0x${string}`,
          name: 'Gauntlet USDC',
          asset: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as `0x${string}`,
          apy: 0.03,
          totalAssets: BigInt('1000000'),
          totalShares: BigInt('1000000'),
          owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as `0x${string}`,
          curator:
            '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as `0x${string}`,
          fee: 0.1,
          lastUpdate: 1234567890,
        },
      ]

      mockLendProvider.getVaults.mockResolvedValue(mockVaults)

      const result = await lendService.getVaults()

      expect(result).toEqual(mockVaults)
      expect(mockLendProvider.getVaults).toHaveBeenCalledOnce()
    })

    it('should throw error when lend provider fails', async () => {
      const error = new Error('Lend provider error')
      mockLendProvider.getVaults.mockRejectedValue(error)

      await expect(lendService.getVaults()).rejects.toThrow(
        'Failed to fetch vaults: Lend provider error',
      )
    })

    it('should handle unknown errors', async () => {
      mockLendProvider.getVaults.mockRejectedValue('Unknown error')

      await expect(lendService.getVaults()).rejects.toThrow(
        'Failed to fetch vaults: Unknown error',
      )
    })
  })

  describe('getVault', () => {
    const vaultAddress =
      '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as `0x${string}`

    it('should return vault info from the lend provider', async () => {
      const mockVaultInfo = {
        address: vaultAddress,
        name: 'Gauntlet USDC',
        asset: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as `0x${string}`,
        apy: 0.03,
        totalAssets: BigInt('1000000'),
        totalShares: BigInt('1000000'),
        owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as `0x${string}`,
        curator: '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as `0x${string}`,
        fee: 0.1,
        lastUpdate: 1234567890,
      }

      mockLendProvider.getVault.mockResolvedValue(mockVaultInfo)

      const result = await lendService.getVault(vaultAddress)

      expect(result).toEqual(mockVaultInfo)
      expect(mockLendProvider.getVault).toHaveBeenCalledWith(vaultAddress)
    })

    it('should throw error when lend provider fails', async () => {
      const error = new Error('Vault not found')
      mockLendProvider.getVault.mockRejectedValue(error)

      await expect(lendService.getVault(vaultAddress)).rejects.toThrow(
        'Failed to fetch vault info: Vault not found',
      )
    })

    it('should handle unknown errors', async () => {
      mockLendProvider.getVault.mockRejectedValue('Unknown error')

      await expect(lendService.getVault(vaultAddress)).rejects.toThrow(
        'Failed to fetch vault info: Unknown error',
      )
    })
  })
})
