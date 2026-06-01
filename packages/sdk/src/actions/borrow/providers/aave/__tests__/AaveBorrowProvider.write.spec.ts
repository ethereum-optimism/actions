import {
  type Address,
  decodeFunctionData,
  maxUint256,
  type PublicClient,
} from 'viem'
import { optimismSepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import { AaveBorrowProvider } from '@/actions/borrow/providers/aave/AaveBorrowProvider.js'
import { computeAaveBorrowMarketId } from '@/actions/borrow/providers/aave/marketId.js'
import { POOL_ABI } from '@/actions/shared/aave/abis/pool.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'

const OPS = optimismSepolia.id
const WETH = '0x4200000000000000000000000000000000000006' as Address
const USDC = '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address
const A_WETH = '0x00000000000000000000000000000000000Aae71' as Address
const VAR_DEBT_USDC = '0x00000000000000000000000000000000000aDeb7' as Address
const WALLET = '0x000000000000000000000000000000000000beef' as Address

const collateralAsset = {
  type: 'native',
  address: { [OPS]: WETH },
  metadata: { symbol: 'ETH', name: 'Ether', decimals: 18 },
} satisfies Asset

const borrowAsset = {
  type: 'erc20',
  address: { [OPS]: USDC },
  metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
} satisfies Asset

const market: AaveBorrowMarketConfig = {
  kind: 'aave-v3',
  marketId: computeAaveBorrowMarketId({
    chainId: OPS,
    collateralAddress: WETH,
    debtAddress: USDC,
  }),
  chainId: OPS,
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

const CONFIG_BITMAP = 8000n | (8250n << 16n) | (10500n << 32n) | (18n << 48n)

function reserveData(opts: {
  configBitmap?: bigint
  aToken?: Address
  variableDebtToken?: Address
}) {
  const z = '0x0000000000000000000000000000000000000000' as Address
  return [
    { data: opts.configBitmap ?? 0n },
    0n,
    0n,
    0n,
    0n,
    0n,
    0,
    0,
    opts.aToken ?? z,
    z,
    opts.variableDebtToken ?? z,
    z,
    0n,
    0n,
    0n,
  ] as const
}

/**
 * Mock a public client for a wallet holding `collateral` aWETH and `debt`
 * variable USDC debt, with the given USDC->pool allowance. ETH price $3000,
 * USDC $1 (8-decimal oracle scale).
 */
function makeProvider(opts: {
  collateral: bigint
  debt: bigint
  allowance: bigint
}) {
  const ORACLE = '0x00000000000000000000000000000000000orAc1' as Address
  const client: Partial<PublicClient> = {
    multicall: vi.fn(async ({ contracts }: { contracts: never[] }) => {
      const first = contracts[0] as { functionName: string }
      if (first.functionName === 'getReserveData') {
        // position read: [debtReserve, collateralReserve, accountData]
        return [
          reserveData({ variableDebtToken: VAR_DEBT_USDC }),
          reserveData({ configBitmap: CONFIG_BITMAP, aToken: A_WETH }),
          [
            opts.collateral * 3000n, // collateralBase (rough)
            opts.debt, // debtBase
            0n,
            8250n,
            8000n,
            opts.debt > 0n ? 1_500_000_000_000_000_000n : maxUint256,
          ],
        ]
      }
      if (first.functionName === 'balanceOf') {
        return [opts.collateral, opts.debt]
      }
      if (first.functionName === 'getAssetPrice') {
        return [300_000_000_000n, 100_000_000n] // ETH $3000, USDC $1 (8 dp)
      }
      throw new Error(`unexpected multicall ${first.functionName}`)
    }) as never,
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'getPriceOracle') return ORACLE
      if (functionName === 'allowance') return opts.allowance
      throw new Error(`unexpected readContract ${functionName}`)
    }) as never,
  }
  const cm = {
    getPublicClient: vi.fn().mockReturnValue(client),
    getSupportedChains: vi.fn().mockReturnValue([OPS]),
  } as unknown as ChainManager
  return new AaveBorrowProvider({ marketAllowlist: [market] }, cm)
}

describe('AaveBorrowProvider write layer', () => {
  it('emits a single variable-rate borrow against existing collateral', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 0n,
      allowance: 0n,
    })
    const quote = await provider.openPosition({
      market,
      walletAddress: WALLET,
      borrowAmount: { amountRaw: 1_000_000_000n },
    })
    expect(quote.provider).toBe('aave')
    expect(quote.execution.transactions).toHaveLength(1)
    const decoded = decodeFunctionData({
      abi: POOL_ABI,
      data: quote.execution.transactions[0].data,
    })
    expect(decoded.functionName).toBe('borrow')
    expect(decoded.args[0]).toBe(USDC)
    expect(decoded.args[2]).toBe(2n) // variable rate mode
    expect(quote.positionAfter.borrowAmount).toBe(1_000_000_000n)
    expect(quote.expiresAt).toBeGreaterThan(quote.quotedAt)
    expect(quote.safeCeilingLtv).toBeGreaterThan(0)
  })

  it('repays with approval-then-repay when allowance is insufficient', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: 0n,
    })
    const quote = await provider.repay({
      market,
      walletAddress: WALLET,
      amount: { amountRaw: 500_000_000n },
    })
    expect(quote.execution.transactions).toHaveLength(2)
    expect(quote.execution.approvalsSkipped).toBe(false)
    const repay = decodeFunctionData({
      abi: POOL_ABI,
      data: quote.execution.transactions[1].data,
    })
    expect(repay.functionName).toBe('repay')
    expect(repay.args[1]).toBe(500_000_000n)
  })

  it('uses maxUint256 on a full repay and skips approval when allowed', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: maxUint256,
    })
    const quote = await provider.repay({
      market,
      walletAddress: WALLET,
      amount: { max: true },
    })
    expect(quote.execution.transactions).toHaveLength(1)
    expect(quote.execution.approvalsSkipped).toBe(true)
    const repay = decodeFunctionData({
      abi: POOL_ABI,
      data: quote.execution.transactions[0].data,
    })
    expect(repay.functionName).toBe('repay')
    expect(repay.args[1]).toBe(maxUint256)
    expect(quote.positionAfter.borrowAmount).toBe(0n)
  })

  it('routes a native-ETH collateral withdrawal through the gateway', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: maxUint256,
    })
    const quote = await provider.withdrawCollateral({
      market,
      walletAddress: WALLET,
      amount: { amountRaw: 5n * 10n ** 17n },
    })
    expect(quote.execution.transactions).toHaveLength(1)
    // Gateway address, not the Pool, is the target for native ETH withdraws.
    const poolBound = quote.execution.transactions[0].to.toLowerCase()
    expect(poolBound).not.toBe(USDC.toLowerCase())
    expect(quote.action).toBe('withdrawCollateral')
  })
})
