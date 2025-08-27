import type { EmbeddedWallet } from '@/wallet/base/EmbeddedWallet.js'

/**
 * Base embedded wallet provider interface
 * @description Abstract interface for embedded wallet providers (Privy, Dynamic, etc.)
 */
export abstract class EmbeddedWalletProvider {
  abstract createWallet(): Promise<EmbeddedWallet>
  abstract getWallet(params: { walletId: string }): Promise<EmbeddedWallet>
}
