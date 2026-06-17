import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { createMockSwapProvider } from '@/actions/swap/__mocks__/MockSwapProvider.js'
import { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
import { WalletSwapNamespace } from '@/actions/swap/namespaces/WalletSwapNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
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

    it('defaults recipient to wallet address when omitted', async () => {
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
          recipient: mockWalletAddress,
        }),
      )
    })

    it('preserves explicit recipient over wallet address', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)
      const customRecipient =
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address

      await namespace.execute({
        amountIn: 100,
        assetIn: USDC,
        assetOut: ETH,
        chainId: 84532 as SupportedChainId,
        recipient: customRecipient,
      })

      expect(provider.mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: customRecipient,
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
      ).rejects.toThrow("A 'swap' provider is not configured")
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

  describe('getQuote recipient injection', () => {
    it('injects wallet address as recipient', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      const quote = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      // Quote should have wallet address as the encoded recipient
      expect(quote.recipient).toBe(mockWalletAddress)
    })

    it('preserves explicit recipient over wallet address', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)
      const customRecipient =
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address

      const quote = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
        recipient: customRecipient,
      })

      expect(quote.recipient).toBe(customRecipient)
    })

    it('rejects a price-only quote passed to execute (no recipient to bind)', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const actions = new ActionsSwapNamespace({ uniswap: provider })
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      // A PriceQuote from actions.swap.getQuote carries quotedAt (so execute
      // routes it down the pre-built-quote path) but has no recipient. It must
      // fail loudly rather than silently re-quoting to the wallet — re-quote
      // via wallet.swap.getQuote to execute.
      const priceQuote = await actions.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      await expect(namespace.execute(priceQuote)).rejects.toThrow()
      expect(provider.mockExecute).not.toHaveBeenCalled()
    })
  })

  describe('execute with recipient mismatch', () => {
    it('throws when quote.recipient does not match wallet.address', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      // Get quote without wallet (simulates ActionsSwapNamespace quote — recipient
      // defaults to UNIVERSAL_ROUTER_MSG_SENDER, not the executing wallet)
      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(quote.recipient).not.toBe(mockWalletAddress)

      await expect(namespace.execute(quote)).rejects.toThrow(
        /generated for a different recipient/i,
      )
      // Provider's getQuote was called once (the original); execute did not re-quote.
      expect(provider.mockGetQuote).toHaveBeenCalledTimes(1)
    })

    it('throws on a quote built for a different wallet address', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)
      const otherWallet =
        '0x9999999999999999999999999999999999999999' as Address

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
        recipient: otherWallet,
      })

      expect(quote.recipient).toBe(otherWallet)

      await expect(namespace.execute(quote)).rejects.toThrow(
        /generated for a different recipient/i,
      )
    })

    it('executes when quote.recipient equals wallet.address', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      const quote = await namespace.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
      })

      expect(quote.recipient).toBe(mockWalletAddress)

      const result = await namespace.execute(quote)
      expect(result.price).toBeDefined()
      // Single getQuote call — no re-quote, no re-encode.
      expect(provider.mockGetQuote).toHaveBeenCalledTimes(1)
    })

    it('executes when quote.recipient differs only in case from wallet.address', async () => {
      // Address with hex letters so case actually changes the string. The
      // wallet uses checksummed casing; the quote uses lowercase. Without
      // `isAddressEqual` the strict `!==` would falsely reject.
      const checksummedAddress =
        '0xAbCdEf1234567890aBcDeF1234567890ABcDeF12' as Address
      const lowercaseAddress = checksummedAddress.toLowerCase() as Address

      const provider = createMockSwapProvider()
      const wallet = {
        address: checksummedAddress,
        send: vi.fn().mockResolvedValue({ transactionHash: '0xtx1' }),
        sendBatch: vi.fn().mockResolvedValue({ transactionHash: '0xtx2' }),
      } as unknown as Wallet
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      const quote = await provider.getQuote({
        assetIn: USDC,
        assetOut: ETH,
        amountIn: 100,
        chainId: 84532 as SupportedChainId,
        recipient: lowercaseAddress,
      })

      expect(quote.recipient).toBe(lowercaseAddress)
      expect(quote.recipient).not.toBe(checksummedAddress)

      const result = await namespace.execute(quote)
      expect(result.price).toBeDefined()
    })
  })

  describe('inherits read-only methods', () => {
    it('has getMarkets method from BaseSwapNamespace', async () => {
      const provider = createMockSwapProvider()
      const wallet = createMockWallet()
      const namespace = new WalletSwapNamespace({ uniswap: provider }, wallet)

      const result = await namespace.getMarkets({})

      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })
})
