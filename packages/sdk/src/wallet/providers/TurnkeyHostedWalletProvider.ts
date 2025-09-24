import type { TurnkeySDKClientBase } from '@turnkey/core'
import type { TurnkeyClient as TurnkeyHttpClient } from '@turnkey/http'
import type { TurnkeyServerClient } from '@turnkey/sdk-server'

import type { ChainManager } from '@/services/ChainManager.js'
import type { TurnkeyHostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'
import { TurnkeyWallet } from '@/wallet/TurnkeyWallet.js'

/**
 * Turnkey wallet provider implementation
 * @description Hosted wallet provider that wraps Turnkey's signing infrastructure
 * and exposes a Verbs-compatible wallet. This provider is intended for Node
 * environments where the Turnkey client (HTTP, server, or core SDK) and
 * organization context are provided at construction time.
 */
export class TurnkeyHostedWalletProvider extends HostedWalletProvider<'turnkey'> {
  /**
   * Create a new Turnkey wallet provider
   * @param client - Turnkey client instance (HTTP, server, or core SDK base)
   * @param organizationId - Turnkey organization ID that owns the signing key
   * @param chainManager - Chain manager used to resolve chains and RPC transports
   */
  constructor(
    private readonly client:
      | TurnkeyHttpClient
      | TurnkeyServerClient
      | TurnkeySDKClientBase,
    private readonly organizationId: string,
    chainManager: ChainManager,
  ) {
    super(chainManager)
  }

  /**
   * Convert a Turnkey hosted wallet context into a Verbs wallet
   * @description Creates a `TurnkeyWallet` configured with the provider's Turnkey
   * client and organization.
   * @param params - Options for creating the Verbs wallet from Turnkey context
   * @param params.signWith - Wallet account address, private key address, or private key ID
   * @param params.ethereumAddress - Ethereum address to use for this account, in the case that a private key ID is used to sign.
   * @returns Promise resolving to a Verbs-compatible wallet instance
   */
  async toVerbsWallet(
    params: TurnkeyHostedWalletToVerbsWalletOptions,
  ): Promise<Wallet> {
    return TurnkeyWallet.create({
      client: this.client,
      organizationId: this.organizationId,
      signWith: params.signWith,
      ethereumAddress: params.ethereumAddress,
      chainManager: this.chainManager,
    })
  }
}
