import type { Address, Hex, LocalAccount } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'
import { describe, expect, it } from 'vitest'

import { getRandomAddress } from '@/test/utils.js'
import { getSignerPublicKey } from '@/wallet/core/wallets/smart/default/utils/getSignerPublicKey.js'

describe('getSignerPublicKey', () => {
  it('returns the address itself when signer is a plain address string', () => {
    const address = getRandomAddress()
    const result = getSignerPublicKey(address)
    expect(result).toBe(address)
  })

  it('returns the address when signer is a LocalAccount', () => {
    const address = getRandomAddress()
    const localAccount: LocalAccount = {
      address,
      type: 'local',
      publicKey: '0xaabbccdd' as Hex,
    } as unknown as LocalAccount

    const result = getSignerPublicKey(localAccount)
    expect(result).toBe(address)
  })

  it('returns the publicKey when signer is a WebAuthnAccount', () => {
    const publicKey: Hex =
      '0xe7575170745fe55d7a26190c6d5504743496c49498b129d2b3660da3697e81d4daebb2496f89aa4a05f1705e1d5d316153211c198f80d3100b51489bf4963f47'
    const webAuthnAccount: WebAuthnAccount = {
      type: 'webAuthn',
      publicKey,
      id: 'test-id',
    } as unknown as WebAuthnAccount

    const result = getSignerPublicKey(webAuthnAccount)
    expect(result).toBe(publicKey)
  })

  it('throws error for invalid signer type', () => {
    const invalidSigner = {
      type: 'unknown',
      address: '0x1234567890123456789012345678901234567890' as Address,
    } as unknown as LocalAccount

    expect(() => getSignerPublicKey(invalidSigner)).toThrow(
      'invalid signer type',
    )
  })

  it('handles different address formats correctly', () => {
    const checksummedAddress: Address =
      '0x7838d2724FC686813CAf81d4429beff1110c739a'
    const lowercaseAddress: Address =
      '0x7838d2724fc686813caf81d4429beff1110c739a'

    expect(getSignerPublicKey(checksummedAddress)).toBe(checksummedAddress)
    expect(getSignerPublicKey(lowercaseAddress)).toBe(lowercaseAddress)
  })
})
