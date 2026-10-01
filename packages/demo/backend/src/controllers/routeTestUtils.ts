import { vi } from 'vitest'

import { buildPrivyClientMock } from '@/utils/testUtils.js'

export function authHeaders(): Record<string, string> {
  return {
    Authorization: 'Bearer fake-access-token',
    'privy-id-token': 'fake-id-token',
  }
}

/**
 * Stubs Privy so both credentials the auth middleware checks resolve.
 * @description The access token and the identity token resolve to the same
 * user unless `identityUserId` is passed, which is how a test expresses a
 * deliberate cross-user pairing.
 * @param userId - Privy user the access token was issued to.
 * @param identityUserId - Privy user the identity token resolves to, defaulting to `userId`.
 * @returns void
 */
export async function mockVerifiedUser(
  userId: string,
  identityUserId: string = userId,
): Promise<void> {
  const { getPrivyClient } = await import('@/config/actions.js')
  const { client } = buildPrivyClientMock({
    accessSubject: userId,
    identitySubject: identityUserId,
  })
  vi.mocked(getPrivyClient).mockReturnValue(client)
}
