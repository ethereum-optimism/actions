import { type Address, type PublicClient, zeroAddress } from 'viem'
import { optimismSepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import {
  MOCK_USDC_ADDRESS as USDC,
  MOCK_WETH_ADDRESS as WETH,
} from '@/__mocks__/MockAssets.js'
import { computeAaveBorrowMarketId } from '@/actions/borrow/providers/aave/marketId.js'
import {
  fetchAaveMarketState,
  fetchAavePositionState,
} from '@/actions/borrow/providers/aave/state.js'
import type { Asset } from '@/types/asset.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'

const A_WETH = '0x00000000000000000000000000000000000Aae71' as Address
const VAR_DEBT_USDC = '0x00000000000000000000000000000000000aDeb7' as Address

const collateralAsset = {
  type: 'native',
  address: { [optimismSepolia.id]: WETH },
  metadata: { symbol: 'ETH', name: 'Ether', decimals: 18 },
} satisfies Asset

const borrowAsset = {
  type: 'erc20',
  address: { [optimismSepolia.id]: USDC },
  metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
} satisfies Asset

const config: AaveBorrowMarketConfig = {
  kind: 'aave-v3',
  marketId: computeAaveBorrowMarketId({
    chainId: optimismSepolia.id,
    collateralAddress: WETH,
    debtAddress: USDC,
  }),
  chainId: optimismSepolia.id,
  name: 'Aave ETH / USDC',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'aave',
  lendProvider: 'aave',
  aave: {
    debtReserve: USDC,
    collateralReserve: WETH,
    collateralUsesWethGateway: true,
  },
}

const COLLATERAL_CONFIG_BITMAP =
  8000n | (8250n << 16n) | (10500n << 32n) | (18n << 48n)
const VARIABLE_BORROW_RATE = 35_000_000_000_000_000_000_000_000n

// Build a getReserveData tuple with only the fields the decoder reads.
function reserveData(opts: {
  configBitmap?: bigint
  variableBorrowRate?: bigint
  aToken?: Address
  variableDebtToken?: Address
}) {
  return [
    { data: opts.configBitmap ?? 0n }, // 0 configuration
    0n, // 1 liquidityIndex
    0n, // 2 currentLiquidityRate
    0n, // 3 variableBorrowIndex
    opts.variableBorrowRate ?? 0n, // 4 currentVariableBorrowRate
    0n, // 5 currentStableBorrowRate
    0, // 6 lastUpdateTimestamp
    0, // 7 id
    opts.aToken ?? zeroAddress, // 8 aTokenAddress
    zeroAddress, // 9 stableDebtTokenAddress
    opts.variableDebtToken ?? zeroAddress, // 10 variableDebtTokenAddress
    zeroAddress, // 11 interestRateStrategyAddress
    0n, // 12 accruedToTreasury
    0n, // 13 unbacked
    0n, // 14 isolationModeTotalDebt
  ] as const
}

function makeClient(
  responder: (
    contracts: Array<{ functionName: string; address: string }>,
  ) => unknown[],
): PublicClient {
  return {
    multicall: vi.fn(async ({ contracts }: { contracts: never[] }) =>
      responder(contracts),
    ),
  } as unknown as PublicClient
}

describe('fetchAaveMarketState', () => {
  it('reads borrow rate, liquidation params, and totals', async () => {
    const client = makeClient((contracts) => {
      if (contracts[0].functionName === 'getReserveData') {
        return [
          reserveData({
            variableBorrowRate: VARIABLE_BORROW_RATE,
            variableDebtToken: VAR_DEBT_USDC,
          }),
          reserveData({
            configBitmap: COLLATERAL_CONFIG_BITMAP,
            aToken: A_WETH,
          }),
        ]
      }
      // totalSupply multicall (variable debt then aToken)
      return [123n, 456n]
    })

    const state = await fetchAaveMarketState(client, config)
    expect(state.variableBorrowRateRay).toBe(VARIABLE_BORROW_RATE)
    expect(state.liquidationThresholdBps).toBe(8250n)
    expect(state.liquidationBonusBps).toBe(10500n)
    expect(state.totalBorrowed).toBe(123n)
    expect(state.totalCollateral).toBe(456n)
  })
})

describe('fetchAavePositionState', () => {
  it('reads specific reserve balances, not the aggregate, for the pair', async () => {
    const user = '0x000000000000000000000000000000000000beef' as Address
    const collateralBalance = 10n ** 18n
    const debtBalance = 1_000_000_000n
    const client = makeClient((contracts) => {
      if (contracts[0].functionName === 'getReserveData') {
        return [
          reserveData({
            variableBorrowRate: VARIABLE_BORROW_RATE,
            variableDebtToken: VAR_DEBT_USDC,
          }),
          reserveData({
            configBitmap: COLLATERAL_CONFIG_BITMAP,
            aToken: A_WETH,
          }),
          // getUserAccountData: [collateralBase, debtBase, avail, liqThreshold, ltv, hf]
          [3000n, 1000n, 0n, 8250n, 8000n, 1_500_000_000_000_000_000n],
        ]
      }
      // balanceOf multicall (aToken/collateral then variable debt)
      return [collateralBalance, debtBalance]
    })

    const state = await fetchAavePositionState(client, config, user)
    expect(state.collateralAmount).toBe(collateralBalance)
    expect(state.debtAmount).toBe(debtBalance)
    expect(state.healthFactorWad).toBe(1_500_000_000_000_000_000n)
    expect(state.liquidationThresholdBps).toBe(8250n)
    expect(state.totalCollateralBase).toBe(3000n)
    expect(state.totalDebtBase).toBe(1000n)
  })
})
