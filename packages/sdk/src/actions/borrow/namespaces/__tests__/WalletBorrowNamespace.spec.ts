import { baseSepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { WalletBorrowNamespace } from '@/actions/borrow/namespaces/WalletBorrowNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  ChainNotSupportedError,
  InvalidParamsError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
} from '@/core/error/errors.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type {
  BorrowMarketConfig,
  BorrowQuote,
  MorphoMarketParams,
} from '@/types/borrow/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId
const walletAddress = '0x000000000000000000000000000000000000beef' as const

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
  marketId:
    '0x1111111111111111111111111111111111111111111111111111111111111111',
  chainId: BASE_SEPOLIA_ID,
  name: 'Test market',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
  marketParams,
}

type WalletMocks = {
  send: ReturnType<typeof vi.fn>
  sendBatch: ReturnType<typeof vi.fn>
}

function makeWallet(): { wallet: Wallet; mocks: WalletMocks } {
  const send = vi.fn().mockResolvedValue({
    transactionHash: '0xeoatxhash',
  })
  const sendBatch = vi
    .fn()
    .mockResolvedValue([
      { transactionHash: '0xeoabatch0' },
      { transactionHash: '0xeoabatch1' },
    ])
  const wallet = {
    address: walletAddress,
    send,
    sendBatch,
  } as unknown as Wallet
  return { wallet, mocks: { send, sendBatch } }
}

function makeQuote(overrides: Partial<BorrowQuote> = {}): BorrowQuote {
  const now = Math.floor(Date.now() / 1000)
  return {
    marketId: {
      kind: market.kind,
      marketId: market.marketId,
      chainId: market.chainId,
    },
    action: 'open',
    positionBefore: null,
    positionAfter: {
      marketId: {
        kind: market.kind,
        marketId: market.marketId,
        chainId: market.chainId,
      },
      collateralAsset,
      collateralAmount: 0n,
      collateralAmountFormatted: '0',
      borrowAsset,
      borrowAmount: 0n,
      borrowAmountFormatted: '0',
      healthFactor: null,
      liquidationPrice: 0n,
      liquidationPriceFormatted: '0',
      borrowApy: 0.05,
      liquidationBonus: 0.05,
      ltv: null,
      maxLtv: 0.86,
    },
    fees: { borrowApy: 0.05, liquidationBonus: 0.05 },
    safeCeilingLtv: 0.86 * 0.95,
    execution: {
      transactions: [
        {
          to: '0x0000000000000000000000000000000000000001',
          data: '0xdeadbeef',
          value: 0n,
        },
      ],
    },
    provider: 'morpho',
    quotedAt: now,
    expiresAt: now + 30,
    ...overrides,
  }
}

