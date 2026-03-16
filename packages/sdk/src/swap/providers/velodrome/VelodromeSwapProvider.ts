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
    const marketConfig = this.resolveVelodromeConfig(assetIn, assetOut, chainId)

    const amountInWei = params.amountInWei!

    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInWei,
      chainId,
      publicClient,
      routerAddress: addresses.router,
      routerType: addresses.routerType,
      stable: marketConfig.stable,
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
      stable: marketConfig.stable,
      factoryAddress: addresses.poolFactory,
      recipient: params.recipient,
      deadline: params.deadline,
      chainId,
    })

    // Build token approval directly to the router (no Permit2)
    let tokenApproval: TransactionData | undefined
    if (!isNativeAsset(assetIn)) {
      const token = getAssetAddress(assetIn, chainId)
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
        permit2Approval: undefined,
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
    const marketConfig = this.resolveVelodromeConfig(assetIn, assetOut, chainId)

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
      stable: marketConfig.stable,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Look up the Velodrome-specific market config for a pair, validating the stable flag.
   * @param assetIn - Input asset
   * @param assetOut - Output asset
   * @param chainId - Target chain
   * @returns Market config with guaranteed stable flag
   * @throws If pair not in allowlist or missing stable flag
   */
  private resolveVelodromeConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): VelodromeMarketConfig & { stable: boolean } {
    const config = this.resolveMarketConfig(assetIn, assetOut, chainId) as
      | VelodromeMarketConfig
      | undefined
    if (config?.stable === undefined) {
      throw new Error(
        `stable flag must be configured for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }
    return config as VelodromeMarketConfig & { stable: boolean }
  }

  /** @returns Allowlist entries that have the required stable flag set */
  private validConfigs(): Array<VelodromeMarketConfig & { stable: boolean }> {
    return (this._config.marketAllowlist ?? []).filter(
      (f): f is VelodromeMarketConfig & { stable: boolean } =>
        f.stable !== undefined,
    )
  }

  /**
   * Generate all SwapMarket objects from a single config entry on a given chain.
   * @param config - Market config with stable flag
   * @param chainId - Target chain
   * @param asset - If provided, only return markets containing this asset
   */
  private marketsFromConfig(
    config: VelodromeMarketConfig & { stable: boolean },
    chainId: SupportedChainId,
    asset?: Asset,
  ): SwapMarket[] {
    return this.assetPairs(config.assets, asset)
      .map(([a, b]) => this.configToMarket(a, b, chainId, config.stable))
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
   * Computes a deterministic poolId: keccak256(abi.encodePacked(sortedTokenA, sortedTokenB, stable)).
   * @returns SwapMarket, or null if either asset lacks an address on this chain
   */
  private configToMarket(
    assetA: Asset,
    assetB: Asset,
    chainId: SupportedChainId,
    stable: boolean,
  ): SwapMarket | null {
    const addrA = assetA.address[chainId]
    const addrB = assetB.address[chainId]
    if (!addrA || addrA === 'native' || !addrB || addrB === 'native')
      return null

    // Sort addresses alphabetically for deterministic pool ID
    const [sortedA, sortedB] =
      addrA.toLowerCase() < addrB.toLowerCase()
        ? [addrA, addrB]
        : [addrB, addrA]

    const poolId = keccak256(
      concat([
        sortedA as Address,
        sortedB as Address,
        stable ? '0x01' : '0x00',
      ]),
    )

    return {
      marketId: { poolId, chainId },
      assets: [assetA, assetB],
      fee: 0,
      provider: 'velodrome' as SwapMarket['provider'],
    }
  }
}
