/**
 * Network fork system tests for WalletLendNamespace.
 *
 * Tests the full lend lifecycle: openPosition -> getPosition -> closePosition -> verify.
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
import { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'
import { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
import { FORK_CHAINS, OP_USDC } from '@/test/network/fixtures/index.js'
import { expectReceiptSuccess } from '@/test/network/harness/assertions.js'
import {
  type AnvilFork,
  fundERC20,
  fundETH,
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

describe('WalletLendNamespace network fork tests', () => {
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

  describe('Optimism — Aave USDC lend lifecycle', () => {
    it('openPosition -> getPosition -> closePosition', async () => {
      const chainManager = createForkChainManager(forkMap)
      const wallet = await TestEOAWallet.create(chainManager)
      const chainId = opFork.config.chainId
      const usdcAddress = OP_USDC.address[chainId]! as Address

      await fundETH(opFork, wallet.address)
      await fundERC20(opFork, wallet.address, OP_USDC, 1_000_000_000n) // 1000 USDC

      const provider = new AaveLendProvider({}, chainManager)

      const lendNs = new WalletLendNamespace({ aave: provider }, wallet)

      const marketId = { address: usdcAddress, chainId }

      const openReceipt = await lendNs.openPosition({
        marketId,
        amount: 100,
        asset: OP_USDC,
      })
      expectReceiptSuccess(openReceipt)

      const position = await lendNs.getPosition({
        marketId,
        asset: OP_USDC,
      })
      expect(position.balance).toBeGreaterThan(0)
      expect(position.balanceFormatted).toBeGreaterThan(0)

      const closeReceipt = await lendNs.closePosition({
        marketId,
        amount: 50,
        asset: OP_USDC,
      })
      expectReceiptSuccess(closeReceipt)

      const positionAfter = await lendNs.getPosition({
        marketId,
        asset: OP_USDC,
      })
      expect(positionAfter.balance).toBeLessThan(position.balance)
    })
  })
})
