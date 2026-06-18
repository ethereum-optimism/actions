import type { SmartWallet } from '@eth-optimism/actions-sdk'
import { getAssetAddress, USDC_DEMO } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { decodeFunctionData, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi.js'
import {
  mintMirrorUsdc,
  MIRROR_SINK_ADDRESS,
  removeMirrorUsdc,
} from '@/services/mirror.js'

// Checksummed so it matches the address viem returns from decodeFunctionData.
const WALLET = getAddress('0x000000000000000000000000000000000000beef')
const USDC_DEMO_BASE = getAssetAddress(USDC_DEMO, baseSepolia.id)

type Call = { to: Address; data: `0x${string}`; value: bigint }

function makeWallet() {
  const sendBatch = vi.fn(async (_calls: Call[], _chainId: number) => ({
    transactionHash: '0xabc',
  }))
  const wallet = { address: WALLET, sendBatch } as unknown as SmartWallet
  return { wallet, sendBatch }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('mirror module', () => {
  it('mints USDC_DEMO to the user wallet on Base Sepolia', async () => {
    const { wallet, sendBatch } = makeWallet()
    await mintMirrorUsdc(wallet, 100_000_000n, '0xreal')

    expect(sendBatch).toHaveBeenCalledTimes(1)
    const [calls, chainId] = sendBatch.mock.calls[0]
    expect(chainId).toBe(baseSepolia.id)
    expect(calls[0].to.toLowerCase()).toBe(USDC_DEMO_BASE.toLowerCase())
    const decoded = decodeFunctionData({
      abi: mintableErc20Abi,
      data: calls[0].data,
    })
    expect(decoded.functionName).toBe('mint')
    expect(decoded.args).toEqual([WALLET, 100_000_000n])
  })

  it('removes USDC_DEMO by transferring the repaid amount to the dead sink', async () => {
    const { wallet, sendBatch } = makeWallet()
    await removeMirrorUsdc(wallet, 40_000_000n, '0xreal')

    const [calls] = sendBatch.mock.calls[0]
    const decoded = decodeFunctionData({
      abi: mintableErc20Abi,
      data: calls[0].data,
    })
    expect(decoded.functionName).toBe('transfer')
    expect(decoded.args).toEqual([MIRROR_SINK_ADDRESS, 40_000_000n])
  })

  it('never rejects into the caller when the mirror tx fails', async () => {
    const sendBatch = vi.fn(async () => {
      throw new Error('rpc down')
    })
    const wallet = { address: WALLET, sendBatch } as unknown as SmartWallet
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(mintMirrorUsdc(wallet, 1n)).resolves.toBeUndefined()
    await expect(removeMirrorUsdc(wallet, 1n)).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()
  })
})
