import type { Address } from 'viem'
import { concat, encodeFunctionData, formatUnits, keccak256 } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import {
  ERC20_ALLOWANCE_ABI,
  ERC20_APPROVE_ABI,
} from '@/swap/providers/velodrome/abis.js'
import {
  getSupportedChainIds,
  getVelodromeAddresses,
} from '@/swap/providers/velodrome/addresses.js'
import { encodeSwap, getQuote } from '@/swap/providers/velodrome/encoding.js'
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
  SwapPriceParams,
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
 * Supports v2 routers (Optimism, Base) and leaf routers (Relay chains).
 */
export class VelodromeSwapProvider extends SwapProvider<VelodromeSwapProviderConfig> {
  /** @returns Chain IDs where Velodrome/Aerodrome contracts are deployed */
  supportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  /**
   * Build a swap transaction with quote, calldata, and any required approvals.
   * Velodrome/Aerodrome only supports exact-input swaps.
   * @param params - Resolved swap parameters (amounts in wei, defaults applied)
   * @returns Transaction data ready for wallet execution
   */
  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    if (params.amountOutWei !== undefined) {
      throw new Error(
        'Velodrome/Aerodrome does not support exact-output swaps. Provide amountIn instead of amountOut.',
      )
    }

    const { chainId, assetIn, assetOut } = params
    const addresses = getVelodromeAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const poolConfig = this.resolveVelodromeConfig(assetIn, assetOut, chainId)

    if (poolConfig.type === 'cl') {
      throw new Error(
        'CL pool execution not yet supported via _execute. Use getQuote() + execute(quote) instead.',
      )
    }

