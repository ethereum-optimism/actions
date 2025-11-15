import type { TurnkeySDKClientBase } from '@turnkey/core'
import type { TurnkeyClient as TurnkeyHttpClient } from '@turnkey/http'
import type { TurnkeyServerClient } from '@turnkey/sdk-server'
import type { LocalAccount } from 'viem'

import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { NodeToActionsOptionsMap } from '@/wallet/node/providers/hosted/types/index.js'
import { TurnkeyWallet } from '@/wallet/node/wallets/hosted/turnkey/TurnkeyWallet.js'
import { createSigner } from '@/wallet/node/wallets/hosted/turnkey/utils/createSigner.js'

/**
 * Turnkey wallet provider implementation
 * @description Hosted wallet provider that wraps Turnkey's signing infrastructure
 * and exposes an Actions-compatible wallet. This provider is intended for Node
 * environments where the Turnkey client (HTTP, server, or core SDK) and
 * organization context are provided at construction time.
 */
export class TurnkeyHostedWalletProvider extends HostedWalletProvider<
  'turnkey',
  NodeToActionsOptionsMap
> {
  /**
   * Create a new Turnkey wallet provider
   * @param client - Turnkey client instance (HTTP, server, or core SDK base)
   * @param chainManager - Chain manager used to resolve chains and RPC transports
   * @param lendProviders - Optional lend providers for DeFi operations
   * @param supportedAssets - Optional list of supported assets
   */
  constructor(
    private readonly client:
      | TurnkeyHttpClient
      | TurnkeyServerClient
      | TurnkeySDKClientBase,
    chainManager: ChainManager,
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
    supportedAssets?: Asset[],
  ) {
    super(chainManager, lendProviders, supportedAssets)
  }

  /**
   * Convert a Turnkey hosted wallet context into an Actions wallet
   * @description Creates a `TurnkeyWallet` configured with the provider's Turnkey
   * client and organization.
   * @param params - Options for creating the Actions wallet from Turnkey context
   * @param params.signWith - Wallet account address, private key address, or private key ID
   * @param params.ethereumAddress - Ethereum address to use for this account, in the case that a private key ID is used to sign.
   * @returns Promise resolving to an Actions-compatible wallet instance
   */
  async toActionsWallet(
    params: NodeToActionsOptionsMap['turnkey'],
  ): Promise<Wallet> {
    return TurnkeyWallet.create({
      client: this.client,
      organizationId: params.organizationId,
      signWith: params.signWith,
      ethereumAddress: params.ethereumAddress,
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      supportedAssets: this.supportedAssets,
    })
  }

  /**
   * Create a viem LocalAccount signer from Turnkey credentials
   * @description Produces a signing account backed by Turnkey without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Turnkey configuration for the signer
   * @param params.client - Turnkey client instance
   * @param params.organizationId - Turnkey organization ID that owns the signing key
   * @param params.signWith - Wallet account address, private key address, or private key ID
   * @param params.ethereumAddress - Optional Ethereum address (recommended for passkey clients to avoid extra prompts)
   * @returns Promise resolving to a viem `LocalAccount` with Turnkey as the signer backend
   */
  async createSigner(
    params: NodeToActionsOptionsMap['turnkey'],
  ): Promise<LocalAccount> {
    return createSigner({
      ...params,
      client: this.client,
    })
  }
}
