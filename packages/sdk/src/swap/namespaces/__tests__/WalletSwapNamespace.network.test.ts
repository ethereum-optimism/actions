/**
 * Network fork system tests for WalletSwapNamespace.
 *
 * Tests the full wallet execution path: quote -> approve -> swap -> verify balances.
 * Uses a real EOAWallet subclass backed by deterministic Anvil accounts.
 *
 * Run: pnpm test:network
 */
import type { Address } from 'viem'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { WalletSwapNamespace } from '@/swap/namespaces/WalletSwapNamespace.js'
import { VelodromeSwapProvider } from '@/swap/providers/velodrome/VelodromeSwapProvider.js'
import { FORK_CHAINS, OP_OP, OP_USDC } from '@/test/network/fixtures/index.js'
import { expectReceiptSuccess } from '@/test/network/harness/assertions.js'
import {
  type AnvilFork,
  fundERC20,
  fundETH,
  getERC20Balance,
  revert,
  snapshot,
  startFork,
  stopAllForks,
} from '@/test/network/harness/index.js'
import {
  createForkChainManager,
  TestEOAWallet,
} from '@/test/network/harness/wallets.js'

let opFork: AnvilFork
let forkMap: Map<SupportedChainId, AnvilFork>
let snapshotId: string

describe('WalletSwapNamespace network fork tests', () => {
  beforeAll(async () => {
    opFork = await startFork(FORK_CHAINS.optimism)
    forkMap = new Map<SupportedChainId, AnvilFork>()
    forkMap.set(opFork.config.chainId, opFork)
  }, 60_000)

  afterAll(() => stopAllForks())

  beforeEach(async () => {
    snapshotId = await snapshot(opFork)
  })

  afterEach(async () => {
    await revert(opFork, snapshotId)
  })

  describe('Optimism — Velodrome swap execution', () => {
    it('execute USDC -> OP: balance of OP increases', async () => {
      const chainManager = createForkChainManager(forkMap)
      const wallet = await TestEOAWallet.create(chainManager)
      const chainId = opFork.config.chainId

      await fundETH(opFork, wallet.address)
      await fundERC20(opFork, wallet.address, OP_USDC, 100_000_000n) // 100 USDC

      const provider = new VelodromeSwapProvider(
        {
          defaultSlippage: 0.01,
          marketAllowlist: [
            { assets: [OP_USDC, OP_OP], stable: false, chainId },
          ],
        },
        chainManager,
      )

      const swapNs = new WalletSwapNamespace({ velodrome: provider }, wallet)

      const opTokenAddress = OP_OP.address[chainId]! as Address
      const balanceBefore = await getERC20Balance(
        opFork.client,
        opTokenAddress,
        wallet.address,
      )

      const quote = await swapNs.getQuote({
        assetIn: OP_USDC,
        assetOut: OP_OP,
        amountIn: 10,
        chainId,
      })

      expect(quote.amountOut).toBeGreaterThan(0)
      expect(quote.recipient).toBe(wallet.address)

      const receipt = await swapNs.execute(quote)
      expectReceiptSuccess(receipt.receipt)

      const balanceAfter = await getERC20Balance(
        opFork.client,
        opTokenAddress,
        wallet.address,
      )
      expect(balanceAfter).toBeGreaterThan(balanceBefore)
      expect(receipt.amountOut).toBeGreaterThan(0)
    })
  })
})
