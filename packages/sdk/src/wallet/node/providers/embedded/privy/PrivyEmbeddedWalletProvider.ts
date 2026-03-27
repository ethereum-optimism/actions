import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import type { LocalAccount } from 'viem'
import { getAddress } from 'viem'

import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { LendProviderConfig, SwapProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import { EmbeddedWalletProvider } from '@/wallet/core/providers/embedded/abstract/EmbeddedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  NodeToActionsOptionsMap,
  PrivyHostedWalletToActionsWalletOptions,
} from '@/wallet/node/providers/embedded/types/index.js'
import { PrivyWallet } from '@/wallet/node/wallets/embedded/privy/PrivyWallet.js'
import { createSigner } from '@/wallet/node/wallets/embedded/privy/utils/createSigner.js'

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class PrivyEmbeddedWalletProvider extends EmbeddedWalletProvider<
  'privy',
  NodeToActionsOptionsMap
> {
  private readonly privyClient: PrivyClient
  private readonly authorizationContext?: AuthorizationContext

  /**
   * Create a new Privy wallet provider
   * @param params - Configuration parameters
   * @param params.privyClient - Privy client instance
   * @param params.chainManager - Chain manager for multi-chain operations
   * @param params.lendProviders - Optional lend providers for DeFi operations
   * @param params.swapProviders - Optional swap providers for trading operations
   * @param params.supportedAssets - Optional list of supported assets
   * @param params.authorizationContext - Optional authorization context for the Privy client.
   * Used when Privy needs to sign requests.
   * See https://docs.privy.io/controls/authorization-keys/using-owners/sign/automatic#using-the-authorization-context
   * for more information on building and using the authorization context.
   */
  constructor(params: {
    privyClient: PrivyClient
    chainManager: ChainManager
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    }
    swapProviders?: {
      uniswap?: SwapProvider<SwapProviderConfig>
    }
    supportedAssets?: Asset[]
    authorizationContext?: AuthorizationContext
  }) {
    super(
      params.chainManager,
      params.lendProviders,
      params.swapProviders,
      params.supportedAssets,
    )
    this.privyClient = params.privyClient
    this.authorizationContext = params.authorizationContext
  }

  async toActionsWallet(
    params: PrivyHostedWalletToActionsWalletOptions,
  ): Promise<Wallet> {
    return PrivyWallet.create({
      privyClient: this.privyClient,
      authorizationContext: this.authorizationContext,
      walletId: params.walletId,
      address: getAddress(params.address),
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      swapProviders: this.swapProviders,
      supportedAssets: this.supportedAssets,
    })
  }

  /**
   * Create a LocalAccount from this Privy wallet
   * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Privy's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @param params - Privy configuration for the signer
   * @param params.privyClient - Privy client instance
   * @param params.walletId - Privy wallet identifier
   * @param params.address - Ethereum address of the wallet
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  async createSigner(
    params: NodeToActionsOptionsMap['privy'],
  ): Promise<LocalAccount> {
    return createSigner({
      ...params,
      privyClient: this.privyClient,
      authorizationContext: this.authorizationContext,
    })
  }
}
