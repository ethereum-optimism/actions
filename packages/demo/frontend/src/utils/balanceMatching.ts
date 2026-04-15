import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type { LendMarketId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { isEthSymbol } from './assetUtils'

interface BalanceMatchingParams {
  allTokenBalances: TokenBalance[]
  selectedAssetSymbol: string
  marketData?: {
    assetAddress: Address
    marketId: LendMarketId
  } | null
}

/**
 * Extract the balance for a specific asset from token balances
 * Special handling for ETH markets (uses native ETH balance)
 */
export function matchAssetBalance({
  allTokenBalances,
  selectedAssetSymbol,
  marketData,
}: BalanceMatchingParams): string {
  if (!allTokenBalances || !selectedAssetSymbol) {
    return '0.00'
  }

  let assetToken: TokenBalance | undefined
  let chainBalance: { balance: number; balanceRaw: bigint } | undefined

  if (marketData?.assetAddress && marketData?.marketId?.chainId) {
    const targetChainId = marketData.marketId.chainId

    // For ETH markets, match by asset type (native token has no address)
    // For ERC20 tokens, match by address on the target chain
    if (isEthSymbol(selectedAssetSymbol)) {
      assetToken = allTokenBalances.find((token) => isEthSymbol(token.asset.metadata.symbol))
    } else {
      const targetAddress = marketData.assetAddress.toLowerCase()
      for (const token of allTokenBalances) {
        const tokenAddr = token.asset.address[targetChainId]
        if (tokenAddr && tokenAddr.toLowerCase() === targetAddress) {
          assetToken = token
          chainBalance = token.chains[targetChainId]
          break
        }
      }
    }

    // Get chain-specific balance if we found the token but not the chain balance
    if (assetToken && !chainBalance) {
      chainBalance = assetToken.chains[targetChainId]
    }
  } else {
    // Fallback to symbol matching (less precise)
    assetToken = allTokenBalances.find(
      (token) => token.asset.metadata.symbol === selectedAssetSymbol,
    )
  }

  const isEth = isEthSymbol(selectedAssetSymbol)
  const displayPrecision = isEth ? 4 : 2
  const precisionMultiplier = Math.pow(10, displayPrecision)

  if (assetToken && chainBalance && chainBalance.balanceRaw > 0n) {
    // Use the specific chain balance (already human-readable)
    const flooredBalance =
      Math.floor(chainBalance.balance * precisionMultiplier) / precisionMultiplier
    return flooredBalance.toFixed(displayPrecision)
  } else if (assetToken && assetToken.totalBalanceRaw > 0n) {
    // Fallback to total balance (already human-readable)
    const flooredBalance =
      Math.floor(assetToken.totalBalance * precisionMultiplier) / precisionMultiplier
    return flooredBalance.toFixed(displayPrecision)
  } else {
    return isEth ? '0.0000' : '0.00'
  }
}
