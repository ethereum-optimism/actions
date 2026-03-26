import type { Address } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import {
  createMockPrivyClient,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { Actions } from '@/actions.js'
import {
  NATIVELY_SUPPORTED_ASSETS,
  OP_DEMO,
  USDC_DEMO,
} from '@/constants/assets.js'
import {
  POOL_ADDRESSES_MAINNET,
  POOL_ADDRESSES_TESTNET,
  WETH_GATEWAY_ADDRESSES_MAINNET,
  WETH_GATEWAY_ADDRESSES_TESTNET,
} from '@/lend/providers/aave/addresses.js'
import { MORPHO_CONTRACTS } from '@/lend/providers/morpho/contracts.js'
import { UNISWAP_ADDRESSES } from '@/swap/providers/uniswap/addresses.js'
import type { Asset } from '@/types/asset.js'
import type { LendMarketConfig } from '@/types/lend/index.js'
import {
  validateAddressMap,
  validateAssetAddresses,
  validateConfigAddresses,
} from '@/utils/validateAddresses.js'
import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type { HostedWalletProvidersSchema } from '@/wallet/core/providers/hosted/types/index.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type {
  NodeOptionsMap,
  NodeToActionsOptionsMap,
} from '@/wallet/node/providers/hosted/types/index.js'

const VALID_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const VALID_ADDRESS_2 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const INVALID_ADDRESS = '0xabc' as Address
const INVALID_ADDRESS_2 = '0xdeadbeef' as Address

describe('validateAddressMap', () => {
  it('throws when any address in the map is malformed, listing the bad address, key name, and chain ID', () => {
    const map = {
      10: { poolAddress: INVALID_ADDRESS },
    }
    expect(() => validateAddressMap(map)).toThrow(/poolAddress\[10\]/)
    expect(() => validateAddressMap(map)).toThrow(INVALID_ADDRESS)
  })

  it('collects multiple failures and throws once with all of them listed', () => {
    const map = {
      10: { poolAddress: INVALID_ADDRESS },
      8453: { rewardAddress: INVALID_ADDRESS_2 },
    }
    let err: Error | undefined
    try {
      validateAddressMap(map)
    } catch (e) {
      err = e as Error
    }
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/poolAddress\[10\]/)
    expect(err!.message).toMatch(/rewardAddress\[8453\]/)
  })

  it('passes for valid checksummed addresses', () => {
    const map = {
      10: { poolAddress: VALID_ADDRESS },
      8453: { rewardAddress: VALID_ADDRESS_2 },
    }
    expect(() => validateAddressMap(map)).not.toThrow()
  })

  it('passes for valid lowercase (non-checksummed) addresses', () => {
    const map = {
      10: { poolAddress: VALID_ADDRESS.toLowerCase() as Address },
    }
    expect(() => validateAddressMap(map)).not.toThrow()
  })

  it('returns the original map reference on success', () => {
    const map = { 10: { poolAddress: VALID_ADDRESS } }
    expect(validateAddressMap(map)).toBe(map)
  })

  it('handles simple Record<number, Address> values', () => {
    const map: Record<number, Address> = { 10: INVALID_ADDRESS }
    expect(() => validateAddressMap(map)).toThrow(/\[10\]/)
  })
})

describe('validateAssetAddresses', () => {
  it("skips 'native' entries without throwing", () => {
    const map = { 1: 'native' as const, 10: 'native' as const }
    expect(() => validateAssetAddresses(map)).not.toThrow()
  })

  it('throws with location info for invalid non-native addresses', () => {
    const map = { 10: INVALID_ADDRESS }
    expect(() => validateAssetAddresses(map)).toThrow(/\[10\]/)
    expect(() => validateAssetAddresses(map)).toThrow(INVALID_ADDRESS)
  })

  it('collects multiple failures before throwing', () => {
    const map = { 10: INVALID_ADDRESS, 8453: INVALID_ADDRESS_2 }
    let err: Error | undefined
    try {
      validateAssetAddresses(map)
    } catch (e) {
      err = e as Error
    }
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/\[10\]/)
    expect(err!.message).toMatch(/\[8453\]/)
  })

  it('passes for valid addresses and skips native', () => {
    const map = { 1: 'native' as const, 10: VALID_ADDRESS }
    expect(() => validateAssetAddresses(map)).not.toThrow()
  })

  it('passes for valid addresses', () => {
    const map = { 10: VALID_ADDRESS }
    expect(() => validateAssetAddresses(map)).not.toThrow()
  })
})

