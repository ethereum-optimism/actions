import type {
  GetAllWalletsOptions,
  WalletInterface,
} from '@eth-optimism/verbs-sdk'

import { getVerbs } from '../config/verbs.js'

export async function createWallet(userId: string): Promise<WalletInterface> {
  const verbs = getVerbs()
  return await verbs.createWallet(userId)
}

export async function getWallet(
  userId: string,
): Promise<WalletInterface | null> {
  const verbs = getVerbs()
  return await verbs.getWallet(userId)
}

export async function getAllWallets(
  options?: GetAllWalletsOptions,
): Promise<WalletInterface[]> {
  const verbs = getVerbs()
  return await verbs.getAllWallets(options)
}

export async function getOrCreateWallet(
  userId: string,
): Promise<WalletInterface> {
  let wallet = await getWallet(userId)
  if (!wallet) {
    wallet = await createWallet(userId)
  }
  return wallet
}
