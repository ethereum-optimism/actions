import type { Address, PublicClient } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  buildAavePoolApproval,
  encodeAaveBorrow,
  encodeAaveDepositETH,
  encodeAaveRepay,
  encodeAaveSupply,
  encodeAaveWithdraw,
  encodeAaveWithdrawETH,
  maxUint256,
} from '@/actions/borrow/providers/aave/calldata.js'
import {
  type AavePositionState,
  type AaveReservePrices,
  adaptAaveBorrowMarket,
  adaptAaveBorrowPosition,
  bpsToFraction,
  projectAavePositionState,
} from '@/actions/borrow/providers/aave/presentation.js'
import {
  fetchAaveMarketState,
  fetchAavePositionState,
  fetchAavePrices,
} from '@/actions/borrow/providers/aave/state.js'
import {
  getPoolAddress,
  getSupportedChainIds as getAaveSupportedChainIds,
} from '@/actions/shared/aave/addresses.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type {
  AaveBorrowMarketConfig,
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
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'
import { checkTokenAllowance } from '@/utils/approve.js'

/**
 * Aave V3 borrow provider.
 * @description Concrete `BorrowProvider` for Aave V3. Reads reserve and
 * position state via viem multicall against the shared Aave Pool, and models
 * a borrow "market" as the synthetic (collateral, debt) reserve pair carried
 * on the `aave-v3` config. Holds zero demo or mirror logic — it is an honest
 * real-Aave integration reusable outside the demo. Variable-rate debt only.
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
        throw new Error(
          `AaveBorrowProvider: no Aave Pool configured for chain ${market.chainId}`,
        )
      }
    }
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
    const { current, prices } = await this.fetchStateAndPrices(
      market,
      params.walletAddress,
    )

    const txs: TransactionData[] = []
    let approvalsSkipped = true
    const collateral = params.collateralAmountWei ?? 0n
    if (collateral > 0n) {
      const collateralTxs = await this.buildCollateralDeposit(
        market,
        collateral,
        params.walletAddress,
        params.approvalMode,
      )
      txs.push(...collateralTxs.txs)
      approvalsSkipped = collateralTxs.approvalsSkipped
    }
    txs.push(
      encodeAaveBorrow(market, params.borrowAmountWei, params.walletAddress),
    )

    const after = projectAavePositionState(
      current,
      prices,
      { collateralDelta: collateral, debtDelta: params.borrowAmountWei },
      this.decimals(market),
    )
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
    const { current, prices } = await this.fetchStateAndPrices(
      market,
      params.walletAddress,
    )

    const { amount: repayAmount, isMax } = this.resolveAmount(
      params.amount,
      current.debtAmount,
    )
    const onChainAmount = isMax ? maxUint256 : repayAmount

    const allowance = await checkTokenAllowance({
      publicClient: client,
      token: market.aave.debtReserve,
      owner: params.walletAddress,
      spender: getPoolAddress(market.chainId)!,
    })
    const approvalTx = buildAavePoolApproval(
      market,
      market.aave.debtReserve,
      repayAmount,
      allowance,
      params.approvalMode,
    )
    const txs: TransactionData[] = []
    if (approvalTx) txs.push(approvalTx)
    txs.push(encodeAaveRepay(market, onChainAmount, params.walletAddress))

    const after = projectAavePositionState(
      current,
      prices,
      { collateralDelta: 0n, debtDelta: -repayAmount },
      this.decimals(market),
    )
    return this.assembleQuote({
      action: 'repay',
      market,
      before: current,
      after,
      transactions: txs,
      quoteAmounts: { borrowAmountRaw: repayAmount },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  protected async _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const { current, prices } = await this.fetchStateAndPrices(
      market,
      params.walletAddress,
    )
    const { txs, approvalsSkipped } = await this.buildCollateralDeposit(
      market,
      params.amountWei,
      params.walletAddress,
      params.approvalMode,
    )
    const after = projectAavePositionState(
      current,
      prices,
      { collateralDelta: params.amountWei, debtDelta: 0n },
      this.decimals(market),
    )
    return this.assembleQuote({
      action: 'depositCollateral',
      market,
      before: current,
      after,
      transactions: txs,
      quoteAmounts: { collateralAmountRaw: params.amountWei },
      approvalsSkipped,
    })
  }

  protected async _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const { current, prices } = await this.fetchStateAndPrices(
      market,
      params.walletAddress,
    )
    const { amount, isMax } = this.resolveAmount(
      params.amount,
      current.collateralAmount,
    )
    if (isMax && current.collateralAmount === 0n) {
      throw new EmptyPositionError({ operation: 'withdrawCollateral' })
    }
    const onChainAmount = isMax ? maxUint256 : amount
    const tx = market.aave.collateralUsesWethGateway
      ? encodeAaveWithdrawETH(market, onChainAmount, params.walletAddress)
      : encodeAaveWithdraw(market, onChainAmount, params.walletAddress)

    const after = projectAavePositionState(
      current,
      prices,
      { collateralDelta: -amount, debtDelta: 0n },
      this.decimals(market),
    )
    return this.assembleQuote({
      action: 'withdrawCollateral',
      market,
      before: current,
      after,
      transactions: [tx],
      quoteAmounts: { collateralAmountRaw: amount },
      // Pool.withdraw needs no approval; the gateway path is handled by the
      // demo's lend withdraw flow, so no approval is prepended here.
      approvalsSkipped: true,
    })
  }

  protected async _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.client(market)
    const { current, prices } = await this.fetchStateAndPrices(
      market,
      params.walletAddress,
    )

    const { amount: repayAmount, isMax: repayIsMax } = this.resolveAmount(
      params.borrowAmount,
      current.debtAmount,
    )
    const onChainRepay = repayIsMax ? maxUint256 : repayAmount

    const allowance = await checkTokenAllowance({
      publicClient: client,
      token: market.aave.debtReserve,
      owner: params.walletAddress,
      spender: getPoolAddress(market.chainId)!,
    })
    const approvalTx = buildAavePoolApproval(
      market,
      market.aave.debtReserve,
      repayAmount,
      allowance,
      params.approvalMode,
    )
    const txs: TransactionData[] = []
    if (approvalTx) txs.push(approvalTx)
    txs.push(encodeAaveRepay(market, onChainRepay, params.walletAddress))

    let collateralDelta = 0n
    if (params.collateralAmount !== undefined) {
      const { amount: withdrawAmount, isMax: withdrawIsMax } =
        this.resolveAmount(params.collateralAmount, current.collateralAmount)
      collateralDelta = -withdrawAmount
      const onChainWithdraw = withdrawIsMax ? maxUint256 : withdrawAmount
      txs.push(
        market.aave.collateralUsesWethGateway
          ? encodeAaveWithdrawETH(market, onChainWithdraw, params.walletAddress)
          : encodeAaveWithdraw(market, onChainWithdraw, params.walletAddress),
      )
    }

    const after = projectAavePositionState(
      current,
      prices,
      { collateralDelta, debtDelta: -repayAmount },
      this.decimals(market),
    )
    return this.assembleQuote({
      action: 'close',
      market,
      before: current,
      after,
      transactions: txs,
      quoteAmounts: {
        borrowAmountRaw: repayAmount,
        collateralAmountRaw:
          collateralDelta < 0n ? -collateralDelta : undefined,
      },
      approvalsSkipped: approvalTx === undefined,
    })
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Resolve an `AmountWeiOrMax` to a concrete wei amount. `{ max: true }`
   * resolves to `fallbackMax` (the live balance) for projection; the on-chain
   * call separately uses `maxUint256` so Aave clears dust precisely.
   */
  private resolveAmount(
    amount: BorrowRepayInternalParams['amount'],
    fallbackMax: bigint,
  ): { amount: bigint; isMax: boolean } {
    if ('max' in amount) return { amount: fallbackMax, isMax: true }
    return { amount: amount.amountWei, isMax: false }
  }

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

  private decimals(config: AaveBorrowMarketConfig): {
    collateral: number
    debt: number
  } {
    return {
      collateral: config.collateralAsset.metadata.decimals,
      debt: config.borrowAsset.metadata.decimals,
    }
  }

  private async fetchStateAndPrices(
    config: AaveBorrowMarketConfig,
    user: Address,
  ): Promise<{ current: AavePositionState; prices: AaveReservePrices }> {
    const client = this.client(config)
    const [current, prices] = await Promise.all([
      fetchAavePositionState(client, config, user),
      fetchAavePrices(client, config),
    ])
    return { current, prices }
  }

  /**
   * Build the collateral-deposit transactions: native ETH routes through the
   * WETH gateway (no ERC-20 approval), an ERC-20 reserve uses Pool.supply with
   * an approval when the current allowance is insufficient.
   */
  private async buildCollateralDeposit(
    config: AaveBorrowMarketConfig,
    amount: bigint,
    user: Address,
    approvalMode: BorrowOpenPositionInternalParams['approvalMode'],
  ): Promise<{ txs: TransactionData[]; approvalsSkipped: boolean }> {
    if (config.aave.collateralUsesWethGateway) {
      return {
        txs: [encodeAaveDepositETH(config, amount, user)],
        approvalsSkipped: true,
      }
    }
    const allowance = await checkTokenAllowance({
      publicClient: this.client(config),
      token: config.aave.collateralReserve,
      owner: user,
      spender: getPoolAddress(config.chainId)!,
    })
    const approvalTx = buildAavePoolApproval(
      config,
      config.aave.collateralReserve,
      amount,
      allowance,
      approvalMode,
    )
    const txs: TransactionData[] = []
    if (approvalTx) txs.push(approvalTx)
    txs.push(encodeAaveSupply(config, amount, user))
    return { txs, approvalsSkipped: approvalTx === undefined }
  }

  private assembleQuote(args: {
    action: BorrowAction
    market: AaveBorrowMarketConfig
    before: AavePositionState
    after: AavePositionState
    transactions: TransactionData[]
    quoteAmounts: { borrowAmountRaw?: bigint; collateralAmountRaw?: bigint }
    approvalsSkipped: boolean
  }): BorrowQuote {
    const now = Math.floor(Date.now() / 1000)
    const hasBefore =
      args.before.collateralAmount > 0n || args.before.debtAmount > 0n
    const positionAfter = adaptAaveBorrowPosition(args.market, args.after)
    return {
      marketId: {
        kind: args.market.kind,
        marketId: args.market.marketId,
        chainId: args.market.chainId,
      },
      action: args.action,
      borrowAmountRaw: args.quoteAmounts.borrowAmountRaw,
      collateralAmountRaw: args.quoteAmounts.collateralAmountRaw,
      positionBefore: hasBefore
        ? adaptAaveBorrowPosition(args.market, args.before)
        : null,
      positionAfter,
      fees: {
        borrowApy: positionAfter.borrowApy,
        liquidationBonus: positionAfter.liquidationBonus,
      },
      safeCeilingLtv:
        bpsToFraction(args.after.liquidationThresholdBps) *
        (1 - this.resolveHealthBufferPct(args.market)),
      execution: {
        transactions: args.transactions,
        approvalsSkipped: args.approvalsSkipped,
      },
      provider: 'aave',
      quotedAt: now,
      expiresAt: now + this.quoteExpirationSeconds,
    }
  }
}