describe('validateConfigAddresses', () => {
  const validMarket: LendMarketConfig = {
    address: VALID_ADDRESS,
    chainId: unichain.id,
    name: 'Valid Market',
    asset: {
      address: { [unichain.id]: VALID_ADDRESS_2 },
      metadata: { decimals: 18, name: 'WETH', symbol: 'WETH' },
      type: 'erc20',
    },
    lendProvider: 'morpho',
  }

  const invalidMarketAddress: LendMarketConfig = {
    ...validMarket,
    address: INVALID_ADDRESS,
  }

  const invalidAssetAddress: LendMarketConfig = {
    ...validMarket,
    asset: {
      ...validMarket.asset,
      address: { [unichain.id]: INVALID_ADDRESS },
    },
  }

  const validAsset: Asset = {
    address: { [unichain.id]: VALID_ADDRESS },
    metadata: { decimals: 6, name: 'USDC', symbol: 'USDC' },
    type: 'erc20',
  }

  const invalidAsset: Asset = {
    address: { [unichain.id]: INVALID_ADDRESS },
    metadata: { decimals: 6, name: 'USDC', symbol: 'USDC' },
    type: 'erc20',
  }

  it('throws with a descriptive message when a bad address appears in marketAllowlist', () => {
    expect(() =>
      validateConfigAddresses({
        lend: { morpho: { marketAllowlist: [invalidMarketAddress] } },
      }),
    ).toThrow(/lend\.morpho\.marketAllowlist/)
  })

  it('throws with a descriptive message when a bad address appears in marketBlocklist', () => {
    expect(() =>
      validateConfigAddresses({
        lend: { morpho: { marketBlocklist: [invalidMarketAddress] } },
      }),
    ).toThrow(/lend\.morpho\.marketBlocklist/)
  })

  it('throws with a descriptive message when a bad address appears in assets.allow', () => {
    expect(() =>
      validateConfigAddresses({ assets: { allow: [invalidAsset] } }),
    ).toThrow(/assets\.allow/)
  })

  it('throws with a descriptive message when a bad address appears in assets.block', () => {
    expect(() =>
      validateConfigAddresses({ assets: { block: [invalidAsset] } }),
    ).toThrow(/assets\.block/)
  })

  it('throws with a descriptive message when a bad address appears in lend.aave.marketAllowlist', () => {
    expect(() =>
      validateConfigAddresses({
        lend: {
          aave: {
            marketAllowlist: [
              { ...invalidMarketAddress, lendProvider: 'aave' },
            ],
          },
        },
      }),
    ).toThrow(/lend\.aave\.marketAllowlist/)
  })

  it('throws with a descriptive message when a bad address appears in lend.aave.marketBlocklist', () => {
    expect(() =>
      validateConfigAddresses({
        lend: {
          aave: {
            marketBlocklist: [
              { ...invalidMarketAddress, lendProvider: 'aave' },
            ],
          },
        },
      }),
    ).toThrow(/lend\.aave\.marketBlocklist/)
  })

  it('throws with a descriptive message when a bad address appears in swap.uniswap.marketAllowlist', () => {
    expect(() =>
      validateConfigAddresses({
        swap: {
          uniswap: {
            marketAllowlist: [{ assets: [invalidAsset, validAsset] }],
          },
        },
      }),
    ).toThrow(/swap\.uniswap\.marketAllowlist/)
  })

  it('throws with a descriptive message when a bad address appears in swap.uniswap.marketBlocklist', () => {
    expect(() =>
      validateConfigAddresses({
        swap: {
          uniswap: {
            marketBlocklist: [{ assets: [invalidAsset, validAsset] }],
          },
        },
      }),
    ).toThrow(/swap\.uniswap\.marketBlocklist/)
  })

  it('collects failures across multiple config sections and throws once with all of them', () => {
    let err: Error | undefined
    try {
      validateConfigAddresses({
        lend: {
          morpho: {
            marketAllowlist: [invalidMarketAddress],
            marketBlocklist: [invalidAssetAddress],
          },
        },
        assets: { allow: [invalidAsset] },
      })
    } catch (e) {
      err = e as Error
    }
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/lend\.morpho\.marketAllowlist/)
    expect(err!.message).toMatch(/lend\.morpho\.marketBlocklist/)
    expect(err!.message).toMatch(/assets\.allow/)
  })

  it('returns void (no throw) when all addresses are valid', () => {
    expect(() =>
      validateConfigAddresses({
        lend: { morpho: { marketAllowlist: [validMarket] } },
        assets: { allow: [validAsset] },
      }),
    ).not.toThrow()
  })
})

