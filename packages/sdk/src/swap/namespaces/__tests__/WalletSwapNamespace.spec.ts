import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { createMockSwapProvider } from '@/swap/__mocks__/MockSwapProvider.js'
import { WalletSwapNamespace } from '@/swap/namespaces/WalletSwapNamespace.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

describe('WalletSwapNamespace', () => {
  const USDC = {
    type: 'erc20' as const,
    address: { 84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const },
    metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  }
  const ETH = {
    type: 'native' as const,
    address: { 84532: '0x0000000000000000000000000000000000000000' as const },
    metadata: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  }

  const mockWalletAddress =
    '0x1234567890123456789012345678901234567890' as Address

  function createMockWallet(): Wallet {
    return {
      address: mockWalletAddress,
      send: vi.fn().mockResolvedValue({ transactionHash: '0xtx1' }),
      sendBatch: vi.fn().mockResolvedValue({ transactionHash: '0xtx2' }),
    } as unknown as Wallet
  }

  describe('execute', () => {
    it('executes swap with single transaction', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      const result = await namespace.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: ETH,
        chainId: 84532 as SupportedChainId,
      })

      expect(provider.mockExecute).toHaveBeenCalledTimes(1)
      expect(wallet.send).toHaveBeenCalledTimes(1)
      expect(wallet.sendBatch).not.toHaveBeenCalled()
      expect(result.price).toBe(1.5)
      expect(result.assetIn).toBe(USDC)
      expect(result.assetOut).toBe(ETH)
    })

    it('batches transactions when approvals needed', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      // Override mock to return transaction with approvals
      provider.mockExecute.mockResolvedValueOnce({
        amountIn: 100,
        amountOut: 1.5,
        amountInRaw: 100000000n,
        amountOutRaw: 1500000000000000000n,
        assetIn: USDC,
        assetOut: ETH,
        price: 1.5,
        priceImpact: 0.001,
        transactionData: {
          tokenApproval: {
            to: '0xpermit2' as Address,
            data: '0xapprove' as `0x${string}`,
            value: 0n,
          },
          permit2Approval: {
            to: '0xpermit2' as Address,
            data: '0xpermit' as `0x${string}`,
            value: 0n,
          },
          swap: {
            to: '0xrouter' as Address,
            data: '0xswap' as `0x${string}`,
            value: 0n,
          },
        },
      })

      await namespace.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: ETH,
        chainId: 84532 as SupportedChainId,
      })

      expect(wallet.sendBatch).toHaveBeenCalledTimes(1)
      expect(wallet.send).not.toHaveBeenCalled()

      // Verify all 3 transactions were batched
      const batchCall = vi.mocked(wallet.sendBatch).mock.calls[0]
      expect(batchCall[0]).toHaveLength(3)
    })

    it('passes wallet address to provider', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      await namespace.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: ETH,
        chainId: 84532 as SupportedChainId,
      })

      expect(provider.mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: mockWalletAddress,
        }),
      )
    })

    it('throws when no provider configured', async () => {
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({}, wallet)

      await expect(
        namespace.execute({
          amountIn: 100,
          assetIn: USDC,
          assetOut: ETH,
          chainId: 84532 as SupportedChainId,
        }),
      ).rejects.toThrow('No swap provider configured')
    })

    it('executes swap from a SwapQuote (skips re-quoting)', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      // Get a quote first
      const quote = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      // Execute with the quote
      const result = await namespace.execute(quote)

      // Should use quote path: _buildApprovals called, not _execute
      expect(provider.mockBuildApprovals).toHaveBeenCalledTimes(1)
      expect(provider.mockExecute).not.toHaveBeenCalled()
      expect(result.price).toBe(1.5)
      expect(wallet.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('inherits read-only methods', () => {
    it('has getQuote method from BaseSwapNamespace', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      const result = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(result.price).toBe(1.5)
    })

    it('has getMarkets method from BaseSwapNamespace', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      const result = await namespace.getMarkets({})

      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })
})
