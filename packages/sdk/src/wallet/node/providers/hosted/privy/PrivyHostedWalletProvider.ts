import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import type { LocalAccount } from 'viem'
import { getAddress } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  NodeToActionsOptionsMap,
  PrivyHostedWalletToActionsWalletOptions,
} from '@/wallet/node/providers/hosted/types/index.js'
import { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'
import { createSigner } from '@/wallet/node/wallets/hosted/privy/utils/createSigner.js'

/**
 * Privy wallet provider implementation
 * @description Wallet provider implementation using Privy service
 */
export class PrivyHostedWalletProvider extends HostedWalletProvider<
  'privy',
  NodeToActionsOptionsMap
> {
  /**
   * Create a new Privy wallet provider
   * @param privyClient - Privy client instance
   */
  constructor(
    private readonly privyClient: PrivyClient,
    private readonly authorizationContext: AuthorizationContext,
    chainManager: ChainManager,
    lendProvider?: LendProvider<LendConfig>,
  ) {
    super(chainManager, lendProvider)
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
      lendProvider: this.lendProvider,
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
