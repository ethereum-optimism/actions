import { describe, expect, it } from 'vitest'

import { getExplorerUrl } from '../explorer.js'

describe('Explorer URL Utility', () => {
  const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

  it('should return Etherscan URL for Ethereum mainnet', () => {
    const url = getExplorerUrl(1, mockTxHash)
    expect(url).toBe(`https://etherscan.io/tx/${mockTxHash}`)
  })

  it('should return Optimistic Etherscan URL for Optimism', () => {
    const url = getExplorerUrl(10, mockTxHash)
    expect(url).toBe(`https://optimistic.etherscan.io/tx/${mockTxHash}`)
  })

  it('should return Basescan URL for Base', () => {
    const url = getExplorerUrl(8453, mockTxHash)
    expect(url).toBe(`https://basescan.org/tx/${mockTxHash}`)
  })

  it('should return Arbiscan URL for Arbitrum One', () => {
    const url = getExplorerUrl(42161, mockTxHash)
    expect(url).toBe(`https://arbiscan.io/tx/${mockTxHash}`)
  })

  it('should return Sepolia Etherscan URL for Sepolia testnet', () => {
    const url = getExplorerUrl(11155111, mockTxHash)
    expect(url).toBe(`https://sepolia.etherscan.io/tx/${mockTxHash}`)
  })

  it('should return OP Sepolia explorer URL for OP Sepolia', () => {
    const url = getExplorerUrl(11155420, mockTxHash)
    expect(url).toBe(`https://sepolia-optimism.etherscan.io/tx/${mockTxHash}`)
  })

  it('should return Base Sepolia explorer URL for Base Sepolia', () => {
    const url = getExplorerUrl(84532, mockTxHash)
    expect(url).toBe(`https://sepolia.basescan.org/tx/${mockTxHash}`)
  })

  it('should return Unichain explorer URL for Unichain', () => {
    const url = getExplorerUrl(130, mockTxHash)
    expect(url).toBeDefined()
    expect(url).toContain('/tx/')
    expect(url).toContain(mockTxHash)
  })

  it('should handle undefined explorer gracefully', () => {
    // Using a hypothetical chain ID that might not have an explorer configured
    const url = getExplorerUrl(999999 as any, mockTxHash)
    expect(url).toBeUndefined()
  })

  it('should format URL correctly with tx path', () => {
    const url = getExplorerUrl(1, mockTxHash)
    expect(url).toMatch(/^https:\/\/.+\/tx\/0x[0-9a-f]{64}$/)
  })
})
