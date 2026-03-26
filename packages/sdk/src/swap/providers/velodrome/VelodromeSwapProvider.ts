import type { Address, Hex } from 'viem'
import { concat, encodeFunctionData, formatUnits, keccak256 } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import {
  ERC20_ALLOWANCE_ABI,
  ERC20_APPROVE_ABI,
} from '@/swap/providers/velodrome/abis.js'
import {
  getSupportedChainIds,
  getVelodromeConfig,
} from '@/swap/providers/velodrome/addresses.js'
import {
  encodeCLSwap,
  encodeSwap,
  getCLQuote,
  getQuote,
} from '@/swap/providers/velodrome/encoding.js'
import type {
  ResolvedPoolConfig,
  VelodromeMarketConfig,
  VelodromeSwapProviderConfig,
} from '@/swap/providers/velodrome/types.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapMarket,
  SwapPrice,
  SwapQuote,
  SwapQuoteParams,
  SwapTransaction,
} from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  getAssetAddress,
  isNativeAsset,
  parseAssetAmount,
} from '@/utils/assets.js'

/**
 * Velodrome/Aerodrome swap provider for OP Stack chains.
 * Supports v2 AMM pools, CL/Slipstream concentrated liquidity pools,
 * v2 routers (Optimism, Base), leaf routers (Relay chains), and Universal Router (Base Sepolia).
 */
export class VelodromeSwapProvider extends SwapProvider<VelodromeSwapProviderConfig> {
  /** @returns Chain IDs where Velodrome/Aerodrome contracts are deployed */
  protocolSupportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  /**
   * Build a swap transaction from raw parameters.
   * Delegates to _getQuote then _executeFromQuote to avoid duplicating logic.
   * @param params - Resolved swap parameters (amounts as raw bigint, defaults applied)
   * @returns Transaction data ready for wallet execution
   * @throws If amountOut is provided (Velodrome only supports exact-input swaps)
   */
  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    if (params.amountOutRaw !== undefined) {
      throw new Error(
        'Velodrome/Aerodrome does not support exact-output swaps. Provide amountIn instead of amountOut.',
      )
    }

