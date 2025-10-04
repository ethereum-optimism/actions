import type { Address, LocalAccount, OneOf } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

/**
 * A single signer/owner for a Smart Wallet.
 *
 * Can be one of three types:
 * - **`Address`**: A plain Ethereum address (hex string like `'0x123...'`). The address itself cannot sign,
 * but can be used as an owner identifier.
 * - **`LocalAccount`**: A local account (e.g., from a private key or mnemonic) that can sign transactions
 * and messages using standard ECDSA signatures.
 * - **`WebAuthnAccount`**: A WebAuthn/passkey account that signs using the WebAuthn P256 curve,
 * typically used for biometric authentication.
 *
 * The `OneOf` utility ensures that account objects are mutually exclusive - an account can be
 * either a `LocalAccount` OR a `WebAuthnAccount`, never a hybrid with properties from both types.
 * This prevents type confusion and ensures proper signature handling for each account type.
 */
export type Signer = Address | OneOf<LocalAccount | WebAuthnAccount>
