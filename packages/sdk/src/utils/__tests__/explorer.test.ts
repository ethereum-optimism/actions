import { describe, expect, it } from 'vitest'

import { getExplorerUrl } from '../explorer.js'

describe('Explorer URL Utility', () => {
  const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

  it('should return Etherscan URL for Ethereum mainnet', () => {
    const url = getExplorerUrl(1, mockTxHash)
    expect(url).toBe(`https://etherscan.io/tx/${mockTxHash}`)
  })

  it('should return explorer URL for Optimism', () => {
    const url = getExplorerUrl(10, mockTxHash)
    expect(url).toBe(`https://explorer.optimism.io/tx/${mockTxHash}`)
  })

  it('should return explorer URL for Base', () => {
    const url = getExplorerUrl(8453, mockTxHash)
    expect(url).toContain('/tx/')
    expect(url).toContain(mockTxHash)
  })

  it('should return Sepolia Etherscan URL for Sepolia testnet', () => {
    const url = getExplorerUrl(11155111, mockTxHash)
    expect(url).toBe(`https://sepolia.etherscan.io/tx/${mockTxHash}`)
  })

  it('should return OP Sepolia explorer URL', () => {
    const url = getExplorerUrl(11155420, mockTxHash)
    expect(url).toContain('/tx/')
    expect(url).toContain(mockTxHash)
  })

  it('should return Base Sepolia explorer URL', () => {
    const url = getExplorerUrl(84532, mockTxHash)
    expect(url).toContain('/tx/')
    expect(url).toContain(mockTxHash)
  })

  it('should return Unichain explorer URL', () => {
    const url = getExplorerUrl(130, mockTxHash)
    expect(url).toBe(`https://explorer.unichain.org/tx/${mockTxHash}`)
  })

  it('should handle undefined explorer gracefully', () => {
    const url = getExplorerUrl(999999 as any, mockTxHash)
    expect(url).toBeUndefined()
  })

  it('should format URL correctly with tx path', () => {
    const url = getExplorerUrl(10, mockTxHash)
    expect(url).toMatch(/^https:\/\/.+\/tx\/0x[0-9a-f]{64}$/)
  })
})
