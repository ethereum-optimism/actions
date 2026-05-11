import {
  AccrualPosition,
  Market,
  type MarketId,
  MarketParams,
} from '@morpho-org/blue-sdk'
import { blueAbi, blueOracleAbi } from '@morpho-org/blue-sdk-viem'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  type Hex,
} from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  getMorphoContracts,
  getSupportedChainIds as getMorphoSupportedChainIds,
} from '@/actions/shared/morpho/contracts.js'
import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/shared/morpho/marketParams.js'
import { BorrowMarketParamsMismatchError } from '@/core/error/errors.js'
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

/** Wad denominator for converting Morpho's 1e18-scaled values to fractions. */
const WAD = 10n ** 18n

/**
 * Morpho Blue borrow provider.
 * @description Concrete `BorrowProvider` for Morpho Blue's borrow markets.
 * Reads happen in one multicall round-trip per call (`Morpho.position`,
 * `Morpho.market`, `IOracle.price`) — the results are fed into Morpho's
 * official `Market` / `AccrualPosition` classes so we reuse the SDK's
 * accrual / health-factor / liquidation-price math without depending on
 * `@morpho-org/blue-sdk`'s per-chain registry (which does not yet include
 * the demo's `baseSepolia` deployment). The write side ships in a
 * follow-up commit.
 */
