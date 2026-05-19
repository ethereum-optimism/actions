import { blueAbi } from '@morpho-org/blue-sdk-viem'
import {
  decodeFunctionData,
  erc20Abi,
  maxUint256,
  type PublicClient,
} from 'viem'
import { baseSepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MorphoBorrowProvider } from '@/actions/borrow/providers/morpho/MorphoBorrowProvider.js'
import { computeMorphoMarketId } from '@/actions/shared/morpho/marketParams.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  BorrowMarketParamsMismatchError,
  EmptyPositionError,
  MarketNotAllowedError,
} from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  BorrowMarketConfig,
  MorphoMarketParams,
} from '@/types/borrow/index.js'

const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId

const collateralAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839' },
  metadata: { symbol: 'dUSDC', name: 'dUSDC', decimals: 18 },
} as never

const borrowAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xd6169405013e92387b78457fa77d377ce8cd3ee8' },
  metadata: { symbol: 'OP', name: 'OP', decimals: 18 },
} as never

const marketParams: MorphoMarketParams = {
  loanToken: '0xd6169405013e92387b78457fa77d377ce8cd3ee8',
  collateralToken: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839',
  oracle: '0x0000000000000000000000000000000000000aaa',
  irm: '0x46415998764c29ab2a25cbea6254146d50d22687',
  lltv: 860000000000000000n,
}

const market: BorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId: computeMorphoMarketId(marketParams),
  chainId: BASE_SEPOLIA_ID,
  name: 'Test market',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
  marketParams,
}

const secondMarketParams: MorphoMarketParams = {
  ...marketParams,
  oracle: '0x0000000000000000000000000000000000000bbb',
}

const secondMarket: BorrowMarketConfig = {
  ...market,
  marketId: computeMorphoMarketId(secondMarketParams),
  name: 'Second test market',
  marketParams: secondMarketParams,
}

// Helper to build a tuple-shaped market() return value.
function marketTuple(
  overrides: Partial<{
    totalSupplyAssets: bigint
    totalSupplyShares: bigint
    totalBorrowAssets: bigint
    totalBorrowShares: bigint
    lastUpdate: bigint
    fee: bigint
  }> = {},
) {
  return [
    overrides.totalSupplyAssets ?? 100_000_000_000_000_000_000_000n,
    overrides.totalSupplyShares ?? 100_000_000_000_000_000_000_000n,
    overrides.totalBorrowAssets ?? 50_000_000_000_000_000_000_000n,
    overrides.totalBorrowShares ?? 50_000_000_000_000_000_000_000n,
    overrides.lastUpdate ?? BigInt(Math.floor(Date.now() / 1000)),
    overrides.fee ?? 0n,
  ] as const
}

function positionTuple(
  overrides: Partial<{
    supplyShares: bigint
    borrowShares: bigint
    collateral: bigint
  }> = {},
) {
  return [
    overrides.supplyShares ?? 0n,
    overrides.borrowShares ?? 0n,
    overrides.collateral ?? 0n,
  ] as const
}

function makeChainManagerWithMulticall(
  multicallImpl: (args: unknown) => Promise<unknown>,
) {
  const client: Partial<PublicClient> = {
    multicall: vi.fn().mockImplementation(multicallImpl) as never,
    readContract: vi.fn() as never,
  }
  const cm = {
    getPublicClient: vi.fn().mockReturnValue(client),
    getSupportedChains: vi.fn().mockReturnValue([BASE_SEPOLIA_ID]),
  }
  return cm as unknown as ChainManager
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MorphoBorrowProvider — constructor', () => {
  it('accepts a consistent (marketId, marketParams) pair', () => {
    const cm = makeChainManagerWithMulticall(async () => [])
    expect(
      () => new MorphoBorrowProvider({ marketAllowlist: [market] }, cm),
    ).not.toThrow()
  })

  it('throws BorrowMarketParamsMismatchError on inconsistent pair', () => {
    const cm = makeChainManagerWithMulticall(async () => [])
    const bad: BorrowMarketConfig = {
      ...market,
      marketId:
        '0x9999999999999999999999999999999999999999999999999999999999999999',
    }
    expect(
      () => new MorphoBorrowProvider({ marketAllowlist: [bad] }, cm),
    ).toThrow(BorrowMarketParamsMismatchError)
  })
})