function makeProvider(): BorrowProvider<BorrowProviderConfig> {
  return {
    config: { marketAllowlist: [market] },
    supportedChainIds: () => [BASE_SEPOLIA_ID],
    isChainSupported: () => true,
    openPosition: vi.fn(async () => makeQuote()),
    closePosition: vi.fn(async () => makeQuote({ action: 'close' })),
    depositCollateral: vi.fn(async () =>
      makeQuote({ action: 'depositCollateral' }),
    ),
    withdrawCollateral: vi.fn(async () =>
      makeQuote({ action: 'withdrawCollateral' }),
    ),
    repay: vi.fn(async () => makeQuote({ action: 'repay' })),
    getMarket: vi.fn(),
    getMarkets: vi.fn(),
    getPosition: vi.fn(),
  } as unknown as BorrowProvider<BorrowProviderConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WalletBorrowNamespace - quote dispatch', () => {
  it('dispatches a valid pre-built quote via wallet.send', async () => {
    const { wallet, mocks } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    const receipt = await namespace.openPosition(makeQuote())
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.sendBatch).not.toHaveBeenCalled()
    expect(receipt.action).toBe('open')
    expect(receipt.marketId.chainId).toBe(BASE_SEPOLIA_ID)
  })

  it('dispatches via wallet.sendBatch when multiple txs are present', async () => {
    const { wallet, mocks } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    const quote = makeQuote({
      execution: {
        transactions: [
          {
            to: '0x0000000000000000000000000000000000000001',
            data: '0xaa',
            value: 0n,
          },
          {
            to: '0x0000000000000000000000000000000000000002',
            data: '0xbb',
            value: 0n,
          },
        ],
      },
    })
    await namespace.openPosition(quote)
    expect(mocks.sendBatch).toHaveBeenCalledTimes(1)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('re-quotes raw params that happen to include quotedAt', async () => {
    const { wallet, mocks } = makeWallet()
    const provider = makeProvider()
    const namespace = new WalletBorrowNamespace({ morpho: provider }, wallet)

    await namespace.openPosition({
      market,
      borrowAmount: { amountRaw: 1n },
      quotedAt: Math.floor(Date.now() / 1000),
    } as {
      market: BorrowMarketConfig
      borrowAmount: { amountRaw: bigint }
      quotedAt: number
    })

    expect(provider.openPosition).toHaveBeenCalledTimes(1)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})

describe('WalletBorrowNamespace - quote validation', () => {
  it('throws QuoteExpiredError when the quote has expired', async () => {
    const { wallet } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    const now = Math.floor(Date.now() / 1000)
    await expect(
      namespace.openPosition(
        makeQuote({ quotedAt: now - 60, expiresAt: now - 1 }),
      ),
    ).rejects.toBeInstanceOf(QuoteExpiredError)
  })

  it('throws ChainNotSupportedError for a quote on an unsupported chain', async () => {
    const { wallet } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    await expect(
      namespace.openPosition(
        makeQuote({
          marketId: {
            kind: 'morpho-blue',
            marketId: market.marketId,
            chainId: 1 as SupportedChainId,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ChainNotSupportedError)
  })

  it('throws ProviderNotConfiguredError for a quote outside the configured market allowlist', async () => {
    const { wallet } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    await expect(
      namespace.openPosition(
        makeQuote({
          marketId: {
            kind: 'morpho-blue',
            marketId:
              '0x9999999999999999999999999999999999999999999999999999999999999999',
            chainId: BASE_SEPOLIA_ID,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError)
  })

  it('throws InvalidParamsError when quote.action does not match the called method', async () => {
    const { wallet } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    await expect(
      namespace.openPosition(makeQuote({ action: 'repay' })),
    ).rejects.toBeInstanceOf(InvalidParamsError)
  })
})

describe('WalletBorrowNamespace - re-quote', () => {
  it('re-quotes raw params through the underlying provider', async () => {
    const { wallet } = makeWallet()
    const provider = makeProvider()
    const namespace = new WalletBorrowNamespace({ morpho: provider }, wallet)
    await namespace.openPosition({
      market,
      borrowAmount: { amountRaw: 1n },
    })
    expect(provider.openPosition).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress }),
    )
  })

  it('injects walletAddress across every raw-params action path', async () => {
    const { wallet } = makeWallet()
    const provider = makeProvider()
    const namespace = new WalletBorrowNamespace({ morpho: provider }, wallet)

    await namespace.closePosition({
      market,
      borrowAmount: { max: true },
    })
    await namespace.depositCollateral({
      market,
      amount: { amountRaw: 1n },
    })
    await namespace.withdrawCollateral({
      market,
      amount: { max: true },
    })
    await namespace.repay({
      market,
      amount: { amountRaw: 1n },
    })

    expect(provider.closePosition).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress }),
    )
    expect(provider.depositCollateral).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress }),
    )
    expect(provider.withdrawCollateral).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress }),
    )
    expect(provider.repay).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress }),
    )
  })

  it('routes by marketId when no provider configures the market in its allowlist', async () => {
    const { wallet } = makeWallet()
    const provider = makeProvider()
    ;(provider.config as BorrowProviderConfig).marketAllowlist = []
    const namespace = new WalletBorrowNamespace({ morpho: provider }, wallet)
    await namespace.depositCollateral({
      market,
      amount: { amountRaw: 1n },
    })
    expect(provider.depositCollateral).toHaveBeenCalled()
  })
})

describe('WalletBorrowNamespace - receipt envelope hashes', () => {
  it('surfaces transactionHash for a single EOA tx', async () => {
    const { wallet } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    const receipt = await namespace.openPosition(makeQuote())
    expect(receipt.transactionHash).toBe('0xeoatxhash')
    expect(receipt.transactionHashes).toBeUndefined()
    expect(receipt.userOpHash).toBeUndefined()
  })

  it('surfaces transactionHashes for batched EOA txs', async () => {
    const { wallet } = makeWallet()
    const namespace = new WalletBorrowNamespace(
      { morpho: makeProvider() },
      wallet,
    )
    const quote = makeQuote({
      execution: {
        transactions: [
          {
            to: '0x0000000000000000000000000000000000000001',
            data: '0xaa',
            value: 0n,
          },
          {
            to: '0x0000000000000000000000000000000000000002',
            data: '0xbb',
            value: 0n,
          },
        ],
      },
    })
    const receipt = await namespace.openPosition(quote)
    expect(receipt.transactionHashes).toEqual(['0xeoabatch0', '0xeoabatch1'])
    expect(receipt.transactionHash).toBeUndefined()
    expect(receipt.userOpHash).toBeUndefined()
  })
})

describe('WalletBorrowNamespace - provider resolution failure', () => {
  it('throws when no borrow provider is configured', async () => {
    const { wallet } = makeWallet()
    const namespace = new WalletBorrowNamespace({}, wallet)
    await expect(
      namespace.openPosition({
        market,
        borrowAmount: { amountRaw: 1n },
      }),
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError)
  })
})
