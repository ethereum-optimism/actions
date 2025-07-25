import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'

import { ChainManager } from '@/services/ChainManager.js'
import type { ChainConfig } from '@/types/chain.js'

describe('ChainManager', () => {
  let chainManager: ChainManager
  let mockChainConfigs: ChainConfig[]

  beforeEach(() => {
    mockChainConfigs = [
      {
        chainId: unichain.id,
        rpcUrl: 'https://rpc.unichain.org',
      },
    ]
    chainManager = new ChainManager(mockChainConfigs)
  })

  describe('constructor', () => {
    it('should create ChainManager with chain configs', () => {
      expect(chainManager).toBeInstanceOf(ChainManager)
    })

    it('should throw error for unknown chain ID', () => {
      const invalidChainConfigs = [
        {
          chainId: 99999 as any,
          rpcUrl: 'https://invalid.rpc',
        },
      ]

      expect(() => new ChainManager(invalidChainConfigs)).toThrow(
        'Chain not found for ID: 99999',
      )
    })

    it('should throw error if multiple chains configured with the same chain ID', () => {
      const multiChainConfigs: ChainConfig[] = [
        { chainId: unichain.id, rpcUrl: 'https://sepolia.unichain.org' },
        { chainId: unichain.id, rpcUrl: 'https://another.rpc' },
      ]
      expect(() => new ChainManager(multiChainConfigs)).toThrow(
        `Public client already configured for chain ID: ${unichain.id}`,
      )
    })
  })

  describe('getPublicClient', () => {
    it('should return public client for configured chain', () => {
      const client = chainManager.getPublicClient(unichain.id)

      expect(client).toBeDefined()
      expect(client.chain!.id).toBe(unichain.id)
    })

    it('should throw error for unsupported chain', () => {
      const unsupportedChainId = 999 as any

      expect(() => chainManager.getPublicClient(unsupportedChainId)).toThrow(
        'No public client configured for chain ID: 999',
      )
    })
  })

  describe('getSupportedChains', () => {
    it('should return array of supported chain IDs', () => {
      const supportedChains = chainManager.getSupportedChains()
      expect(supportedChains).toEqual([unichain.id])
    })
  })
})
