import type { Market, MarketId } from '@morpho-org/blue-sdk'
import { AccrualPosition } from '@morpho-org/blue-sdk'
import { blueAbi, blueOracleAbi } from '@morpho-org/blue-sdk-viem'
import { type Address, erc20Abi, type Hex, maxUint256 } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  buildMorphoMarket,
  encodeMorphoBorrow,
  encodeMorphoRepay,
  encodeMorphoSupplyCollateral,
  encodeMorphoWithdrawCollateral,
  requireMorphoAllowlistMarket,
  requireMorphoBlueAddress,
  verifyMorphoAllowlistMarketIds,
} from '@/actions/borrow/providers/morpho/helpers.js'
import {
  adaptMorphoBorrowMarket,
  adaptMorphoBorrowPosition,
  assembleMorphoBorrowQuote,
} from '@/actions/borrow/providers/morpho/presentation.js'
import { getSupportedChainIds as getMorphoSupportedChainIds } from '@/actions/shared/morpho/contracts.js'
import { EmptyPositionError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ApprovalMode,
  BorrowProviderConfig,
  BorrowSettings,
} from '@/types/actions.js'
import type {
  BorrowAction,
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowOpenPositionInternalParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
  GetBorrowMarketsParams,
  GetBorrowPositionParams,
  MorphoMarketParams,
} from '@/types/borrow/index.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  buildErc20ApprovalTx,
  resolveErc20ApprovalAmount,
} from '@/utils/approve.js'

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

  protected async _getMarket(marketId: BorrowMarketId): Promise<BorrowMarket> {
    const config = this.requireAllowlistMarket(marketId)
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

  protected async _getPosition(
    params: GetBorrowPositionParams,
  ): Promise<BorrowMarketPosition> {
    const config = this.requireAllowlistMarket(params.marketId)
    const accrualPosition = await this.fetchPosition(
      config,
      params.walletAddress,
    )
    return this.adaptPosition(config, accrualPosition)
  }

  protected async _openPosition(
    params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAllowlistMarket(params.market)
    const resolvedParams = { ...params, market }
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
    const approvalTx = this.buildCollateralApproval(
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
        this.encodeSupplyCollateral(
          market,
          params.collateralAmountWei,
          params.walletAddress,
        ),
      )
    }
    txs.push(
      this.encodeBorrow(
        market,
        params.borrowAmountWei,
        0n,
        params.walletAddress,
        params.recipient,
      ),
    )

    return this.assembleQuote({
      action: 'open',
      params: resolvedParams,
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
    const market = this.requireAllowlistMarket(params.market)
    const resolvedParams = { ...params, market }
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
        ? this.buildMaxLoanApproval(market, allowance)
        : this.buildLoanApproval(
            market,
            repayAssetsWei,
            allowance,
            params.approvalMode,
          )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      this.encodeRepay(
        market,
        repayAssetsWei,
        repaySharesWei,
        params.walletAddress,
      ),
    )
    if (withdrawCollateralWei > 0n) {
      txs.push(
        this.encodeWithdrawCollateral(
          market,
          withdrawCollateralWei,
          params.walletAddress,
          params.recipient,
        ),
      )
    }

    return this.assembleQuote({
      action: 'close',
      params: resolvedParams,
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
    const market = this.requireAllowlistMarket(params.market)
    const resolvedParams = { ...params, market }
    const { current, allowance } = await this.fetchStateWithAllowance(
      market,
      params.walletAddress,
      market.marketParams.collateralToken,
    )
    const after = current.supplyCollateral(params.amountWei)

    const txs: TransactionData[] = []
    const approvalTx = this.buildCollateralApproval(
      market,
      params.amountWei,
      allowance,
      params.approvalMode,
    )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      this.encodeSupplyCollateral(
        market,
        params.amountWei,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'depositCollateral',
      params: resolvedParams,
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
    const market = this.requireAllowlistMarket(params.market)
    const resolvedParams = { ...params, market }
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

    const tx = this.encodeWithdrawCollateral(
      market,
      amountWei,
      params.walletAddress,
      params.recipient,
    )

    return this.assembleQuote({
      action: 'withdrawCollateral',
      params: resolvedParams,
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
    const market = this.requireAllowlistMarket(params.market)
    const resolvedParams = { ...params, market }
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
        ? this.buildMaxLoanApproval(market, allowance)
        : this.buildLoanApproval(
            market,
            repayAssetsWei,
            allowance,
            params.approvalMode,
          )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      this.encodeRepay(
        market,
        repayAssetsWei,
        repaySharesWei,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'repay',
      params: resolvedParams,
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
   * Look up a `BorrowMarketConfig` from the allowlist by id.
   * @description Decoupling the read methods from the allowlist would force
   * an extra `idToMarketParams` RPC. Locking it instead keeps `_getMarket`
   * and `_getPosition` at one round-trip.
   */
  private requireAllowlistMarket(marketId: BorrowMarketId): BorrowMarketConfig {
    return requireMorphoAllowlistMarket(this._config.marketAllowlist, marketId)
  }

  /**
   * Read market state + oracle price in one multicall. Constructs a
   * `Market` instance locally so we reuse Morpho's math (accrual rate,
   * APY, liquidation incentive) without depending on
   * `@morpho-org/blue-sdk`'s per-chain registry.
   */
  private async fetchMarket(config: BorrowMarketConfig): Promise<Market> {
    const client = this.chainManager.getPublicClient(config.chainId)
    const morphoBlue = requireMorphoBlueAddress(config.chainId)
    const id = config.marketId as Hex
    const [marketTuple, price] = await client.multicall({
      allowFailure: false,
      contracts: [
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'market',
          args: [id],
        },
        {
          address: config.marketParams.oracle,
          abi: blueOracleAbi,
          functionName: 'price',
          args: [],
        },
      ],
    })

    return buildMorphoMarket(config, marketTuple, price)
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
    const morphoBlue = requireMorphoBlueAddress(config.chainId)
    const id = config.marketId as Hex
    const [positionTuple, marketTuple, price] = await client.multicall({
      allowFailure: false,
      contracts: [
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'position',
          args: [id, user],
        },
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'market',
          args: [id],
        },
        {
          address: config.marketParams.oracle,
          abi: blueOracleAbi,
          functionName: 'price',
          args: [],
        },
      ],
    })

    const market = buildMorphoMarket(config, marketTuple, price)
    const [supplyShares, borrowShares, collateral] = positionTuple
    return new AccrualPosition(
      {
        user,
        supplyShares,
        borrowShares,
        collateral,
      },
      market,
    )
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
    const morphoBlue = requireMorphoBlueAddress(config.chainId)
    const id = config.marketId as Hex
    const [positionTuple, marketTuple, price, allowance] =
      await client.multicall({
        allowFailure: false,
        contracts: [
          {
            address: morphoBlue,
            abi: blueAbi,
            functionName: 'position',
            args: [id, user],
          },
          {
            address: morphoBlue,
            abi: blueAbi,
            functionName: 'market',
            args: [id],
          },
          {
            address: config.marketParams.oracle,
            abi: blueOracleAbi,
            functionName: 'price',
            args: [],
          },
          {
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [user, morphoBlue],
          },
        ],
      })

    const market = buildMorphoMarket(config, marketTuple, price)
    const [supplyShares, borrowShares, collateral] = positionTuple
    const current = new AccrualPosition(
      {
        user,
        supplyShares,
        borrowShares,
        collateral,
      },
      market,
    )
    return { current, allowance }
  }

  private buildCollateralApproval(
    config: BorrowMarketConfig,
    amountWei: bigint | undefined,
    currentAllowance: bigint,
    mode: ApprovalMode,
  ): TransactionData | undefined {
    if (amountWei === undefined || amountWei === 0n) return undefined
    if (currentAllowance >= amountWei) return undefined
    const spender = requireMorphoBlueAddress(config.chainId)
    return buildErc20ApprovalTx(
      config.marketParams.collateralToken,
      spender,
      resolveErc20ApprovalAmount(mode, amountWei),
    )
  }

  private buildLoanApproval(
    config: BorrowMarketConfig,
    amountWei: bigint,
    currentAllowance: bigint,
    mode: ApprovalMode,
  ): TransactionData | undefined {
    if (amountWei === 0n) return undefined
    if (currentAllowance >= amountWei) return undefined
    const spender = requireMorphoBlueAddress(config.chainId)
    return buildErc20ApprovalTx(
      config.marketParams.loanToken,
      spender,
      resolveErc20ApprovalAmount(mode, amountWei),
    )
  }

  private buildMaxLoanApproval(
    config: BorrowMarketConfig,
    currentAllowance: bigint,
  ): TransactionData | undefined {
    if (currentAllowance === maxUint256) return undefined
    const spender = requireMorphoBlueAddress(config.chainId)
    return buildErc20ApprovalTx(
      config.marketParams.loanToken,
      spender,
      maxUint256,
    )
  }

  private encodeSupplyCollateral(
    config: BorrowMarketConfig,
    assets: bigint,
    onBehalf: Address,
  ): TransactionData {
    return encodeMorphoSupplyCollateral(config, assets, onBehalf)
  }

  private encodeBorrow(
    config: BorrowMarketConfig,
    assets: bigint,
    shares: bigint,
    onBehalf: Address,
    receiver: Address,
  ): TransactionData {
    return encodeMorphoBorrow(config, assets, shares, onBehalf, receiver)
  }

  private encodeRepay(
    config: BorrowMarketConfig,
    assets: bigint,
    shares: bigint,
    onBehalf: Address,
  ): TransactionData {
    return encodeMorphoRepay(config, assets, shares, onBehalf)
  }

  private encodeWithdrawCollateral(
    config: BorrowMarketConfig,
    assets: bigint,
    onBehalf: Address,
    receiver: Address,
  ): TransactionData {
    return encodeMorphoWithdrawCollateral(config, assets, onBehalf, receiver)
  }

  private assembleQuote(args: {
    action: BorrowAction
    params: { market: BorrowMarketConfig; recipient: Address }
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
      config: args.params.market,
      recipient: args.params.recipient,
      positionBefore: args.positionBefore,
      positionAfter: args.positionAfter,
      transactions: args.transactions,
      echoAmounts: args.echoAmounts,
      approvalsSkipped: args.approvalsSkipped,
      quoteExpirationSeconds: this.quoteExpirationSeconds,
      healthBufferPct: this.resolveHealthBufferPct(args.params.market),
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
