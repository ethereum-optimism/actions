import { afterEach, describe, expect, it, vi } from 'vitest'
import { erc4626Abi, type Address } from 'viem'

const { readContract, createPublicClient } = vi.hoisted(() => {
  const readContract = vi.fn()
  return { readContract, createPublicClient: vi.fn(() => ({ readContract })) }
})

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return { ...actual, createPublicClient }
})

vi.mock('@/envVars', () => ({
  env: {
    VITE_BASE_SEPOLIA_RPC_URL: undefined,
    VITE_OP_SEPOLIA_RPC_URL: undefined,
  },
}))

const VAULT = '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1' as Address
const CHAIN_ID = 84532

afterEach(() => {
  readContract.mockReset()
  createPublicClient.mockClear()
})

describe('fetchCollateralUnderlying', () => {
  it('reads convertToAssets for the vault with the given shares', async () => {
    readContract.mockResolvedValue(107_271_719n)
    const { fetchCollateralUnderlying } = await import('./vaultCollateral')

    const result = await fetchCollateralUnderlying(
      VAULT,
      4_572_262_248_432_600_730n,
      CHAIN_ID,
    )

    expect(result).toBe(107_271_719n)
    expect(readContract).toHaveBeenCalledWith({
      address: VAULT,
      abi: erc4626Abi,
      functionName: 'convertToAssets',
      args: [4_572_262_248_432_600_730n],
    })
  })

  it('short-circuits to 0n for zero shares without a chain read', async () => {
    const { fetchCollateralUnderlying } = await import('./vaultCollateral')
    const result = await fetchCollateralUnderlying(VAULT, 0n, CHAIN_ID)
    expect(result).toBe(0n)
    expect(readContract).not.toHaveBeenCalled()
  })

  it('reuses one client per chain across calls', async () => {
    readContract.mockResolvedValue(1n)
    const { fetchCollateralUnderlying } = await import('./vaultCollateral')
    createPublicClient.mockClear()

    // Use a chain not exercised by the other tests so the module-level client
    // cache starts empty for this assertion regardless of test order.
    const FRESH_CHAIN_ID = 11155420
    await fetchCollateralUnderlying(VAULT, 1n, FRESH_CHAIN_ID)
    await fetchCollateralUnderlying(VAULT, 2n, FRESH_CHAIN_ID)

    expect(createPublicClient).toHaveBeenCalledTimes(1)
  })
})