describe('hardcoded address maps contain valid EVM addresses', () => {
  it('all hardcoded address maps contain valid EVM addresses', () => {
    expect(() => validateAddressMap(POOL_ADDRESSES_MAINNET)).not.toThrow()
    expect(() => validateAddressMap(POOL_ADDRESSES_TESTNET)).not.toThrow()
    expect(() =>
      validateAddressMap(WETH_GATEWAY_ADDRESSES_MAINNET),
    ).not.toThrow()
    expect(() =>
      validateAddressMap(WETH_GATEWAY_ADDRESSES_TESTNET),
    ).not.toThrow()
    expect(() =>
      validateAddressMap(
        MORPHO_CONTRACTS as unknown as Record<number, Record<string, Address>>,
      ),
    ).not.toThrow()
    expect(() =>
      validateAddressMap(
        UNISWAP_ADDRESSES as Record<number, Record<string, Address>>,
      ),
    ).not.toThrow()
  })

  it('all hardcoded asset address maps contain valid EVM addresses', () => {
    for (const asset of NATIVELY_SUPPORTED_ASSETS) {
      expect(() => validateAssetAddresses(asset.address)).not.toThrow()
    }
    expect(() => validateAssetAddresses(USDC_DEMO.address)).not.toThrow()
    expect(() => validateAssetAddresses(OP_DEMO.address)).not.toThrow()
  })
})

describe('Actions constructor address validation', () => {
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
          return Boolean((options as NodeOptionsMap['privy'])?.privyClient)
        },
        create({ chainManager }, options) {
          return new PrivyHostedWalletProvider({
            privyClient: options.privyClient,
            chainManager,
            authorizationContext: options.authorizationContext,
          })
        },
      })
    }
  }

  const baseWalletConfig = {
    hostedWalletConfig: {
      provider: {
        type: 'privy' as const,
        config: {
          privyClient: createMockPrivyClient('test-id', 'test-secret'),
          authorizationContext: getMockAuthorizationContext(),
        },
      },
    },
    smartWalletConfig: { provider: { type: 'default' as const } },
  }

  it('throws on construction when ActionsConfig contains an invalid address', () => {
    expect(
      () =>
        new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            lend: {
              morpho: {
                marketAllowlist: [
                  {
                    address: '0xbad' as Address,
                    chainId: unichain.id,
                    name: 'Bad Market',
                    asset: {
                      address: { [unichain.id]: VALID_ADDRESS },
                      metadata: { decimals: 18, name: 'WETH', symbol: 'WETH' },
                      type: 'erc20',
                    },
                    lendProvider: 'morpho',
                  },
                ],
              },
            },
            wallet: baseWalletConfig,
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        ),
    ).toThrow(/Invalid addresses found/)
  })

  it('constructs successfully when all addresses are valid', () => {
    expect(
      () =>
        new Actions<
          TestWalletProvider['providerTypes'],
          TestWalletProvider,
          'privy'
        >(
          {
            chains: [{ chainId: unichain.id }],
            lend: {
              morpho: {
                marketAllowlist: [
                  {
                    address: VALID_ADDRESS,
                    chainId: unichain.id,
                    name: 'Valid Market',
                    asset: {
                      address: { [unichain.id]: VALID_ADDRESS_2 },
                      metadata: { decimals: 18, name: 'WETH', symbol: 'WETH' },
                      type: 'erc20',
                    },
                    lendProvider: 'morpho',
                  },
                ],
              },
            },
            wallet: baseWalletConfig,
          },
          {
            hostedWalletProviderRegistry:
              new TestHostedWalletProviderRegistry(),
          },
        ),
    ).not.toThrow()
  })
})
