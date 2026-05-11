import { MetaMorphoAction } from '@morpho-org/blue-sdk-viem'
import { erc20Abi, erc4626Abi, formatUnits } from 'viem'

import { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { getVault, getVaults } from '@/actions/lend/providers/morpho/sdk.js'
import { findMarketInAllowlist } from '@/actions/lend/utils/markets.js'
import { getSupportedChainIds as getMorphoSupportedChainIds } from '@/actions/shared/morpho/contracts.js'
import { resolveUnderlyingDecimals } from '@/actions/shared/morpho/decimals.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig, LendSettings } from '@/types/actions.js'
import type {
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendOpenPosition,
  LendOpenPositionInternalParams,
  LendTransaction,
} from '@/types/lend/index.js'
import { getAssetAddress } from '@/utils/assets.js'

/**
 * Morpho lending provider implementation
 * @description Lending provider implementation using Morpho protocol
 */
export class MorphoLendProvider extends LendProvider<LendProviderConfig> {
  constructor(
    config: LendProviderConfig,
    chainManager: ChainManager,
    settings?: LendSettings,
  ) {
    super(config, chainManager, settings)
  }

  protocolSupportedChainIds(): number[] {
    return getMorphoSupportedChainIds()
  }

  /**
   * Describe a Morpho deposit. The base class wraps this into a
   * `LendTransaction` with the appropriate ERC-20 approval based on
   * `params.approvalMode`.
   * @param params - Position opening parameters (amount in wei, walletAddress, approvalMode)
   * @returns Spender + deposit calldata + APY snapshot
   */
  protected async _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendOpenPosition> {
    try {
      // Get asset address for the chain (throws for native assets)
      const assetAddress = getAssetAddress(
        params.asset,
        params.marketId.chainId,
      )

      // Get vault information for APY
      const vaultInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      const depositCallData = MetaMorphoAction.deposit(
        params.amountWei,
        params.walletAddress,
      )

      return {
        spender: params.marketId.address,
        assetAddress,
        transaction: {
          to: params.marketId.address,
          data: depositCallData,
          value: 0n,
        },
        apy: vaultInfo.apy.total,
      }
    } catch {
      throw new Error(
        `Failed to open position with ${params.amountWei} of ${params.asset.metadata.symbol}`,
      )
    }
  }

  /**
   * Close a position in a Morpho market
   * @description Withdraws assets from a Morpho market
   * @param params - Position closing operation parameters
   * @returns Promise resolving to withdrawal transaction details
   */
  protected async _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction> {
    try {
      const vaultInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      // Get asset address for the market's chain
      const assetAddress = getAssetAddress(
        vaultInfo.asset,
        params.marketId.chainId,
      )

      const assets = params.amount
      const receiver = params.walletAddress
      const owner = params.walletAddress
      const withdrawCallData = MetaMorphoAction.withdraw(
        assets,
        receiver,
        owner,
      )

      return {
        amount: params.amount,
        assetAddress,
        marketId: params.marketId.address,
        apy: vaultInfo.apy.total,
        transactionData: {
          position: {
            to: params.marketId.address,
            data: withdrawCallData,
            value: 0n,
          },
        },
      }
    } catch {
      throw new Error('Failed to close position')
    }
  }

  /**
   * Get detailed market information
   * @param marketId - Market identifier containing address and chainId
   * @returns Promise resolving to market information
   */
  protected async _getMarket(marketId: LendMarketId): Promise<LendMarket> {
    return getVault({
      marketId,
      chainManager: this.chainManager,
      lendConfig: this._config,
    })
  }

  /**
   * Get list of available lending markets
   * @param params - Filtering parameters
   * @returns Promise resolving to array of market information
   */
  protected async _getMarkets(
    params: GetLendMarketsParams,
  ): Promise<LendMarket[]> {
    // We will eventually fetch markets externally, filtered by Asset and chainId
    const _unused = { asset: params.asset, chainId: params.chainId }

    const marketConfigs = params.markets || []

    return getVaults({
      chainManager: this.chainManager,
      lendConfig: this._config,
      markets: marketConfigs,
    })
  }

  /**
   * Get position for a specific wallet address
   * @param params - Parameters for fetching position
   * @returns Promise resolving to position information
   */
  protected async _getPosition(
    params: GetMarketBalanceParams,
  ): Promise<LendMarketPosition> {
    try {
      const publicClient = this.chainManager.getPublicClient(
        params.marketId.chainId,
      )
      const match = findMarketInAllowlist(
        this._config.marketAllowlist,
        params.marketId,
      )
      const underlyingDecimals = await resolveUnderlyingDecimals({
        publicClient,
        vaultAddress: params.marketId.address,
        allowlistDecimals: match?.asset.metadata.decimals,
      })

      // Get user's market token balance (shares in the vault)
      const shares = await publicClient.readContract({
        address: params.marketId.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [params.walletAddress],
      })

      // Convert shares to underlying asset balance using convertToAssets
      const balance = await publicClient.readContract({
        address: params.marketId.address,
        abi: erc4626Abi,
        functionName: 'convertToAssets',
        args: [shares],
      })

      return {
        balance,
        balanceFormatted: formatUnits(balance, underlyingDecimals),
        shares,
        // MetaMorpho vault shares are 18 decimals by contract invariant
        sharesFormatted: formatUnits(shares, 18),
        marketId: params.marketId,
      }
    } catch {
      throw new Error(
        `Failed to get market balance for ${params.walletAddress} in market ${params.marketId.address}`,
      )
    }
  }
}
