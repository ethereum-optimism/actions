import type { Address, LocalAccount } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

import type { SmartWallet } from '@/wallet/base/SmartWallet.js'

/**
 * Base smart wallet provider interface
 * @description Abstract interface for smart wallet providers (Native, etc.)
 */
export abstract class SmartWalletProvider {
  abstract createWallet(params: {
    owners: Array<Address | WebAuthnAccount>
    signer: LocalAccount
    nonce?: bigint
  }): Promise<SmartWallet>

  abstract getWallet(params: {
    walletAddress: Address
    signer: LocalAccount
    ownerIndex?: number
  }): SmartWallet

  abstract getWalletAddress(params: {
    owners: Array<Address | WebAuthnAccount>
    nonce?: bigint
  }): Promise<Address>
}
