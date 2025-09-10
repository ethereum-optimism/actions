import { chainById } from '@eth-optimism/viem/chains'
import { createSmartAccountClient } from 'permissionless/clients'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { createBundlerClient } from 'viem/account-abstraction'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { ChainConfig, PimlicoBundlerConfig } from '@/types/chain.js'

vi.mock('viem/account-abstraction', () => {
  return {
    createBundlerClient: vi
      .fn()
      .mockReturnValue({ __type: 'bundlerClient' } as unknown),
  }
})

vi.mock('permissionless/clients/pimlico', () => {
  return {
    createPimlicoClient: vi.fn().mockReturnValue({
      getUserOperationGasPrice: vi.fn().mockResolvedValue({
        fast: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
      }),
    } as unknown),
  }
})

vi.mock('permissionless/clients', () => {
  return {
    createSmartAccountClient: vi
      .fn()
      .mockReturnValue({ __type: 'smartAccountClient' } as unknown),
  }
})

describe('ChainManager', () => {
  let chainManager: ChainManager
  let mockChainConfigs: ChainConfig[]

  beforeEach(() => {
    vi.clearAllMocks()
    mockChainConfigs = [
      {
        chainId: unichain.id,
        rpcUrls: ['https://rpc.unichain.org'],
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
          chainId: 99999 as unknown as SupportedChainId,
          rpcUrl: 'https://invalid.rpc',
        },
      ]

      expect(() => new ChainManager(invalidChainConfigs)).toThrow(
        'Chain not found for ID: 99999',
      )
    })

    it('should throw error if multiple chains configured with the same chain ID', () => {
      const multiChainConfigs: ChainConfig[] = [
        { chainId: unichain.id, rpcUrls: ['https://sepolia.unichain.org'] },
        { chainId: unichain.id, rpcUrls: ['https://another.rpc'] },
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
      const unsupportedChainId = 999 as unknown as SupportedChainId

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

  describe('getBundlerClient', () => {
    const mockAccount = {
      entryPoint: {
        address: '0x0000000000000000000000000000000000000005',
        version: '0.6',
      },
    } as unknown as Parameters<ChainManager['getBundlerClient']>[1]

    it('returns Pimlico SmartAccountClient when bundler type is pimlico (with sponsorshipPolicyId)', async () => {
      const bundlerConfig: PimlicoBundlerConfig = {
        type: 'pimlico',
        url: 'https://pimlico.example',
        sponsorshipPolicyId: 'policy-123',
      }
      const configs: ChainConfig[] = [
        {
          chainId: unichain.id,
          rpcUrls: ['https://rpc.unichain.org'],
          bundler: bundlerConfig,
        },
      ]

      const mgr = new ChainManager(configs)
      const client = mgr.getBundlerClient(unichain.id, mockAccount)

      expect(client).toEqual({ __type: 'smartAccountClient' })
      expect(createPimlicoClient).toHaveBeenCalledTimes(1)
      expect(createPimlicoClient).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: chainById[unichain.id],
          entryPoint: {
            address: mockAccount.entryPoint.address,
            version: mockAccount.entryPoint.version,
          },
        }),
      )
      expect(createSmartAccountClient).toHaveBeenCalledTimes(1)
      expect(createSmartAccountClient).toHaveBeenCalledWith(
        expect.objectContaining({
          account: mockAccount,
          chain: chainById[unichain.id],
          paymasterContext: {
            sponsorshipPolicyId: bundlerConfig.sponsorshipPolicyId!,
          },
          userOperation: {
            estimateFeesPerGas: expect.any(Function),
          },
        }),
      )
    })

    it('returns Pimlico SmartAccountClient when bundler type is pimlico (without sponsorshipPolicyId)', async () => {
      const configs: ChainConfig[] = [
        {
          chainId: unichain.id,
          rpcUrls: ['https://rpc.unichain.org'],
          bundler: {
            type: 'pimlico',
            url: 'https://pimlico.example',
          },
        },
      ]

      const mgr = new ChainManager(configs)

      const client = mgr.getBundlerClient(unichain.id, mockAccount)
      expect(client).toEqual({ __type: 'smartAccountClient' })
      expect(createPimlicoClient).toHaveBeenCalledTimes(1)
      expect(createSmartAccountClient).toHaveBeenCalledTimes(1)
      expect(createSmartAccountClient).toHaveBeenCalledWith(
        expect.objectContaining({
          account: mockAccount,
          chain: chainById[unichain.id],
          paymasterContext: undefined,
          userOperation: {
            estimateFeesPerGas: expect.any(Function),
          },
        }),
      )
    })

    it('returns viem BundlerClient when bundler type is simple', async () => {
      const configs: ChainConfig[] = [
        {
          chainId: unichain.id,
          rpcUrls: ['https://rpc.unichain.org'],
          bundler: {
            type: 'simple',
            url: 'https://bundler.example',
          },
        },
      ]

      const mgr = new ChainManager(configs)

      const client = mgr.getBundlerClient(unichain.id, mockAccount)
      expect(client).toEqual({ __type: 'bundlerClient' })
      expect(createBundlerClient).toHaveBeenCalledTimes(1)
      expect(createBundlerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          account: mockAccount,
          chain: chainById[unichain.id],
        }),
      )
      expect(createPimlicoClient).not.toHaveBeenCalled()
      expect(createSmartAccountClient).not.toHaveBeenCalled()
    })

    it('throws when no bundler is configured for the chain', () => {
      const configs: ChainConfig[] = [
        {
          chainId: unichain.id,
          rpcUrls: ['https://rpc.unichain.org'],
        },
      ]

      const mgr = new ChainManager(configs)

      expect(() => mgr.getBundlerClient(unichain.id, mockAccount)).toThrow(
        `No bundler configured for chain ID: ${unichain.id}`,
      )
    })

    it('throws when bundler URL is empty for simple bundler', () => {
      const configs: ChainConfig[] = [
        {
          chainId: unichain.id,
          rpcUrls: ['https://rpc.unichain.org'],
          bundler: {
            type: 'simple',
            url: '',
          },
        },
      ]

      const mgr = new ChainManager(configs)

      expect(() => mgr.getBundlerClient(unichain.id, mockAccount)).toThrow(
        `No bundler URL configured for chain ID: ${unichain.id}`,
      )
    })
  })
})
