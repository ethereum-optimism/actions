import { vi } from 'vitest'

import type { dripEthToWallet } from '@/services/faucet.js'

export const successfulFaucetDrip = {
  success: true,
  userOpHash: `0x${'d'.repeat(64)}`,
} satisfies Awaited<ReturnType<typeof dripEthToWallet>>

export function authHeaders(): Record<string, string> {
  return {
    Authorization: 'Bearer fake-access-token',
    'privy-id-token': 'fake-id-token',
  }
}

export async function mockVerifiedUser(userId: string): Promise<void> {
  const { getPrivyClient } = await import('@/config/actions.js')
  vi.mocked(getPrivyClient).mockReturnValue({
    utils: () => ({
      auth: () => ({
        verifyAuthToken: vi.fn().mockResolvedValue({ user_id: userId }),
      }),
    }),
  } as never)
}