describe('MorphoBorrowProvider — _getMarket', () => {
  it('throws MarketNotAllowedError when marketId is not in the allowlist', async () => {
    const cm = makeChainManagerWithMulticall(async () => [])
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    await expect(
      provider.getMarket({
        kind: 'morpho-blue',
        marketId:
          '0x1111111111111111111111111111111111111111111111111111111111111111',
        chainId: BASE_SEPOLIA_ID,
      }),
    ).rejects.toBeInstanceOf(MarketNotAllowedError)
  })

  it('reads market+oracle in one multicall and returns BorrowMarket', async () => {
    const calls: unknown[][] = []
    const cm = makeChainManagerWithMulticall(async (args) => {
      calls.push((args as { contracts: unknown[] }).contracts)
      return [
        marketTuple({ totalBorrowAssets: 1234n }),
        500_000_000_000_000_000_000_000_000_000_000_000n, // some price
      ]
    })
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const result = await provider.getMarket({
      kind: market.kind,
      marketId: market.marketId,
      chainId: market.chainId,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toHaveLength(2)
    expect(result.maxLtv).toBeCloseTo(0.86)
    expect(result.totalBorrowed).toBe(1234n)
    expect(result.collateralAsset).toBe(collateralAsset)
    expect(result.borrowAsset).toBe(borrowAsset)
  })

  it('keeps healthy markets when one allowlisted market read fails', async () => {
    let callCount = 0
    const cm = makeChainManagerWithMulticall(async () => {
      callCount += 1
      if (callCount === 2) {
        throw new Error('oracle reverted')
      }
      return [marketTuple(), 500_000_000_000_000_000_000_000_000_000_000_000n]
    })
    const provider = new MorphoBorrowProvider(
      { marketAllowlist: [market, secondMarket] },
      cm,
    )

    const results = await provider.getMarkets()

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe(market.name)
  })
})

describe('MorphoBorrowProvider — _getPosition', () => {
  const collateralWad = 100_000_000_000_000_000_000n // 100 dUSDC
  // borrowShares are virtually equal to assets when no interest has accrued.
  const borrowShares = 50_000_000_000_000_000_000n

  it('returns null health factor and ltv when no debt is outstanding', async () => {
    const cm = makeChainManagerWithMulticall(async () => [
      positionTuple({ collateral: collateralWad, borrowShares: 0n }),
      marketTuple(),
      1n, // any non-zero price
    ])
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const position = await provider.getPosition({
      marketId: market,
      walletAddress: '0x000000000000000000000000000000000000beef',
    })
    expect(position.collateralAmount).toBe(collateralWad)
    expect(position.borrowAmount).toBe(0n)
    expect(position.healthFactor).toBeNull()
    expect(position.ltv).toBeNull()
    expect(position.maxLtv).toBeCloseTo(0.86)
  })

  it('surfaces non-null health factor and ltv when debt is outstanding', async () => {
    const cm = makeChainManagerWithMulticall(async () => [
      positionTuple({ collateral: collateralWad, borrowShares }),
      marketTuple(),
      1_000_000_000_000_000_000_000_000_000_000_000_000n, // mid price
    ])
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const position = await provider.getPosition({
      marketId: market,
      walletAddress: '0x000000000000000000000000000000000000beef',
    })
    expect(position.collateralAmount).toBe(collateralWad)
    expect(position.borrowAmount).toBeGreaterThan(0n)
    expect(position.healthFactor).not.toBeNull()
    expect(position.ltv).not.toBeNull()
  })
})

const oneEth = 1_000_000_000_000_000_000n
const walletAddress = '0x000000000000000000000000000000000000beef' as const

function stateMulticallResult(
  opts: {
    collateral?: bigint
    borrowShares?: bigint
    allowance?: bigint
  } = {},
) {
  return [
    positionTuple({
      collateral: opts.collateral ?? 0n,
      borrowShares: opts.borrowShares ?? 0n,
    }),
    marketTuple(),
    1_000_000_000_000_000_000_000_000_000_000_000_000n,
    opts.allowance ?? 0n,
  ]
}

describe('MorphoBorrowProvider — depositCollateral', () => {
  it('builds [approve, supplyCollateral] when no allowance is set', async () => {
    const cm = makeChainManagerWithMulticall(async () => stateMulticallResult())
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.depositCollateral({
      market,
      walletAddress,
      amount: { amountRaw: oneEth },
    })
    expect(quote.action).toBe('depositCollateral')
    expect(quote.execution.transactions).toHaveLength(2)
    expect(quote.execution.approvalsSkipped).toBe(false)
    expect(quote.collateralAmountRaw).toBe(oneEth)
    expect(quote.recipient).toBe(walletAddress)
  })

  it('omits the approval tx when allowance already covers the amount', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({ allowance: oneEth * 10n }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.depositCollateral({
      market,
      walletAddress,
      amount: { amountRaw: oneEth },
    })
    expect(quote.execution.transactions).toHaveLength(1)
    expect(quote.execution.approvalsSkipped).toBe(true)
  })

  it('uses the allowlisted market params for allowance checks and approvals', async () => {
    const calls: Array<{ contracts: Array<{ address: string }> }> = []
    const cm = makeChainManagerWithMulticall(async (args) => {
      calls.push(args as { contracts: Array<{ address: string }> })
      return stateMulticallResult()
    })
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const tamperedMarket: BorrowMarketConfig = {
      ...market,
      marketParams: {
        ...market.marketParams,
        collateralToken: '0x0000000000000000000000000000000000000bbb',
      },
    }

    const quote = await provider.depositCollateral({
      market: tamperedMarket,
      walletAddress,
      amount: { amountRaw: oneEth },
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].contracts[3].address).toBe(
      market.marketParams.collateralToken,
    )
    expect(quote.execution.transactions[0].to).toBe(
      market.marketParams.collateralToken,
    )
  })

  it('encodes maxUint256 collateral approval when approvalMode is max', async () => {
    const cm = makeChainManagerWithMulticall(async () => stateMulticallResult())
    const provider = new MorphoBorrowProvider(
      { marketAllowlist: [market], approvalMode: 'max' },
      cm,
    )
    const quote = await provider.depositCollateral({
      market,
      walletAddress,
      amount: { amountRaw: oneEth },
    })

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: quote.execution.transactions[0].data,
    })
    expect(decoded.functionName).toBe('approve')
    expect(decoded.args?.[1]).toBe(maxUint256)
  })
})

