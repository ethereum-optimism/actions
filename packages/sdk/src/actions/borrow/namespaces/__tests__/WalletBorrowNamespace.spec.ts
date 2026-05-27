import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MockBorrowProvider } from '@/actions/borrow/__mocks__/MockBorrowProvider.js'
import {
  BASE_SEPOLIA_ID,
  borrowAsset,
  collateralAsset,
  market,
  walletAddress,
} from '@/actions/borrow/__tests__/fixtures.js'
import { WalletBorrowNamespace } from '@/actions/borrow/namespaces/WalletBorrowNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  ChainNotSupportedError,
  InvalidParamsError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
} from '@/core/error/errors.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type { BorrowMarketConfig, BorrowQuote } from '@/types/borrow/index.js'
import { TestWallet } from '@/wallet/core/wallets/abstract/__mocks__/TestWallet.js'
import type { EOATransactionReceipt } from '@/wallet/core/wallets/abstract/types/index.js'

const singleTransactionHash =
  '0xe0a0000000000000000000000000000000000000000000000000000000000001'
const batchTransactionHashes = [
  '0xe0a0000000000000000000000000000000000000000000000000000000000002',
  '0xe0a0000000000000000000000000000000000000000000000000000000000003',
] as const

function makeWallet() {
  const chainManager = new MockChainManager({
    supportedChains: [BASE_SEPOLIA_ID],
  }) as unknown as ChainManager
  const wallet = new TestWallet({
    chainManager,
    address: walletAddress,
    signer: privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    ),
  })
  const send = vi
    .spyOn(wallet, 'send')
    .mockResolvedValue(makeEoaReceipt(singleTransactionHash))
  const sendBatch = vi
    .spyOn(wallet, 'sendBatch')
    .mockResolvedValue(batchTransactionHashes.map(makeEoaReceipt))
  return { wallet, mocks: { send, sendBatch } }
}

function makeEoaReceipt(
  transactionHash: EOATransactionReceipt['transactionHash'],
): EOATransactionReceipt {
  return {
    blockHash:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 0n,
    effectiveGasPrice: 0n,
    from: walletAddress,
    gasUsed: 0n,
    logs: [],
    logsBloom: `0x${'0'.repeat(512)}` as EOATransactionReceipt['logsBloom'],
    status: 'success',
    to: '0x0000000000000000000000000000000000000001',
    transactionHash,
    transactionIndex: 0,
    type: 'eip1559',
  }
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
      collateralShares: 0n,
      collateralSharesFormatted: '0',
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

function makeProvider(): MockBorrowProvider {
  const provider = new MockBorrowProvider({ marketAllowlist: [market] })
  provider.openPosition.mockResolvedValue(makeQuote())
  provider.closePosition.mockResolvedValue(makeQuote({ action: 'close' }))
  provider.depositCollateral.mockResolvedValue(
    makeQuote({ action: 'depositCollateral' }),
  )
  provider.withdrawCollateral.mockResolvedValue(
    makeQuote({ action: 'withdrawCollateral' }),
  )
  provider.repay.mockResolvedValue(makeQuote({ action: 'repay' }))
  return provider
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
  it('injects walletAddress for getPosition reads', async () => {
    const { wallet } = makeWallet()
    const provider = makeProvider()
    const namespace = new WalletBorrowNamespace({ morpho: provider }, wallet)
    await namespace.getPosition({
      marketId: {
        kind: market.kind,
        marketId: market.marketId,
        chainId: market.chainId,
      },
    })
    expect(provider.getPosition).toHaveBeenCalledWith({
      marketId: {
        kind: market.kind,
        marketId: market.marketId,
        chainId: market.chainId,
      },
      walletAddress,
    })
  })

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
    expect(receipt.transactionHash).toBe(singleTransactionHash)
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
    expect(receipt.transactionHashes).toEqual(batchTransactionHashes)
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
