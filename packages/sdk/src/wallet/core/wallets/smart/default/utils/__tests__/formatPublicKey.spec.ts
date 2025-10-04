import type { Address, Hex } from 'viem'
import { pad } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'
import { describe, expect, it } from 'vitest'

import { formatPublicKey } from '@/wallet/core/wallets/smart/default/utils/formatPublicKey.js'

describe('formatPublicKey', () => {
  it('pads EOA address to 32 bytes', () => {
    const eoa: Address = '0x7838d2724FC686813CAf81d4429beff1110c739a'
    const result = formatPublicKey(eoa)
    expect(result).toBe(pad(eoa))
    // 32 bytes = 64 hex chars after 0x
    expect((result as string).length).toBe(66)
  })

  it('returns WebAuthn publicKey as-is', () => {
    const publicKey64Bytes: Hex =
      '0xe7575170745fe55d7a26190c6d5504743496c49498b129d2b3660da3697e81d4daebb2496f89aa4a05f1705e1d5d316153211c198f80d3100b51489bf4963f47'
    const webAuthn: WebAuthnAccount = {
      type: 'webAuthn',
      publicKey: publicKey64Bytes,
    } as unknown as WebAuthnAccount

    const result = formatPublicKey(webAuthn.publicKey)
    expect(result).toBe(publicKey64Bytes)
  })
})
