import type { Address } from 'viem'
import { type MockedFunction, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapMarket,
  SwapPrice,
  SwapPriceParams,
  SwapProviderConfig,
  SwapTransaction,
} from '@/types/swap/index.js'

export interface MockSwapProviderConfig {
  supportedChains: SupportedChainId[]
  defaultPrice: string
  defaultPriceImpact: number
  provider: 'uniswap' | 'velodrome'
}

/**
 * Mock Swap Provider for testing
 */
export class MockSwapProvider extends SwapProvider<SwapProviderConfig> {
  public mockExecute: MockedFunction<
    (params: ResolvedSwapParams) => Promise<SwapTransaction>
  >
  public mockGetPrice: MockedFunction<
    (params: SwapPriceParams) => Promise<SwapPrice>
  >
  public mockGetMarket: MockedFunction<
    (params: GetSwapMarketParams) => Promise<SwapMarket>
  >
  public mockGetMarkets: MockedFunction<
    (params: GetSwapMarketsParams) => Promise<SwapMarket[]>
  >

  private _supportedChains: SupportedChainId[]
  private mockProviderConfig: MockSwapProviderConfig

  constructor(
    config?: SwapProviderConfig,
    mockConfig?: Partial<MockSwapProviderConfig>,
    chainManager?: ChainManager,
  ) {
    super(
      config || {},
      chainManager || (new MockChainManager() as unknown as ChainManager),
    )

    this._supportedChains = mockConfig?.supportedChains ?? [
      84532 as SupportedChainId,
    ]
    this.mockProviderConfig = {
      supportedChains: this._supportedChains,
      defaultPrice: mockConfig?.defaultPrice ?? '1.5',
      defaultPriceImpact: mockConfig?.defaultPriceImpact ?? 0.001,
      provider: mockConfig?.provider ?? 'uniswap',
    }

    // Create mocked functions
    this.mockExecute = vi
      .fn()
      .mockImplementation(this.createMockSwapTransaction.bind(this))
    this.mockGetPrice = vi
      .fn()
      .mockImplementation(this.createMockPrice.bind(this))
    this.mockGetMarket = vi
      .fn()
      .mockImplementation(this.createMockMarket.bind(this))
    this.mockGetMarkets = vi
      .fn()
      .mockImplementation(this.createMockMarkets.bind(this))
  }

  supportedChainIds(): SupportedChainId[] {
    return this._supportedChains
  }

  reset(): void {
    vi.clearAllMocks()
  }

  // Expose protected methods for testing
  public testValidateMarketAllowed(
    assetIn: any,
    assetOut: any,
    chainId: SupportedChainId,
  ): void {
    return this.validateMarketAllowed(assetIn, assetOut, chainId)
  }

  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    return this.mockExecute(params)
  }

  protected async _getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    return this.mockGetPrice(params)
  }

  protected async _getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    return this.mockGetMarket(params)
  }

  protected async _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]> {
    return this.mockGetMarkets(params)
  }

  private createMockSwapTransaction(
    params: ResolvedSwapParams,
  ): SwapTransaction {
    const amountIn = params.amountInWei ?? 1000000n
    const amountOut = 1500000000000000000n

    return {
      amountIn: 1.0,
      amountOut: 1.5,
      amountInWei: amountIn,
      amountOutWei: amountOut,
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      price: this.mockProviderConfig.defaultPrice,
      priceImpact: this.mockProviderConfig.defaultPriceImpact,
      transactionData: {
        swap: {
          to: '0x492e6456d9528771018deb9e87ef7750ef184104' as Address,
          data: '0x1234' as `0x${string}`,
          value: 0n,
        },
      },
    }
  }

  private createMockPrice(params: SwapPriceParams): SwapPrice {
    const amountIn =
      params.amountIn !== undefined
        ? BigInt(
            Math.floor(
              params.amountIn * 10 ** params.assetIn.metadata.decimals,
            ),
          )
        : BigInt(10 ** params.assetIn.metadata.decimals)

    const amountOut = (amountIn * 15n) / 10n

    return {
      price: this.mockProviderConfig.defaultPrice,
      priceInverse: '0.666666',
      amountIn: 1.0,
      amountOut: 1.5,
      amountInWei: amountIn,
      amountOutWei: amountOut,
      priceImpact: this.mockProviderConfig.defaultPriceImpact,
      route: {
        path: [params.assetIn, params.assetOut!],
        pools: [
          {
            address: '0x1234' as Address,
            fee: 500,
            version: 'v4',
          },
        ],
      },
      gasEstimate: 150000n,
    }
  }

  private createMockMarket(params: GetSwapMarketParams): SwapMarket {
    return {
      marketId: {
        poolId: params.poolId,
        chainId: params.chainId,
      },
      assets: [
        {
          type: 'erc20',
          address: { [params.chainId]: '0x1111' as Address },
          metadata: { name: 'USDC', symbol: 'USDC', decimals: 6 },
        },
        {
          type: 'erc20',
          address: { [params.chainId]: '0x2222' as Address },
          metadata: { name: 'WETH', symbol: 'WETH', decimals: 18 },
        },
      ],
      fee: 500,
      provider: this.mockProviderConfig.provider,
    }
  }

  private createMockMarkets(_params: GetSwapMarketsParams): SwapMarket[] {
    return [
      this.createMockMarket({
        poolId: '0xpool1',
        chainId: 84532 as SupportedChainId,
      }),
    ]
  }
}

/**
 * Create a mock swap provider
 */
export function createMockSwapProvider(
  config?: SwapProviderConfig,
  mockConfig?: Partial<MockSwapProviderConfig>,
): MockSwapProvider {
  return new MockSwapProvider(config, mockConfig)
}
