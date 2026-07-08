import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { MOCK_ADDRESS, MOCK_ENS_NAME } from '@/__tests__/helpers/ens.js'
import { CliError } from '@/output/errors.js'
import { resolveWalletAddress } from '@/resolvers/ens.js'

describe('resolveWalletAddress', () => {
  it('checksums --address input', async () => {
    const ens = {
      getAddress: vi.fn(async (): Promise<Address> => MOCK_ADDRESS),
    }

    await expect(
      resolveWalletAddress(ens, { address: MOCK_ADDRESS.toLowerCase() }),
    ).resolves.toBe(MOCK_ADDRESS)
    expect(ens.getAddress).not.toHaveBeenCalled()
  })

  it('resolves --ens input through the ENS resolver', async () => {
    const ens = {
      getAddress: vi.fn(async (): Promise<Address> => MOCK_ADDRESS),
    }

    await expect(
      resolveWalletAddress(ens, { ens: MOCK_ENS_NAME }),
    ).resolves.toBe(MOCK_ADDRESS)
    expect(ens.getAddress).toHaveBeenCalledWith(MOCK_ENS_NAME)
  })

  it('rejects both flags', async () => {
    const ens = {
      getAddress: vi.fn(async (): Promise<Address> => MOCK_ADDRESS),
    }

    await expect(
      resolveWalletAddress(ens, {
        address: MOCK_ADDRESS,
        ens: MOCK_ENS_NAME,
      }),
    ).rejects.toThrow(CliError)
    expect(ens.getAddress).not.toHaveBeenCalled()
  })

  it('rejects missing flags', async () => {
    const ens = {
      getAddress: vi.fn(async (): Promise<Address> => MOCK_ADDRESS),
    }

    await expect(resolveWalletAddress(ens, {})).rejects.toThrow(CliError)
    expect(ens.getAddress).not.toHaveBeenCalled()
  })

  it('rejects malformed explicit inputs before ENS lookup', async () => {
    const ens = {
      getAddress: vi.fn(async (): Promise<Address> => MOCK_ADDRESS),
    }

    await expect(
      resolveWalletAddress(ens, { address: 'not-an-address' }),
    ).rejects.toThrow(CliError)
    await expect(
      resolveWalletAddress(ens, { ens: 'notaname' }),
    ).rejects.toThrow(CliError)
    expect(ens.getAddress).not.toHaveBeenCalled()
  })
})