    const swapQuote = await this._getQuote({
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountIn: params.amountInRaw
        ? parseFloat(
            formatUnits(params.amountInRaw, params.assetIn.metadata.decimals),
          )
        : undefined,
      chainId: params.chainId,
      slippage: params.slippage,
      deadline: params.deadline,
      recipient: params.recipient,
    })
    return this._executeFromQuote(swapQuote)
  }

  /**
   * Find a specific market by poolId from the allowlist.
   * @param params - Pool ID and chain to look up
   * @returns Matching market
   * @throws If no matching market found in config
   */
  protected async _getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    const { poolId, chainId } = params

    for (const config of this.validConfigs()) {
      if (config.chainId !== undefined && config.chainId !== chainId) continue
      const match = this.marketsFromConfig(config, chainId).find(
        (m) => m.marketId.poolId === poolId,
      )
      if (match) return match
    }

    throw new Error(
      `Market with poolId ${poolId} not found on chain ${chainId}`,
    )
  }

  /**
   * Expand the market allowlist into concrete SwapMarket objects.
   * @param params - Optional filters (chainId, asset)
   * @returns All configured markets matching the filters
   */
  protected async _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]> {
    return this.validConfigs().flatMap((config) => {
      const chainIds = params.chainId
        ? [params.chainId]
        : config.chainId
          ? [config.chainId]
          : this.supportedChainIds()

      return chainIds.flatMap((chainId) =>
        this.marketsFromConfig(config, chainId, params.asset),
      )
    })
  }

  /**
   * Get a full swap quote with pricing, slippage bounds, and pre-built execution data.
   * Routes to v2 AMM or CL/Slipstream quoting based on the market config.
   * @param params - Quote parameters (assets, amounts, chain, slippage, deadline)
   * @returns SwapQuote with amounts, price, route, and encoded calldata
   * @throws If amountOut is provided (Velodrome only supports exact-input)
   * @throws If CL pool requested on a chain without CL factory/quoter
   */
  protected async _getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params

    if (params.amountOut !== undefined) {
      throw new Error(
        'Velodrome/Aerodrome does not support exact-output swaps. Provide amountIn instead of amountOut.',
      )
    }

    const chain = getVelodromeConfig(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const poolConfig = this.resolveVelodromeConfig(assetIn, assetOut, chainId)

    const amountInRaw = parseAssetAmount(assetIn, params.amountIn ?? 1)
    const slippage = params.slippage ?? this.defaultSlippage
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + this.quoteExpirationSeconds
    const recipient =
      params.recipient ?? '0x0000000000000000000000000000000000000001'

    // Get internal price quote and encode swap calldata
    let internalQuote: SwapPrice
    let swapCalldata: Hex
    let providerContext: Record<string, unknown>

    if (poolConfig.type === 'cl') {
      if (!chain.contracts.clPoolFactory || !chain.contracts.clQuoterV2) {
        throw new Error(`CL pools not supported on chain ${chainId}`)
      }

      internalQuote = await getCLQuote({
        assetIn,
        assetOut,
        amountInRaw,
        chainId,
        publicClient,
        clFactoryAddress: chain.contracts.clPoolFactory,
        clQuoterAddress: chain.contracts.clQuoterV2,
        tickSpacing: poolConfig.tickSpacing,
      })

      providerContext = {
        tickSpacing: poolConfig.tickSpacing,
        clFactoryAddress: chain.contracts.clPoolFactory,
        poolAddress: internalQuote.route.pools[0]?.address,
      }
    } else {
      internalQuote = await getQuote({
        assetIn,
        assetOut,
        amountInRaw,
        chainId,
        publicClient,
        routerAddress: chain.contracts.router,
        routerType: chain.metadata.routerType,
        stable: poolConfig.stable,
        factoryAddress: chain.contracts.poolFactory,
      })

      providerContext = {
        stable: poolConfig.stable,
        factoryAddress: chain.contracts.poolFactory,
        routerType: chain.metadata.routerType,
      }
    }

    // Slippage: computed once in bigint, used for both encoding and the SwapQuote return
    const amountOutMinRaw =
      (internalQuote.amountOutRaw *
        BigInt(Math.round((1 - slippage) * 10000))) /
      10000n
    const amountOutMin = parseFloat(
      formatUnits(amountOutMinRaw, assetOut.metadata.decimals),
    )

    if (poolConfig.type === 'cl') {
      swapCalldata = encodeCLSwap({
        assetIn,
        assetOut,
        amountInRaw,
        amountOutMin: amountOutMinRaw,
        tickSpacing: (poolConfig as { type: 'cl'; tickSpacing: number })
          .tickSpacing,
        recipient,
        deadline,
        chainId,
      })
    } else {
      swapCalldata = encodeSwap({
        assetIn,
        assetOut,
        amountInRaw,
        amountOutMin: amountOutMinRaw,
        routerType: chain.metadata.routerType,
        stable: (poolConfig as { type: 'v2'; stable: boolean }).stable,
        factoryAddress: chain.contracts.poolFactory,
        recipient,
        deadline,
        chainId,
      })
    }

    return {
      assetIn,
      assetOut,
      chainId,
      amountIn: internalQuote.amountIn,
      amountInRaw: amountInRaw,
      amountOut: internalQuote.amountOut,
      amountOutRaw: internalQuote.amountOutRaw,
      amountOutMin,
      amountOutMinRaw,
      price: internalQuote.amountOut / internalQuote.amountIn,
      priceInverse: internalQuote.amountIn / internalQuote.amountOut,
      priceImpact: internalQuote.priceImpact,
      route: internalQuote.route,
      execution: {
        swapCalldata,
        routerAddress: chain.contracts.router,
        value: isNativeAsset(assetIn) ? amountInRaw : 0n,
        providerContext,
      },
      provider: 'velodrome',
      slippage,
      deadline,
      quotedAt: now,
      expiresAt: deadline,
      gasEstimate: internalQuote.gasEstimate,
    }
  }

  /**
   * Execute a swap from a pre-built quote.
   * Uses the pre-encoded calldata from the quote but builds fresh token approval transactions.
   * For Universal Router: transfers tokens directly to the router (avoids Permit2 with 4337 batching).
   * For legacy routers: approves tokens directly to the router.
   * @param quote - A SwapQuote previously returned by _getQuote
   * @returns Transaction data with approvals and swap calldata
   */
  protected async _executeFromQuote(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut, execution } = quote
    const chain = getVelodromeConfig(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    let tokenApproval: TransactionData | undefined

    if (!isNativeAsset(assetIn)) {
      const token = getAssetAddress(assetIn, chainId)

      if (chain.metadata.routerType === 'universal') {
        tokenApproval = {
          to: token,
          data: encodeFunctionData({
            abi: [
              {
                name: 'transfer',
                type: 'function',
                stateMutability: 'nonpayable',
                inputs: [
                  { name: 'to', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
                outputs: [{ type: 'bool' }],
              },
            ] as const,
            functionName: 'transfer',
            args: [chain.contracts.router, quote.amountInRaw],
          }),
          value: 0n,
        }
      } else {
        const currentAllowance = await publicClient.readContract({
          address: token,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: 'allowance',
          // Use providerContext or a reasonable default for the owner address
          args: [
            '0x0000000000000000000000000000000000000001' as Address,
            chain.contracts.router,
          ],
        })

        if ((currentAllowance as bigint) < quote.amountInRaw) {
          tokenApproval = {
            to: token,
            data: encodeFunctionData({
              abi: ERC20_APPROVE_ABI,
              functionName: 'approve',
              args: [chain.contracts.router, quote.amountInRaw],
            }),
            value: 0n,
          }
        }
      }
    }

    const swapTx: TransactionData = {
      to: execution.routerAddress,
      data: execution.swapCalldata,
      value: execution.value,
    }

    return {
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      amountInRaw: quote.amountInRaw,
      amountOutRaw: quote.amountOutRaw,
      assetIn,
      assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: {
        tokenApproval,
        swap: swapTx,
      },
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve market config to a discriminated pool config.
   * @throws If pair not in allowlist, or has both/neither stable and tickSpacing
   */
  private resolveVelodromeConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): ResolvedPoolConfig {
    const config = this.resolveMarketConfig(assetIn, assetOut, chainId) as
      | VelodromeMarketConfig
      | undefined
    if (!config) {
      throw new Error(
        `No market config for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }
    return VelodromeSwapProvider.resolvePoolConfig(config)
  }

  /**
   * Resolve a VelodromeMarketConfig to a discriminated ResolvedPoolConfig.
   * Exactly one of stable or tickSpacing must be set.
   */
  private static resolvePoolConfig(
    config: VelodromeMarketConfig,
  ): ResolvedPoolConfig {
    const hasStable = config.stable !== undefined
    const hasTick = config.tickSpacing !== undefined
    if (hasStable && hasTick) {
      throw new Error(
        'stable and tickSpacing are mutually exclusive — set one, not both',
      )
    }
    if (!hasStable && !hasTick) {
      throw new Error(
        'Either stable (v2 AMM) or tickSpacing (CL) must be configured',
      )
    }
    if (hasTick) {
      return { type: 'cl', tickSpacing: config.tickSpacing! }
    }
    return { type: 'v2', stable: config.stable! }
  }

  /** @returns Allowlist entries that have either stable or tickSpacing set */
  private validConfigs(): VelodromeMarketConfig[] {
    return (this._config.marketAllowlist ?? []).filter(
      (f) => f.stable !== undefined || f.tickSpacing !== undefined,
    )
  }

  /**
   * Generate all SwapMarket objects from a single config entry on a given chain.
   */
  private marketsFromConfig(
    config: VelodromeMarketConfig,
    chainId: SupportedChainId,
    asset?: Asset,
  ): SwapMarket[] {
    const poolConfig = VelodromeSwapProvider.resolvePoolConfig(config)
    return this.assetPairs(config.assets, asset)
      .map(([a, b]) => this.configToMarket(a, b, chainId, poolConfig))
      .filter((m): m is SwapMarket => m !== null)
  }

  /**
   * Generate unique asset pairs, optionally scoped to pairs containing a required asset.
   * @param assets - Full list of assets from a market config
   * @param requiredAsset - If set, only pairs including this asset are returned
   */
  private assetPairs(
    assets: Asset[],
    requiredAsset?: Asset,
  ): Array<[Asset, Asset]> {
    return assets
      .flatMap((a, i) => assets.slice(i + 1).map((b): [Asset, Asset] => [a, b]))
      .filter(
        ([a, b]) =>
          !requiredAsset || a === requiredAsset || b === requiredAsset,
      )
  }

  /**
   * Build a SwapMarket from two assets and Velodrome pool parameters.
   * For v2: poolId = keccak256(sortedA, sortedB, stable)
   * For CL: poolId = keccak256(sortedA, sortedB, tickSpacing as int24)
   * @returns SwapMarket, or null if either asset lacks an address on this chain
   */
  private configToMarket(
    assetA: Asset,
    assetB: Asset,
    chainId: SupportedChainId,
    poolConfig: ResolvedPoolConfig,
  ): SwapMarket | null {
    const addrA = assetA.address[chainId]
    const addrB = assetB.address[chainId]
    if (!addrA || addrA === 'native' || !addrB || addrB === 'native')
      return null

    const [sortedA, sortedB] =
      addrA.toLowerCase() < addrB.toLowerCase()
        ? [addrA, addrB]
        : [addrB, addrA]

    let poolId: string
    if (poolConfig.type === 'cl') {
      // CL pool: encode tickSpacing as int24 (3 bytes)
      const tickBytes =
        `0x${(poolConfig.tickSpacing & 0xffffff).toString(16).padStart(6, '0')}` as `0x${string}`
      poolId = keccak256(
        concat([sortedA as Address, sortedB as Address, tickBytes]),
      )
    } else {
      poolId = keccak256(
        concat([
          sortedA as Address,
          sortedB as Address,
          poolConfig.stable ? '0x01' : '0x00',
        ]),
      )
    }

    return {
      marketId: { poolId, chainId },
      assets: [assetA, assetB],
      fee: 0,
      provider: 'velodrome' as SwapMarket['provider'],
    }
  }
}