export class MorphoBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  constructor(
    config: BorrowProviderConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
    this.verifyAllowlistMarketIds(config.marketAllowlist)
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
    return Promise.all(
      configs.map(async (config) => {
        const market = await this.fetchMarket(config)
        return this.adaptMarket(config, market)
      }),
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
    const { current, allowance } = await this.fetchStateWithAllowance(
      params.market,
      params.walletAddress,
      params.market.marketParams.collateralToken,
    )
    let after = current
    if (params.collateralAmountWei !== undefined) {
      after = after.supplyCollateral(params.collateralAmountWei)
    }
    const borrowed = after.borrow(params.borrowAmountWei, 0n)
    after = borrowed.position

    const txs: TransactionData[] = []
    const approvalTx = this.buildCollateralApproval(
      params.market,
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
          params.market,
          params.collateralAmountWei,
          params.walletAddress,
        ),
      )
    }
    txs.push(
      this.encodeBorrow(
        params.market,
        params.borrowAmountWei,
        0n,
        params.walletAddress,
        params.recipient,
      ),
    )

    return this.assembleQuote({
      action: 'open',
      params,
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
    const { current, allowance } = await this.fetchStateWithAllowance(
      params.market,
      params.walletAddress,
      params.market.marketParams.loanToken,
    )
    let after = current

    // Repay leg. `{ max: true }` uses Morpho's shares-based path to avoid the
    // toAssetsUp 1-wei dust bug. The wallet namespace re-fetches shares
    // at dispatch time (Phase 5) to absorb additional accrual.
    let repayAssetsWei = 0n
    let repaySharesWei = 0n
    if ('max' in params.borrowAmount) {
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
    const approvalAmount =
      repayAssetsWei > 0n ? repayAssetsWei : current.borrowAssets
    const approvalTx = this.buildLoanApproval(
      params.market,
      approvalAmount,
      allowance,
      params.approvalMode,
    )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      this.encodeRepay(
        params.market,
        repayAssetsWei,
        repaySharesWei,
        params.walletAddress,
      ),
    )
    if (withdrawCollateralWei > 0n) {
      txs.push(
        this.encodeWithdrawCollateral(
          params.market,
          withdrawCollateralWei,
          params.walletAddress,
          params.recipient,
        ),
      )
    }

    return this.assembleQuote({
      action: 'close',
      params,
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
    const { current, allowance } = await this.fetchStateWithAllowance(
      params.market,
      params.walletAddress,
      params.market.marketParams.collateralToken,
    )
    const after = current.supplyCollateral(params.amountWei)

    const txs: TransactionData[] = []
    const approvalTx = this.buildCollateralApproval(
      params.market,
      params.amountWei,
      allowance,
      params.approvalMode,
    )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      this.encodeSupplyCollateral(
        params.market,
        params.amountWei,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'depositCollateral',
      params,
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
    const current = await this.fetchPosition(
      params.market,
      params.walletAddress,
    )
    const amountWei =
      'max' in params.amount ? current.collateral : params.amount.amountWei
    const after = current.withdrawCollateral(amountWei)

    const tx = this.encodeWithdrawCollateral(
      params.market,
      amountWei,
      params.walletAddress,
      params.recipient,
    )

    return this.assembleQuote({
      action: 'withdrawCollateral',
      params,
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
    const { current, allowance } = await this.fetchStateWithAllowance(
      params.market,
      params.walletAddress,
      params.market.marketParams.loanToken,
    )

    let repayAssetsWei = 0n
    let repaySharesWei = 0n
    let after: AccrualPosition
    if ('max' in params.amount) {
      repaySharesWei = current.borrowShares
      const result = current.repay(0n, repaySharesWei)
      after = result.position
    } else {
      repayAssetsWei = params.amount.amountWei
      const result = current.repay(repayAssetsWei, 0n)
      after = result.position
    }

    const txs: TransactionData[] = []
    const approvalAmount =
      repayAssetsWei > 0n ? repayAssetsWei : current.borrowAssets
    const approvalTx = this.buildLoanApproval(
      params.market,
      approvalAmount,
      allowance,
      params.approvalMode,
    )
    if (approvalTx) txs.push(approvalTx)
    txs.push(
      this.encodeRepay(
        params.market,
        repayAssetsWei,
        repaySharesWei,
        params.walletAddress,
      ),
    )

    return this.assembleQuote({
      action: 'repay',
      params,
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
   * Synchronously verify that every allowlisted market's `marketId` matches
   * `keccak256(abi.encode(marketParams))`. Misconfigured deployments fail
   * fast at SDK construction rather than producing silently incorrect
   * calldata at first use.
   */
  private verifyAllowlistMarketIds(
    allowlist: BorrowMarketConfig[] | undefined,
  ): void {
    if (!allowlist?.length) return
    for (const market of allowlist) {
      if (market.kind !== 'morpho-blue') continue
      if (!verifyMorphoMarketId(market.marketId, market.marketParams)) {
        throw new BorrowMarketParamsMismatchError({
          marketId: market.marketId,
          computedMarketId: computeMorphoMarketId(market.marketParams),
        })
      }
    }
  }

  /**
   * Look up a `BorrowMarketConfig` from the allowlist by id.
   * @description Decoupling the read methods from the allowlist would force
   * an extra `idToMarketParams` RPC. Locking it instead keeps `_getMarket`
   * and `_getPosition` at one round-trip.
   */
  private requireAllowlistMarket(marketId: BorrowMarketId): BorrowMarketConfig {
    const allowlist = this._config.marketAllowlist ?? []
    const match = allowlist.find(
      (m) =>
        m.kind === marketId.kind &&
        m.chainId === marketId.chainId &&
        m.marketId.toLowerCase() === marketId.marketId.toLowerCase(),
    )
    if (!match) {
      throw new BorrowMarketParamsMismatchError({
        marketId: marketId.marketId,
        computedMarketId:
          'No matching market in allowlist; supply marketParams via config',
      })
    }
    return match
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

    return buildMarket(config, marketTuple, price)
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

    const market = buildMarket(config, marketTuple, price)
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

    const market = buildMarket(config, marketTuple, price)
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

  private morphoTx(
    config: BorrowMarketConfig,
    functionName:
      | 'supplyCollateral'
      | 'borrow'
      | 'repay'
      | 'withdrawCollateral',
    args: readonly unknown[],
  ): TransactionData {
    return {
      to: requireMorphoBlueAddress(config.chainId),
      data: encodeFunctionData({
        abi: blueAbi,
        functionName,
        // viem's typings tighten args based on functionName; cast at the
        // call site rather than threading per-method generics through.
        args: args as never,
      }),
      value: 0n,
    }
  }

  private encodeSupplyCollateral(
    config: BorrowMarketConfig,
    assets: bigint,
    onBehalf: Address,
  ): TransactionData {
    return this.morphoTx(config, 'supplyCollateral', [
      morphoMarketParamsTuple(config.marketParams),
      assets,
      onBehalf,
      '0x',
    ])
  }

  private encodeBorrow(
    config: BorrowMarketConfig,
    assets: bigint,
    shares: bigint,
    onBehalf: Address,
    receiver: Address,
  ): TransactionData {
    return this.morphoTx(config, 'borrow', [
      morphoMarketParamsTuple(config.marketParams),
      assets,
      shares,
      onBehalf,
      receiver,
    ])
  }

  private encodeRepay(
    config: BorrowMarketConfig,
    assets: bigint,
    shares: bigint,
    onBehalf: Address,
  ): TransactionData {
    return this.morphoTx(config, 'repay', [
      morphoMarketParamsTuple(config.marketParams),
      assets,
      shares,
      onBehalf,
      '0x',
    ])
  }

  private encodeWithdrawCollateral(
    config: BorrowMarketConfig,
    assets: bigint,
    onBehalf: Address,
    receiver: Address,
  ): TransactionData {
    return this.morphoTx(config, 'withdrawCollateral', [
      morphoMarketParamsTuple(config.marketParams),
      assets,
      onBehalf,
      receiver,
    ])
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
    const { action, params, transactions } = args
    const config = params.market
    const now = Math.floor(Date.now() / 1000)
    const hasBefore =
      args.positionBefore.collateral > 0n ||
      args.positionBefore.borrowShares > 0n
    return {
      marketId: {
        kind: config.kind,
        marketId: config.marketId,
        chainId: config.chainId,
      },
      action,
      borrowAmountRaw: args.echoAmounts.borrowAmountRaw,
      collateralAmountRaw: args.echoAmounts.collateralAmountRaw,
      positionBefore: hasBefore
        ? this.adaptPosition(config, args.positionBefore)
        : null,
      positionAfter: this.adaptPosition(config, args.positionAfter),
      fees: {
        borrowApy: wadToNumber(args.positionAfter.market.borrowApy),
        liquidationBonus: liquidationBonusFromIncentive(
          args.positionAfter.market.params.liquidationIncentiveFactor,
        ),
      },
      safeCeilingLtv:
        wadToNumber(config.marketParams.lltv) *
        (1 - this.resolveHealthBufferPct(config)),
      execution: {
        transactions,
        approvalsSkipped: args.approvalsSkipped,
      },
      provider: 'morpho',
      recipient: params.recipient,
      quotedAt: now,
      expiresAt: now + this.quoteExpirationSeconds,
    }
  }

  private adaptMarket(
    config: BorrowMarketConfig,
    market: Market,
  ): BorrowMarket {
    return {
      marketId: {
        kind: config.kind,
        marketId: config.marketId,
        chainId: config.chainId,
      },
      name: config.name,
      collateralAsset: config.collateralAsset,
      borrowAsset: config.borrowAsset,
      borrowApy: wadToNumber(market.borrowApy),
      liquidationBonus: liquidationBonusFromIncentive(
        market.params.liquidationIncentiveFactor,
      ),
      maxLtv: wadToNumber(config.marketParams.lltv),
      totalBorrowed: market.totalBorrowAssets,
      // Morpho doesn't expose aggregate collateral as a single accumulator —
      // it would require summing per-user balances. Frontends that need the
      // figure can derive it from indexer data; we surface `0n` rather than
      // a misleading number.
      totalCollateral: 0n,
    }
  }

  private adaptPosition(
    config: BorrowMarketConfig,
    position: AccrualPosition,
  ): BorrowMarketPosition {
    const hasDebt = position.borrowAssets > 0n
    const ltvFraction = hasDebt ? toFractionOrNull(position.ltv) : null
    const hfFraction = hasDebt ? toFractionOrNull(position.healthFactor) : null
    const liquidationPrice = position.liquidationPrice ?? 0n
    return {
      marketId: {
        kind: config.kind,
        marketId: config.marketId,
        chainId: config.chainId,
      },
      collateralAsset: config.collateralAsset,
      collateralAmount: position.collateral,
      collateralAmountFormatted: formatUnits(
        position.collateral,
        config.collateralAsset.metadata.decimals,
      ),
      borrowAsset: config.borrowAsset,
      borrowAmount: position.borrowAssets,
      borrowAmountFormatted: formatUnits(
        position.borrowAssets,
        config.borrowAsset.metadata.decimals,
      ),
      healthFactor: hfFraction,
      liquidationPrice,
      liquidationPriceFormatted: formatUnits(
        liquidationPrice,
        config.borrowAsset.metadata.decimals,
      ),
      borrowApy: wadToNumber(position.market.borrowApy),
      liquidationBonus: liquidationBonusFromIncentive(
        position.market.params.liquidationIncentiveFactor,
      ),
      ltv: ltvFraction,
      maxLtv: wadToNumber(config.marketParams.lltv),
    }
  }
}

function wadToNumber(value: bigint): number {
  return Number(value) / Number(WAD)
}

function toFractionOrNull(value: bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return wadToNumber(value)
}

/**
 * Morpho's `liquidationIncentiveFactor` is `WAD + bonus`. Subtract WAD to
 * recover the bonus fraction (e.g., `1.05e18 → 0.05`).
 */
function liquidationBonusFromIncentive(factor: bigint): number {
  if (factor <= WAD) return 0
  return wadToNumber(factor - WAD)
}

/**
 * Convert a `MorphoMarketParams` object to the tuple shape `blueAbi` expects.
 * Destructured by name so a future ABI re-ordering surfaces as a TypeScript
 * error rather than a silent calldata bug.
 */
function morphoMarketParamsTuple(params: MorphoMarketParams): {
  loanToken: Address
  collateralToken: Address
  oracle: Address
  irm: Address
  lltv: bigint
} {
  return {
    loanToken: params.loanToken,
    collateralToken: params.collateralToken,
    oracle: params.oracle,
    irm: params.irm,
    lltv: params.lltv,
  }
}

function requireMorphoBlueAddress(chainId: number): Address {
  const contracts = getMorphoContracts(chainId)
  if (!contracts) {
    throw new Error(
      `Morpho Blue contracts not configured for chain id ${chainId}`,
    )
  }
  return contracts.morphoBlue
}

/**
 * Compose Morpho's `Market` from the raw `market()` tuple plus oracle price.
 * @description `blueAbi.market(id)` returns
 * `[totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee]`
 * as uint128/uint128/uint128/uint128/uint128/uint128.
 */
function buildMarket(
  config: BorrowMarketConfig,
  marketTuple: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
  price: bigint,
): Market {
  const [
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
  ] = marketTuple
  return new Market({
    params: new MarketParams({
      loanToken: config.marketParams.loanToken,
      collateralToken: config.marketParams.collateralToken,
      oracle: config.marketParams.oracle,
      irm: config.marketParams.irm,
      lltv: config.marketParams.lltv,
    }),
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
    price,
  })
}

export type { MarketId, MorphoMarketParams }
