import { describe, expect, it } from 'vitest'

import { createMockPrivyClient } from './test/MockPrivyClient.js'
import { externalTest } from './utils/test.js'
import { Verbs } from './verbs.js'

describe('Verbs SDK - System Tests', () => {
  describe('Morpho Lend Provider Integration', () => {
    // Note: These are external tests that make real network requests
    // Run with: EXTERNAL_TEST=true pnpm test src/verbs.test.ts
    it.runIf(externalTest())(
      'should fetch real vault info from Morpho on Unichain',
      async () => {
        // Create Verbs instance with Morpho lending configured
        const verbs = new Verbs({
          lend: {
            type: 'morpho',
            defaultSlippage: 50,
          },
          wallet: {
            embeddedWalletConfig: {
              provider: {
                type: 'privy',
                privyClient: createMockPrivyClient(
                  'test-app-id',
                  'test-app-secret',
                ),
              },
            },
            smartWalletConfig: {
              provider: {
                type: 'default',
              },
            },
          },
        })

        // Test the Gauntlet USDC vault
        const vaultAddress = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'

        // This will make an actual network request to fetch vault data
        const vaultInfo = await verbs.lend.getVault(vaultAddress)

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
        expect(vaultInfo).toHaveProperty('lastUpdate')

        // Verify the data types
        expect(typeof vaultInfo.apy).toBe('number')
        expect(typeof vaultInfo.fee).toBe('number')
        expect(typeof vaultInfo.totalAssets).toBe('bigint')
        expect(typeof vaultInfo.totalShares).toBe('bigint')

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

    it.runIf(externalTest())(
      'should fetch vault info with enhanced rewards data',
      async () => {
        const verbs = new Verbs({
          lend: {
            type: 'morpho',
            defaultSlippage: 50,
          },
          wallet: {
            embeddedWalletConfig: {
              provider: {
                type: 'privy',
                privyClient: createMockPrivyClient(
                  'test-app-id',
                  'test-app-secret',
                ),
              },
            },
            smartWalletConfig: {
              provider: {
                type: 'default',
              },
            },
          },
        })

        const vaultAddress = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'
        const vaultInfo = await verbs.lend.getVault(vaultAddress)

        expect(vaultInfo).toBeDefined()
        expect(vaultInfo.address).toBe(vaultAddress)
        expect(vaultInfo.name).toBe('Gauntlet USDC')
        expect(typeof vaultInfo.apy).toBe('number')
        expect(typeof vaultInfo.totalAssets).toBe('bigint')
        expect(typeof vaultInfo.fee).toBe('number')

        // Enhanced APY should be higher than base APY due to rewards
        expect(vaultInfo.apy).toBeGreaterThan(0.03) // Should be > 3% with rewards
      },
      30000,
    ) // 30 second timeout for network request

    it.runIf(externalTest())(
      'should handle non-existent vault gracefully',
      async () => {
        const verbs = new Verbs({
          lend: {
            type: 'morpho',
            defaultSlippage: 50,
          },
          wallet: {
            embeddedWalletConfig: {
              provider: {
                type: 'privy',
                privyClient: createMockPrivyClient(
                  'test-app-id',
                  'test-app-secret',
                ),
              },
            },
            smartWalletConfig: {
              provider: {
                type: 'default',
              },
            },
          },
        })

        const invalidVaultAddress = '0x0000000000000000000000000000000000000000'

        await expect(verbs.lend.getVault(invalidVaultAddress)).rejects.toThrow(
          `Vault ${invalidVaultAddress} not found`,
        )
      },
    )

    it('should list supported network IDs', async () => {
      const verbs = new Verbs({
        lend: {
          type: 'morpho',
          defaultSlippage: 50,
        },
        wallet: {
          embeddedWalletConfig: {
            provider: {
              type: 'privy',
              privyClient: createMockPrivyClient(
                'test-app-id',
                'test-app-secret',
              ),
            },
          },
          smartWalletConfig: {
            provider: {
              type: 'default',
            },
          },
        },
      })

      const networkIds = verbs.lend.supportedNetworkIds()

      expect(Array.isArray(networkIds)).toBe(true)
      expect(networkIds).toContain(130) // Unichain
    })

    it.runIf(externalTest())('should get list of vaults', async () => {
      const verbs = new Verbs({
        lend: {
          type: 'morpho',
          defaultSlippage: 50,
        },
        wallet: {
          embeddedWalletConfig: {
            provider: {
              type: 'privy',
              privyClient: createMockPrivyClient(
                'test-app-id',
                'test-app-secret',
              ),
            },
          },
          smartWalletConfig: {
            provider: {
              type: 'default',
            },
          },
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
