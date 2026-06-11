import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  maxUint256,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { optimismSepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import {
  MOCK_USDC_ADDRESS as USDC,
  MOCK_WETH_ADDRESS as WETH,
} from '@/__mocks__/MockAssets.js'
import { AaveBorrowProvider } from '@/actions/borrow/providers/aave/AaveBorrowProvider.js'
import { computeAaveBorrowMarketId } from '@/actions/borrow/providers/aave/marketId.js'
import { POOL_ABI, WETH_GATEWAY_ABI } from '@/actions/shared/aave/abis/pool.js'
import { EmptyPositionError, InvalidParamsError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'

const OPS = optimismSepolia.id
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

const WBTC = '0x1111111111111111111111111111111111111111' as Address

// ERC-20 collateral variant (no WETH gateway), e.g. a WBTC collateral reserve.
const erc20Market: AaveBorrowMarketConfig = {
  ...market,
  aave: {
    debtReserve: USDC,
    collateralReserve: WBTC,
    collateralUsesWethGateway: false,
  },
}

const CONFIG_BITMAP = 8000n | (8250n << 16n) | (10500n << 32n) | (18n << 48n)

function reserveData(opts: {
  configBitmap?: bigint
  aToken?: Address
  variableDebtToken?: Address
}) {
  return [
    { data: opts.configBitmap ?? 0n },
    0n,
    0n,
    0n,
    0n,
    0n,
    0,
    0,
    opts.aToken ?? zeroAddress,
    zeroAddress,
    opts.variableDebtToken ?? zeroAddress,
    zeroAddress,
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
  market?: AaveBorrowMarketConfig
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
  return new AaveBorrowProvider(
    { marketAllowlist: [opts.market ?? market] },
    cm,
  )
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

  it('opens with collateral: deposits via gateway then borrows', async () => {
    const provider = makeProvider({ collateral: 0n, debt: 0n, allowance: 0n })
    const quote = await provider.openPosition({
      market,
      walletAddress: WALLET,
      collateralAmount: { amountRaw: 5n * 10n ** 17n },
      borrowAmount: { amountRaw: 1_000_000_000n },
    })
    expect(quote.execution.transactions).toHaveLength(2)
    // Native-ETH collateral deposits route through the gateway, no approval.
    expect(quote.execution.approvalsSkipped).toBe(true)
    expect(
      decodeFunctionData({
        abi: WETH_GATEWAY_ABI,
        data: quote.execution.transactions[0].data,
      }).functionName,
    ).toBe('depositETH')
    expect(
      decodeFunctionData({
        abi: POOL_ABI,
        data: quote.execution.transactions[1].data,
      }).functionName,
    ).toBe('borrow')
    expect(quote.collateralAmountRaw).toBe(5n * 10n ** 17n)
  })

  it('rejects a max-amount depositCollateral with InvalidParamsError', async () => {
    const provider = makeProvider({ collateral: 0n, debt: 0n, allowance: 0n })
    await expect(
      provider.depositCollateral({
        market,
        walletAddress: WALLET,
        amount: { max: true },
      }),
    ).rejects.toBeInstanceOf(InvalidParamsError)
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

  it('bounds the exact-mode approval to live debt on a full repay (not maxUint256)', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: 0n,
    })
    const quote = await provider.repay({
      market,
      walletAddress: WALLET,
      amount: { max: true },
    })
    expect(quote.execution.transactions).toHaveLength(2)
    const approve = decodeFunctionData({
      abi: erc20Abi,
      data: quote.execution.transactions[0].data,
    })
    expect(approve.functionName).toBe('approve')
    // Exact mode approves the live-debt snapshot, never the maxUint256 sentinel.
    expect(approve.args[1]).toBe(1_000_000_000n)
    // The on-chain repay still carries maxUint256 so Aave clears accrued interest.
    const repay = decodeFunctionData({
      abi: POOL_ABI,
      data: quote.execution.transactions[1].data,
    })
    expect(repay.args[1]).toBe(maxUint256)
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

  it('prepends an aToken->gateway approval for a native withdraw with no allowance', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: 0n,
    })
    const quote = await provider.withdrawCollateral({
      market,
      walletAddress: WALLET,
      amount: { amountRaw: 5n * 10n ** 17n },
    })
    expect(quote.execution.transactions).toHaveLength(2)
    expect(quote.execution.approvalsSkipped).toBe(false)
    const withdraw = decodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      data: quote.execution.transactions[1].data,
    })
    expect(withdraw.functionName).toBe('withdrawETH')
  })

  it('bounds the exact-mode aToken approval to live collateral on a max withdraw', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: 0n,
    })
    const quote = await provider.withdrawCollateral({
      market,
      walletAddress: WALLET,
      amount: { max: true },
    })
    expect(quote.execution.transactions).toHaveLength(2)
    const approve = decodeFunctionData({
      abi: erc20Abi,
      data: quote.execution.transactions[0].data,
    })
    expect(approve.functionName).toBe('approve')
    // Exact mode approves the live collateral balance, never maxUint256.
    expect(approve.args[1]).toBe(10n ** 18n)
    // The on-chain withdraw still carries maxUint256 to drain residual dust.
    const withdraw = decodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      data: quote.execution.transactions[1].data,
    })
    expect(withdraw.functionName).toBe('withdrawETH')
    expect(withdraw.args[1]).toBe(maxUint256)
  })

  it('throws EmptyPositionError on max withdraw with zero collateral', async () => {
    const provider = makeProvider({ collateral: 0n, debt: 0n, allowance: 0n })
    await expect(
      provider.withdrawCollateral({
        market,
        walletAddress: WALLET,
        amount: { max: true },
      }),
    ).rejects.toBeInstanceOf(EmptyPositionError)
  })

  it('throws EmptyPositionError on max repay with no debt', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 0n,
      allowance: maxUint256,
    })
    await expect(
      provider.repay({ market, walletAddress: WALLET, amount: { max: true } }),
    ).rejects.toBeInstanceOf(EmptyPositionError)
  })

  it('deposits native-ETH collateral through the gateway with msg.value', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 0n,
      allowance: 0n,
    })
    const quote = await provider.depositCollateral({
      market,
      walletAddress: WALLET,
      amount: { amountRaw: 5n * 10n ** 17n },
    })
    expect(quote.execution.transactions).toHaveLength(1)
    const tx = quote.execution.transactions[0]
    expect(tx.value).toBe(5n * 10n ** 17n)
    expect(
      decodeFunctionData({ abi: WETH_GATEWAY_ABI, data: tx.data }).functionName,
    ).toBe('depositETH')
  })

  it('deposits ERC-20 collateral via approval + Pool.supply (no gateway)', async () => {
    const provider = makeProvider({
      collateral: 0n,
      debt: 0n,
      allowance: 0n,
      market: erc20Market,
    })
    const quote = await provider.depositCollateral({
      market: erc20Market,
      walletAddress: WALLET,
      amount: { amountRaw: 10n ** 8n },
    })
    expect(quote.execution.transactions).toHaveLength(2)
    expect(quote.execution.approvalsSkipped).toBe(false)
    const supply = decodeFunctionData({
      abi: POOL_ABI,
      data: quote.execution.transactions[1].data,
    })
    expect(supply.functionName).toBe('supply')
    expect(supply.args[0]).toBe(WBTC)
  })

  it('skips the approval when ERC-20 collateral allowance already covers the deposit', async () => {
    const provider = makeProvider({
      collateral: 0n,
      debt: 0n,
      allowance: maxUint256,
      market: erc20Market,
    })
    const quote = await provider.depositCollateral({
      market: erc20Market,
      walletAddress: WALLET,
      amount: { amountRaw: 10n ** 8n },
    })
    expect(quote.execution.transactions).toHaveLength(1)
    expect(quote.execution.approvalsSkipped).toBe(true)
    expect(
      decodeFunctionData({
        abi: POOL_ABI,
        data: quote.execution.transactions[0].data,
      }).functionName,
    ).toBe('supply')
  })

  it('withdraws an explicit (non-max) collateral amount on close', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: maxUint256,
    })
    const quote = await provider.closePosition({
      market,
      walletAddress: WALLET,
      borrowAmount: { amountRaw: 1_000_000_000n },
      collateralAmount: { amountRaw: 4n * 10n ** 17n },
    })
    const withdraw = decodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      data: quote.execution.transactions[1].data,
    })
    expect(withdraw.functionName).toBe('withdrawETH')
    // Explicit amount flows through verbatim, not the maxUint256 drain sentinel.
    expect(withdraw.args[1]).toBe(4n * 10n ** 17n)
    expect(quote.collateralAmountRaw).toBe(4n * 10n ** 17n)
  })

  it('closes a position: approval, repay, then collateral withdraw', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: maxUint256,
    })
    const quote = await provider.closePosition({
      market,
      walletAddress: WALLET,
      borrowAmount: { max: true },
      collateralAmount: { max: true },
    })
    expect(quote.action).toBe('close')
    const fns = quote.execution.transactions.map((t) => {
      try {
        return decodeFunctionData({ abi: POOL_ABI, data: t.data }).functionName
      } catch {
        return decodeFunctionData({ abi: WETH_GATEWAY_ABI, data: t.data })
          .functionName
      }
    })
    expect(fns).toContain('repay')
    expect(fns).toContain('withdrawETH')
    expect(quote.positionAfter.borrowAmount).toBe(0n)
  })

  it('omits the collateral withdraw when closePosition has no collateralAmount', async () => {
    const provider = makeProvider({
      collateral: 10n ** 18n,
      debt: 1_000_000_000n,
      allowance: maxUint256,
    })
    const quote = await provider.closePosition({
      market,
      walletAddress: WALLET,
      borrowAmount: { amountRaw: 1_000_000_000n },
    })
    expect(quote.execution.transactions).toHaveLength(1)
    expect(
      decodeFunctionData({
        abi: POOL_ABI,
        data: quote.execution.transactions[0].data,
      }).functionName,
    ).toBe('repay')
  })
})
