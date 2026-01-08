import type { Address, Hex, LocalAccount } from 'viem'
import { pad } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'
import { describe, expect, it } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import { findSignerInArray } from '@/wallet/core/wallets/smart/default/utils/findSignerInArray.js'

describe('findSignerInArray', () => {
  const mockAddress1 = getRandomAddress()
  const mockAddress2 = getRandomAddress()
  const mockPublicKey1 = pad('0xaabb', { size: 32 }) as Hex

  it('should find LocalAccount address in owners array with EOA addresses', () => {
    const owners = [mockAddress1, mockAddress2]
    const signer = {
      address: mockAddress1,
      type: 'local',
    } as unknown as LocalAccount

    const index = findSignerInArray(owners, signer)

    expect(index).toBe(0)
  })

  it('should find LocalAccount in owners array by matching address', () => {
    const owners = [mockAddress1, mockAddress2]
    const signer = {
      address: mockAddress2,
      type: 'local',
    } as unknown as LocalAccount

    const index = findSignerInArray(owners, signer)

    expect(index).toBe(1)
  })

  it('should return -1 when LocalAccount address is not found in owners', () => {
    const owners = [mockAddress1, mockAddress2]
    const signer = {
      address: '0x3333333333333333333333333333333333333333' as Address,
      type: 'local',
    } as unknown as LocalAccount

    const index = findSignerInArray(owners, signer)

    expect(index).toBe(-1)
  })

  it('should ignore WebAuthn accounts in owners array and only match addresses', () => {
    const webAuthnAccount: WebAuthnAccount = {
      type: 'webAuthn',
      publicKey: mockPublicKey1,
      address: mockAddress2,
    } as unknown as WebAuthnAccount

    const owners = [mockAddress1, webAuthnAccount]
    const signer = {
      address: mockAddress2,
      type: 'local',
    } as unknown as LocalAccount

    // Should return -1 because we only match EOA addresses, not WebAuthn accounts
    const index = findSignerInArray(owners, signer)

    expect(index).toBe(-1)
  })
})
