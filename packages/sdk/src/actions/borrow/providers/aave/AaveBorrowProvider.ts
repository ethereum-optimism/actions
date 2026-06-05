import type { Address, PublicClient } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { encodeAaveBorrow } from '@/actions/borrow/providers/aave/calldata.js'
import {
  type AavePositionState,
  type AaveReservePrices,
  adaptAaveBorrowMarket,
  adaptAaveBorrowPosition,
  assembleAaveBorrowQuote,
  type AssembleAaveQuoteArgs,
  projectAavePositionState,
} from '@/actions/borrow/providers/aave/presentation.js'
import {
  fetchAaveMarketState,
  fetchAavePositionState,
  fetchAaveStateAndPrices,
} from '@/actions/borrow/providers/aave/state.js'
import {
  buildAaveCollateralDeposit,
  buildAaveCollateralWithdraw,
  buildAaveRepay,
  resolveAaveAmount,
} from '@/actions/borrow/providers/aave/write.js'
import {
  getPoolAddress,
  getSupportedChainIds as getAaveSupportedChainIds,
} from '@/actions/shared/aave/addresses.js'
import {
  ChainNotSupportedError,
  EmptyPositionError,
} from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type {
  AaveBorrowMarketConfig,
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
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'

/**
 * Aave V3 borrow provider.
 * @description Concrete `BorrowProvider` for Aave V3. Reads reserve and
 * position state via viem multicall against the shared Aave Pool, and models
 * a borrow "market" as the synthetic (collateral, debt) reserve pair carried
 * on the `aave-v3` config. Holds zero demo or mirror logic; it is an honest
 * real-Aave integration reusable outside the demo. Variable-rate debt only.
 * State reads live in `state.ts`, calldata in `calldata.ts`, transaction
 * assembly in `write.ts`, and quote shaping in `presentation.ts`.
 */
export class AaveBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  constructor(
    config: BorrowProviderConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
    // Reject allowlist entries that aren't aave-v3 or whose chain lacks an
    // Aave deployment, surfacing config mistakes at construction time.
    for (const market of config.marketAllowlist ?? []) {
      if (market.kind !== 'aave-v3') continue
      if (!getPoolAddress(market.chainId)) {
        throw new ChainNotSupportedError({
          chainId: market.chainId,
          supportedChainIds: getAaveSupportedChainIds(),
        })
      }
    }
  }

  /** Services Aave V3 borrow markets. */
  public get marketKind(): 'aave-v3' {
    return 'aave-v3'
  }

  protocolSupportedChainIds(): number[] {
    return getAaveSupportedChainIds()
  }

  // ── Read hooks ────────────────────────────────────────────────────────────

  protected async _getMarket(
    rawConfig: BorrowMarketConfig,
  ): Promise<BorrowMarket> {
    const config = this.requireAaveConfig(rawConfig)
    const state = await fetchAaveMarketState(this.client(config), config)
    return adaptAaveBorrowMarket(
      config,
      state,
      this.resolveHealthBufferPct(config),
    )
  }

  protected async _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    const configs = params.markets ?? []
    const results = await Promise.allSettled(
      configs.map((rawConfig) => this._getMarket(rawConfig)),
    )
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    )
  }

  protected async _getPosition(params: {
    market: BorrowMarketConfig
    walletAddress: Address
  }): Promise<BorrowMarketPosition> {
    const config = this.requireAaveConfig(params.market)
    const state = await fetchAavePositionState(
      this.client(config),
      config,
      params.walletAddress,
    )
    return adaptAaveBorrowPosition(config, state)
  }

  // ── Write hooks ───────────────────────────────────────────────────────────

  protected async _openPosition(
    params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.client(market)
    const { current, prices } = await fetchAaveStateAndPrices(
      client,
      market,
      params.walletAddress,
    )

    const collateral = params.collateralAmountWei ?? 0n
    const txs: TransactionData[] = []
    let approvalsSkipped = true
    if (collateral > 0n) {
      const deposit = await buildAaveCollateralDeposit(
        client,
        market,
        collateral,
        params.walletAddress,
        params.approvalMode,
      )
      txs.push(...deposit.txs)
      approvalsSkipped = deposit.approvalsSkipped
    }
    txs.push(
      encodeAaveBorrow(market, params.borrowAmountWei, params.walletAddress),
    )

    const after = this.project(current, prices, market, {
      collateralDelta: collateral,
      debtDelta: params.borrowAmountWei,
    })
    return this.assembleQuote({
      action: 'open',
      market,
      before: current,
      after,
      transactions: txs,
      quoteAmounts: {
        borrowAmountRaw: params.borrowAmountWei,
        collateralAmountRaw: collateral > 0n ? collateral : undefined,
      },
      approvalsSkipped,
    })
  }

  protected async _repay(
    params: BorrowRepayInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.client(market)
    const { current, prices } = await fetchAaveStateAndPrices(
      client,
      market,
      params.walletAddress,
    )
    const { txs, approvalsSkipped, repayAmount } = await buildAaveRepay(
      client,
      market,
      params.amount,
      current.debtAmount,
      params.walletAddress,
      params.approvalMode,
    )
    const after = this.project(current, prices, market, {
      collateralDelta: 0n,
      debtDelta: -repayAmount,
    })
    return this.assembleQuote({
      action: 'repay',
      market,
      before: current,
      after,
      transactions: txs,
      quoteAmounts: { borrowAmountRaw: repayAmount },
      approvalsSkipped,
    })
  }

  protected async _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    // A `max` collateral deposit would mean "supply the wallet's entire
    // reserve balance", which is ambiguous for the native-ETH gateway path and
    // unused in practice (Aave collateral is supplied at lend time). Require an
    // explicit amount.
    if ('max' in params.amount) {
      throw new Error(
        'Aave depositCollateral does not support a max amount; pass an explicit amount.',
      )
    }
    const amountWei = params.amount.amountWei
    const client = this.client(market)
    const { current, prices } = await fetchAaveStateAndPrices(
      client,
      market,
      params.walletAddress,
    )
    const { txs, approvalsSkipped } = await buildAaveCollateralDeposit(
      client,
      market,
      amountWei,
      params.walletAddress,
      params.approvalMode,
    )
    const after = this.project(current, prices, market, {
      collateralDelta: amountWei,
      debtDelta: 0n,
    })
    return this.assembleQuote({
      action: 'depositCollateral',
      market,
      before: current,
      after,
      transactions: txs,
      quoteAmounts: { collateralAmountRaw: amountWei },
      approvalsSkipped,
    })
  }

  protected async _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.client(market)
    const { current, prices } = await fetchAaveStateAndPrices(
      client,
      market,
      params.walletAddress,
    )
    const { amount, isMax } = resolveAaveAmount(
      params.amount,
      current.collateralAmount,
    )
    if (isMax && current.collateralAmount === 0n) {
      throw new EmptyPositionError({ operation: 'withdrawCollateral' })
    }
    const txs = await buildAaveCollateralWithdraw(
      client,
      market,
      amount,
      isMax,
      params.walletAddress,
      params.approvalMode,
    )
    const after = this.project(current, prices, market, {
      collateralDelta: -amount,
      debtDelta: 0n,
    })
    return this.assembleQuote({
      action: 'withdrawCollateral',
      market,
      before: current,
      after,
      transactions: txs,
      // The native-ETH path prepends an aToken approval to the gateway; the
      // direct Pool.withdraw path needs none.
      approvalsSkipped: txs.length === 1,
      quoteAmounts: { collateralAmountRaw: amount },
    })
  }

  protected async _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.client(market)
    const { current, prices } = await fetchAaveStateAndPrices(
      client,
      market,
      params.walletAddress,
    )
    const repay = await buildAaveRepay(
      client,
      market,
      params.borrowAmount,
      current.debtAmount,
      params.walletAddress,
      params.approvalMode,
    )
    const txs = [...repay.txs]

    let collateralDelta = 0n
    if (params.collateralAmount !== undefined) {
      const { amount: withdrawAmount, isMax } = resolveAaveAmount(
        params.collateralAmount,
        current.collateralAmount,
      )
      collateralDelta = -withdrawAmount
      txs.push(
        ...(await buildAaveCollateralWithdraw(
          client,
          market,
          withdrawAmount,
          isMax,
          params.walletAddress,
          params.approvalMode,
        )),
      )
    }

    const after = this.project(current, prices, market, {
      collateralDelta,
      debtDelta: -repay.repayAmount,
    })
    return this.assembleQuote({
      action: 'close',
      market,
      before: current,
      after,
      transactions: txs,
      quoteAmounts: {
        borrowAmountRaw: repay.repayAmount,
        collateralAmountRaw:
          collateralDelta < 0n ? -collateralDelta : undefined,
      },
      // Reflects the repay leg only; the native-ETH withdraw approval, when
      // present, is a gateway aToken approval the caller does not pre-clear.
      approvalsSkipped: repay.approvalsSkipped,
    })
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private requireAaveConfig(
    config: BorrowMarketConfig,
  ): AaveBorrowMarketConfig {
    if (config.kind !== 'aave-v3') {
      throw new Error(
        `AaveBorrowProvider received a ${config.kind} market config`,
      )
    }
    return config
  }

  private client(config: AaveBorrowMarketConfig): PublicClient {
    return this.chainManager.getPublicClient(config.chainId)
  }

  /** Project the position after a collateral/debt delta using this market's decimals. */
  private project(
    current: AavePositionState,
    prices: AaveReservePrices,
    market: AaveBorrowMarketConfig,
    delta: { collateralDelta: bigint; debtDelta: bigint },
  ): AavePositionState {
    return projectAavePositionState(current, prices, delta, {
      collateral: market.collateralAsset.metadata.decimals,
      debt: market.borrowAsset.metadata.decimals,
    })
  }

  private assembleQuote(
    args: Omit<
      AssembleAaveQuoteArgs,
      'quoteExpirationSeconds' | 'healthBufferPct'
    >,
  ): BorrowQuote {
    return assembleAaveBorrowQuote({
      ...args,
      quoteExpirationSeconds: this.quoteExpirationSeconds,
      healthBufferPct: this.resolveHealthBufferPct(args.market),
    })
  }
}