describe('MorphoBorrowProvider — withdrawCollateral', () => {
  it('encodes a single tx with the requested amount', async () => {
    const cm = makeChainManagerWithMulticall(async () => [
      positionTuple({ collateral: oneEth * 5n }),
      marketTuple(),
      1n,
    ])
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.withdrawCollateral({
      market,
      walletAddress,
      amount: { amountRaw: oneEth },
    })
    expect(quote.action).toBe('withdrawCollateral')
    expect(quote.execution.transactions).toHaveLength(1)
    expect(quote.execution.approvalsSkipped).toBe(true)
    expect(quote.collateralAmountRaw).toBe(oneEth)
  })

  it('uses live collateral balance when amount is `{ max: true }`', async () => {
    const cm = makeChainManagerWithMulticall(async () => [
      positionTuple({ collateral: oneEth * 7n }),
      marketTuple(),
      1n,
    ])
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.withdrawCollateral({
      market,
      walletAddress,
      amount: { max: true },
    })
    expect(quote.collateralAmountRaw).toBe(oneEth * 7n)
  })

  it('throws EmptyPositionError when `{ max: true }` and collateral is 0', async () => {
    const cm = makeChainManagerWithMulticall(async () => [
      positionTuple({ collateral: 0n }),
      marketTuple(),
      1n,
    ])
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    await expect(
      provider.withdrawCollateral({
        market,
        walletAddress,
        amount: { max: true },
      }),
    ).rejects.toBeInstanceOf(EmptyPositionError)
  })
})

describe('MorphoBorrowProvider — repay', () => {
  it('switches to shares-based repay when amount is `{ max: true }`', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        borrowShares: oneEth * 3n,
        allowance: oneEth * 999n,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.repay({
      market,
      walletAddress,
      amount: { max: true },
    })
    expect(quote.action).toBe('repay')
    expect(quote.execution.transactions).toHaveLength(2)
    expect(quote.execution.approvalsSkipped).toBe(false)
  })

  it('prepends a max approval for shares-based repay when allowance is finite', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        borrowShares: oneEth * 3n,
        allowance: oneEth * 3n,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.repay({
      market,
      walletAddress,
      amount: { max: true },
    })

    expect(quote.execution.transactions).toHaveLength(2)
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: quote.execution.transactions[0].data,
    })
    expect(decoded.functionName).toBe('approve')
    expect(decoded.args?.[1]).toBe(maxUint256)
  })

  it('encodes maxUint256 loan approval when approvalMode is max', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({ borrowShares: oneEth * 3n }),
    )
    const provider = new MorphoBorrowProvider(
      { marketAllowlist: [market], approvalMode: 'max' },
      cm,
    )
    const quote = await provider.repay({
      market,
      walletAddress,
      amount: { amountRaw: oneEth },
    })

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: quote.execution.transactions[0].data,
    })
    expect(decoded.functionName).toBe('approve')
    expect(decoded.args?.[1]).toBe(maxUint256)
  })

  it('throws EmptyPositionError when `{ max: true }` and debt is 0', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({ borrowShares: 0n }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    await expect(
      provider.repay({ market, walletAddress, amount: { max: true } }),
    ).rejects.toBeInstanceOf(EmptyPositionError)
  })
})

