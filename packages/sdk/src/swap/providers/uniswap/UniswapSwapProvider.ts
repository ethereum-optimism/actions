import { type Address, encodeAbiParameters, formatUnits, keccak256 } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
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
import {
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
  checkPermit2Allowance,
  checkTokenAllowance,
} from '@/utils/permit2.js'

import { POOL_KEY_ABI_TYPE } from './abis.js'
import { getSupportedChainIds, getUniswapAddresses } from './addresses.js'
import { encodeUniversalRouterSwap, getQuote } from './encoding.js'
import type { UniswapMarketConfig, UniswapSwapProviderConfig } from './types.js'

/**
 * Uniswap swap provider using Universal Router
 * @description Routes swaps through V4 pools via the Uniswap Universal Router.
 * Uses Permit2 for token approvals.
 */
export class UniswapSwapProvider extends SwapProvider<UniswapSwapProviderConfig> {
  supportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut, walletAddress } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

    // Get quote first for price info
    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInWei: params.amountInWei,
      amountOutWei: params.amountOutWei,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })

    // Build the swap calldata
    const swapCalldata = encodeUniversalRouterSwap({
      amountInWei: params.amountInWei,
      amountOutWei: params.amountOutWei,
      assetIn,
      assetOut,
      slippage: params.slippage,
      deadline: params.deadline,
      recipient: params.recipient,
      chainId,
      quote,
      universalRouterAddress: addresses.universalRouter,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })

    // Determine if approvals are needed (not for native ETH input)
    let tokenApproval: TransactionData | undefined
    let permit2Approval: TransactionData | undefined

    if (!isNativeAsset(assetIn)) {
      const assetInAddress = getAssetAddress(assetIn, chainId)
      const requiredAmount = params.amountInWei ?? quote.amountInWei

      // Check both allowances in parallel
      const [tokenAllowance, permit2Allowance] = await Promise.all([
        checkTokenAllowance({
          publicClient,
          token: assetInAddress,
          owner: walletAddress,
          spender: addresses.permit2,
        }),
        checkPermit2Allowance({
          publicClient,
          permit2Address: addresses.permit2,
          owner: walletAddress,
          token: assetInAddress,
          spender: addresses.universalRouter,
        }),
      ])

      if (tokenAllowance < requiredAmount) {
        tokenApproval = buildTokenApprovalTx(assetInAddress, addresses.permit2)
      }

      // Permit2 expiration is in Unix seconds (matching EVM block.timestamp)
      const permit2Expired =
        permit2Allowance.expiration < Math.floor(Date.now() / 1000)
      if (permit2Allowance.amount < requiredAmount || permit2Expired) {
        permit2Approval = buildPermit2ApprovalTx({
          permit2Address: addresses.permit2,
          token: assetInAddress,
          spender: addresses.universalRouter,
          amount: requiredAmount,
          expirySeconds: this._config.permit2ExpirySeconds,
        })
      }
    }

    // Build swap transaction
    const swapTx: TransactionData = {
      to: addresses.universalRouter,
      data: swapCalldata,
      value: isNativeAsset(assetIn) ? (params.amountInWei ?? 0n) : 0n,
    }

    const amountInWei = params.amountInWei ?? quote.amountInWei
    const amountOutWei = quote.amountOutWei

    return {
      amountIn: parseFloat(formatUnits(amountInWei, assetIn.metadata.decimals)),
      amountOut: parseFloat(
        formatUnits(amountOutWei, assetOut.metadata.decimals),
      ),
      amountInWei,
      amountOutWei,
      assetIn,
      assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: {
        tokenApproval,
        permit2Approval,
        swap: swapTx,
      },
    }
  }

  protected async _getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    if (!assetOut) {
      throw new Error('assetOut is required')
    }

    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

    // Default to 1 unit for price quotes when no amount specified
    const amountInWei = parseAssetAmount(params.amountIn ?? 1, assetIn)
    const amountOutWei = parseAssetAmount(params.amountOut, assetOut)

    return getQuote({
      assetIn,
      assetOut,
      amountInWei: amountOutWei ? undefined : amountInWei,
      amountOutWei,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })
  }

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
   * Expands the market allowlist into concrete SwapMarket objects.
   * Derives poolId from each asset pair's pool key — no RPC calls needed.
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
   * Resolve and validate Uniswap-specific market config with required fee/tickSpacing
   */
  private resolveUniswapConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): UniswapMarketConfig & { fee: number; tickSpacing: number } {
    const config = this.resolveMarketConfig(assetIn, assetOut, chainId) as
      | UniswapMarketConfig
      | undefined
    if (config?.fee === undefined || config?.tickSpacing === undefined) {
      throw new Error(
        `fee and tickSpacing must be configured for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }
    return config as UniswapMarketConfig & { fee: number; tickSpacing: number }
  }

  /** Configs from allowlist that have required fee/tickSpacing */
  private validConfigs(): Array<
    UniswapMarketConfig & {
      fee: number
      tickSpacing: number
    }
  > {
    return (this._config.marketAllowlist ?? []).filter(
      (f): f is UniswapMarketConfig & { fee: number; tickSpacing: number } =>
        f.fee !== undefined && f.tickSpacing !== undefined,
    )
  }

  /** Generate all pair-based markets from a config on a given chain */
  private marketsFromConfig(
    config: UniswapMarketConfig & { fee: number; tickSpacing: number },
    chainId: SupportedChainId,
    asset?: Asset,
  ): SwapMarket[] {
    return this.assetPairs(config.assets, asset)
      .map(([a, b]) =>
        this.configToMarket(a, b, chainId, config.fee, config.tickSpacing),
      )
      .filter((m): m is SwapMarket => m !== null)
  }

  /** Unique pairs from an asset list, optionally scoped to pairs containing a specific asset */
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

  /** Build a SwapMarket from two assets + pool params. Returns null if assets lack addresses on this chain. */
  private configToMarket(
    assetA: Asset,
    assetB: Asset,
    chainId: SupportedChainId,
    fee: number,
    tickSpacing: number,
  ): SwapMarket | null {
    const addrA = assetA.address[chainId]
    const addrB = assetB.address[chainId]
    if (!addrA || addrA === 'native' || !addrB || addrB === 'native')
      return null

    // Sort tokens for deterministic poolId (V4 requires currency0 < currency1)
    const [currency0, currency1] =
      addrA.toLowerCase() < addrB.toLowerCase()
        ? [addrA, addrB]
        : [addrB, addrA]

    const poolId = keccak256(
      encodeAbiParameters(POOL_KEY_ABI_TYPE, [
        currency0 as Address,
        currency1 as Address,
        fee,
        tickSpacing,
        '0x0000000000000000000000000000000000000000' as Address,
      ]),
    )

    return {
      marketId: { poolId, chainId },
      assets: [assetA, assetB],
      fee,
      provider: 'uniswap',
    }
  }
}
