import type { AccrualPosition, Market, MarketId } from '@morpho-org/blue-sdk'
import { type Address } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  buildMorphoCollateralApproval,
  encodeMorphoRepay,
  encodeMorphoSupplyCollateral,
  encodeMorphoWithdrawCollateral,
} from '@/actions/borrow/providers/morpho/blue.js'
import {
  buildCloseTransactions,
  computeClose,
} from '@/actions/borrow/providers/morpho/close.js'
import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/borrow/providers/morpho/marketParams.js'
import {
  buildOpenTransactions,
  computeOpen,
} from '@/actions/borrow/providers/morpho/open.js'
import {
  adaptMorphoBorrowMarket,
  adaptMorphoBorrowPosition,
  assembleMorphoBorrowQuote,
} from '@/actions/borrow/providers/morpho/presentation.js'
import {
  buildRepayApproval,
  computeRepay,
} from '@/actions/borrow/providers/morpho/repay.js'
import {
  fetchMorphoMarket,
  fetchMorphoPosition,
  fetchMorphoStateWithAllowance,
} from '@/actions/borrow/providers/morpho/state.js'
import { getSupportedChainIds as getMorphoSupportedChainIds } from '@/actions/shared/morpho/contracts.js'
import {
  BorrowMarketParamsMismatchError,
  EmptyPositionError,
} from '@/core/error/errors.js'
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
 * `Morpho.market`, `IOracle.price`); the results are fed into Morpho's
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
    // Verify each allowlist entry's marketId matches the keccak256 of its
    // marketParams; rejects a config where the two were spliced from
    // different markets (which would silently route calldata to a market
    // whose params don't match the on-chain identity).
    for (const market of config.marketAllowlist ?? []) {
      if (market.kind !== 'morpho-blue') continue
      if (!verifyMorphoMarketId(market.marketId, market.marketParams)) {
        throw new BorrowMarketParamsMismatchError({
          marketId: market.marketId,
          computedMarketId: computeMorphoMarketId(market.marketParams),
        })
      }
    }
  }

  protocolSupportedChainIds(): number[] {
    return getMorphoSupportedChainIds()
  }

  protected async _getMarket(
    config: BorrowMarketConfig,
  ): Promise<BorrowMarket> {
    const market = await this.fetchMarket(config)
    return adaptMorphoBorrowMarket(
      config,
      market,
      this.resolveHealthBufferPct(config),
    )
  }

  protected async _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    const configs = params.markets ?? []
    const results = await Promise.allSettled(
      configs.map(async (config) => {
        const market = await this.fetchMarket(config)
        return adaptMorphoBorrowMarket(
          config,
          market,
          this.resolveHealthBufferPct(config),
        )
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
    const { position } = await this.fetchPosition(
      params.market,
      params.walletAddress,
    )
    return adaptMorphoBorrowPosition(params.market, position)
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
    const after = computeOpen(params, current)
    const { txs, approvalTx } = buildOpenTransactions(params, allowance)
    return this.assembleQuote({
      action: 'open',
      market,
      positionBefore: current,
      positionAfter: after,
      transactions: txs,
      quoteAmounts: {
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
    const plan = computeClose(params, current)
    const { txs, approvalTx } = buildCloseTransactions(params, plan, allowance)
    return this.assembleQuote({
      action: 'close',
      market,
      positionBefore: current,
      positionAfter: plan.after,
      transactions: txs,
      quoteAmounts: {
        borrowAmountRaw:
          plan.repay.repaySharesWei > 0n
            ? current.borrowAssets
            : plan.repay.repayAssetsWei,
        collateralAmountRaw:
          plan.withdrawCollateralWei > 0n
            ? plan.withdrawCollateralWei
            : undefined,
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
      quoteAmounts: { collateralAmountRaw: params.amountWei },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  protected async _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = params.market
    const { position: current } = await this.fetchPosition(
      market,
      params.walletAddress,
    )
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
      quoteAmounts: { collateralAmountRaw: amountWei },
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

    const repay = computeRepay(params.amount, current, 'repay')
    const approvalTx = buildRepayApproval(
      market,
      repay,
      allowance,
      params.approvalMode,
    )
    const txs: TransactionData[] = []
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      encodeMorphoRepay(
        market,
        repay.repayAssetsWei,
        repay.repaySharesWei,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'repay',
      market,
      positionBefore: current,
      positionAfter: repay.after,
      transactions: txs,
      quoteAmounts: {
        borrowAmountRaw:
          repay.repaySharesWei > 0n
            ? current.borrowAssets
            : repay.repayAssetsWei,
      },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  // Each `fetchX` wraps the corresponding `fetchMorphoX` in `state.ts` so
  // call sites read tersely; the multicall composition lives next to the
  // ABI plumbing.
  private fetchMarket(config: BorrowMarketConfig): Promise<Market> {
    return fetchMorphoMarket(
      this.chainManager.getPublicClient(config.chainId),
      config,
    )
  }

  private fetchPosition(
    config: BorrowMarketConfig,
    user: Address,
  ): Promise<{ position: AccrualPosition }> {
    return fetchMorphoPosition(
      this.chainManager.getPublicClient(config.chainId),
      config,
      user,
    )
  }

  private fetchStateWithAllowance(
    config: BorrowMarketConfig,
    user: Address,
    token: Address,
  ): Promise<{
    current: AccrualPosition
    allowance: bigint
  }> {
    return fetchMorphoStateWithAllowance(
      this.chainManager.getPublicClient(config.chainId),
      config,
      user,
      token,
    )
  }

  private assembleQuote(args: AssembleMorphoQuoteArgs): BorrowQuote {
    return assembleMorphoBorrowQuote({
      ...args,
      quoteExpirationSeconds: this.quoteExpirationSeconds,
      healthBufferPct: this.resolveHealthBufferPct(args.market),
    })
  }
}

interface AssembleMorphoQuoteArgs {
  action: BorrowAction
  market: BorrowMarketConfig
  positionBefore: AccrualPosition
  positionAfter: AccrualPosition
  transactions: TransactionData[]
  quoteAmounts: { borrowAmountRaw?: bigint; collateralAmountRaw?: bigint }
  approvalsSkipped: boolean
}

export type { MarketId, MorphoMarketParams }
