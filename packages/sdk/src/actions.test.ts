import type { Address } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { Actions } from '@/actions.js'
import {
  createMockPrivyClient,
  getMockAuthorizationContext,
} from '@/test/MockPrivyClient.js'
import type { LendMarketConfig, MorphoLendConfig } from '@/types/lend/index.js'
import { externalTest } from '@/utils/test.js'
import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type { HostedWalletProvidersSchema } from '@/wallet/core/providers/hosted/types/index.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type {
  NodeOptionsMap,
  NodeToActionsOptionsMap,
} from '@/wallet/node/providers/hosted/types/index.js'

describe('Actions SDK', () => {
  type TestInstanceMap = { privy: PrivyHostedWalletProvider }
  type TestConfigMap = { privy: NodeOptionsMap['privy'] }
  type TestWalletProvider = HostedWalletProvidersSchema<
    'privy',
    TestInstanceMap,
    TestConfigMap,
    NodeToActionsOptionsMap
  >
  class TestHostedWalletProviderRegistry extends HostedWalletProviderRegistry<
    TestInstanceMap,
    TestConfigMap,
    'privy'
  > {
    constructor() {
      super()
      this.register<'privy'>({
        type: 'privy',
        validateOptions(options): options is NodeOptionsMap['privy'] {
          const hasPrivyClient = !!(options as NodeOptionsMap['privy'])
            ?.privyClient
          const hasAuthorizationContext = !!(options as NodeOptionsMap['privy'])
            ?.authorizationContext
          return hasPrivyClient && hasAuthorizationContext
        },
        create({ chainManager }, options) {
          return new PrivyHostedWalletProvider(
            options.privyClient,
            options.authorizationContext,
            chainManager,
          )
        },
      })
    }
  }

  describe('Configuration', () => {
    describe('Morpho Provider Configuration', () => {
      it('should create Morpho provider when provider is set to morpho', () => {
        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            lend: {
              provider: 'morpho',
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-id',
                      'test-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: { type: 'default' },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        expect(actions.lend).toBeDefined()
        expect(actions.lend.supportedChainIds()).toContain(130) // Unichain
      })

      it('should create Morpho provider with custom default slippage', () => {
        const customSlippage = 150
        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            lend: {
              provider: 'morpho',
              defaultSlippage: customSlippage,
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-id',
                      'test-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: { type: 'default' },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        expect(actions.lend).toBeDefined()
        expect(actions.lend.config.defaultSlippage).toBe(customSlippage)
        expect(actions.lend.config.provider).toBe('morpho')
      })

      it('should create Morpho provider with market allowlist', () => {
        const mockMarket: LendMarketConfig = {
          address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
          chainId: unichain.id,
          name: 'Test Gauntlet USDC',
          asset: {
            address: {
              [unichain.id]:
                '0xA0b86991c431c924C2407E4C573C686cc8C6c5b7' as Address,
            },
            metadata: {
              decimals: 6,
              name: 'USD Coin',
              symbol: 'USDC',
            },
            type: 'erc20',
          },
          lendProvider: 'morpho',
        }

        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            lend: {
              provider: 'morpho',
              marketAllowlist: [mockMarket],
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-id',
                      'test-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: { type: 'default' },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        expect(actions.lend).toBeDefined()
        const allowlist = actions.lend.config.marketAllowlist
        expect(allowlist).toBeDefined()
        expect(allowlist).toHaveLength(1)
        expect(allowlist![0].address).toBe(mockMarket.address)
        expect(allowlist![0].name).toBe(mockMarket.name)
      })

      it('should create Morpho provider with multiple markets in allowlist', () => {
        const mockMarkets: LendMarketConfig[] = [
          {
            address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
            chainId: unichain.id,
            name: 'Gauntlet USDC',
            asset: {
              address: {
                [unichain.id]:
                  '0xA0b86991c431c924C2407E4C573C686cc8C6c5b7' as Address,
              },
              metadata: {
                decimals: 6,
                name: 'USD Coin',
                symbol: 'USDC',
              },
              type: 'erc20',
            },
            lendProvider: 'morpho',
          },
          {
            address: '0x1234567890123456789012345678901234567890' as Address,
            chainId: unichain.id,
            name: 'Test WETH Market',
            asset: {
              address: {
                [unichain.id]:
                  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
              },
              metadata: {
                decimals: 18,
                name: 'Wrapped Ether',
                symbol: 'WETH',
              },
              type: 'erc20',
            },
            lendProvider: 'morpho',
          },
        ]

        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            lend: {
              provider: 'morpho',
              marketAllowlist: mockMarkets,
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-id',
                      'test-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: { type: 'default' },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        expect(actions.lend).toBeDefined()
        const allowlist = actions.lend.config.marketAllowlist
        expect(allowlist).toBeDefined()
        expect(allowlist).toHaveLength(2)
        expect(allowlist![0].name).toBe('Gauntlet USDC')
        expect(allowlist![1].name).toBe('Test WETH Market')
      })

      it('should throw error for unsupported lending provider', () => {
        expect(() => {
          new Actions<
            TestWalletProvider['providerTypes'],
            TestWalletProvider,
            'privy'
          >(
            {
              chains: [{ chainId: unichain.id }],
              lend: {
                provider: 'invalid' as any,
              },
              wallet: {
                hostedWalletConfig: {
                  provider: {
                    type: 'privy',
                    config: {
                      privyClient: createMockPrivyClient(
                        'test-id',
                        'test-secret',
                      ),
                      authorizationContext: getMockAuthorizationContext(),
                    },
                  },
                },
                smartWalletConfig: {
                  provider: { type: 'default' },
                },
              },
            },
            {
              hostedWalletProviderRegistry:
                new TestHostedWalletProviderRegistry(),
            },
          )
        }).toThrow('Unsupported lending provider: invalid')
      })

      it('should work without lend configuration', () => {
        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-id',
                      'test-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: { type: 'default' },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        expect(actions['lendProvider']).toBeUndefined()
        expect(() => actions.lend).toThrow('Lend provider not configured')
      })
    })

    describe('Lending Configuration Types', () => {
      it('should accept valid MorphoLendConfig', () => {
        const config: MorphoLendConfig = {
          provider: 'morpho',
          defaultSlippage: 100,
          marketAllowlist: [],
        }

        expect(() => {
          new Actions<
            TestWalletProvider['providerTypes'],
            TestWalletProvider,
            'privy'
          >(
            {
              chains: [{ chainId: unichain.id }],
              lend: config,
              wallet: {
                hostedWalletConfig: {
                  provider: {
                    type: 'privy',
                    config: {
                      privyClient: createMockPrivyClient(
                        'test-id',
                        'test-secret',
                      ),
                      authorizationContext: getMockAuthorizationContext(),
                    },
                  },
                },
                smartWalletConfig: {
                  provider: { type: 'default' },
                },
              },
            },
            {
              hostedWalletProviderRegistry:
                new TestHostedWalletProviderRegistry(),
            },
          )
        }).not.toThrow()
      })

      it('should accept minimal MorphoLendConfig', () => {
        const config: MorphoLendConfig = {
          provider: 'morpho',
        }

        expect(() => {
          new Actions<
            TestWalletProvider['providerTypes'],
            TestWalletProvider,
            'privy'
          >(
            {
              chains: [{ chainId: unichain.id }],
              lend: config,
              wallet: {
                hostedWalletConfig: {
                  provider: {
                    type: 'privy',
                    config: {
                      privyClient: createMockPrivyClient(
                        'test-id',
                        'test-secret',
                      ),
                      authorizationContext: getMockAuthorizationContext(),
                    },
                  },
                },
                smartWalletConfig: {
                  provider: { type: 'default' },
                },
              },
            },
            {
              hostedWalletProviderRegistry:
                new TestHostedWalletProviderRegistry(),
            },
          )
        }).not.toThrow()
      })
    })

    describe('Integration with ChainManager', () => {
      it('should pass chain configuration to lending provider', () => {
        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [
              { chainId: unichain.id },
              { chainId: 84532 }, // Base Sepolia
            ],
            lend: {
              provider: 'morpho',
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-id',
                      'test-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: { type: 'default' },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        expect(actions.lend).toBeDefined()
        const supportedIds = actions.lend.supportedChainIds()
        expect(supportedIds).toContain(130) // Unichain
        expect(supportedIds).toContain(8453) // Base
      })
    })

    describe('Unit Tests', () => {
      it('should list supported chain IDs', () => {
        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            lend: {
              provider: 'morpho',
              defaultSlippage: 50,
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-app-id',
                      'test-app-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: { type: 'default' },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        const chainIds = actions.lend.supportedChainIds()
        expect(Array.isArray(chainIds)).toBe(true)
        expect(chainIds).toContain(130) // Unichain
      })
    })
  })

  describe('System Tests', () => {
    describe('Morpho Lend Provider Integration', () => {
      // Note: These are external tests that make real network requests
      // Run with: EXTERNAL_TEST=true pnpm test src/actions.test.ts
      it.runIf(externalTest())(
        'should fetch real vault info from Morpho on Unichain',
        async () => {
          // Create Actions instance with Morpho lending configured
          const actions = new Actions<
            TestWalletProvider['providerTypes'],
            TestWalletProvider,
            'privy'
          >(
            {
              chains: [
                {
                  chainId: unichain.id,
                },
              ],
              lend: {
                provider: 'morpho',
                defaultSlippage: 50,
              },
              wallet: {
                hostedWalletConfig: {
                  provider: {
                    type: 'privy',
                    config: {
                      privyClient: createMockPrivyClient(
                        'test-app-id',
                        'test-app-secret',
                      ),
                      authorizationContext: getMockAuthorizationContext(),
                    },
                  },
                },
                smartWalletConfig: {
                  provider: { type: 'default' },
                },
              },
            },
            {
              hostedWalletProviderRegistry:
                new TestHostedWalletProviderRegistry(),
            },
          )

          const networkIds = actions.lend.supportedChainIds()
          expect(Array.isArray(networkIds)).toBe(true)
          expect(networkIds).toContain(130) // Unichain
        },
      )
    })
  })

  describe('System Tests', () => {
    describe('Morpho Lend Provider Integration', () => {
      // Note: These are external tests that make real network requests
      // Run with: EXTERNAL_TEST=true pnpm test src/actions.test.ts
      it.runIf(externalTest())(
        'should fetch real vault info from Morpho on Unichain',
        async () => {
          // Create Actions instance with Morpho lending configured
          const actions = new Actions<
            TestWalletProvider['providerTypes'],
            TestWalletProvider,
            'privy'
          >(
            {
              chains: [
                {
                  chainId: unichain.id,
                },
              ],
              lend: {
                provider: 'morpho',
                defaultSlippage: 50,
              },
              wallet: {
                hostedWalletConfig: {
                  provider: {
                    type: 'privy',
                    config: {
                      privyClient: createMockPrivyClient(
                        'test-app-id',
                        'test-app-secret',
                      ),
                      authorizationContext: getMockAuthorizationContext(),
                    },
                  },
                },
                smartWalletConfig: {
                  provider: {
                    type: 'default',
                  },
                },
              },
            },
            {
              hostedWalletProviderRegistry:
                new TestHostedWalletProviderRegistry(),
            },
          )

          // Test the Gauntlet USDC vault
          const vaultAddress = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'

          // This will make an actual network request to fetch vault data
          const vaultInfo = await actions.lend.getMarket({
            address: vaultAddress,
            chainId: 130,
          })

          // Verify the vault info structure
          expect(vaultInfo.marketId.address).toBe(vaultAddress)
          expect(vaultInfo).toHaveProperty('name')
          expect(vaultInfo).toHaveProperty('asset')
          expect(vaultInfo).toHaveProperty('supply')
          expect(vaultInfo).toHaveProperty('apy')
          expect(vaultInfo).toHaveProperty('metadata')

          // Verify the data types
          expect(typeof vaultInfo.apy.total).toBe('number')
          expect(typeof vaultInfo.metadata.fee).toBe('number')
          expect(typeof vaultInfo.supply.totalAssets).toBe('bigint')
          expect(typeof vaultInfo.supply.totalShares).toBe('bigint')

          // Verify reasonable values
          expect(vaultInfo.apy.total).toBeGreaterThanOrEqual(0)
          expect(vaultInfo.metadata.fee).toBeGreaterThanOrEqual(0)
          expect(vaultInfo.supply.totalAssets).toBeGreaterThanOrEqual(0n)
          expect(vaultInfo.supply.totalShares).toBeGreaterThanOrEqual(0n)

          // Log the actual values for manual verification
          // eslint-disable-next-line no-console
          console.log('Vault Info:', {
            address: vaultInfo.marketId.address,
            name: vaultInfo.name,
            apy: `${(vaultInfo.apy.total * 100).toFixed(2)}%`,
            totalAssets: vaultInfo.supply.totalAssets.toString(),
            fee: `${vaultInfo.metadata.fee}%`,
            owner: vaultInfo.metadata.owner,
            curator: vaultInfo.metadata.curator,
          })
        },
        30000,
      ) // 30 second timeout for network request

      it.runIf(externalTest())(
        'should fetch vault info with enhanced rewards data',
        async () => {
          const actions = new Actions<
            TestWalletProvider['providerTypes'],
            TestWalletProvider,
            'privy'
          >(
            {
              chains: [
                {
                  chainId: unichain.id,
                },
              ],
              lend: {
                provider: 'morpho',
                defaultSlippage: 50,
              },
              wallet: {
                hostedWalletConfig: {
                  provider: {
                    type: 'privy',
                    config: {
                      privyClient: createMockPrivyClient(
                        'test-app-id',
                        'test-app-secret',
                      ),
                      authorizationContext: getMockAuthorizationContext(),
                    },
                  },
                },
                smartWalletConfig: {
                  provider: {
                    type: 'default',
                  },
                },
              },
            },
            {
              hostedWalletProviderRegistry:
                new TestHostedWalletProviderRegistry(),
            },
          )

          const vaultAddress = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'
          const vaultInfo = await actions.lend.getMarket({
            address: vaultAddress,
            chainId: 130,
          })

          expect(vaultInfo).toBeDefined()
          expect(vaultInfo.marketId.address).toBe(vaultAddress)
          expect(vaultInfo.name).toBe('Gauntlet USDC')
          expect(typeof vaultInfo.apy.total).toBe('number')
          expect(typeof vaultInfo.supply.totalAssets).toBe('bigint')
          expect(typeof vaultInfo.metadata.fee).toBe('number')

          // Enhanced APY should be higher than base APY due to rewards
          expect(vaultInfo.apy.total).toBeGreaterThan(0.03) // Should be > 3% with rewards
        },
        30000,
      ) // 30 second timeout for network request

      it.runIf(externalTest())(
        'should handle non-existent vault gracefully',
        async () => {
          const actions = new Actions<
            TestWalletProvider['providerTypes'],
            TestWalletProvider,
            'privy'
          >(
            {
              chains: [
                {
                  chainId: unichain.id,
                },
              ],
              lend: {
                provider: 'morpho',
                defaultSlippage: 50,
              },
              wallet: {
                hostedWalletConfig: {
                  provider: {
                    type: 'privy',
                    config: {
                      privyClient: createMockPrivyClient(
                        'test-app-id',
                        'test-app-secret',
                      ),
                      authorizationContext: getMockAuthorizationContext(),
                    },
                  },
                },
                smartWalletConfig: {
                  provider: {
                    type: 'default',
                  },
                },
              },
            },
            {
              hostedWalletProviderRegistry:
                new TestHostedWalletProviderRegistry(),
            },
          )

          const invalidVaultAddress =
            '0x0000000000000000000000000000000000000000'

          await expect(
            actions.lend.getMarket({
              address: invalidVaultAddress,
              chainId: 130,
            }),
          ).rejects.toThrow(`Vault ${invalidVaultAddress} not found`)
        },
      )

      it.runIf(externalTest())('should get list of vaults', async () => {
        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [
              {
                chainId: unichain.id,
              },
            ],
            lend: {
              provider: 'morpho',
              defaultSlippage: 50,
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-app-id',
                      'test-app-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: {
                  type: 'default',
                },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        const invalidVaultAddress = '0x0000000000000000000000000000000000000000'

        await expect(
          actions.lend.getMarket({
            address: invalidVaultAddress,
            chainId: 130,
          }),
        ).rejects.toThrow(`Vault ${invalidVaultAddress} not found`)
      })

      it.runIf(externalTest())('should get list of vaults', async () => {
        const actions = new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [
              {
                chainId: unichain.id,
              },
            ],
            lend: {
              provider: 'morpho',
              defaultSlippage: 50,
            },
            wallet: {
              hostedWalletConfig: {
                provider: {
                  type: 'privy',
                  config: {
                    privyClient: createMockPrivyClient(
                      'test-app-id',
                      'test-app-secret',
                    ),
                    authorizationContext: getMockAuthorizationContext(),
                  },
                },
              },
              smartWalletConfig: {
                provider: {
                  type: 'default',
                },
              },
            },
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        )

        const markets = await actions.lend.getMarkets()

        expect(Array.isArray(markets)).toBe(true)
        expect(markets.length).toBeGreaterThan(0)

        // Check first market has expected structure
        const firstMarket = markets[0]
        expect(firstMarket).toHaveProperty('address')
        expect(firstMarket).toHaveProperty('name')
        expect(firstMarket).toHaveProperty('apy')
        expect(typeof firstMarket.apy).toBe('number')
      })
    })
  })
})
