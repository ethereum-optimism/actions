import { describe, expect, it } from 'vitest'

import { Verbs } from './verbs.js'

// Helper for system tests that make real network requests
const systemTest = () => process.env.SYSTEM_TEST === 'true'

describe('Verbs SDK - System Tests', () => {
  describe('Morpho Lend Provider Integration', () => {
    // Note: These are system tests that make real network requests
    // Run with: SYSTEM_TEST=true pnpm test src/verbs.test.ts
    it.runIf(systemTest())(
      'should fetch real vault info from Morpho on Unichain',
      async () => {
        // Create Verbs instance with Morpho lending configured
        const verbs = new Verbs({
          chainId: 130, // Unichain
          rpcUrl: 'https://mainnet.unichain.org/',
          lend: {
            type: 'morpho',
            defaultSlippage: 50,
          },
          wallet: {
            type: 'privy',
            appId: 'test-app-id',
            appSecret: 'test-app-secret',
          },
        })

        // Test the Gauntlet USDC vault
        const vaultAddress = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'

        // This will make an actual network request to fetch vault data
        const vaultInfo = await verbs.lend.getVaultInfo(vaultAddress)

        // Verify the vault info structure
        expect(vaultInfo).toHaveProperty('address', vaultAddress)
        expect(vaultInfo).toHaveProperty('name')
        expect(vaultInfo).toHaveProperty('asset')
        expect(vaultInfo).toHaveProperty('totalAssets')
        expect(vaultInfo).toHaveProperty('totalShares')
        expect(vaultInfo).toHaveProperty('apy')
        expect(vaultInfo).toHaveProperty('owner')
        expect(vaultInfo).toHaveProperty('curator')
        expect(vaultInfo).toHaveProperty('fee')
        expect(vaultInfo).toHaveProperty('depositCapacity')
        expect(vaultInfo).toHaveProperty('withdrawalCapacity')
        expect(vaultInfo).toHaveProperty('lastUpdate')

        // Verify the data types
        expect(typeof vaultInfo.apy).toBe('number')
        expect(typeof vaultInfo.fee).toBe('number')
        expect(typeof vaultInfo.totalAssets).toBe('bigint')
        expect(typeof vaultInfo.totalShares).toBe('bigint')
        expect(typeof vaultInfo.depositCapacity).toBe('bigint')
        expect(typeof vaultInfo.withdrawalCapacity).toBe('bigint')

        // Verify reasonable values
        expect(vaultInfo.apy).toBeGreaterThanOrEqual(0)
        expect(vaultInfo.fee).toBeGreaterThanOrEqual(0)
        expect(vaultInfo.totalAssets).toBeGreaterThanOrEqual(0n)
        expect(vaultInfo.totalShares).toBeGreaterThanOrEqual(0n)

        // Log the actual values for manual verification
        // eslint-disable-next-line no-console
        console.log('Vault Info:', {
          address: vaultInfo.address,
          name: vaultInfo.name,
          apy: `${(vaultInfo.apy * 100).toFixed(2)}%`,
          totalAssets: vaultInfo.totalAssets.toString(),
          fee: `${vaultInfo.fee}%`,
          owner: vaultInfo.owner,
          curator: vaultInfo.curator,
        })
      },
      30000,
    ) // 30 second timeout for network request

    it.runIf(systemTest())(
      'should handle non-existent vault gracefully',
      async () => {
        const verbs = new Verbs({
          chainId: 130,
          rpcUrl: 'https://mainnet.unichain.org/',
          lend: {
            type: 'morpho',
            defaultSlippage: 50,
          },
          wallet: {
            type: 'privy',
            appId: 'test-app-id',
            appSecret: 'test-app-secret',
          },
        })

        const invalidVaultAddress = '0x0000000000000000000000000000000000000000'

        await expect(
          verbs.lend.getVaultInfo(invalidVaultAddress),
        ).rejects.toThrow(`Vault ${invalidVaultAddress} not found`)
      },
    )

    it('should list supported network IDs', async () => {
      const verbs = new Verbs({
        chainId: 130,
        rpcUrl: 'https://rpc.unichain.org',
        lend: {
          type: 'morpho',
          defaultSlippage: 50,
        },
        wallet: {
          type: 'privy',
          appId: 'test-app-id',
          appSecret: 'test-app-secret',
        },
      })

      const networkIds = verbs.lend.supportedNetworkIds()

      expect(Array.isArray(networkIds)).toBe(true)
      expect(networkIds).toContain(130) // Unichain
    })

    it.runIf(systemTest())('should get list of vaults', async () => {
      const verbs = new Verbs({
        chainId: 130,
        rpcUrl: 'https://mainnet.unichain.org/',
        lend: {
          type: 'morpho',
          defaultSlippage: 50,
        },
        wallet: {
          type: 'privy',
          appId: 'test-app-id',
          appSecret: 'test-app-secret',
        },
      })

      const vaults = await verbs.lend.getVaults()

      expect(Array.isArray(vaults)).toBe(true)
      expect(vaults.length).toBeGreaterThan(0)

      // Check first vault has expected structure
      const firstVault = vaults[0]
      expect(firstVault).toHaveProperty('address')
      expect(firstVault).toHaveProperty('name')
      expect(firstVault).toHaveProperty('apy')
      expect(typeof firstVault.apy).toBe('number')
    })
  })
})
