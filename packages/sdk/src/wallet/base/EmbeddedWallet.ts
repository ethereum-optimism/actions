import type { Address, LocalAccount } from 'viem'

export abstract class EmbeddedWallet {
  public readonly address: Address

  constructor(address: Address) {
    this.address = address
  }

  abstract signer(): Promise<LocalAccount>
}
