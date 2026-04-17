import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { EmbeddedWalletProvider } from '@/wallet/core/providers/embedded/abstract/EmbeddedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { ReactToActionsOptionsMap } from '@/wallet/react/providers/embedded/types/index.js'
import { TurnkeyWallet } from '@/wallet/react/wallets/embedded/turnkey/TurnkeyWallet.js'
import { createSigner } from '@/wallet/react/wallets/embedded/turnkey/utils/createSigner.js'

/**
 * Turnkey wallet provider implementation
 * @description Embedded wallet provider that wraps Turnkey's signing infrastructure
 * and exposes an Actions-compatible wallet. This provider is intended for browser
 * environments where the Turnkey client and
 * organization context are provided at construction time.
 */
export class TurnkeyEmbeddedWalletProvider extends EmbeddedWalletProvider<
  'turnkey',
  ReactToActionsOptionsMap
> {
  /**
   * Create a new Turnkey wallet provider
   * @param chainManager - Chain manager used to resolve chains and RPC transports
   * @param lendProviders - Optional lend providers for DeFi operations
   * @param swapProviders - Optional swap providers for trading operations
   */
  constructor(
    chainManager: ChainManager,
    lendProviders?: LendProviders,
    swapProviders?: SwapProviders,
    supportedAssets?: Asset[],
  ) {
    super(chainManager, lendProviders, swapProviders, supportedAssets)
  }

  /**
   * Convert a Turnkey embedded wallet context into an Actions wallet
   * @description Creates a `TurnkeyWallet` configured with the provider's Turnkey
   * client and organization.
   * @param params - Options for creating the Actions wallet from Turnkey context
   * @param params.client - Turnkey client instance
   * @param params.organizationId - Turnkey organization ID that owns the signing key
   * @param params.signWith - Wallet account address, private key address, or private key ID
   * @param params.ethereumAddress - Ethereum address to use for this account, in the case that a private key ID is used to sign.
   * @returns Promise resolving to an Actions-compatible wallet instance
   */
  async toActionsWallet(
    params: ReactToActionsOptionsMap['turnkey'],
  ): Promise<Wallet> {
    const { client, organizationId, signWith, ethereumAddress } = params
    return TurnkeyWallet.create({
      client,
      organizationId,
      signWith,
      ethereumAddress,
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      swapProviders: this.swapProviders,
      supportedAssets: this.supportedAssets,
    })
  }

  /**
   * Create a viem LocalAccount signer from Turnkey credentials
   * @description Produces a signing account backed by Turnkey without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as an owner, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Turnkey configuration for the signer
   * @param params.client - Turnkey client instance
   * @param params.organizationId - Turnkey organization ID that owns the signing key
   * @param params.signWith - Wallet account address, private key address, or private key ID
   * @param params.ethereumAddress - Optional Ethereum address (recommended for passkey clients to avoid extra prompts)
   * @returns Promise resolving to a viem `LocalAccount` with Turnkey as the signer backend
   */
  async createSigner(
    params: ReactToActionsOptionsMap['turnkey'],
  ): Promise<LocalAccount> {
    return createSigner(params)
  }
}
