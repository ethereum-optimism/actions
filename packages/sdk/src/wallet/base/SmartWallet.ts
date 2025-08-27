import type { Address, Hash, LocalAccount } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  LendOptions,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import type { TokenBalance } from '@/types/token.js'
import type { AssetIdentifier } from '@/utils/assets.js'

export abstract class SmartWallet {
  abstract signer: LocalAccount
  abstract getAddress(): Promise<Address>
  abstract getBalance(): Promise<TokenBalance[]>
  // TODO: add addSigner method
  // TODO: add removeSigner method
  abstract send(
    transactionData: TransactionData,
    chainId: SupportedChainId,
  ): Promise<Hash>
  abstract lend(
    amount: number,
    asset: AssetIdentifier,
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
  abstract sendTokens(
    amount: number,
    asset: AssetIdentifier,
    recipientAddress: Address,
  ): Promise<TransactionData>
}
