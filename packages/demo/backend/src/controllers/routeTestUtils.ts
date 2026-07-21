import { vi } from 'vitest'

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
