import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { ReactToVerbsOptionsMap } from '@/wallet/react/providers/hosted/types/index.js'
import { TurnkeyWallet } from '@/wallet/react/wallets/hosted/turnkey/TurnkeyWallet.js'
import { createSigner } from '@/wallet/react/wallets/hosted/turnkey/utils/createSigner.js'

/**
 * Turnkey wallet provider implementation
 * @description Hosted wallet provider that wraps Turnkey's signing infrastructure
 * and exposes a Verbs-compatible wallet. This provider is intended for browser
 * environments where the Turnkey client and
 * organization context are provided at construction time.
 */
export class TurnkeyHostedWalletProvider extends HostedWalletProvider<
  'turnkey',
  ReactToVerbsOptionsMap
> {
  /**
   * Create a new Turnkey wallet provider
   * @param client - Turnkey browser client instance
   * @param organizationId - Turnkey organization ID that owns the signing key
   * @param chainManager - Chain manager used to resolve chains and RPC transports
   */
  constructor(chainManager: ChainManager) {
    super(chainManager)
  }

  /**
   * Convert a Turnkey hosted wallet context into a Verbs wallet
   * @description Creates a `TurnkeyWallet` configured with the provider's Turnkey
   * client and organization.
   * @param params - Options for creating the Verbs wallet from Turnkey context
   * @param params.client - Turnkey client instance
   * @param params.organizationId - Turnkey organization ID that owns the signing key
   * @param params.signWith - Wallet account address, private key address, or private key ID
   * @param params.ethereumAddress - Ethereum address to use for this account, in the case that a private key ID is used to sign.
   * @returns Promise resolving to a Verbs-compatible wallet instance
   */
  async toVerbsWallet(
    params: ReactToVerbsOptionsMap['turnkey'],
  ): Promise<Wallet> {
    const { client, organizationId, signWith, ethereumAddress } = params
    return TurnkeyWallet.create({
      client,
      organizationId,
      signWith,
      ethereumAddress,
      chainManager: this.chainManager,
    })
  }

  /**
   * Create a viem LocalAccount signer from Turnkey credentials
   * @description Produces a signing account backed by Turnkey without wrapping
   * it in a full Verbs wallet. This is useful when you need to pass the signer
   * into a Verbs smart wallet as an owner, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Turnkey configuration for the signer
   * @param params.client - Turnkey client instance
   * @param params.organizationId - Turnkey organization ID that owns the signing key
   * @param params.signWith - Wallet account address, private key address, or private key ID
   * @param params.ethereumAddress - Optional Ethereum address (recommended for passkey clients to avoid extra prompts)
   * @returns Promise resolving to a viem `LocalAccount` with Turnkey as the signer backend
   */
  async createSigner(
    params: ReactToVerbsOptionsMap['turnkey'],
  ): Promise<LocalAccount> {
    return createSigner(params)
  }
}
