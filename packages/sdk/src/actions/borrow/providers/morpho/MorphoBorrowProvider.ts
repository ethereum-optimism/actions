import type { AccrualPosition, Market, MarketId } from '@morpho-org/blue-sdk'
import { type Address } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { verifyMorphoAllowlistMarketIds } from '@/actions/borrow/providers/morpho/helpers.js'
import {
  adaptMorphoBorrowMarket,
  adaptMorphoBorrowPosition,
  assembleMorphoBorrowQuote,
} from '@/actions/borrow/providers/morpho/presentation.js'
import {
  buildMorphoCollateralApproval,
  buildMorphoLoanApproval,
  buildMorphoMaxLoanApproval,
  encodeMorphoBorrow,
  encodeMorphoRepay,
  encodeMorphoSupplyCollateral,
  encodeMorphoWithdrawCollateral,
} from '@/actions/shared/morpho/blue.js'
import { getSupportedChainIds as getMorphoSupportedChainIds } from '@/actions/shared/morpho/contracts.js'
import {
  fetchMorphoMarket,
  fetchMorphoPosition,
  fetchMorphoStateWithAllowance,
} from '@/actions/shared/morpho/state.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type {
  BorrowAction,
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketPosition,
  BorrowOpenPositionInternalParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
  GetBorrowMarketsParams,
  MorphoMarketParams,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

/**
 * Morpho Blue borrow provider.
 * @description Concrete `BorrowProvider` for Morpho Blue's borrow markets.
 * Reads happen in one multicall round-trip per call (`Morpho.position`,
 * `Morpho.market`, `IOracle.price`) — the results are fed into Morpho's
 * official `Market` / `AccrualPosition` classes so we reuse the SDK's
 * accrual / health-factor / liquidation-price math without depending on
 * `@morpho-org/blue-sdk`'s per-chain registry (which does not yet include
 * the demo's `baseSepolia` deployment). Write paths build calldata
 * directly from the verified allowlist config.
 */
