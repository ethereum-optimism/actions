// import { type Address, type Hash, type WalletClient } from 'viem'

// import type { TransactionData } from '@/types/lend.js'
// import type { VerbsInterface } from '@/types/verbs.js'
// import type {
//   GetAllWalletsOptions,
//   Wallet,
//   WalletProvider,
// } from '@/types/wallet.js'
// import { Wallet as WalletImpl } from '@/wallet/index.js'

// /**
//  * Test wallet provider for local testing with viem
//  * @description Test implementation of WalletProvider that uses viem directly
//  */
// export class WalletProviderTest implements WalletProvider {
//   private walletClient: WalletClient
//   private verbs: VerbsInterface
//   private wallets: Map<string, { id: string; address: Address }> = new Map()

//   constructor(walletClient: WalletClient, verbs: VerbsInterface) {
//     this.walletClient = walletClient
//     this.verbs = verbs
//   }

//   /**
//    * Create a new wallet (or register existing)
//    */
//   async createWallet(userId: string): Promise<Wallet> {
//     // For testing, we'll use the wallet client's account
//     const [address] = await this.walletClient.getAddresses()

//     this.wallets.set(userId, { id: userId, address })

//     const wallet = new WalletImpl(userId, this.verbs, this)
//     wallet.init(address)
//     return wallet
//   }

//   /**
//    * Get wallet by user ID
//    */
//   async getWallet(userId: string): Promise<Wallet | null> {
//     const walletData = this.wallets.get(userId)
//     if (!walletData) return null

//     const wallet = new WalletImpl(userId, this.verbs, this)
//     wallet.init(walletData.address)
//     return wallet
//   }

//   /**
//    * Get all wallets
//    */
//   async getAllWallets(_options?: GetAllWalletsOptions): Promise<Wallet[]> {
//     const wallets: Wallet[] = []

//     for (const [userId, walletData] of this.wallets.entries()) {
//       const wallet = new WalletImpl(userId, this.verbs, this)
//       wallet.init(walletData.address)
//       wallets.push(wallet)
//     }

//     return wallets
//   }

//   /**
//    * Sign and send a transaction using viem wallet client
//    */
//   async sign(
//     _walletId: string,
//     transactionData: TransactionData,
//   ): Promise<Hash> {
//     try {
//       // Send transaction using viem wallet client
//       const txParams: any = {
//         to: transactionData.to as Address,
//         data: transactionData.data as `0x${string}`,
//         value: BigInt(transactionData.value),
//       }

//       // Add account if available
//       if (this.walletClient.account) {
//         txParams.account = this.walletClient.account
//       }

//       const hash = await this.walletClient.sendTransaction(txParams)

//       return hash
//     } catch (error) {
//       throw new Error(
//         `Failed to sign transaction: ${
//           error instanceof Error ? error.message : 'Unknown error'
//         }`,
//       )
//     }
//   }

//   /**
//    * Sign a transaction without sending it
//    */
//   async signOnly(
//     _walletId: string,
//     transactionData: TransactionData,
//   ): Promise<string> {
//     try {
//       // Sign transaction using viem wallet client
//       const txParams: any = {
//         to: transactionData.to as Address,
//         data: transactionData.data as `0x${string}`,
//         value: BigInt(transactionData.value),
//       }

//       const signedTx = await this.walletClient.signTransaction(txParams)

//       return signedTx
//     } catch (error) {
//       throw new Error(
//         `Failed to sign transaction: ${
//           error instanceof Error ? error.message : 'Unknown error'
//         }`,
//       )
//     }
//   }
// }
