import { encodeFunctionData, type Address } from 'viem'
import type {
  Asset,
  SupportedChainId,
  TransactionReturnType,
  Wallet,
} from '@eth-optimism/actions-sdk/react'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import { actionsApi } from '@/api/actionsApi'

export type FrontendMintWallet = Pick<Wallet, 'address'> & {
  sendBatch: Wallet['sendBatch']
}

function resolveAssetChainId(asset: Asset): SupportedChainId {
  const chainId = asset.address
    ? Object.keys(asset.address).find(
        (key) => asset.address[key as unknown as SupportedChainId],
      )
    : undefined

  if (!chainId) {
    throw new Error('No chain available for asset')
  }

  return parseInt(chainId) as SupportedChainId
}

function buildExplorerResult(result: TransactionReturnType) {
  if ('blockExplorerUrl' in result && result.blockExplorerUrl) {
    return { blockExplorerUrls: [result.blockExplorerUrl as string] }
  }
  if ('blockExplorerUrls' in result && result.blockExplorerUrls) {
    return { blockExplorerUrls: result.blockExplorerUrls as string[] }
  }
}

export async function mintDemoAsset(
  wallet: FrontendMintWallet,
  asset: Asset,
): Promise<{ blockExplorerUrls?: string[] } | void> {
  const chainId = resolveAssetChainId(asset)

  if (asset.metadata.symbol === 'ETH' && asset.type === 'native') {
    await actionsApi.dripEthToWallet(wallet.address)
    return
  }

  const tokenAddress = asset.address[chainId]
  if (!tokenAddress || tokenAddress === 'native') {
    throw new Error(
      `Asset ${asset.metadata.symbol} not available on chain ${chainId}`,
    )
  }

  const amountInDecimals = BigInt(
    Math.floor(parseFloat('100') * Math.pow(10, asset.metadata.decimals)),
  )

  const result = await wallet.sendBatch(
    [
      {
        to: tokenAddress as Address,
        data: encodeFunctionData({
          abi: mintableErc20Abi,
          functionName: 'mint',
          args: [wallet.address, amountInDecimals],
        }),
        value: 0n,
      },
    ],
    chainId,
  )

  return buildExplorerResult(result)
}
