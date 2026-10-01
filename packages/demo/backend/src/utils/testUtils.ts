import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { vi } from 'vitest'

export const getRandomAddress = () => {
  return privateKeyToAccount(generatePrivateKey()).address
}

/**
 * Verification stubs for the two credentials the auth middleware checks.
 * @description Subjects are `unknown` so tests can express the SDK's own
 * looseness: the access-token path runs its subject through a string guard, but
 * identity-token parsing assigns `id: payload.sub` unchecked, so a non-string
 * identity subject is reachable in production and must be expressible here.
 */
export interface PrivyMockOptions {
  accessSubject?: unknown
  identitySubject?: unknown
  accessRejects?: unknown
  identityRejects?: unknown
}

/**
 * Builds a Privy client mock exposing only the auth surface the middleware uses.
 * @description Shared so the middleware spec and the route specs stub the same
 * nested `utils().auth()` shape in one place. The `as never` cast is unavoidable:
 * `PrivyClient` is a class with private fields, so no object literal can
 * structurally satisfy it.
 * @param options - Subjects each token resolves to, or a value to reject with.
 * @returns The mock client plus both verification spies for assertions.
 */
export function buildPrivyClientMock(options: PrivyMockOptions = {}) {
  const verifyAuthToken = options.accessRejects
    ? vi.fn().mockRejectedValue(options.accessRejects)
    : vi.fn().mockResolvedValue({ user_id: options.accessSubject })
  const verifyIdentityToken = options.identityRejects
    ? vi.fn().mockRejectedValue(options.identityRejects)
    : vi.fn().mockResolvedValue({ id: options.identitySubject })

  const client = {
    utils: () => ({ auth: () => ({ verifyAuthToken, verifyIdentityToken }) }),
  } as never

  return { client, verifyAuthToken, verifyIdentityToken }
}