    const amountInWei = params.amountInWei!

    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInWei,
      chainId,
      publicClient,
      routerAddress: addresses.router,
      routerType: addresses.routerType,
      stable: poolConfig.stable,
      factoryAddress: addresses.poolFactory,
    })

    const amountOutMin =
      (quote.amountOutWei * BigInt(Math.round((1 - params.slippage) * 10000))) /
      10000n

    const swapCalldata = encodeSwap({
      assetIn,
      assetOut,
      amountInWei,
      amountOutMin,
      routerType: addresses.routerType,
      stable: poolConfig.stable,
      factoryAddress: addresses.poolFactory,
      recipient: params.recipient,
      deadline: params.deadline,
      chainId,
    })

    // For the Universal Router: transfer tokens directly to the router before the swap.
    // The swap uses payerIsUser=false (router's own balance), avoiding Permit2 pull
    // complexity with 4337 batched transactions.
    // For legacy routers: approve tokens directly to the router.
    let tokenApproval: TransactionData | undefined

    if (!isNativeAsset(assetIn)) {
      const token = getAssetAddress(assetIn, chainId)

      if (addresses.routerType === 'universal') {
        // Transfer tokens to the Universal Router — it will use its own balance
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
            args: [addresses.router, amountInWei],
          }),
          value: 0n,
        }
      } else {
        const currentAllowance = await publicClient.readContract({
          address: token,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: 'allowance',
          args: [params.walletAddress, addresses.router],
        })

        if ((currentAllowance as bigint) < amountInWei) {
          tokenApproval = {
            to: token,
            data: encodeFunctionData({
              abi: ERC20_APPROVE_ABI,
              functionName: 'approve',
              args: [addresses.router, amountInWei],
            }),
            value: 0n,
          }
        }
      }
    }

    const swapTx: TransactionData = {
      to: addresses.router,
      data: swapCalldata,
      value: isNativeAsset(assetIn) ? amountInWei : 0n,
    }

    return {
      amountIn: parseFloat(formatUnits(amountInWei, assetIn.metadata.decimals)),
      amountOut: parseFloat(
        formatUnits(quote.amountOutWei, assetOut.metadata.decimals),
      ),
      amountInWei,
      amountOutWei: quote.amountOutWei,
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

  /**
   * Get a price quote for a swap pair.
   * @param params - Price query with assets, optional amounts, and chain
   * @returns Quote with price, amounts, and route
   */
  protected async _getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    const { chainId, assetIn, assetOut } = params

    if (!assetOut) {
      throw new Error('assetOut is required')
    }

    if (params.amountOut !== undefined) {
      throw new Error(
        'Velodrome/Aerodrome does not support exact-output swaps. Provide amountIn instead of amountOut.',
      )
    }

    const addresses = getVelodromeAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const poolConfig = this.resolveVelodromeConfig(assetIn, assetOut, chainId)

    if (poolConfig.type === 'cl') {
      throw new Error(
        'CL pool pricing not yet supported via _getPrice. Use getQuote() instead.',
      )
    }

    // Default to 1 unit for price quotes when no amount specified
    const amountInWei = parseAssetAmount(assetIn, params.amountIn ?? 1)

    return getQuote({
      assetIn,
      assetOut,
      amountInWei,
      chainId,
      publicClient,
      routerAddress: addresses.router,
      routerType: addresses.routerType,
      stable: poolConfig.stable,
      factoryAddress: addresses.poolFactory,
    })
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
   * Derives poolId from each asset pair's sorted addresses and stable flag.
   * @param params - Optional chain and asset filters
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
   * Get a full swap quote with pre-built execution data.
   * Combines quoting + encoding into a single call.
   */
  protected async _getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params

    if (params.amountOut !== undefined) {
      throw new Error(
        'Velodrome/Aerodrome does not support exact-output swaps. Provide amountIn instead of amountOut.',
      )
    }

    const addresses = getVelodromeAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const poolConfig = this.resolveVelodromeConfig(assetIn, assetOut, chainId)

    if (poolConfig.type === 'cl') {
      throw new Error(
        'CL pool quoting not yet supported. CL encoding coming in a future commit.',
      )
    }

    const amountInWei = parseAssetAmount(assetIn, params.amountIn ?? 1)
    const slippage = params.slippage ?? this.defaultSlippage
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + 60

    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInWei,
      chainId,
      publicClient,
      routerAddress: addresses.router,
      routerType: addresses.routerType,
      stable: poolConfig.stable,
      factoryAddress: addresses.poolFactory,
    })

    const amountOutMinWei =
      (quote.amountOutWei * BigInt(Math.round((1 - slippage) * 10000))) / 10000n

    const swapCalldata = encodeSwap({
      assetIn,
      assetOut,
      amountInWei,
      amountOutMin: amountOutMinWei,
      routerType: addresses.routerType,
      stable: poolConfig.stable,
      factoryAddress: addresses.poolFactory,
      recipient:
        params.recipient ?? '0x0000000000000000000000000000000000000001',
      deadline,
      chainId,
    })

    return {
      assetIn,
      assetOut,
      amountIn: params.amountIn,
      chainId,
      slippage,
      deadline,
      recipient: params.recipient,
      provider: 'velodrome',
      price: quote,
      execution: {
        swapCalldata,
        routerAddress: addresses.router,
        amountInWei,
        amountOutMinWei,
        value: isNativeAsset(assetIn) ? amountInWei : 0n,
        chainId,
        deadline,
        providerContext: {
          stable: poolConfig.stable,
          factoryAddress: addresses.poolFactory,
          routerType: addresses.routerType,
        },
      },
      quotedAt: now,
      expiresAt: deadline,
    }
  }

  /**
   * Execute a swap from a pre-built quote.
   * Uses the pre-encoded calldata but builds fresh approval transactions.
   */
  protected async _executeFromQuote(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut } = quote
    const { execution } = quote
    const addresses = getVelodromeAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    let tokenApproval: TransactionData | undefined

    if (!isNativeAsset(assetIn)) {
      const token = getAssetAddress(assetIn, chainId)

      if (addresses.routerType === 'universal') {
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
            args: [addresses.router, execution.amountInWei],
          }),
          value: 0n,
        }
      } else {
        const recipient =
          quote.recipient ?? '0x0000000000000000000000000000000000000001'
        const currentAllowance = await publicClient.readContract({
          address: token,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: 'allowance',
          args: [recipient, addresses.router],
        })

        if ((currentAllowance as bigint) < execution.amountInWei) {
          tokenApproval = {
            to: token,
            data: encodeFunctionData({
              abi: ERC20_APPROVE_ABI,
              functionName: 'approve',
              args: [addresses.router, execution.amountInWei],
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
      amountIn: quote.price.amountIn,
      amountOut: quote.price.amountOut,
      amountInWei: execution.amountInWei,
      amountOutWei: quote.price.amountOutWei,
      assetIn,
      assetOut,
      price: quote.price.price,
      priceImpact: quote.price.priceImpact,
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
