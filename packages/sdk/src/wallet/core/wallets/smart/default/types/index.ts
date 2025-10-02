import type { Address, LocalAccount, OneOf } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

export type Owners = Array<Address | OneOf<LocalAccount | WebAuthnAccount>>
