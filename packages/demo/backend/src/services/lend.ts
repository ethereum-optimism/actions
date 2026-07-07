import type {
  LendMarket,
  LendMarketId,
  LendTransactionReceipt,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'

import { getActions } from '@/config/actions.js'
import { WalletNotFoundError } from '@/helpers/errors.js'
import { getWallet } from '@/services/wallet.js'
import type { PositionParams } from '@/types/index.js'
import { resolveAsset } from '@/utils/assets.js'
import { getBlockExplorerUrls } from '@/utils/explorers.js'

type LendTransactionReceiptWithUrls = LendTransactionReceipt & {
  blockExplorerUrls: string[]
}

export async function getMarkets(): Promise<LendMarket[]> {
  const actions = getActions()
  return await actions.lend.getMarkets()
}

export async function getMarket(marketId: LendMarketId): Promise<LendMarket> {
  const actions = getActions()
  return await actions.lend.getMarket(marketId)
}

async function executePosition(
  params: PositionParams,
  operation: 'open' | 'close',
): Promise<LendTransactionReceiptWithUrls> {
  const { idToken, amount, tokenAddress, marketId } = params

  const wallet = await getWallet(idToken)
  if (!wallet) {
    throw new WalletNotFoundError()
  }

  const asset = resolveAsset(tokenAddress, marketId.chainId as SupportedChainId)

  const positionParams = { amount, asset, marketId }

  const result =
    operation === 'open'
      ? await wallet.lend!.openPosition(positionParams)
      : await wallet.lend!.closePosition(positionParams)

  const blockExplorerUrls = getBlockExplorerUrls({
    chainId: marketId.chainId,
    ...result,
  })

  return {
    ...result,
    blockExplorerUrls,
  } as LendTransactionReceiptWithUrls
}

export async function openPosition(
  params: PositionParams,
): Promise<LendTransactionReceiptWithUrls> {
  return executePosition(params, 'open')
}

export async function closePosition(
  params: PositionParams,
): Promise<LendTransactionReceiptWithUrls> {
  return executePosition(params, 'close')
}
