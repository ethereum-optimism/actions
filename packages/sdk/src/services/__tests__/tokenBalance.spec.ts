import type { Address } from 'viem'
import { erc20Abi } from 'viem'
import { base, celo, optimism, unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MockUSDCAsset } from '@/__mocks__/MockAssets.js'
import { ETH } from '@/constants/assets.js'
import {
  MULTICALL3_ADDRESS,
  multicall3GetEthBalanceAbi,
} from '@/constants/multicall.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchBalances } from '@/services/tokenBalance.js'
import type { Asset } from '@/types/asset.js'

describe('fetchBalances', () => {
  let chainManager: ChainManager
  const walletAddress: Address = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    chainManager = new MockChainManager({
      supportedChains: [unichain.id],
      defaultBalance: 1000000n,
    }) as unknown as ChainManager
  })

  const multiChainManager = (): ChainManager =>
    new MockChainManager({
      supportedChains: [optimism.id, base.id, unichain.id],
      defaultBalance: 1000000n,
    }) as unknown as ChainManager

  it('fetches ERC20 balances across supported chains', async () => {
    const [usdc] = await fetchBalances(chainManager, walletAddress, [
      MockUSDCAsset,
    ])

    expect(usdc).toEqual({
      asset: MockUSDCAsset,
      totalBalance: 1,
      totalBalanceRaw: 1000000n,
      chains: {
        [unichain.id]: { balance: 1, balanceRaw: 1000000n },
      },
    })
  })

  it('fetches the native ETH balance via Multicall3 getEthBalance', async () => {
    const [eth] = await fetchBalances(chainManager, walletAddress, [ETH])

    expect(eth).toEqual({
      asset: ETH,
      totalBalance: 0.000000000001,
      totalBalanceRaw: 1000000n,
      chains: {
        [unichain.id]: { balance: 0.000000000001, balanceRaw: 1000000n },
      },
    })

    // The native balance is read through Multicall3's getEthBalance entry.
    const client = chainManager.getPublicClient(unichain.id)
    const contracts = vi.mocked(client.multicall).mock.calls[0][0]
      .contracts as any[]
    expect(contracts).toHaveLength(1)
    expect(contracts[0].address.toLowerCase()).toBe(
      MULTICALL3_ADDRESS.toLowerCase(),
    )
    expect(contracts[0].abi).toBe(multicall3GetEthBalanceAbi)
    expect(contracts[0].functionName).toBe('getEthBalance')
    expect(contracts[0].args).toEqual([walletAddress])
  })

  it('batches native + ERC20 reads into a single multicall per chain', async () => {
    const balances = await fetchBalances(chainManager, walletAddress, [
      ETH,
      MockUSDCAsset,
    ])

    expect(balances.map((b) => b.asset)).toEqual([ETH, MockUSDCAsset])

    const client = chainManager.getPublicClient(unichain.id)
    expect(client.multicall).toHaveBeenCalledTimes(1)
    const contracts = vi.mocked(client.multicall).mock.calls[0][0]
      .contracts as any[]
    expect(contracts).toHaveLength(2)
    expect(contracts[0].functionName).toBe('getEthBalance')
    expect(contracts[1]).toEqual({
      address: MockUSDCAsset.address[unichain.id],
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress],
    })
  })

  it('queries only the requested chains when chainIds is provided', async () => {
    const cm = multiChainManager()

    const [usdc] = await fetchBalances(cm, walletAddress, [MockUSDCAsset], {
      chainIds: [base.id],
    })

    expect(usdc.chains).toEqual({
      [base.id]: { balance: 1, balanceRaw: 1000000n },
    })
    expect(usdc.totalBalanceRaw).toBe(1000000n)
    expect(cm.getPublicClient).toHaveBeenCalledTimes(1)
    expect(cm.getPublicClient).toHaveBeenCalledWith(base.id)
  })

  it('aggregates an ERC20 balance across multiple chains', async () => {
    const cm = multiChainManager()

    const [usdc] = await fetchBalances(cm, walletAddress, [MockUSDCAsset], {
      chainIds: [optimism.id, base.id],
    })

    expect(Object.keys(usdc.chains).map(Number).sort()).toEqual(
      [optimism.id, base.id].sort(),
    )
    expect(usdc.totalBalanceRaw).toBe(2000000n)
  })

  it('skips chains where the asset has no configured address', async () => {
    const cm = multiChainManager()
    const opOnly: Asset = {
      ...MockUSDCAsset,
      address: { [optimism.id]: MockUSDCAsset.address[optimism.id] } as any,
    }

    const [usdc] = await fetchBalances(cm, walletAddress, [opOnly], {
      chainIds: [optimism.id, base.id],
    })

    expect(usdc.chains).toEqual({
      [optimism.id]: { balance: 1, balanceRaw: 1000000n },
    })
    // No multicall is issued for a chain with no applicable assets.
    expect(cm.getPublicClient).toHaveBeenCalledTimes(1)
    expect(cm.getPublicClient).toHaveBeenCalledWith(optimism.id)
  })

  it('returns zero balance when an asset is unsupported on every chain', async () => {
    const unsupportedAsset: Asset = {
      metadata: {
        symbol: 'UNSUPPORTED',
        name: 'Unsupported Token',
        decimals: 18,
      },
      address: { 27637: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' } as any,
      type: 'erc20',
    }

    const [balance] = await fetchBalances(chainManager, walletAddress, [
      unsupportedAsset,
    ])

    expect(balance).toEqual({
      asset: unsupportedAsset,
      totalBalance: 0,
      totalBalanceRaw: 0n,
      chains: {},
    })
  })

  it('omits an asset on a chain whose inner call failed', async () => {
    const client = chainManager.getPublicClient(unichain.id)
    vi.mocked(client.multicall).mockResolvedValueOnce([
      { status: 'success', result: 1000000n },
      { status: 'failure', error: new Error('reverted') },
    ] as any)

    const [eth, usdc] = await fetchBalances(chainManager, walletAddress, [
      ETH,
      MockUSDCAsset,
    ])

    expect(eth.chains).toEqual({
      [unichain.id]: { balance: 0.000000000001, balanceRaw: 1000000n },
    })
    expect(usdc.chains).toEqual({})
    expect(usdc.totalBalanceRaw).toBe(0n)
  })

  it('reads native ETH on supported chains absent from the asset address map', async () => {
    // celo is a supported chain but has no entry in ETH.address; the native
    // balance must still be read (matching the previous unconditional fan-out).
    const cm = new MockChainManager({
      supportedChains: [celo.id],
      defaultBalance: 1000000n,
    }) as unknown as ChainManager

    const [eth] = await fetchBalances(cm, walletAddress, [ETH])

    expect(eth.chains).toEqual({
      [celo.id]: { balance: 0.000000000001, balanceRaw: 1000000n },
    })
    expect(eth.totalBalanceRaw).toBe(1000000n)
  })

  it('targets the chain-configured Multicall3 address when present', async () => {
    const custom = '0x000000000000000000000000000000000000cafe' as Address
    vi.spyOn(chainManager as any, 'getChain').mockReturnValue({
      contracts: { multicall3: { address: custom } },
    })

    await fetchBalances(chainManager, walletAddress, [ETH])

    const client = chainManager.getPublicClient(unichain.id)
    const contracts = vi.mocked(client.multicall).mock.calls[0][0]
      .contracts as any[]
    expect(contracts[0].address).toBe(custom)
  })

  it('rejects when a chain multicall fails at the transport level', async () => {
    const client = chainManager.getPublicClient(unichain.id)
    vi.mocked(client.multicall).mockRejectedValueOnce(
      new Error('transport down'),
    )

    await expect(
      fetchBalances(chainManager, walletAddress, [ETH]),
    ).rejects.toThrow('transport down')
  })

  it('aggregates only succeeding chains when one chain inner call fails', async () => {
    const cm = multiChainManager()
    const opClient = cm.getPublicClient(optimism.id)
    vi.mocked(opClient.multicall).mockResolvedValueOnce([
      { status: 'failure', error: new Error('reverted') },
    ] as any)

    const [usdc] = await fetchBalances(cm, walletAddress, [MockUSDCAsset], {
      chainIds: [optimism.id, base.id],
    })

    expect(usdc.chains).toEqual({
      [base.id]: { balance: 1, balanceRaw: 1000000n },
    })
    expect(usdc.totalBalanceRaw).toBe(1000000n)
  })
})
