import type { Address } from 'viem'
import { type MockedFunction, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
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
  SwapQuote,
  SwapQuoteParams,
  SwapTransaction,
} from '@/types/swap/index.js'

export interface MockSwapProviderConfig {
  supportedChains: SupportedChainId[]
  defaultPrice: number
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
  public mockGetQuote: MockedFunction<
    (params: SwapQuoteParams) => Promise<SwapQuote>
  >
  public mockExecuteFromQuote: MockedFunction<
    (quote: SwapQuote) => Promise<SwapTransaction>
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
      chainManager ||
        (new MockChainManager({
          supportedChains: [84532 as SupportedChainId],
        }) as unknown as ChainManager),
    )

    this._supportedChains = mockConfig?.supportedChains ?? [
      84532 as SupportedChainId,
    ]
    this.mockProviderConfig = {
      supportedChains: this._supportedChains,
      defaultPrice: mockConfig?.defaultPrice ?? 1.5,
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
    this.mockGetQuote = vi
      .fn()
      .mockImplementation(this.createMockQuote.bind(this))
    this.mockExecuteFromQuote = vi
      .fn()
      .mockImplementation((quote: SwapQuote) =>
        this.createMockSwapTransactionFromQuote(quote),
      )
    this.mockGetMarket = vi
      .fn()
      .mockImplementation(this.createMockMarket.bind(this))
    this.mockGetMarkets = vi
      .fn()
      .mockImplementation(this.createMockMarkets.bind(this))
  }

  protocolSupportedChainIds(): SupportedChainId[] {
    return this._supportedChains
  }

  reset(): void {
    vi.clearAllMocks()
  }

  // Expose protected methods for testing
  public testValidateMarketAllowed(
    assetIn: Asset,
    assetOut: Asset,
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

  protected async _getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    return this.mockGetQuote(params)
  }

  protected async _executeFromQuote(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
    return this.mockExecuteFromQuote(quote)
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
    const amountIn = params.amountInRaw ?? 1000000n
    const amountOut = 1500000000000000000n

    return {
      amountIn: 1.0,
      amountOut: 1.5,
      amountInRaw: amountIn,
      amountOutRaw: amountOut,
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
      price: String(this.mockProviderConfig.defaultPrice),
      priceInverse: String(1 / this.mockProviderConfig.defaultPrice),
      amountIn: 1.0,
      amountOut: 1.5,
      amountInRaw: amountIn,
      amountOutRaw: amountOut,
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

  private createMockQuote(params: SwapQuoteParams): SwapQuote {
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + 60
    const slippage = params.slippage ?? 0.005
    const amountIn = params.amountIn ?? 1.0
    const amountOut = amountIn * this.mockProviderConfig.defaultPrice
    const amountInRaw = BigInt(
      Math.floor(amountIn * 10 ** params.assetIn.metadata.decimals),
    )
    const amountOutRaw = BigInt(
      Math.floor(amountOut * 10 ** params.assetOut.metadata.decimals),
    )
    const amountOutMinRaw =
      (amountOutRaw * BigInt(Math.round((1 - slippage) * 10000))) / 10000n

    return {
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      chainId: params.chainId,
      amountIn,
      amountInRaw,
      amountOut,
      amountOutRaw,
      amountOutMin: amountOut * (1 - slippage),
      amountOutMinRaw,
      price: this.mockProviderConfig.defaultPrice,
      priceInverse: 1 / this.mockProviderConfig.defaultPrice,
      priceImpact: this.mockProviderConfig.defaultPriceImpact,
      route: {
        path: [params.assetIn, params.assetOut],
        pools: [{ address: '0x1234' as Address, fee: 500, version: 'v4' }],
      },
      execution: {
        swapCalldata: '0x1234' as `0x${string}`,
        routerAddress: '0x492e6456d9528771018deb9e87ef7750ef184104' as Address,
        value: 0n,
      },
      provider: this.mockProviderConfig.provider,
      slippage,
      deadline,
      quotedAt: now,
      expiresAt: deadline,
      gasEstimate: 150000n,
    }
  }

  private createMockSwapTransactionFromQuote(
    quote: SwapQuote,
  ): SwapTransaction {
    return {
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      amountInRaw: quote.amountInRaw,
      amountOutRaw: quote.amountOutRaw,
      assetIn: quote.assetIn,
      assetOut: quote.assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: {
        swap: {
          to: quote.execution.routerAddress,
          data: quote.execution.swapCalldata,
          value: quote.execution.value,
        },
      },
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