export class MorphoBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  constructor(
    config: BorrowProviderConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
    verifyMorphoAllowlistMarketIds(config.marketAllowlist)
  }

  protocolSupportedChainIds(): number[] {
    return getMorphoSupportedChainIds()
  }

  protected async _getMarket(
    config: BorrowMarketConfig,
  ): Promise<BorrowMarket> {
    const market = await this.fetchMarket(config)
    return this.adaptMarket(config, market)
  }

  protected async _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    const configs = params.markets ?? this._config.marketAllowlist ?? []
    const results = await Promise.allSettled(
      configs.map(async (config) => {
        const market = await this.fetchMarket(config)
        return this.adaptMarket(config, market)
      }),
    )
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    )
  }

  protected async _getPosition(params: {
    market: BorrowMarketConfig
    walletAddress: Address
  }): Promise<BorrowMarketPosition> {
    const accrualPosition = await this.fetchPosition(
      params.market,
      params.walletAddress,
    )
    return this.adaptPosition(params.market, accrualPosition)
  }

  protected async _openPosition(
    params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = params.market
    const { current, allowance } = await this.fetchStateWithAllowance(
      market,
      params.walletAddress,
      market.marketParams.collateralToken,
    )
    let after = current
    if (params.collateralAmountWei !== undefined) {
      after = after.supplyCollateral(params.collateralAmountWei)
    }
    const borrowed = after.borrow(params.borrowAmountWei, 0n)
    after = borrowed.position

    const txs: TransactionData[] = []
    const approvalTx = buildMorphoCollateralApproval(
      market,
      params.collateralAmountWei,
      allowance,
      params.approvalMode,
    )
    if (approvalTx) txs.push(approvalTx)
    if (
      params.collateralAmountWei !== undefined &&
      params.collateralAmountWei > 0n
    ) {
      txs.push(
        encodeMorphoSupplyCollateral(
          market,
          params.collateralAmountWei,
          params.walletAddress,
        ),
      )
    }
    txs.push(
      encodeMorphoBorrow(
        market,
        params.borrowAmountWei,
        0n,
        params.walletAddress,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'open',
      market,
      positionBefore: current,
      positionAfter: after,
      transactions: txs,
      echoAmounts: {
        borrowAmountRaw: params.borrowAmountWei,
        collateralAmountRaw: params.collateralAmountWei,
      },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  protected async _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = params.market
    const { current, allowance } = await this.fetchStateWithAllowance(
      market,
      params.walletAddress,
      market.marketParams.loanToken,
    )
    let after = current

    // Repay leg. `{ max: true }` uses Morpho's shares-based path to avoid the
    // toAssetsUp 1-wei dust bug. Morpho's `_accrueInterest` runs on-chain
    // before the share→asset conversion, so the actual transferred amount
    // tracks live state without an SDK-side re-fetch.
    let repayAssetsWei = 0n
    let repaySharesWei = 0n
    if ('max' in params.borrowAmount) {
      if (current.borrowShares === 0n) {
        throw new EmptyPositionError({ operation: 'closePosition' })
      }
      repaySharesWei = current.borrowShares
      const result = after.repay(0n, repaySharesWei)
      after = result.position
    } else {
      repayAssetsWei = params.borrowAmount.amountWei
      const result = after.repay(repayAssetsWei, 0n)
      after = result.position
    }

    // Withdraw leg, optional.
    let withdrawCollateralWei = 0n
    if (params.collateralAmount !== undefined) {
      withdrawCollateralWei =
        'max' in params.collateralAmount
          ? after.collateral
          : params.collateralAmount.amountWei
      after = after.withdrawCollateral(withdrawCollateralWei)
    }

    const txs: TransactionData[] = []
    const approvalTx =
      repaySharesWei > 0n
        ? buildMorphoMaxLoanApproval(market, allowance)
        : buildMorphoLoanApproval(
            market,
            repayAssetsWei,
            allowance,
            params.approvalMode,
          )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      encodeMorphoRepay(
        market,
        repayAssetsWei,
        repaySharesWei,
        params.walletAddress,
      ),
    )
    if (withdrawCollateralWei > 0n) {
      txs.push(
        encodeMorphoWithdrawCollateral(
          market,
          withdrawCollateralWei,
          params.walletAddress,
          params.walletAddress,
        ),
      )
    }

    return this.assembleQuote({
      action: 'close',
      market,
      positionBefore: current,
      positionAfter: after,
      transactions: txs,
      echoAmounts: {
        borrowAmountRaw:
          repaySharesWei > 0n ? current.borrowAssets : repayAssetsWei,
        collateralAmountRaw:
          withdrawCollateralWei > 0n ? withdrawCollateralWei : undefined,
      },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  protected async _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = params.market
    const { current, allowance } = await this.fetchStateWithAllowance(
      market,
      params.walletAddress,
      market.marketParams.collateralToken,
    )
    const after = current.supplyCollateral(params.amountWei)

    const txs: TransactionData[] = []
    const approvalTx = buildMorphoCollateralApproval(
      market,
      params.amountWei,
      allowance,
      params.approvalMode,
    )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      encodeMorphoSupplyCollateral(
        market,
        params.amountWei,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'depositCollateral',
      market,
      positionBefore: current,
      positionAfter: after,
      transactions: txs,
      echoAmounts: { collateralAmountRaw: params.amountWei },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  protected async _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = params.market
    const current = await this.fetchPosition(market, params.walletAddress)
    let amountWei: bigint
    if ('max' in params.amount) {
      if (current.collateral === 0n) {
        throw new EmptyPositionError({ operation: 'withdrawCollateral' })
      }
      amountWei = current.collateral
    } else {
      amountWei = params.amount.amountWei
    }
    const after = current.withdrawCollateral(amountWei)

    const tx = encodeMorphoWithdrawCollateral(
      market,
      amountWei,
      params.walletAddress,
      params.walletAddress,
    )

    return this.assembleQuote({
      action: 'withdrawCollateral',
      market,
      positionBefore: current,
      positionAfter: after,
      transactions: [tx],
      echoAmounts: { collateralAmountRaw: amountWei },
      // No approval ever required for withdrawals.
      approvalsSkipped: true,
    })
  }

  protected async _repay(
    params: BorrowRepayInternalParams,
  ): Promise<BorrowQuote> {
    const market = params.market
    const { current, allowance } = await this.fetchStateWithAllowance(
      market,
      params.walletAddress,
      market.marketParams.loanToken,
    )

    let repayAssetsWei = 0n
    let repaySharesWei = 0n
    let after: AccrualPosition
    if ('max' in params.amount) {
      if (current.borrowShares === 0n) {
        throw new EmptyPositionError({ operation: 'repay' })
      }
      repaySharesWei = current.borrowShares
      const result = current.repay(0n, repaySharesWei)
      after = result.position
    } else {
      repayAssetsWei = params.amount.amountWei
      const result = current.repay(repayAssetsWei, 0n)
      after = result.position
    }

    const txs: TransactionData[] = []
    const approvalTx =
      repaySharesWei > 0n
        ? buildMorphoMaxLoanApproval(market, allowance)
        : buildMorphoLoanApproval(
            market,
            repayAssetsWei,
            allowance,
            params.approvalMode,
          )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      encodeMorphoRepay(
        market,
        repayAssetsWei,
        repaySharesWei,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'repay',
      market,
      positionBefore: current,
      positionAfter: after,
      transactions: txs,
      echoAmounts: {
        borrowAmountRaw:
          repaySharesWei > 0n ? current.borrowAssets : repayAssetsWei,
      },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Read market state + oracle price in one multicall. Constructs a
   * `Market` instance locally so we reuse Morpho's math (accrual rate,
   * APY, liquidation incentive) without depending on
   * `@morpho-org/blue-sdk`'s per-chain registry.
   */
  private async fetchMarket(config: BorrowMarketConfig): Promise<Market> {
    const client = this.chainManager.getPublicClient(config.chainId)
    return fetchMorphoMarket(client, config)
  }

  /**
   * Read the user's position alongside market + oracle in one multicall.
   * Builds an `AccrualPosition` locally so the SDK's getters
   * (`healthFactor`, `ltv`, `liquidationPrice`, `borrowAssets`) compute on
   * up-to-date state regardless of which chain the market lives on.
   */
  private async fetchPosition(
    config: BorrowMarketConfig,
    user: Address,
  ): Promise<AccrualPosition> {
    const client = this.chainManager.getPublicClient(config.chainId)
    return fetchMorphoPosition(client, config, user)
  }

  /**
   * Fetch `AccrualPosition` + the user's ERC-20 allowance for the supplied
   * token spender (Morpho Blue) in a single multicall. Used by every
   * write-side hook that needs an approval-check pre-flight.
   */
  private async fetchStateWithAllowance(
    config: BorrowMarketConfig,
    user: Address,
    token: Address,
  ): Promise<{ current: AccrualPosition; allowance: bigint }> {
    const client = this.chainManager.getPublicClient(config.chainId)
    return fetchMorphoStateWithAllowance(client, config, user, token)
  }

  private assembleQuote(args: {
    action: BorrowAction
    market: BorrowMarketConfig
    positionBefore: AccrualPosition
    positionAfter: AccrualPosition
    transactions: TransactionData[]
    echoAmounts: {
      borrowAmountRaw?: bigint
      collateralAmountRaw?: bigint
    }
    approvalsSkipped: boolean
  }): BorrowQuote {
    return assembleMorphoBorrowQuote({
      action: args.action,
      config: args.market,
      positionBefore: args.positionBefore,
      positionAfter: args.positionAfter,
      transactions: args.transactions,
      echoAmounts: args.echoAmounts,
      approvalsSkipped: args.approvalsSkipped,
      quoteExpirationSeconds: this.quoteExpirationSeconds,
      healthBufferPct: this.resolveHealthBufferPct(args.market),
    })
  }

  private adaptMarket(
    config: BorrowMarketConfig,
    market: Market,
  ): BorrowMarket {
    return adaptMorphoBorrowMarket(
      config,
      market,
      this.resolveHealthBufferPct(config),
    )
  }

  private adaptPosition(
    config: BorrowMarketConfig,
    position: AccrualPosition,
  ): BorrowMarketPosition {
    return adaptMorphoBorrowPosition(config, position)
  }
}

export type { MarketId, MorphoMarketParams }