describe('MorphoBorrowProvider — openPosition', () => {
  it('emits [approve, supplyCollateral, borrow] for a fresh position', async () => {
    const cm = makeChainManagerWithMulticall(async () => stateMulticallResult())
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.openPosition({
      market,
      walletAddress,
      borrowAmount: { amountRaw: oneEth },
      collateralAmount: { amountRaw: oneEth * 5n },
    })
    expect(quote.action).toBe('open')
    expect(quote.execution.transactions).toHaveLength(3)
    expect(quote.borrowAmountRaw).toBe(oneEth)
    expect(quote.collateralAmountRaw).toBe(oneEth * 5n)
    expect(quote.expiresAt).toBeGreaterThan(quote.quotedAt)
  })

  it('emits a single borrow tx when collateral is already supplied', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({ collateral: oneEth * 10n }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.openPosition({
      market,
      walletAddress,
      borrowAmount: { amountRaw: oneEth },
    })
    expect(quote.execution.transactions).toHaveLength(1)
    expect(quote.execution.approvalsSkipped).toBe(true)
    const decoded = decodeFunctionData({
      abi: blueAbi,
      data: quote.execution.transactions[0].data,
    })
    expect(decoded.functionName).toBe('borrow')
  })
})

describe('MorphoBorrowProvider — closePosition', () => {
  it('builds [approve?, repay(max), withdrawCollateral(max)] when both are max', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        collateral: oneEth * 2n,
        borrowShares: oneEth * 1n,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.closePosition({
      market,
      walletAddress,
      borrowAmount: { max: true },
      collateralAmount: { max: true },
    })
    expect(quote.action).toBe('close')
    // approve (none, since allowance=0 but repay amount in assets is positive) +
    // repay + withdrawCollateral.
    expect(quote.execution.transactions.length).toBeGreaterThanOrEqual(2)
    expect(quote.collateralAmountRaw).toBe(oneEth * 2n)
  })

  it('throws EmptyPositionError when `borrowAmount: { max: true }` and debt is 0', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({ collateral: oneEth * 2n, borrowShares: 0n }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    await expect(
      provider.closePosition({
        market,
        walletAddress,
        borrowAmount: { max: true },
        collateralAmount: { max: true },
      }),
    ).rejects.toBeInstanceOf(EmptyPositionError)
  })

  it('uses a max approval for shares-based close when allowance is finite', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        collateral: oneEth * 2n,
        borrowShares: oneEth,
        allowance: oneEth,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.closePosition({
      market,
      walletAddress,
      borrowAmount: { max: true },
      collateralAmount: { max: true },
    })

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: quote.execution.transactions[0].data,
    })
    expect(decoded.functionName).toBe('approve')
    expect(decoded.args?.[1]).toBe(maxUint256)
  })

  it('supports max borrow with an exact collateral withdrawal', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        collateral: oneEth * 4n,
        borrowShares: oneEth,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.closePosition({
      market,
      walletAddress,
      borrowAmount: { max: true },
      collateralAmount: { amountRaw: oneEth },
    })

    expect(quote.execution.transactions).toHaveLength(3)
    expect(quote.collateralAmountRaw).toBe(oneEth)
  })

  it('rejects exact borrow with max collateral withdrawal when debt remains', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        collateral: oneEth * 3n,
        borrowShares: oneEth * 2n,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    await expect(
      provider.closePosition({
        market,
        walletAddress,
        borrowAmount: { amountRaw: oneEth },
        collateralAmount: { max: true },
      }),
    ).rejects.toThrow('insufficient collateral')
  })

  it('supports exact borrow with an exact collateral withdrawal', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        collateral: oneEth * 3n,
        borrowShares: oneEth * 2n,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.closePosition({
      market,
      walletAddress,
      borrowAmount: { amountRaw: oneEth },
      collateralAmount: { amountRaw: oneEth },
    })

    expect(quote.execution.transactions).toHaveLength(3)
    expect(quote.collateralAmountRaw).toBe(oneEth)
  })

  it('supports max borrow without withdrawing collateral', async () => {
    const cm = makeChainManagerWithMulticall(async () =>
      stateMulticallResult({
        collateral: oneEth * 3n,
        borrowShares: oneEth,
      }),
    )
    const provider = new MorphoBorrowProvider({ marketAllowlist: [market] }, cm)
    const quote = await provider.closePosition({
      market,
      walletAddress,
      borrowAmount: { max: true },
    })

    expect(quote.execution.transactions).toHaveLength(2)
    expect(quote.collateralAmountRaw).toBeUndefined()
  })
})
